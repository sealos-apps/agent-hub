package ws

import (
	"context"
	"encoding/base64"
	"strings"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
)

func TestResolveFilePathResolvesRelativePath(t *testing.T) {
	t.Parallel()

	got, err := resolveFilePath("notes/today.txt")
	if err != nil {
		t.Fatalf("resolveFilePath() error = %v", err)
	}
	if got != "/notes/today.txt" {
		t.Fatalf("resolveFilePath() = %q, want /notes/today.txt", got)
	}
}

func TestResolveFilePathAllowsAbsolutePath(t *testing.T) {
	t.Parallel()

	for _, input := range []string{"/tmp/file", "/opt/hermes/notes/today.txt"} {
		got, err := resolveFilePath(input)
		if err != nil {
			t.Fatalf("resolveFilePath(%q) error = %v", input, err)
		}
		if got != input {
			t.Fatalf("resolveFilePath(%q) = %q, want %q", input, got, input)
		}
	}
}

func TestSplitCSVFiltersEmptyValues(t *testing.T) {
	t.Parallel()

	got := splitCSV(" http://localhost:3000, ,127.0.0.1:5173 ")
	if len(got) != 2 {
		t.Fatalf("splitCSV() len = %d, want 2", len(got))
	}
}

func TestValidateMessageRequiresAuthAuthorization(t *testing.T) {
	t.Parallel()

	err := validateMessage(dto.WSMessage{Type: "auth", Data: map[string]any{}})
	if err == nil {
		t.Fatal("validateMessage(auth) should fail when authorization is missing")
	}
}

func TestValidateMessageRequiresIDForConcurrentOperations(t *testing.T) {
	t.Parallel()

	cases := []dto.WSMessage{
		{Type: "terminal.open", Data: map[string]any{"cwd": "."}},
		{Type: "terminal.input", Data: map[string]any{"input": "ls\n"}},
		{Type: "terminal.resize", Data: map[string]any{"cols": 80, "rows": 24}},
		{Type: "terminal.close", Data: map[string]any{}},
		{Type: "log.subscribe", Data: map[string]any{"tailLines": 50}},
		{Type: "log.unsubscribe", Data: map[string]any{}},
		{Type: "file.upload.begin", Data: map[string]any{"path": "a.txt"}},
		{Type: "file.upload.chunk", Data: map[string]any{"chunk": "aGVsbG8="}},
		{Type: "file.upload.end", Data: map[string]any{}},
	}

	for _, message := range cases {
		if err := validateMessage(message); err == nil {
			t.Fatalf("validateMessage(%s) should fail when id is missing", message.Type)
		}
	}
}

func TestValidateMessageAcceptsIDForConcurrentOperations(t *testing.T) {
	t.Parallel()

	message := dto.WSMessage{
		Type: "terminal.input",
		Data: map[string]any{
			"id":    "term-1",
			"input": "pwd\n",
		},
	}
	if err := validateMessage(message); err != nil {
		t.Fatalf("validateMessage() error = %v, want nil", err)
	}
}

func TestValidateMessageAllowsWhitespaceTerminalInput(t *testing.T) {
	t.Parallel()

	cases := []dto.WSMessage{
		{
			Type: "terminal.input",
			Data: map[string]any{
				"id":    "term-1",
				"input": " ",
			},
		},
		{
			Type: "terminal.input",
			Data: map[string]any{
				"id":    "term-1",
				"input": "\r",
			},
		},
	}

	for _, message := range cases {
		if err := validateMessage(message); err != nil {
			t.Fatalf("validateMessage(%q) error = %v, want nil", message.Data["input"], err)
		}
	}
}

func TestResolveFilePathResolvesDotDotRelativePath(t *testing.T) {
	t.Parallel()

	got, err := resolveFilePath("../etc/passwd")
	if err != nil {
		t.Fatalf("resolveFilePath() error = %v", err)
	}
	if got != "/etc/passwd" {
		t.Fatalf("resolveFilePath() = %q, want /etc/passwd", got)
	}
}

func TestResolveTerminalPathDefaultsToWorkspace(t *testing.T) {
	t.Parallel()

	got, err := resolveTerminalPath(".")
	if err != nil {
		t.Fatalf("resolveTerminalPath() error = %v", err)
	}
	if got != "/opt/data/workspace" {
		t.Fatalf("resolveTerminalPath() = %q, want /opt/data/workspace", got)
	}
}

