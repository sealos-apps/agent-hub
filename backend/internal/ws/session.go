package ws

import (
	"bufio"
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/remotecommand"

	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
	resp "github.com/nightwhite/Agent-Hub/pkg/response"
)

const (
	fileRootDir             = "/"
	terminalDefaultDir      = "/opt/data/workspace"
	terminalHomeDir         = "/opt/data/home"
	terminalInstallDir      = "/opt/hermes"
	terminalRuntimeRoot     = "/opt/data"
	wsReadLimit             = 2 << 20
	wsWriteWait             = 10 * time.Second
	wsPongWait              = 60 * time.Second
	wsPingPeriod            = (wsPongWait * 9) / 10
	wsAuthTimeout           = 15 * time.Second
	maxFileReadSize         = 1 << 20
	maxFileDownloadSize     = 5 << 20
	maxFileUploadSize       = maxFileDownloadSize
	maxUploadChunkSize      = 1 << 20
	maxConcurrentUploads    = 4
	maxConcurrentFileReadOp = 6
	maxConcurrentFileEditOp = 2
	fileReadQueueTimeout    = 8 * time.Second
	fileReadExecTimeout     = 25 * time.Second
	fileEditQueueTimeout    = 20 * time.Second
	fileEditExecTimeout     = 60 * time.Second
	terminalChunkBatchBytes = 24 * 1024
	terminalChunkBatchDelay = 8 * time.Millisecond
	wsOutboundQueueCap      = 512
)

type Handler struct {
	Config config.Config
}

func (h Handler) Serve(c *gin.Context, requestID string) {
	agentName := strings.TrimSpace(c.Param("agentName"))
	if agentName == "" {
		resp.WriteGinError(c, http.StatusUnprocessableEntity, appErr.New(appErr.CodeInvalidAgentName, "invalid agent name"), requestID)
		return
	}

	upgrader := websocket.Upgrader{
		CheckOrigin: h.checkOrigin,
	}
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}

	session := newSession(conn, requestID, h.Config, agentName, bootstrapAuthorization(c))
	session.run()
}

type session struct {
	conn      *websocket.Conn
	requestID string
	config    config.Config
	agentName string
	sendMu    sync.Mutex
	stateMu   sync.RWMutex
	queueMu   sync.Mutex
	queueCond *sync.Cond
	ctx       context.Context
	cancel    context.CancelFunc
	writeDone chan struct{}
	writerOn  bool

	authorization string
	factory       *kube.Factory
	clientset     *kubernetes.Clientset
	pod           kube.PodRef

	terminals   map[string]*terminalSession
	logs        map[string]*logSession
	uploads     map[string]*uploadSession
	fileReadOps chan struct{}
	fileEditOps chan struct{}

	outboundQueue     []wsOutboundMessage
	outboundQueueCap  int
	outboundQueueStop bool
	droppedByStream   map[string]int
}

type wsOutboundPriority uint8

const (
	wsOutboundPriorityControl wsOutboundPriority = iota
	wsOutboundPriorityStream
)

type wsOutboundMessage struct {
	message   dto.WSMessage
	priority  wsOutboundPriority
	streamKey string
}

var (
	errFileOpQueueBusy = errors.New("file operation queue busy")
	errFileOpTimeout   = errors.New("file operation timed out")
)

func newSession(conn *websocket.Conn, requestID string, cfg config.Config, agentName, bootstrapAuth string) *session {
	ctx, cancel := context.WithCancel(context.Background())
	s := &session{
		conn:             conn,
		requestID:        requestID,
		config:           cfg,
		agentName:        agentName,
		ctx:              ctx,
		cancel:           cancel,
		authorization:    strings.TrimSpace(bootstrapAuth),
		terminals:        map[string]*terminalSession{},
		logs:             map[string]*logSession{},
		uploads:          map[string]*uploadSession{},
		fileReadOps:      make(chan struct{}, maxConcurrentFileReadOp),
		fileEditOps:      make(chan struct{}, maxConcurrentFileEditOp),
		writeDone:        make(chan struct{}),
		outboundQueue:    make([]wsOutboundMessage, 0, wsOutboundQueueCap),
		outboundQueueCap: wsOutboundQueueCap,
		droppedByStream:  map[string]int{},
	}
	s.queueCond = sync.NewCond(&s.queueMu)
	return s
}

func (s *session) run() {
	defer s.close()

	s.conn.SetReadLimit(wsReadLimit)
	_ = s.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	s.conn.SetPongHandler(func(string) error {
		return s.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	})

	s.queueMu.Lock()
	s.writerOn = true
	s.queueMu.Unlock()
	go s.writeLoop()

	pingDone := make(chan struct{})
	go s.pingLoop(pingDone)

	if s.authorization != "" {
		if err := s.authenticate(s.authorization); err != nil {
			s.sendAppError(s.requestID, err)
			close(pingDone)
			return
		}
		s.sendSystemReady(s.requestID)
	} else {
		_ = s.conn.SetReadDeadline(time.Now().Add(wsAuthTimeout))
		s.send(dto.WSMessage{
			Type:      "auth.required",
			RequestID: s.requestID,
			Data: map[string]any{
				"message": "send auth message with encoded kubeconfig",
			},
		})
	}

	for {
		_, payload, err := s.conn.ReadMessage()
		if err != nil {
			close(pingDone)
			return
		}

		message, decodeErr := decodeWSBinaryMessage(payload)
		if decodeErr != nil {
			s.sendError("", "invalid_message_frame", decodeErr.Error())
			continue
		}
		s.handleMessage(message)
	}
}

