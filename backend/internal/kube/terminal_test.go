package kube

import (
	"strings"
	"testing"
)

func TestTerminalBootstrapCommandSetsInteractiveTerminalType(t *testing.T) {
	t.Parallel()

	command := BuildTerminalBootstrapCommand("/opt/data/workspace")
	if !strings.Contains(command, "if [ -z \"${TERM:-}\" ] || [ \"$TERM\" = 'dumb' ]; then export TERM='xterm-256color'; fi") {
		t.Fatalf("BuildTerminalBootstrapCommand() = %q, want empty/dumb TERM normalized to xterm-256color", command)
	}
	if !strings.Contains(command, "export COLORTERM=${COLORTERM:-'truecolor'}") {
		t.Fatalf("BuildTerminalBootstrapCommand() = %q, want default COLORTERM=truecolor", command)
	}
}

func TestTerminalBootstrapCommandUsesBashWithoutShellFallback(t *testing.T) {
	t.Parallel()

	command := BuildTerminalBootstrapCommand("/opt/data/workspace")
	if strings.Contains(command, "exec sh") || strings.Contains(command, "command -v bash") {
		t.Fatalf("BuildTerminalBootstrapCommand() = %q, want bash exec without shell fallback", command)
	}
	if !strings.HasSuffix(command, "exec bash") {
		t.Fatalf("BuildTerminalBootstrapCommand() = %q, want final exec bash", command)
	}
}
