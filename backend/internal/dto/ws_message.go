package dto

type WSMessage struct {
	Type      string         `json:"type"`
	RequestID string         `json:"requestId,omitempty"`
	Data      map[string]any `json:"data,omitempty"`
}