func (s *session) close() {
	s.cancel()
	s.stopWriteLoop()

	s.stateMu.Lock()
	for _, terminal := range s.terminals {
		terminal.close()
	}
	for _, logStream := range s.logs {
		logStream.close()
	}
	s.terminals = map[string]*terminalSession{}
	s.logs = map[string]*logSession{}
	s.uploads = map[string]*uploadSession{}
	s.stateMu.Unlock()

	s.queueMu.Lock()
	writerOn := s.writerOn
	s.queueMu.Unlock()
	if writerOn {
		<-s.writeDone
	}
	if s.conn != nil {
		_ = s.conn.Close()
	}
}

func (s *session) pingLoop(done <-chan struct{}) {
	ticker := time.NewTicker(wsPingPeriod)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.sendMu.Lock()
			_ = s.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
			err := s.conn.WriteMessage(websocket.PingMessage, nil)
			s.sendMu.Unlock()
			if err != nil {
				return
			}
		}
	}
}

func (s *session) handleMessage(message dto.WSMessage) {
	if err := validateMessage(message); err != nil {
		s.sendError(message.RequestID, "invalid_message", err.Error())
		return
	}

	switch message.Type {
	case "ping":
		s.send(dto.WSMessage{Type: "pong", RequestID: message.RequestID})
		return
	case "auth":
		s.handleAuth(message)
		return
	}

	if !s.isAuthenticated() {
		s.sendError(message.RequestID, "auth_required", "websocket session is not authenticated")
		return
	}

	switch message.Type {
	case "terminal.open":
		s.openTerminal(message)
	case "terminal.input":
		s.terminalInput(message)
	case "terminal.resize":
		s.terminalResize(message)
	case "terminal.close":
		s.closeTerminal(message)
	case "log.subscribe":
		s.subscribeLogs(message)
	case "log.unsubscribe":
		s.unsubscribeLogs(message)
	case "file.list":
		go s.fileList(message)
	case "file.read":
		go s.fileRead(message)
	case "file.download":
		go s.fileDownload(message)
	case "file.write":
		go s.fileWrite(message)
	case "file.delete":
		go s.fileDelete(message)
	case "file.mkdir":
		go s.fileMkdir(message)
	case "file.upload.begin":
		s.fileUploadBegin(message)
	case "file.upload.chunk":
		s.fileUploadChunk(message)
	case "file.upload.end":
		s.fileUploadEnd(message)
	default:
		s.sendError(message.RequestID, "unsupported_message_type", "unsupported websocket message type")
	}
}

func (s *session) handleAuth(message dto.WSMessage) {
	if s.isAuthenticated() {
		s.sendError(message.RequestID, "already_authenticated", "websocket session is already authenticated")
		return
	}

	auth := getTrimmedString(message.Data, "authorization")
	if err := s.authenticate(auth); err != nil {
		s.sendAppError(message.RequestID, err)
		return
	}

	_ = s.conn.SetReadDeadline(time.Now().Add(wsPongWait))
	s.sendSystemReady(message.RequestID)
}

func (s *session) authenticate(encodedAuthorization string) *appErr.AppError {
	factory, err := kube.NewFactoryFromEncodedKubeconfig(encodedAuthorization)
	if err != nil {
		return err
	}

	clientset, kErr := factory.Kubernetes()
	if kErr != nil {
		return appErr.New(appErr.CodeKubernetesOperation, "failed to build kubernetes clientset")
	}

	podRef, resolveErr := kube.ResolveAgentPod(s.ctx, clientset, factory.Namespace(), s.agentName)
	if resolveErr != nil {
		return appErr.New(appErr.CodeNotFound, resolveErr.Error())
	}

	s.stateMu.Lock()
	s.authorization = encodedAuthorization
	s.factory = factory
	s.clientset = clientset
	s.pod = podRef
	s.stateMu.Unlock()

	return nil
}

func (s *session) isAuthenticated() bool {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.factory != nil && s.clientset != nil
}

func (s *session) sendSystemReady(requestID string) {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()

	s.send(dto.WSMessage{
		Type:      "system.ready",
		RequestID: requestID,
		Data: map[string]any{
			"agentName": s.agentName,
			"namespace": s.factory.Namespace(),
			"podName":   s.pod.Name,
			"container": s.pod.Container,
			"message":   "websocket connected",
		},
	})
}

