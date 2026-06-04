package ws

import (
	"context"
	"encoding/base64"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"k8s.io/client-go/tools/remotecommand"
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

func TestTerminalBootstrapSetsInteractiveTerminalType(t *testing.T) {
	t.Parallel()

	command := buildTerminalBootstrapCommand("/opt/data/workspace")
	if !strings.Contains(command, "if [ -z \"${TERM:-}\" ] || [ \"$TERM\" = 'dumb' ]; then export TERM='xterm-256color'; fi") {
		t.Fatalf("buildTerminalBootstrapCommand() = %q, want empty/dumb TERM normalized to xterm-256color", command)
	}
	if !strings.Contains(command, "export COLORTERM=${COLORTERM:-'truecolor'}") {
		t.Fatalf("buildTerminalBootstrapCommand() = %q, want default COLORTERM=truecolor", command)
	}
}

func TestTerminalResizeKeepsLatestSizeWhenQueueIsFull(t *testing.T) {
	t.Parallel()

	session := &terminalSession{
		resizeChan: make(chan remotecommand.TerminalSize, 1),
	}
	session.resize(80, 24)
	session.resize(120, 32)

	size := terminalSizeQueue(session.resizeChan).Next()
	if size == nil {
		t.Fatal("terminalSizeQueue.Next() = nil, want latest size")
	}
	if size.Width != 120 || size.Height != 32 {
		t.Fatalf("terminalSizeQueue.Next() = %dx%d, want 120x32", size.Width, size.Height)
	}
}

func TestTerminalSizeQueueReturnsLatestQueuedSize(t *testing.T) {
	t.Parallel()

	queue := make(chan remotecommand.TerminalSize, 3)
	queue <- remotecommand.TerminalSize{Width: 80, Height: 24}
	queue <- remotecommand.TerminalSize{Width: 100, Height: 28}
	queue <- remotecommand.TerminalSize{Width: 132, Height: 40}

	size := terminalSizeQueue(queue).Next()
	if size == nil {
		t.Fatal("terminalSizeQueue.Next() = nil, want latest size")
	}
	if size.Width != 132 || size.Height != 40 {
		t.Fatalf("terminalSizeQueue.Next() = %dx%d, want 132x40", size.Width, size.Height)
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

func TestSearchCommandBuildsFindByName(t *testing.T) {
	t.Parallel()

	command := searchCommand("/opt/hermes", "runner", 20)
	if !strings.Contains(command, "find \"$dir\" -mindepth 1 -maxdepth 8 -iname \"$pattern\"") {
		t.Fatalf("searchCommand() = %q, want find -iname search", command)
	}
	if !strings.Contains(command, "head -n \"$limit\"") {
		t.Fatalf("searchCommand() = %q, want result limit", command)
	}
}

func TestBuildUploadWriteCommandCreatesParentDirectory(t *testing.T) {
	t.Parallel()

	command := buildUploadWriteCommand("/workspace/assets/image.png")
	if !strings.Contains(command, "mkdir -p \"$(dirname \"$target\")\"") {
		t.Fatalf("buildUploadWriteCommand() = %q, want parent directory creation", command)
	}
	if !strings.Contains(command, "cat > \"$target\"") {
		t.Fatalf("buildUploadWriteCommand() = %q, want upload written to target", command)
	}
}

func TestFileEditOperationsAreSerialized(t *testing.T) {
	t.Parallel()

	if maxConcurrentFileEditOp != 1 {
		t.Fatalf("maxConcurrentFileEditOp = %d, want serialized edit operations", maxConcurrentFileEditOp)
	}
}

func TestBuildRenameCommandMovesSourceToTarget(t *testing.T) {
	t.Parallel()

	command := buildRenameCommand("/workspace/old.txt", "/workspace/new.txt")
	if strings.Contains(command, "python") {
		t.Fatalf("buildRenameCommand() = %q, want no Python dependency", command)
	}
	if strings.Contains(command, "mv -nT") {
		t.Fatalf("buildRenameCommand() = %q, want no GNU mv -T dependency", command)
	}
	if !strings.Contains(command, "mv -n \"$source\" \"$target\"") {
		t.Fatalf("buildRenameCommand() = %q, want no-clobber target rename", command)
	}
	if !strings.Contains(command, "'/workspace/old.txt'") || !strings.Contains(command, "'/workspace/new.txt'") {
		t.Fatalf("buildRenameCommand() = %q, want quoted source and target", command)
	}
	if !strings.Contains(command, "[ ! -e \"$source\" ] && [ -e \"$target\" ]") {
		t.Fatalf("buildRenameCommand() = %q, want no-clobber move confirmation", command)
	}
}

func TestBuildRenameCommandRejectsExistingTarget(t *testing.T) {
	t.Parallel()

	command := buildRenameCommand("/workspace/old.txt", "/workspace/new.txt")
	if !strings.Contains(command, "[ ! -e \"$target\" ]") {
		t.Fatalf("buildRenameCommand() = %q, want existing target check", command)
	}
	if !strings.Contains(command, "target exists") {
		t.Fatalf("buildRenameCommand() = %q, want explicit target exists failure", command)
	}
}

func TestBuildRenameCommandLocksTargetBeforeMove(t *testing.T) {
	t.Parallel()

	command := buildRenameCommand("/workspace/old.txt", "/workspace/new.txt")
	if !strings.Contains(command, "lockroot=\"${TMPDIR:-/tmp}/agenthub-rename-locks\"") {
		t.Fatalf("buildRenameCommand() = %q, want lock outside target directory", command)
	}
	if !strings.Contains(command, "mkdir \"$lock\"") {
		t.Fatalf("buildRenameCommand() = %q, want atomic target lock creation", command)
	}
	if !strings.Contains(command, "trap 'rmdir \"$lock\"' EXIT") {
		t.Fatalf("buildRenameCommand() = %q, want target lock cleanup", command)
	}
}

func requireRenameCommandSupport(t *testing.T) {
	t.Helper()

	if output, err := exec.Command("sh", "-lc", "mv -n 2>&1 || true").CombinedOutput(); strings.Contains(string(output), "illegal option") || strings.Contains(string(output), "invalid option") {
		t.Skip("mv -n is not supported by the local test host")
	} else if err != nil {
		t.Fatalf("check mv -n support: %v", err)
	}
}

func TestBuildRenameCommandDoesNotLeaveTargetLockDirectory(t *testing.T) {
	t.Parallel()
	requireRenameCommandSupport(t)

	directory := t.TempDir()
	sourcePath := filepath.Join(directory, "old.txt")
	targetPath := filepath.Join(directory, "new.txt")
	tmpPath := filepath.Join(directory, "tmp")
	if err := os.WriteFile(sourcePath, []byte("content"), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	command := "TMPDIR=" + shellQuote(tmpPath) + "; export TMPDIR; " + buildRenameCommand(sourcePath, targetPath)
	if output, err := exec.Command("sh", "-lc", command).CombinedOutput(); err != nil {
		t.Fatalf("rename command failed: %v, output: %s", err, output)
	}
	lockRoot := filepath.Join(tmpPath, "agenthub-rename-locks")
	entries, err := os.ReadDir(lockRoot)
	if err != nil && !os.IsNotExist(err) {
		t.Fatalf("lock root read error = %v, want empty or missing lock root", err)
	}
	if len(entries) != 0 {
		t.Fatalf("lock root entries = %d, want empty lock root", len(entries))
	}
}

func TestBuildRenameCommandDoesNotOverwriteExistingTarget(t *testing.T) {
	t.Parallel()
	requireRenameCommandSupport(t)

	directory := t.TempDir()
	sourcePath := filepath.Join(directory, "old.txt")
	targetPath := filepath.Join(directory, "new.txt")
	if err := os.WriteFile(sourcePath, []byte("source"), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.WriteFile(targetPath, []byte("target"), 0o600); err != nil {
		t.Fatalf("write target: %v", err)
	}

	command := buildRenameCommand(sourcePath, targetPath)
	output, err := exec.Command("sh", "-lc", command).CombinedOutput()
	if err == nil {
		t.Fatalf("rename command should fail when target exists")
	}
	if !strings.Contains(string(output), "target exists") {
		t.Fatalf("rename command output = %q, want target exists failure", output)
	}
	targetContent, readErr := os.ReadFile(targetPath)
	if readErr != nil {
		t.Fatalf("read target: %v", readErr)
	}
	if string(targetContent) != "target" {
		t.Fatalf("target content = %q, want existing target content preserved", targetContent)
	}
	if _, statErr := os.Stat(sourcePath); statErr != nil {
		t.Fatalf("source should remain after failed rename: %v", statErr)
	}
}

func TestBuildRenameCommandDoesNotMoveSourceIntoExistingTargetDirectory(t *testing.T) {
	t.Parallel()
	requireRenameCommandSupport(t)

	directory := t.TempDir()
	sourcePath := filepath.Join(directory, "old.txt")
	targetPath := filepath.Join(directory, "new-dir")
	if err := os.WriteFile(sourcePath, []byte("source"), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.Mkdir(targetPath, 0o700); err != nil {
		t.Fatalf("make target directory: %v", err)
	}

	command := buildRenameCommand(sourcePath, targetPath)
	output, err := exec.Command("sh", "-lc", command).CombinedOutput()
	if err == nil {
		t.Fatalf("rename command should fail when target directory exists")
	}
	if !strings.Contains(string(output), "target exists") {
		t.Fatalf("rename command output = %q, want target exists failure", output)
	}
	if _, statErr := os.Stat(sourcePath); statErr != nil {
		t.Fatalf("source should remain after failed rename: %v", statErr)
	}
	if _, statErr := os.Stat(filepath.Join(targetPath, filepath.Base(sourcePath))); !os.IsNotExist(statErr) {
		t.Fatalf("source should not remain nested in target directory: %v", statErr)
	}
}

func TestBuildRenameCommandRejectsDanglingSymlinkTarget(t *testing.T) {
	t.Parallel()

	directory := t.TempDir()
	sourcePath := filepath.Join(directory, "old.txt")
	targetPath := filepath.Join(directory, "dangling-link")
	if err := os.WriteFile(sourcePath, []byte("content"), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}
	if err := os.Symlink(filepath.Join(directory, "missing-target"), targetPath); err != nil {
		t.Fatalf("create symlink: %v", err)
	}

	command := buildRenameCommand(sourcePath, targetPath)
	output, err := exec.Command("sh", "-lc", command).CombinedOutput()
	if err == nil {
		t.Fatalf("rename command should fail for dangling symlink target")
	}
	if !strings.Contains(string(output), "target exists") {
		t.Fatalf("rename command output = %q, want target exists failure", output)
	}
	if _, err := os.Lstat(targetPath); err != nil {
		t.Fatalf("dangling symlink target should remain: %v", err)
	}
}

func TestBuildRenameCommandPreservesMissingSourceError(t *testing.T) {
	t.Parallel()

	directory := t.TempDir()
	sourcePath := filepath.Join(directory, "missing.txt")
	targetPath := filepath.Join(directory, "new.txt")

	command := buildRenameCommand(sourcePath, targetPath)
	output, err := exec.Command("sh", "-lc", command).CombinedOutput()
	if err == nil {
		t.Fatalf("rename command should fail for missing source")
	}
	if strings.Contains(string(output), "target exists") {
		t.Fatalf("rename command output = %q, want original mv failure", output)
	}
	if !strings.Contains(string(output), "missing.txt") {
		t.Fatalf("rename command output = %q, want missing source details", output)
	}
}

func TestBuildRenameCommandReportsMissingTargetParent(t *testing.T) {
	t.Parallel()

	directory := t.TempDir()
	sourcePath := filepath.Join(directory, "old.txt")
	targetPath := filepath.Join(directory, "missing-dir", "new.txt")
	if err := os.WriteFile(sourcePath, []byte("content"), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}

	command := buildRenameCommand(sourcePath, targetPath)
	output, err := exec.Command("sh", "-lc", command).CombinedOutput()
	if err == nil {
		t.Fatalf("rename command should fail for missing target parent")
	}
	if strings.Contains(string(output), "target exists") {
		t.Fatalf("rename command output = %q, want target parent failure", output)
	}
	if !strings.Contains(string(output), "target parent missing") {
		t.Fatalf("rename command output = %q, want target parent failure", output)
	}
}

func TestParseSearchOutputIncludesPaths(t *testing.T) {
	t.Parallel()

	got := parseSearchOutput("/opt/hermes/batch_runner.py\tbatch_runner.py\tfile\t123\n/opt/hermes/cron\tcron\tdir\t0\n")
	if len(got) != 2 {
		t.Fatalf("parseSearchOutput() len = %d, want 2", len(got))
	}
	if got[0]["path"] != "/opt/hermes/batch_runner.py" || got[0]["name"] != "batch_runner.py" || got[0]["type"] != "file" {
		t.Fatalf("parseSearchOutput()[0] = %#v", got[0])
	}
	if got[1]["type"] != "dir" {
		t.Fatalf("parseSearchOutput()[1].type = %v, want dir", got[1]["type"])
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
		"/workspace",
		"/workspace/project",
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