func TestResolveTerminalPathAllowsHermesRuntimeRoots(t *testing.T) {
	t.Parallel()

	cases := []string{
		"/opt/data/workspace/project",
		"/opt/data/logs",
		"/opt/hermes",
		"/opt/hermes/.venv/bin",
	}

	for _, input := range cases {
		got, err := resolveTerminalPath(input)
		if err != nil {
			t.Fatalf("resolveTerminalPath(%q) error = %v", input, err)
		}
		if got != input {
			t.Fatalf("resolveTerminalPath(%q) = %q, want %q", input, got, input)
		}
	}
}

func TestResolveTerminalPathRejectsEscapes(t *testing.T) {
	t.Parallel()

	for _, input := range []string{"../etc/passwd", "/tmp/file", "/root"} {
		if _, err := resolveTerminalPath(input); err == nil {
			t.Fatalf("resolveTerminalPath(%q) should fail", input)
		}
	}
}

func TestSessionIDPrefersExplicitID(t *testing.T) {
	t.Parallel()

	got := sessionID(dto.WSMessage{
		Type:      "terminal.open",
		RequestID: "req-1",
		Data:      map[string]any{"id": "term-1"},
	})
	if got != "term-1" {
		t.Fatalf("sessionID() = %q, want term-1", got)
	}
}

func TestParseListOutputReturnsStructuredItems(t *testing.T) {
	t.Parallel()

	items := parseListOutput("a.txt\tfile\t12\nnotes\tdir\t0\n")
	if len(items) != 2 {
		t.Fatalf("parseListOutput() len = %d, want 2", len(items))
	}
	if items[0]["name"] != "a.txt" || items[0]["type"] != "file" {
		t.Fatalf("parseListOutput() first item = %#v", items[0])
	}
}

func TestListCommandUsesStatForFileSize(t *testing.T) {
	t.Parallel()

	command := listCommand("/opt/hermes")
	if strings.Contains(command, "wc -c") {
		t.Fatalf("listCommand() = %q, should not rely on wc -c", command)
	}
	if !strings.Contains(command, "find \"$dir\" -mindepth 1 -maxdepth 1") {
		t.Fatalf("listCommand() = %q, want find-based bulk listing path", command)
	}
	if !strings.Contains(command, "| sed -e 's/") || !strings.Contains(command, "dir") || !strings.Contains(command, "other") {
		t.Fatalf("listCommand() = %q, want streaming type remap for bulk listing output", command)
	}
	if !strings.Contains(command, "stat -c %s") {
		t.Fatalf("listCommand() = %q, want stat-based fallback when find -printf is unavailable", command)
	}
}

func TestReadCommandUsesBoundedHead(t *testing.T) {
	t.Parallel()

	command := readCommand("/opt/hermes/notes/today.txt", 1025)
	if !strings.Contains(command, "[ -f \"$file\" ]") {
		t.Fatalf("readCommand() = %q, want file existence guard", command)
	}
	if !strings.Contains(command, "head -c 1025") {
		t.Fatalf("readCommand() = %q, want bounded head read", command)
	}
	if !strings.Contains(command, "dd if=\"$file\" bs=1 count=1025") {
		t.Fatalf("readCommand() = %q, want dd fallback when head is unavailable", command)
	}
}

func TestReadCommandNormalizesNonPositiveLimit(t *testing.T) {
	t.Parallel()

	command := readCommand("/tmp/a.txt", 0)
	if !strings.Contains(command, "head -c 1") {
		t.Fatalf("readCommand() = %q, want minimum 1 byte limit", command)
	}
}

func TestFormatFileListErrorReturnsFriendlyTimeout(t *testing.T) {
	t.Parallel()

	got := formatFileListError(context.DeadlineExceeded)
	want := "directory listing timed out; the directory may contain too many entries or the container filesystem is slow"
	if got != want {
		t.Fatalf("formatFileListError() = %q, want %q", got, want)
	}
}

func TestFormatFileOperationErrorReturnsFriendlyTimeout(t *testing.T) {
	t.Parallel()

	got := formatFileOperationError(context.DeadlineExceeded)
	want := "file operation timed out; please retry"
	if got != want {
		t.Fatalf("formatFileOperationError() = %q, want %q", got, want)
	}
}

func TestMapFileOperationErrorClassifiesQueueBusy(t *testing.T) {
	t.Parallel()

	code, message := mapFileOperationError("file_read_failed", "read", errFileOpQueueBusy)
	if code != "file_queue_busy" {
		t.Fatalf("code = %q, want file_queue_busy", code)
	}
	if !strings.Contains(message, "queue is busy") {
		t.Fatalf("message = %q, want queue busy hint", message)
	}
}