func (s *session) openTerminal(message dto.WSMessage) {
	id := sessionID(message)

	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	if _, exists := s.terminals[id]; exists {
		s.sendError(message.RequestID, "terminal_already_open", "terminal session already open")
		return
	}

	cwd, err := resolveTerminalPath(getTrimmedString(message.Data, "cwd"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	term := newTerminalSession(s, id, message.RequestID)
	s.terminals[id] = term
	s.send(dto.WSMessage{
		Type:      "terminal.opened",
		RequestID: message.RequestID,
		Data: map[string]any{
			"id":  id,
			"cwd": cwd,
		},
	})

	go term.run(cwd)
}

func (s *session) terminalInput(message dto.WSMessage) {
	terminal := s.lookupTerminal(sessionID(message))
	if terminal == nil {
		s.sendError(message.RequestID, "terminal_not_open", "terminal session is not open")
		return
	}

	if _, err := io.WriteString(terminal.stdin, getRawString(message.Data, "input")); err != nil {
		s.sendError(message.RequestID, "terminal_write_failed", err.Error())
	}
}

func (s *session) terminalResize(message dto.WSMessage) {
	terminal := s.lookupTerminal(sessionID(message))
	if terminal == nil {
		s.sendError(message.RequestID, "terminal_not_open", "terminal session is not open")
		return
	}

	cols := int(getNumber(message.Data, "cols"))
	rows := int(getNumber(message.Data, "rows"))
	if cols <= 0 || rows <= 0 {
		s.sendError(message.RequestID, "invalid_terminal_size", "terminal size must be positive")
		return
	}
	terminal.resize(cols, rows)
}

func (s *session) closeTerminal(message dto.WSMessage) {
	id := sessionID(message)
	terminal := s.lookupTerminal(id)
	if terminal == nil {
		return
	}
	terminal.close()
	terminal.emitClosed(message.RequestID)
	s.removeTerminal(id)
}

func (s *session) subscribeLogs(message dto.WSMessage) {
	id := sessionID(message)
	logSession := newLogSession(s, id, message.RequestID)

	s.stateMu.Lock()
	if existing, exists := s.logs[id]; exists {
		existing.close()
	}
	s.logs[id] = logSession
	s.stateMu.Unlock()

	go logSession.run(corev1.PodLogOptions{
		Follow:    true,
		TailLines: optionalInt64(getNumber(message.Data, "tailLines")),
	})
}

func (s *session) unsubscribeLogs(message dto.WSMessage) {
	id := sessionID(message)
	logSession := s.lookupLog(id)
	if logSession == nil {
		return
	}
	logSession.close()
	logSession.emitClosed(message.RequestID)
	s.removeLog(id)
}

func (s *session) fileList(message dto.WSMessage) {
	resolved, err := resolveFilePath(getTrimmedString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	output, execErr := s.execCapture("list", []string{"sh", "-lc", listCommand(resolved)}, "")
	if execErr != nil {
		code, msg := mapFileOperationError("file_list_failed", "list", execErr)
		s.sendError(message.RequestID, code, msg)
		return
	}

	items := parseListOutput(output)
	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":    "list",
		"path":  resolved,
		"items": items,
	}})
}

func (s *session) fileRead(message dto.WSMessage) {
	resolved, err := resolveFilePath(getTrimmedString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	output, execErr := s.execCapture("read", []string{"sh", "-lc", readCommand(resolved, maxFileReadSize+1)}, "")
	if execErr != nil {
		code, msg := mapFileOperationError("file_read_failed", "read", execErr)
		s.sendError(message.RequestID, code, msg)
		return
	}
	if len(output) > maxFileReadSize {
		s.sendError(message.RequestID, "file_too_large", "file exceeds maximum inline read size")
		return
	}

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":      "read",
		"path":    resolved,
		"content": output,
	}})
}

func (s *session) fileDownload(message dto.WSMessage) {
	resolved, err := resolveFilePath(getTrimmedString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	output, execErr := s.execCapture("download", []string{"sh", "-lc", readCommand(resolved, maxFileDownloadSize+1)}, "")
	if execErr != nil {
		code, msg := mapFileOperationError("file_download_failed", "download", execErr)
		s.sendError(message.RequestID, code, msg)
		return
	}
	if len(output) > maxFileDownloadSize {
		s.sendError(message.RequestID, "file_too_large", "file exceeds maximum download size")
		return
	}

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":       "download",
		"path":     resolved,
		"content":  base64.StdEncoding.EncodeToString([]byte(output)),
		"encoding": "base64",
	}})
}

func (s *session) fileWrite(message dto.WSMessage) {
	resolved, err := resolveFilePath(getTrimmedString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	if _, execErr := s.execCapture("write", []string{"sh", "-lc", "cat > " + shellQuote(resolved)}, getRawString(message.Data, "content")); execErr != nil {
		code, msg := mapFileOperationError("file_write_failed", "write", execErr)
		s.sendError(message.RequestID, code, msg)
		return
	}

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":      "write",
		"path":    resolved,
		"written": true,
	}})
}

func (s *session) fileDelete(message dto.WSMessage) {
	resolved, err := resolveFilePath(getTrimmedString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	if _, execErr := s.execCapture("delete", []string{"sh", "-lc", "rm -rf -- " + shellQuote(resolved)}, ""); execErr != nil {
		code, msg := mapFileOperationError("file_delete_failed", "delete", execErr)
		s.sendError(message.RequestID, code, msg)
		return
	}

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":      "delete",
		"path":    resolved,
		"deleted": true,
	}})
}

func (s *session) fileMkdir(message dto.WSMessage) {
	resolved, err := resolveFilePath(getTrimmedString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	if _, execErr := s.execCapture("mkdir", []string{"sh", "-lc", "mkdir -p -- " + shellQuote(resolved)}, ""); execErr != nil {
		code, msg := mapFileOperationError("file_mkdir_failed", "mkdir", execErr)
		s.sendError(message.RequestID, code, msg)
		return
	}

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":      "mkdir",
		"path":    resolved,
		"created": true,
	}})
}

