package handler

import (
	"context"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	agentws "github.com/nightwhite/Agent-Hub/internal/ws"
	"k8s.io/client-go/tools/remotecommand"
)

const (
	agentTerminalWriteWait = 10 * time.Second
	agentTerminalPongWait  = 60 * time.Second
	agentTerminalPingEvery = (agentTerminalPongWait * 9) / 10
	agentTerminalAuthWait  = 15 * time.Second
	agentTerminalReadLimit = 2 << 20
)

type agentTerminalMessage struct {
	Type          string `json:"type"`
	Data          string `json:"data,omitempty"`
	Authorization string `json:"authorization,omitempty"`
	Rows          uint16 `json:"rows,omitempty"`
	Cols          uint16 `json:"cols,omitempty"`
	Cwd           string `json:"cwd,omitempty"`
	Namespace     string `json:"namespace,omitempty"`
	PodName       string `json:"podName,omitempty"`
	Container     string `json:"container,omitempty"`
	Code          string `json:"code,omitempty"`
}

type agentTerminalSession struct {
	conn       *websocket.Conn
	sendMu     sync.Mutex
	ctx        context.Context
	cancel     context.CancelFunc
	stdin      *io.PipeWriter
	resizeChan chan remotecommand.TerminalSize
}

func AgentTerminalWebSocket(c *gin.Context) {
	agentName := strings.TrimSpace(c.Param("agentName"))
	if err := validateAgentName(agentName); err != nil {
		writeValidationError(c, err)
		return
	}

	cfg := runtimeConfig(c)
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return agentws.CheckOrigin(cfg.WSAllowedOrigins, r)
		},
	}
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	conn.SetReadLimit(agentTerminalReadLimit)

	ctx, cancel := context.WithCancel(c.Request.Context())
	session := &agentTerminalSession{
		conn:       conn,
		ctx:        ctx,
		cancel:     cancel,
		resizeChan: make(chan remotecommand.TerminalSize, 8),
	}
	defer session.close()

	session.run(c, agentName)
}

func (s *agentTerminalSession) run(c *gin.Context, agentName string) {
	authMessage, ok := s.readAuthMessage()
	if !ok {
		return
	}

	factory, authErr := kube.NewFactoryFromEncodedKubeconfig(authMessage.Authorization)
	if authErr != nil {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "invalid_auth", Data: authErr.InternalMessage})
		return
	}

	clientset, err := factory.Kubernetes()
	if err != nil {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "kubernetes_client_failed", Data: "failed to build kubernetes clientset"})
		return
	}
	dynamicClient, err := factory.Dynamic()
	if err != nil {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "kubernetes_client_failed", Data: "failed to build kubernetes dynamic client"})
		return
	}
	devbox, err := kube.NewRepository(dynamicClient, factory.Namespace()).Get(s.ctx, agentName)
	if err != nil {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "agent_not_found", Data: "agent not found"})
		return
	}
	view, err := kube.DevboxToAgentView(devbox)
	if err != nil {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "agent_state_unavailable", Data: "failed to load agent state"})
		return
	}
	if view.Agent.Status != agent.StatusRunning {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "agent_not_running", Data: "agent is not running"})
		return
	}

	pod, err := kube.ResolveAgentPod(s.ctx, clientset, factory.Namespace(), agentName)
	if err != nil {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "agent_pod_not_found", Data: err.Error()})
		return
	}

	cwd, err := kube.ResolveTerminalPath(authMessage.Cwd)
	if err != nil {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "invalid_path", Data: err.Error()})
		return
	}

	stdinReader, stdinWriter := io.Pipe()
	s.stdin = stdinWriter

	_ = s.conn.SetReadDeadline(time.Now().Add(agentTerminalPongWait))
	s.conn.SetPongHandler(func(string) error {
		return s.conn.SetReadDeadline(time.Now().Add(agentTerminalPongWait))
	})

	done := make(chan struct{})
	go s.readLoop(done)
	go s.pingLoop(done)

	_ = s.send(agentTerminalMessage{
		Type:      "connected",
		Data:      "Terminal connected successfully",
		Namespace: factory.Namespace(),
		PodName:   pod.Name,
		Container: pod.Container,
	})

	command := []string{"bash", "-lc", kube.BuildTerminalBootstrapCommand(cwd)}
	err = kube.ExecInPodWebSocket(
		s.ctx,
		clientset,
		factory.RESTConfig(),
		factory.Namespace(),
		pod.Name,
		pod.Container,
		command,
		stdinReader,
		agentTerminalWriter{session: s, messageType: "stdout"},
		agentTerminalWriter{session: s, messageType: "stderr"},
		true,
		latestTerminalSizeQueue(s.resizeChan),
	)
	close(done)
	if err != nil && s.ctx.Err() == nil {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "terminal_exec_failed", Data: err.Error()})
	}
}