func TestMapFileOperationErrorClassifiesTimeout(t *testing.T) {
	t.Parallel()

	code, message := mapFileOperationError("file_read_failed", "read", errFileOpTimeout)
	if code != "file_operation_timeout" {
		t.Fatalf("code = %q, want file_operation_timeout", code)
	}
	if !strings.Contains(message, "timed out") {
		t.Fatalf("message = %q, want timeout hint", message)
	}
}

func TestBinaryFrameRoundTripTerminalOutput(t *testing.T) {
	t.Parallel()

	original := dto.WSMessage{
		Type:      "terminal.output",
		RequestID: "req-1",
		Data: map[string]any{
			"id":     "term-1",
			"output": "hello world\n",
			"extra":  "value",
		},
	}

	encoded, err := encodeWSBinaryMessage(original)
	if err != nil {
		t.Fatalf("encodeWSBinaryMessage() error = %v", err)
	}

	decoded, err := decodeWSBinaryMessage(encoded)
	if err != nil {
		t.Fatalf("decodeWSBinaryMessage() error = %v", err)
	}
	if decoded.Type != original.Type {
		t.Fatalf("decoded.Type = %q, want %q", decoded.Type, original.Type)
	}
	if decoded.RequestID != original.RequestID {
		t.Fatalf("decoded.RequestID = %q, want %q", decoded.RequestID, original.RequestID)
	}
	if got := getRawString(decoded.Data, "id"); got != "term-1" {
		t.Fatalf("decoded id = %q, want term-1", got)
	}
	if got := getRawString(decoded.Data, "output"); got != "hello world\n" {
		t.Fatalf("decoded output = %q, want %q", got, "hello world\n")
	}
	if got := getRawString(decoded.Data, "extra"); got != "value" {
		t.Fatalf("decoded extra = %q, want value", got)
	}
}

func TestDecodeWSBinaryMessageRejectsUnsupportedVersion(t *testing.T) {
	t.Parallel()

	frame := make([]byte, wsBinaryV2HeaderSize)
	frame[0] = 1
	frame[1] = wsBinaryTypeCodeByName["ping"]
	if _, err := decodeWSBinaryMessage(frame); err == nil {
		t.Fatal("decodeWSBinaryMessage() should fail for unsupported frame version")
	}
}

func TestWSReadLimitAllowsMaximumUploadChunkFrame(t *testing.T) {
	t.Parallel()

	chunk := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", maxUploadChunkSize)))
	frame, err := encodeWSBinaryMessage(dto.WSMessage{
		Type:      "file.upload.chunk",
		RequestID: "req-upload-chunk",
		Data: map[string]any{
			"id":    "upload-1",
			"chunk": chunk,
		},
	})
	if err != nil {
		t.Fatalf("encodeWSBinaryMessage() error = %v", err)
	}
	if len(frame) > wsReadLimit {
		t.Fatalf("maximum upload chunk frame len = %d, want <= wsReadLimit %d", len(frame), wsReadLimit)
	}
}

func TestFileUploadBeginEnforcesSessionCap(t *testing.T) {
	t.Parallel()

	s := newSession(nil, "req-upload-cap", config.Config{}, "agent-hub", "")
	for i := 0; i < maxConcurrentUploads; i++ {
		id := "upload-" + string(rune('a'+i))
		s.uploads[id] = &uploadSession{ID: id, Path: "/tmp/" + id}
	}

	s.fileUploadBegin(dto.WSMessage{
		Type:      "file.upload.begin",
		RequestID: "req-upload-begin",
		Data: map[string]any{
			"id":   "upload-overflow",
			"path": "/tmp/overflow.txt",
		},
	})

	if len(s.uploads) != maxConcurrentUploads {
		t.Fatalf("uploads len = %d, want %d", len(s.uploads), maxConcurrentUploads)
	}
	if _, exists := s.uploads["upload-overflow"]; exists {
		t.Fatalf("overflow upload session should not be created")
	}
	if len(s.outboundQueue) != 1 {
		t.Fatalf("outbound queue len = %d, want 1", len(s.outboundQueue))
	}
	message := s.outboundQueue[0].message
	if message.Type != "error" || getRawString(message.Data, "code") != "upload_queue_busy" {
		t.Fatalf("queued message = %#v, want upload_queue_busy error", message)
	}
}