func (s *session) fileUploadBegin(message dto.WSMessage) {
	id := sessionID(message)
	resolved, err := resolveFilePath(getTrimmedString(message.Data, "path"))
	if err != nil {
		s.sendError(message.RequestID, "invalid_path", err.Error())
		return
	}

	s.stateMu.Lock()
	if _, exists := s.uploads[id]; !exists && len(s.uploads) >= maxConcurrentUploads {
		s.stateMu.Unlock()
		s.sendError(message.RequestID, "upload_queue_busy", "too many upload sessions are open")
		return
	}
	s.uploads[id] = &uploadSession{ID: id, Path: resolved}
	s.stateMu.Unlock()

	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":       "upload.begin",
		"id":       id,
		"path":     resolved,
		"accepted": true,
	}})
}

func (s *session) fileUploadChunk(message dto.WSMessage) {
	id := sessionID(message)
	upload := s.lookupUpload(id)
	if upload == nil {
		s.sendError(message.RequestID, "upload_not_found", "upload session is not open")
		return
	}

	chunk := getRawString(message.Data, "chunk")
	decoded, err := base64.StdEncoding.DecodeString(chunk)
	if err != nil {
		s.sendError(message.RequestID, "invalid_chunk", "upload chunk must be base64")
		return
	}
	if len(decoded) > maxUploadChunkSize {
		s.sendError(message.RequestID, "chunk_too_large", "upload chunk exceeds maximum size")
		return
	}
	if upload.Buffer.Len()+len(decoded) > maxFileUploadSize {
		s.removeUpload(id)
		s.sendError(message.RequestID, "file_too_large", "upload exceeds maximum file size")
		return
	}

	upload.Buffer.Write(decoded)
	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":   "upload.chunk",
		"id":   id,
		"size": upload.Buffer.Len(),
	}})
}

func (s *session) fileUploadEnd(message dto.WSMessage) {
	id := sessionID(message)
	upload := s.lookupUpload(id)
	if upload == nil {
		s.sendError(message.RequestID, "upload_not_found", "upload session is not open")
		return
	}

	if _, execErr := s.execCapture("upload", []string{"sh", "-lc", "cat > " + shellQuote(upload.Path)}, upload.Buffer.String()); execErr != nil {
		s.removeUpload(id)
		code, msg := mapFileOperationError("file_upload_failed", "upload", execErr)
		s.sendError(message.RequestID, code, msg)
		return
	}

	s.removeUpload(id)
	s.send(dto.WSMessage{Type: "file.result", RequestID: message.RequestID, Data: map[string]any{
		"op":      "upload.end",
		"id":      id,
		"path":    upload.Path,
		"written": true,
	}})
}

func (s *session) execCapture(operation string, command []string, stdin string) (string, error) {
	s.stateMu.RLock()
	clientset := s.clientset
	factory := s.factory
	pod := s.pod
	s.stateMu.RUnlock()

	queueChannel := s.fileEditOps
	queueTimeout := fileEditQueueTimeout
	execTimeout := fileEditExecTimeout
	switch operation {
	case "list", "read", "download":
		queueChannel = s.fileReadOps
		queueTimeout = fileReadQueueTimeout
		execTimeout = fileReadExecTimeout
	}

	queueCtx, queueCancel := context.WithTimeout(s.ctx, queueTimeout)
	defer queueCancel()
	select {
	case queueChannel <- struct{}{}:
	case <-queueCtx.Done():
		if errors.Is(queueCtx.Err(), context.DeadlineExceeded) {
			return "", fmt.Errorf("%w: %s", errFileOpQueueBusy, operation)
		}
		return "", queueCtx.Err()
	}
	defer func() {
		<-queueChannel
	}()

	execCtx, execCancel := context.WithTimeout(s.ctx, execTimeout)
	defer execCancel()

	var stdout strings.Builder
	var stderr strings.Builder
	var stdinReader io.Reader
	if stdin != "" {
		stdinReader = strings.NewReader(stdin)
	}

	err := kube.ExecInPod(execCtx, clientset, factory.RESTConfig(), factory.Namespace(), pod.Name, pod.Container, command, stdinReader, &stdout, &stderr, false, nil)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(execCtx.Err(), context.DeadlineExceeded) {
			return "", fmt.Errorf("%w: %s", errFileOpTimeout, operation)
		}
		if stderr.Len() > 0 {
			return "", fmt.Errorf("%s: %w", strings.TrimSpace(stderr.String()), err)
		}
		return "", err
	}
	if stderr.Len() > 0 {
		return "", fmt.Errorf("%s", strings.TrimSpace(stderr.String()))
	}
	return stdout.String(), nil
}

func (s *session) send(msg dto.WSMessage) {
	_ = s.sendJSON(msg)
}

func (s *session) sendAppError(requestID string, err *appErr.AppError) {
	s.send(dto.WSMessage{
		Type:      "error",
		RequestID: requestID,
		Data: map[string]any{
			"code":    err.Type(),
			"message": err.Error(),
			"details": err.Details(),
		},
	})
}

