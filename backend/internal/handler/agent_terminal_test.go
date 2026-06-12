package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	agentws "github.com/nightwhite/Agent-Hub/internal/ws"
	"k8s.io/client-go/tools/remotecommand"
)

func TestAgentTerminalMessageDecodeInput(t *testing.T) {
	t.Parallel()

	var msg agentTerminalMessage
	if err := json.Unmarshal([]byte(`{"type":"stdin","data":"ls\n"}`), &msg); err != nil {
		t.Fatal(err)
	}
	if msg.Type != "stdin" || msg.Data != "ls\n" {
		t.Fatalf("decoded = %#v", msg)
	}
}

func TestAgentTerminalAuthMessageDecode(t *testing.T) {
	t.Parallel()

	var msg agentTerminalMessage
	if err := json.Unmarshal([]byte(`{"type":"auth","authorization":"apiVersion%3A%20v1","cwd":"/workspace"}`), &msg); err != nil {
		t.Fatal(err)
	}
	if msg.Type != "auth" || msg.Authorization != "apiVersion%3A%20v1" || msg.Cwd != "/workspace" {
		t.Fatalf("decoded auth message = %#v", msg)
	}
}

func TestAgentTerminalWebSocketRejectsInvalidAgentName(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	engine.GET("/api/v1/agents/:agentName/terminal/ws", AgentTerminalWebSocket)

	request := httptest.NewRequest(http.MethodGet, "/api/v1/agents/../terminal/ws", nil)
	recorder := httptest.NewRecorder()

	engine.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusUnprocessableEntity {
		t.Fatalf("terminal websocket invalid agent status = %d, want %d", recorder.Code, http.StatusUnprocessableEntity)
	}
}

func TestAgentTerminalCheckOriginMatchesSameHostAndAllowedOrigins(t *testing.T) {
	t.Parallel()

	req, err := http.NewRequest(http.MethodGet, "http://agenthub.example.com/api/v1/agents/demo-agent/terminal/ws", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Host = "agenthub.example.com"

	if !agentws.CheckOrigin("", req) {
		t.Fatal("same-host terminal websocket origin should be allowed when Origin is empty")
	}

	req.Header.Set("Origin", "http://agenthub.example.com")
	if !agentws.CheckOrigin("", req) {
		t.Fatal("same-host terminal websocket origin should be allowed")
	}

	req.Header.Set("Origin", "https://console.example.com")
	if !agentws.CheckOrigin("console.example.com", req) {
		t.Fatal("configured terminal websocket origin host should be allowed")
	}

	req.Header.Set("Origin", "https://evil.example.com")
	if agentws.CheckOrigin("console.example.com", req) {
		t.Fatal("unconfigured cross-origin terminal websocket origin should be rejected")
	}
}

func TestAgentTerminalResizeKeepsLatest(t *testing.T) {
	t.Parallel()

	session := &agentTerminalSession{resizeChan: make(chan remotecommand.TerminalSize, 1)}
	session.resize(80, 24)
	session.resize(120, 32)

	size := latestTerminalSizeQueue(session.resizeChan).Next()
	if size == nil {
		t.Fatal("latestTerminalSizeQueue.Next() = nil, want latest size")
	}
	if size.Width != 120 || size.Height != 32 {
		t.Fatalf("latestTerminalSizeQueue.Next() = %dx%d, want 120x32", size.Width, size.Height)
	}
}
