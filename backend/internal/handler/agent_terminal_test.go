package handler

import (
	"encoding/json"
	"testing"

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