func (s *session) sendError(requestID, code, message string) {
	s.send(dto.WSMessage{
		Type:      "error",
		RequestID: requestID,
		Data: map[string]any{
			"code":    code,
			"message": message,
		},
	})
}

func (s *session) sendJSON(v any) error {
	message, ok := v.(dto.WSMessage)
	if !ok {
		return fmt.Errorf("unsupported websocket payload type %T", v)
	}
	if !s.enqueueOutbound(message) {
		return io.ErrClosedPipe
	}
	return nil
}

func (s *session) writeLoop() {
	defer close(s.writeDone)

	for {
		outbound, ok := s.dequeueOutbound()
		if !ok {
			return
		}
		if err := s.writeFrame(outbound.message); err != nil {
			s.cancel()
			return
		}
	}
}

func (s *session) writeFrame(message dto.WSMessage) error {
	frame, err := encodeWSBinaryMessage(message)
	if err != nil {
		return err
	}

	s.sendMu.Lock()
	defer s.sendMu.Unlock()

	_ = s.conn.SetWriteDeadline(time.Now().Add(wsWriteWait))
	return s.conn.WriteMessage(websocket.BinaryMessage, frame)
}

func (s *session) stopWriteLoop() {
	s.queueMu.Lock()
	if s.outboundQueueStop {
		s.queueMu.Unlock()
		return
	}
	s.outboundQueueStop = true
	s.queueCond.Broadcast()
	s.queueMu.Unlock()
}

func (s *session) enqueueOutbound(message dto.WSMessage) bool {
	outbound := wsOutboundMessage{
		message:   message,
		priority:  outboundPriorityForType(message.Type),
		streamKey: streamKeyForMessage(message),
	}

	s.queueMu.Lock()
	defer s.queueMu.Unlock()

	if s.outboundQueueStop {
		return false
	}

	if len(s.outboundQueue) >= s.outboundQueueCap {
		if !s.evictForInbound(outbound.priority) {
			s.recordDroppedLocked(outbound)
			return true
		}
	}

	s.applyDroppedMarkerLocked(&outbound)
	s.outboundQueue = append(s.outboundQueue, outbound)
	s.queueCond.Signal()
	return true
}

func (s *session) dequeueOutbound() (wsOutboundMessage, bool) {
	s.queueMu.Lock()
	defer s.queueMu.Unlock()

	for len(s.outboundQueue) == 0 && !s.outboundQueueStop {
		s.queueCond.Wait()
	}
	if len(s.outboundQueue) == 0 {
		return wsOutboundMessage{}, false
	}

	index := 0
	if s.outboundQueue[0].priority == wsOutboundPriorityStream {
		for i := 1; i < len(s.outboundQueue); i++ {
			if s.outboundQueue[i].priority == wsOutboundPriorityControl {
				index = i
				break
			}
		}
	}

	message := s.outboundQueue[index]
	s.outboundQueue = append(s.outboundQueue[:index], s.outboundQueue[index+1:]...)
	return message, true
}

func (s *session) evictForInbound(priority wsOutboundPriority) bool {
	streamIndex := -1
	for i, queued := range s.outboundQueue {
		if queued.priority == wsOutboundPriorityStream {
			streamIndex = i
			break
		}
	}
	if streamIndex >= 0 {
		s.recordDroppedLocked(s.outboundQueue[streamIndex])
		s.outboundQueue = append(s.outboundQueue[:streamIndex], s.outboundQueue[streamIndex+1:]...)
		return true
	}

	if priority == wsOutboundPriorityControl && len(s.outboundQueue) > 0 {
		s.outboundQueue = s.outboundQueue[1:]
		return true
	}

	return false
}

func (s *session) recordDroppedLocked(message wsOutboundMessage) {
	if message.streamKey == "" {
		return
	}
	s.droppedByStream[message.streamKey] = s.droppedByStream[message.streamKey] + 1
}

func (s *session) applyDroppedMarkerLocked(message *wsOutboundMessage) {
	if message == nil || message.streamKey == "" {
		return
	}
	dropped := s.droppedByStream[message.streamKey]
	if dropped <= 0 {
		return
	}
	if message.message.Data == nil {
		message.message.Data = map[string]any{}
	}
	message.message.Data["dropped"] = true
	message.message.Data["droppedCount"] = dropped
	delete(s.droppedByStream, message.streamKey)
}

func outboundPriorityForType(messageType string) wsOutboundPriority {
	switch messageType {
	case "terminal.output", "log.chunk":
		return wsOutboundPriorityStream
	default:
		return wsOutboundPriorityControl
	}
}

func streamKeyForMessage(message dto.WSMessage) string {
	switch message.Type {
	case "terminal.output", "log.chunk":
		return message.Type + ":" + sessionID(message)
	default:
		return ""
	}
}

func (s *session) lookupTerminal(id string) *terminalSession {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.terminals[id]
}

func (s *session) removeTerminal(id string) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	delete(s.terminals, id)
}

func (s *session) lookupLog(id string) *logSession {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.logs[id]
}

func (s *session) removeLog(id string) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	delete(s.logs, id)
}

func (s *session) lookupUpload(id string) *uploadSession {
	s.stateMu.RLock()
	defer s.stateMu.RUnlock()
	return s.uploads[id]
}

