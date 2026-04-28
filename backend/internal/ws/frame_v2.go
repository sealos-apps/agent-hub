package ws

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/nightwhite/Agent-Hub/internal/dto"
)

const (
	wsBinaryV2Version    = uint8(2)
	wsBinaryV2HeaderSize = 20

	wsBinaryFlagUTF8Payload = uint16(1 << 0)
)

var wsBinaryTypeCodeByName = map[string]uint8{
	"ping":              1,
	"pong":              2,
	"auth":              3,
	"auth.required":     4,
	"system.ready":      5,
	"error":             6,
	"terminal.open":     10,
	"terminal.opened":   11,
	"terminal.input":    12,
	"terminal.output":   13,
	"terminal.resize":   14,
	"terminal.close":    15,
	"terminal.closed":   16,
	"log.subscribe":     20,
	"log.unsubscribe":   21,
	"log.chunk":         22,
	"log.closed":        23,
	"file.list":         30,
	"file.read":         31,
	"file.download":     32,
	"file.write":        33,
	"file.delete":       34,
	"file.mkdir":        35,
	"file.upload.begin": 36,
	"file.upload.chunk": 37,
	"file.upload.end":   38,
	"file.result":       39,
}

var wsBinaryTypeNameByCode = func() map[uint8]string {
	out := make(map[uint8]string, len(wsBinaryTypeCodeByName))
	for name, code := range wsBinaryTypeCodeByName {
		out[code] = name
	}
	return out
}()

func encodeWSBinaryMessage(message dto.WSMessage) ([]byte, error) {
	messageType := strings.TrimSpace(message.Type)
	typeCode, ok := wsBinaryTypeCodeByName[messageType]
	if !ok {
		return nil, fmt.Errorf("unsupported message type: %s", messageType)
	}

	data := cloneDataMap(message.Data)
	sessionID := ""
	if id, ok := data["id"].(string); ok {
		sessionID = strings.TrimSpace(id)
	}

	payloadKey, payload := extractPayloadForEncoding(messageType, data)
	if payloadKey != "" {
		data["_payloadKey"] = payloadKey
	}

	requestIDBytes := []byte(message.RequestID)
	sessionIDBytes := []byte(sessionID)
	metaBytes, err := marshalDataMap(data)
	if err != nil {
		return nil, fmt.Errorf("marshal frame meta: %w", err)
	}
	payloadBytes := []byte(payload)

	flags := uint16(0)
	if len(payloadBytes) > 0 {
		flags |= wsBinaryFlagUTF8Payload
	}

	totalSize := wsBinaryV2HeaderSize + len(requestIDBytes) + len(sessionIDBytes) + len(metaBytes) + len(payloadBytes)
	frame := make([]byte, totalSize)
	frame[0] = wsBinaryV2Version
	frame[1] = typeCode
	binary.LittleEndian.PutUint16(frame[2:4], flags)
	binary.LittleEndian.PutUint32(frame[4:8], uint32(len(requestIDBytes)))
	binary.LittleEndian.PutUint32(frame[8:12], uint32(len(sessionIDBytes)))
	binary.LittleEndian.PutUint32(frame[12:16], uint32(len(metaBytes)))
	binary.LittleEndian.PutUint32(frame[16:20], uint32(len(payloadBytes)))

	offset := wsBinaryV2HeaderSize
	copy(frame[offset:], requestIDBytes)
	offset += len(requestIDBytes)
	copy(frame[offset:], sessionIDBytes)
	offset += len(sessionIDBytes)
	copy(frame[offset:], metaBytes)
	offset += len(metaBytes)
	copy(frame[offset:], payloadBytes)

	return frame, nil
}