func TestFileUploadChunkRejectsTotalSizeOverflowAndClearsUpload(t *testing.T) {
	t.Parallel()

	s := newSession(nil, "req-upload-overflow", config.Config{}, "agent-hub", "")
	upload := &uploadSession{ID: "upload-1", Path: "/tmp/large.txt"}
	upload.Buffer.WriteString(strings.Repeat("x", maxFileUploadSize))
	s.uploads[upload.ID] = upload

	s.fileUploadChunk(dto.WSMessage{
		Type:      "file.upload.chunk",
		RequestID: "req-upload-chunk",
		Data: map[string]any{
			"id":    upload.ID,
			"chunk": base64.StdEncoding.EncodeToString([]byte("x")),
		},
	})

	if s.lookupUpload(upload.ID) != nil {
		t.Fatalf("upload session should be cleared after size overflow")
	}
	if len(s.outboundQueue) != 1 {
		t.Fatalf("outbound queue len = %d, want 1", len(s.outboundQueue))
	}
	message := s.outboundQueue[0].message
	if message.Type != "error" || getRawString(message.Data, "code") != "file_too_large" {
		t.Fatalf("queued message = %#v, want file_too_large error", message)
	}
}

func TestEnqueueOutboundDropsOldestStreamAndMarksCurrentChunk(t *testing.T) {
	t.Parallel()

	s := newSession(nil, "req-queue", config.Config{}, "agent-hub", "")
	s.outboundQueueCap = 2

	if ok := s.enqueueOutbound(dto.WSMessage{
		Type: "terminal.output",
		Data: map[string]any{
			"id":     "term-1",
			"output": "chunk-1",
		},
	}); !ok {
		t.Fatal("enqueueOutbound(chunk-1) should succeed")
	}
	if ok := s.enqueueOutbound(dto.WSMessage{
		Type: "terminal.output",
		Data: map[string]any{
			"id":     "term-1",
			"output": "chunk-2",
		},
	}); !ok {
		t.Fatal("enqueueOutbound(chunk-2) should succeed")
	}
	if ok := s.enqueueOutbound(dto.WSMessage{
		Type: "terminal.output",
		Data: map[string]any{
			"id":     "term-1",
			"output": "chunk-3",
		},
	}); !ok {
		t.Fatal("enqueueOutbound(chunk-3) should succeed")
	}

	if len(s.outboundQueue) != 2 {
		t.Fatalf("outbound queue len = %d, want 2", len(s.outboundQueue))
	}

	first := s.outboundQueue[0].message
	second := s.outboundQueue[1].message
	if got := getRawString(first.Data, "output"); got != "chunk-2" {
		t.Fatalf("first queued output = %q, want chunk-2", got)
	}
	if got := getRawString(second.Data, "output"); got != "chunk-3" {
		t.Fatalf("second queued output = %q, want chunk-3", got)
	}
	if dropped, _ := second.Data["dropped"].(bool); !dropped {
		t.Fatalf("second queued output should include dropped marker, got %#v", second.Data["dropped"])
	}
	if droppedCount := int(getNumber(second.Data, "droppedCount")); droppedCount != 1 {
		t.Fatalf("droppedCount = %d, want 1", droppedCount)
	}
}

func TestEnqueueOutboundPreservesControlMessagesUnderPressure(t *testing.T) {
	t.Parallel()

	s := newSession(nil, "req-control", config.Config{}, "agent-hub", "")
	s.outboundQueueCap = 2

	if ok := s.enqueueOutbound(dto.WSMessage{
		Type: "terminal.output",
		Data: map[string]any{
			"id":     "term-1",
			"output": "chunk-1",
		},
	}); !ok {
		t.Fatal("enqueueOutbound(chunk-1) should succeed")
	}
	if ok := s.enqueueOutbound(dto.WSMessage{
		Type: "terminal.output",
		Data: map[string]any{
			"id":     "term-1",
			"output": "chunk-2",
		},
	}); !ok {
		t.Fatal("enqueueOutbound(chunk-2) should succeed")
	}
	if ok := s.enqueueOutbound(dto.WSMessage{
		Type: "error",
		Data: map[string]any{
			"code":    "test",
			"message": "must-not-drop",
		},
	}); !ok {
		t.Fatal("enqueueOutbound(error) should succeed")
	}

	if len(s.outboundQueue) != 2 {
		t.Fatalf("outbound queue len = %d, want 2", len(s.outboundQueue))
	}
	if s.outboundQueue[0].message.Type != "terminal.output" {
		t.Fatalf("first queued type = %s, want terminal.output", s.outboundQueue[0].message.Type)
	}
	if s.outboundQueue[1].message.Type != "error" {
		t.Fatalf("second queued type = %s, want error", s.outboundQueue[1].message.Type)
	}
}