func (s *session) removeUpload(id string) {
	s.stateMu.Lock()
	defer s.stateMu.Unlock()
	delete(s.uploads, id)
}

type terminalSession struct {
	session     *session
	id          string
	requestID   string
	ctx         context.Context
	cancel      context.CancelFunc
	stdinReader *io.PipeReader
	stdin       *io.PipeWriter
	resizeChan  chan remotecommand.TerminalSize
	closed      sync.Once
	emitted     sync.Once
}

func newTerminalSession(s *session, id, requestID string) *terminalSession {
	ctx, cancel := context.WithCancel(s.ctx)
	stdinReader, stdinWriter := io.Pipe()
	return &terminalSession{
		session:     s,
		id:          id,
		requestID:   requestID,
		ctx:         ctx,
		cancel:      cancel,
		stdinReader: stdinReader,
		stdin:       stdinWriter,
		resizeChan:  make(chan remotecommand.TerminalSize, 8),
	}
}

func (t *terminalSession) run(cwd string) {
	writer := &wsChunkWriter{
		session:   t.session,
		msgType:   "terminal.output",
		requestID: t.requestID,
		dataKey:   "output",
		id:        t.id,
	}
	defer writer.Close()

	t.session.stateMu.RLock()
	clientset := t.session.clientset
	factory := t.session.factory
	pod := t.session.pod
	t.session.stateMu.RUnlock()

	command := []string{"bash", "-lc", buildTerminalBootstrapCommand(cwd)}
	err := kube.ExecInPod(t.ctx, clientset, factory.RESTConfig(), factory.Namespace(), pod.Name, pod.Container, command, t.stdinReader, writer, writer, true, terminalSizeQueue(t.resizeChan))
	if err != nil && t.ctx.Err() == nil {
		t.session.sendError(t.requestID, "terminal_exec_failed", err.Error())
	}
	t.emitClosed(t.requestID)
	t.session.removeTerminal(t.id)
}

func (t *terminalSession) resize(cols, rows int) {
	select {
	case t.resizeChan <- remotecommand.TerminalSize{Width: uint16(cols), Height: uint16(rows)}:
	default:
	}
}

func (t *terminalSession) close() {
	t.closed.Do(func() {
		t.cancel()
		if t.stdin != nil {
			_ = t.stdin.Close()
		}
	})
}

func (t *terminalSession) emitClosed(requestID string) {
	t.emitted.Do(func() {
		t.session.send(dto.WSMessage{
			Type:      "terminal.closed",
			RequestID: requestID,
			Data:      map[string]any{"id": t.id},
		})
	})
}

type terminalSizeQueue chan remotecommand.TerminalSize

func (q terminalSizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q
	if !ok {
		return nil
	}
	return &size
}

type logSession struct {
	session   *session
	id        string
	requestID string
	ctx       context.Context
	cancel    context.CancelFunc
	emitted   sync.Once
}

func newLogSession(s *session, id, requestID string) *logSession {
	ctx, cancel := context.WithCancel(s.ctx)
	return &logSession{session: s, id: id, requestID: requestID, ctx: ctx, cancel: cancel}
}

func (l *logSession) run(opts corev1.PodLogOptions) {
	l.session.stateMu.RLock()
	clientset := l.session.clientset
	factory := l.session.factory
	pod := l.session.pod
	l.session.stateMu.RUnlock()

	stream, err := kube.StreamPodLogs(l.ctx, clientset, factory.Namespace(), pod.Name, pod.Container, &opts)
	if err != nil {
		l.session.sendError(l.requestID, "log_stream_failed", err.Error())
		return
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 1024*1024)
	for scanner.Scan() {
		l.session.send(dto.WSMessage{
			Type:      "log.chunk",
			RequestID: l.requestID,
			Data: map[string]any{
				"id":    l.id,
				"chunk": scanner.Text(),
			},
		})
	}
	if err := scanner.Err(); err != nil && l.ctx.Err() == nil {
		l.session.sendError(l.requestID, "log_stream_failed", err.Error())
	}
	l.emitClosed(l.requestID)
	l.session.removeLog(l.id)
}

func (l *logSession) close() {
	l.cancel()
}

func (l *logSession) emitClosed(requestID string) {
	l.emitted.Do(func() {
		l.session.send(dto.WSMessage{
			Type:      "log.closed",
			RequestID: requestID,
			Data:      map[string]any{"id": l.id},
		})
	})
}

type uploadSession struct {
	ID     string
	Path   string
	Buffer bytes.Buffer
}

type wsChunkWriter struct {
	session   *session
	msgType   string
	requestID string
	dataKey   string
	id        string
	mu        sync.Mutex
	buffer    strings.Builder
	pending   bool
	closed    bool
}

func (w *wsChunkWriter) Write(p []byte) (int, error) {
	if len(p) == 0 {
		return len(p), nil
	}

	var immediateChunk string

	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return 0, io.ErrClosedPipe
	}

	w.buffer.Write(p)
	if w.buffer.Len() >= terminalChunkBatchBytes {
		immediateChunk = w.buffer.String()
		w.buffer.Reset()
	} else if !w.pending {
		w.pending = true
		go w.flushScheduled()
	}
	w.mu.Unlock()

	if immediateChunk != "" {
		if err := w.sendChunk(immediateChunk); err != nil {
			return 0, err
		}
	}

	return len(p), nil
}