func decodeWSBinaryMessage(frame []byte) (dto.WSMessage, error) {
	if len(frame) < wsBinaryV2HeaderSize {
		return dto.WSMessage{}, fmt.Errorf("frame too short")
	}
	if frame[0] != wsBinaryV2Version {
		return dto.WSMessage{}, fmt.Errorf("unsupported frame version: %d", frame[0])
	}

	typeCode := frame[1]
	messageType, ok := wsBinaryTypeNameByCode[typeCode]
	if !ok {
		return dto.WSMessage{}, fmt.Errorf("unsupported frame type code: %d", typeCode)
	}

	requestIDLen := int(binary.LittleEndian.Uint32(frame[4:8]))
	sessionIDLen := int(binary.LittleEndian.Uint32(frame[8:12]))
	metaLen := int(binary.LittleEndian.Uint32(frame[12:16]))
	payloadLen := int(binary.LittleEndian.Uint32(frame[16:20]))

	total := wsBinaryV2HeaderSize + requestIDLen + sessionIDLen + metaLen + payloadLen
	if requestIDLen < 0 || sessionIDLen < 0 || metaLen < 0 || payloadLen < 0 || total != len(frame) {
		return dto.WSMessage{}, fmt.Errorf("invalid frame lengths")
	}

	offset := wsBinaryV2HeaderSize
	requestID := string(frame[offset : offset+requestIDLen])
	offset += requestIDLen
	sessionID := string(frame[offset : offset+sessionIDLen])
	offset += sessionIDLen
	metaBytes := frame[offset : offset+metaLen]
	offset += metaLen
	payloadBytes := frame[offset : offset+payloadLen]

	data, err := unmarshalDataMap(metaBytes)
	if err != nil {
		return dto.WSMessage{}, fmt.Errorf("invalid frame meta: %w", err)
	}

	if strings.TrimSpace(sessionID) != "" {
		if _, exists := data["id"]; !exists {
			data["id"] = sessionID
		}
	}

	if len(payloadBytes) > 0 {
		payloadKey := ""
		if raw, ok := data["_payloadKey"].(string); ok {
			payloadKey = strings.TrimSpace(raw)
		}
		delete(data, "_payloadKey")
		if payloadKey == "" {
			payloadKey = inferPayloadKey(messageType, data)
		}
		if payloadKey != "" {
			data[payloadKey] = string(payloadBytes)
		}
	} else {
		delete(data, "_payloadKey")
	}

	return dto.WSMessage{
		Type:      messageType,
		RequestID: requestID,
		Data:      data,
	}, nil
}

func extractPayloadForEncoding(messageType string, data map[string]any) (string, string) {
	switch messageType {
	case "terminal.output":
		if value, ok := data["output"].(string); ok {
			delete(data, "output")
			return "output", value
		}
	case "log.chunk":
		if value, ok := data["chunk"].(string); ok {
			delete(data, "chunk")
			return "chunk", value
		}
	case "file.result":
		if op, _ := data["op"].(string); op == "read" || op == "download" {
			if value, ok := data["content"].(string); ok {
				delete(data, "content")
				return "content", value
			}
		}
	}
	return "", ""
}

func inferPayloadKey(messageType string, data map[string]any) string {
	switch messageType {
	case "terminal.input":
		return "input"
	case "terminal.output":
		return "output"
	case "log.chunk":
		return "chunk"
	case "file.upload.chunk":
		return "chunk"
	case "file.write":
		return "content"
	case "auth":
		return "authorization"
	case "file.result":
		if op, _ := data["op"].(string); op == "read" || op == "download" {
			return "content"
		}
	}
	return ""
}

func cloneDataMap(input map[string]any) map[string]any {
	if len(input) == 0 {
		return map[string]any{}
	}
	out := make(map[string]any, len(input))
	for key, value := range input {
		out[key] = value
	}
	return out
}

func marshalDataMap(data map[string]any) ([]byte, error) {
	if len(data) == 0 {
		return nil, nil
	}
	return json.Marshal(data)
}

func unmarshalDataMap(raw []byte) (map[string]any, error) {
	if len(raw) == 0 {
		return map[string]any{}, nil
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, err
	}
	if out == nil {
		return map[string]any{}, nil
	}
	return out, nil
}