func (s *agentTerminalSession) readAuthMessage() (agentTerminalMessage, bool) {
	_ = s.conn.SetReadDeadline(time.Now().Add(agentTerminalAuthWait))

	var msg agentTerminalMessage
	if err := s.conn.ReadJSON(&msg); err != nil {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "auth_required", Data: "missing terminal auth message"})
		return agentTerminalMessage{}, false
	}

	if strings.TrimSpace(msg.Type) != "auth" {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "auth_required", Data: "first terminal websocket message must be auth"})
		return agentTerminalMessage{}, false
	}

	msg.Authorization = strings.TrimSpace(msg.Authorization)
	if msg.Authorization == "" {
		_ = s.send(agentTerminalMessage{Type: "error", Code: "auth_required", Data: "missing terminal authorization"})
		return agentTerminalMessage{}, false
	}

	return msg, true
}

func (s *agentTerminalSession) readLoop(done <-chan struct{}) {
	for {
		select {
		case <-done:
			return
		default:
		}

		var msg agentTerminalMessage
		if err := s.conn.ReadJSON(&msg); err != nil {
			s.cancel()
			return
		}

		switch strings.TrimSpace(msg.Type) {
		case "stdin":
			if msg.Data != "" && s.stdin != nil {
				_, _ = io.WriteString(s.stdin, msg.Data)
			}
		case "resize":
			s.resize(msg.Cols, msg.Rows)
		case "ping":
			_ = s.send(agentTerminalMessage{Type: "pong"})
		default:
			_ = s.send(agentTerminalMessage{Type: "error", Code: "unsupported_message_type", Data: "unsupported terminal websocket message type"})
		}
	}
}

func (s *agentTerminalSession) pingLoop(done <-chan struct{}) {
	ticker := time.NewTicker(agentTerminalPingEvery)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case <-s.ctx.Done():
			return
		case <-ticker.C:
			s.sendMu.Lock()
			_ = s.conn.SetWriteDeadline(time.Now().Add(agentTerminalWriteWait))
			err := s.conn.WriteMessage(websocket.PingMessage, nil)
			s.sendMu.Unlock()
			if err != nil {
				s.cancel()
				return
			}
		}
	}
}

func (s *agentTerminalSession) resize(cols, rows uint16) {
	if cols == 0 || rows == 0 {
		return
	}

	size := remotecommand.TerminalSize{Width: cols, Height: rows}
	select {
	case s.resizeChan <- size:
		return
	default:
	}

	select {
	case <-s.resizeChan:
	default:
	}

	select {
	case s.resizeChan <- size:
	default:
	}
}

func (s *agentTerminalSession) send(message agentTerminalMessage) error {
	s.sendMu.Lock()
	defer s.sendMu.Unlock()

	_ = s.conn.SetWriteDeadline(time.Now().Add(agentTerminalWriteWait))
	return s.conn.WriteJSON(message)
}

func (s *agentTerminalSession) close() {
	s.cancel()
	if s.stdin != nil {
		_ = s.stdin.Close()
	}
	if s.conn != nil {
		_ = s.conn.Close()
	}
}

type agentTerminalWriter struct {
	session     *agentTerminalSession
	messageType string
}

func (w agentTerminalWriter) Write(p []byte) (int, error) {
	if len(p) == 0 {
		return 0, nil
	}
	if err := w.session.send(agentTerminalMessage{Type: w.messageType, Data: string(p)}); err != nil {
		return 0, err
	}
	return len(p), nil
}

type latestTerminalSizeQueue chan remotecommand.TerminalSize

func (q latestTerminalSizeQueue) Next() *remotecommand.TerminalSize {
	size, ok := <-q
	if !ok {
		return nil
	}
	for {
		select {
		case next, ok := <-q:
			if !ok {
				return &size
			}
			size = next
		default:
			return &size
		}
	}
}