func (w *wsChunkWriter) Close() {
	var remainingChunk string

	w.mu.Lock()
	if w.closed {
		w.mu.Unlock()
		return
	}
	w.closed = true
	if w.buffer.Len() > 0 {
		remainingChunk = w.buffer.String()
		w.buffer.Reset()
	}
	w.pending = false
	w.mu.Unlock()

	if remainingChunk != "" {
		_ = w.sendChunk(remainingChunk)
	}
}

func (w *wsChunkWriter) flushScheduled() {
	time.Sleep(terminalChunkBatchDelay)

	var chunk string
	w.mu.Lock()
	if w.closed {
		w.pending = false
		w.mu.Unlock()
		return
	}
	if w.buffer.Len() > 0 {
		chunk = w.buffer.String()
		w.buffer.Reset()
	}
	w.pending = false
	w.mu.Unlock()

	if chunk != "" {
		_ = w.sendChunk(chunk)
	}
}

func (w *wsChunkWriter) sendChunk(chunk string) error {
	if chunk == "" {
		return nil
	}

	return w.session.sendJSON(dto.WSMessage{
		Type:      w.msgType,
		RequestID: w.requestID,
		Data: map[string]any{
			"id":      w.id,
			w.dataKey: chunk,
		},
	})
}

func (h Handler) checkOrigin(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}

	originURL, err := url.Parse(origin)
	if err != nil {
		return false
	}

	if originURL.Host == r.Host {
		return true
	}

	for _, allowed := range splitCSV(h.Config.WSAllowedOrigins) {
		if origin == allowed || originURL.Host == allowed {
			return true
		}
	}

	return false
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if part != "" {
			out = append(out, part)
		}
	}
	return out
}

func bootstrapAuthorization(c *gin.Context) string {
	if headerValue := strings.TrimSpace(c.GetHeader(kube.DefaultAuthorizationHeader)); headerValue != "" {
		return headerValue
	}
	return strings.TrimSpace(c.Query(kube.WebSocketAuthorizationQueryParam))
}

func sessionID(message dto.WSMessage) string {
	if id := getTrimmedString(message.Data, "id"); id != "" {
		return id
	}
	if message.RequestID != "" {
		return message.RequestID
	}
	return "default"
}

func getRawString(data map[string]any, key string) string {
	if data == nil {
		return ""
	}
	value, _ := data[key]
	text, _ := value.(string)
	return text
}

func getTrimmedString(data map[string]any, key string) string {
	return strings.TrimSpace(getRawString(data, key))
}

func getNumber(data map[string]any, key string) float64 {
	if data == nil {
		return 0
	}
	switch value := data[key].(type) {
	case float64:
		return value
	case int:
		return float64(value)
	case string:
		parsed, _ := strconv.ParseFloat(strings.TrimSpace(value), 64)
		return parsed
	default:
		return 0
	}
}

func optionalInt64(v float64) *int64 {
	if v <= 0 {
		return nil
	}
	result := int64(v)
	return &result
}

func resolveFilePath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "." {
		return fileRootDir, nil
	}

	cleaned := path.Clean(raw)
	if path.IsAbs(cleaned) {
		return cleaned, nil
	}

	resolved := path.Join(fileRootDir, cleaned)
	return resolved, nil
}

func resolveTerminalPath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "." {
		return terminalDefaultDir, nil
	}

	cleaned := path.Clean(raw)
	if path.IsAbs(cleaned) {
		if isWithinRoot(cleaned, terminalRuntimeRoot) || isWithinRoot(cleaned, terminalInstallDir) {
			return cleaned, nil
		}
		return "", fmt.Errorf("path escapes the terminal workspace")
	}

	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", fmt.Errorf("path escapes the terminal workspace")
	}

	resolved := path.Join(terminalDefaultDir, cleaned)
	if !isWithinRoot(resolved, terminalDefaultDir) {
		return "", fmt.Errorf("path escapes the terminal workspace")
	}
	return resolved, nil
}

func isWithinRoot(target, root string) bool {
	return target == root || strings.HasPrefix(target, root+"/")
}

func buildTerminalBootstrapCommand(cwd string) string {
	return strings.Join([]string{
		"export HERMES_HOME=${HERMES_HOME:-" + shellQuote(terminalRuntimeRoot) + "}",
		"if [ -d " + shellQuote(terminalHomeDir) + " ]; then export HOME=" + shellQuote(terminalHomeDir) + "; fi",
		"if [ -d " + shellQuote(terminalInstallDir+"/.venv/bin") + " ]; then export PATH=" + shellQuote(terminalInstallDir+"/.venv/bin") + ":$PATH; fi",
		"if [ -f " + shellQuote(terminalInstallDir+"/.venv/bin/activate") + " ]; then . " + shellQuote(terminalInstallDir+"/.venv/bin/activate") + "; fi",
		"mkdir -p " + shellQuote(terminalDefaultDir) + " >/dev/null 2>&1 || true",
		"cd -- " + shellQuote(cwd),
		"if command -v bash >/dev/null 2>&1; then exec bash; fi",
		"exec sh",
	}, " && ")
}

func shellQuote(input string) string {
	return "'" + strings.ReplaceAll(input, "'", `'\''`) + "'"
}

