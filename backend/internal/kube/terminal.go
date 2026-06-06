package kube

import (
	"path"
	"strings"
)

const (
	TerminalDefaultDir   = "/opt/data/workspace"
	TerminalWorkspaceDir = "/workspace"
	TerminalHomeDir      = "/opt/data/home"
	TerminalInstallDir   = "/opt/hermes"
	TerminalRuntimeRoot  = "/opt/data"
)

func ResolveTerminalPath(raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "." {
		return TerminalDefaultDir, nil
	}

	cleaned := path.Clean(raw)
	if path.IsAbs(cleaned) {
		if isWithinTerminalRoot(cleaned, TerminalRuntimeRoot) || isWithinTerminalRoot(cleaned, TerminalInstallDir) || isWithinTerminalRoot(cleaned, TerminalWorkspaceDir) {
			return cleaned, nil
		}
		return "", ErrTerminalPathEscapesWorkspace
	}

	if cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return "", ErrTerminalPathEscapesWorkspace
	}

	resolved := path.Join(TerminalDefaultDir, cleaned)
	if !isWithinTerminalRoot(resolved, TerminalDefaultDir) {
		return "", ErrTerminalPathEscapesWorkspace
	}
	return resolved, nil
}

func BuildTerminalBootstrapCommand(cwd string) string {
	return strings.Join([]string{
		"export HERMES_HOME=${HERMES_HOME:-" + shellQuote(TerminalRuntimeRoot) + "}",
		"if [ -z \"${TERM:-}\" ] || [ \"$TERM\" = " + shellQuote("dumb") + " ]; then export TERM=" + shellQuote("xterm-256color") + "; fi",
		"export COLORTERM=${COLORTERM:-" + shellQuote("truecolor") + "}",
		"if [ -d " + shellQuote(TerminalHomeDir) + " ]; then export HOME=" + shellQuote(TerminalHomeDir) + "; fi",
		"if [ -d " + shellQuote(TerminalInstallDir+"/.venv/bin") + " ]; then export PATH=" + shellQuote(TerminalInstallDir+"/.venv/bin") + ":$PATH; fi",
		"if [ -f " + shellQuote(TerminalInstallDir+"/.venv/bin/activate") + " ]; then . " + shellQuote(TerminalInstallDir+"/.venv/bin/activate") + "; fi",
		"mkdir -p " + shellQuote(TerminalDefaultDir) + " >/dev/null 2>&1 || true",
		"cd -- " + shellQuote(cwd),
		"exec bash",
	}, " && ")
}

type terminalPathError string

func (e terminalPathError) Error() string {
	return string(e)
}

const ErrTerminalPathEscapesWorkspace = terminalPathError("path escapes the terminal workspace")

func isWithinTerminalRoot(target, root string) bool {
	return target == root || strings.HasPrefix(target, root+"/")
}

func shellQuote(input string) string {
	return "'" + strings.ReplaceAll(input, "'", `'\''`) + "'"
}