func formatFileListError(err error) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return "directory listing timed out; the directory may contain too many entries or the container filesystem is slow"
	}
	return err.Error()
}

func formatFileOperationError(err error) string {
	if errors.Is(err, context.DeadlineExceeded) {
		return "file operation timed out; please retry"
	}
	return err.Error()
}

func mapFileOperationError(defaultCode, operation string, err error) (string, string) {
	if errors.Is(err, errFileOpQueueBusy) {
		return "file_queue_busy", fmt.Sprintf("%s queue is busy; please retry", operation)
	}
	if errors.Is(err, errFileOpTimeout) || errors.Is(err, context.DeadlineExceeded) {
		return "file_operation_timeout", fmt.Sprintf("%s timed out; please retry", operation)
	}
	if defaultCode == "file_list_failed" {
		return defaultCode, formatFileListError(err)
	}
	return defaultCode, formatFileOperationError(err)
}

func listCommand(dir string) string {
	return "dir=" + shellQuote(dir) + "; " +
		"[ -d \"$dir\" ] || { echo 'not_a_directory'; exit 1; }; " +
		"if command -v find >/dev/null 2>&1 && find \"$dir\" -maxdepth 0 -printf '' >/dev/null 2>&1; then " +
		"find \"$dir\" -mindepth 1 -maxdepth 1 " +
		"\\( -type d -printf '%f\td\t0\n' -o -type f -printf '%f\tf\t%s\n' -o -printf '%f\to\t0\n' \\) 2>/dev/null | " +
		"sed -e 's/\td\t/\tdir\t/' -e 's/\tf\t/\tfile\t/' -e 's/\to\t/\tother\t/'; " +
		"else " +
		"for p in \"$dir\"/.* \"$dir\"/*; do " +
		"[ ! -e \"$p\" ] && continue; " +
		"base=${p##*/}; " +
		"[ \"$base\" = \".\" ] && continue; " +
		"[ \"$base\" = \"..\" ] && continue; " +
		"if [ -d \"$p\" ]; then kind=dir; size=0; " +
		"elif [ -f \"$p\" ]; then kind=file; size=$(stat -c %s -- \"$p\" 2>/dev/null || printf 0); " +
		"else kind=other; size=0; fi; " +
		"printf '%s\t%s\t%s\n' \"$base\" \"$kind\" \"$size\"; " +
		"done; " +
		"fi"
}

func readCommand(filePath string, maxBytes int) string {
	if maxBytes <= 0 {
		maxBytes = 1
	}

	maxBytesText := strconv.Itoa(maxBytes)
	return "file=" + shellQuote(filePath) + "; " +
		"[ -f \"$file\" ] || { echo 'not_a_file'; exit 1; }; " +
		"if command -v head >/dev/null 2>&1; then " +
		"head -c " + maxBytesText + " -- \"$file\"; " +
		"else " +
		"dd if=\"$file\" bs=1 count=" + maxBytesText + " 2>/dev/null; " +
		"fi"
}

func parseListOutput(raw string) []map[string]any {
	lines := strings.Split(strings.TrimSpace(raw), "\n")
	items := make([]map[string]any, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		if len(parts) != 3 {
			continue
		}
		size, _ := strconv.ParseInt(strings.TrimSpace(parts[2]), 10, 64)
		items = append(items, map[string]any{
			"name": parts[0],
			"type": parts[1],
			"size": size,
		})
	}
	return items
}

func validateMessage(message dto.WSMessage) error {
	if strings.TrimSpace(message.Type) == "" {
		return fmt.Errorf("message type is required")
	}

	requiredString := func(key string) error {
		if getTrimmedString(message.Data, key) == "" {
			return fmt.Errorf("%s is required", key)
		}
		return nil
	}

	requiredRawString := func(key string) error {
		value, exists := message.Data[key]
		if !exists {
			return fmt.Errorf("%s is required", key)
		}

		text, ok := value.(string)
		if !ok || text == "" {
			return fmt.Errorf("%s is required", key)
		}
		return nil
	}

	requiredID := func() error {
		return requiredString("id")
	}

	switch message.Type {
	case "auth":
		return requiredString("authorization")
	case "terminal.open":
		return requiredID()
	case "terminal.input":
		if err := requiredID(); err != nil {
			return err
		}
		return requiredRawString("input")
	case "terminal.resize":
		if err := requiredID(); err != nil {
			return err
		}
		if getNumber(message.Data, "cols") <= 0 || getNumber(message.Data, "rows") <= 0 {
			return fmt.Errorf("cols and rows must be positive")
		}
	case "log.subscribe", "log.unsubscribe", "terminal.close":
		return requiredID()
	case "file.list", "file.read", "file.download", "file.delete", "file.mkdir":
		return requiredString("path")
	case "file.write":
		if err := requiredString("path"); err != nil {
			return err
		}
		if _, exists := message.Data["content"]; !exists {
			return fmt.Errorf("content is required")
		}
	case "file.upload.begin":
		if err := requiredID(); err != nil {
			return err
		}
		return requiredString("path")
	case "file.upload.chunk":
		if err := requiredID(); err != nil {
			return err
		}
		return requiredRawString("chunk")
	case "file.upload.end":
		return requiredID()
	case "ping":
		return nil
	default:
		return nil
	}
	return nil
}
