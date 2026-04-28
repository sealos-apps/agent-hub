package kube

import (
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agent"
)

func TestStateToStatusPreservesKnownLifecycleStates(t *testing.T) {
	t.Parallel()

	cases := map[string]agent.Status{
		"Running":  agent.StatusRunning,
		"Paused":   agent.StatusPaused,
		"Stopped":  agent.StatusPaused,
		"Creating": agent.StatusCreating,
		"Starting": agent.StatusStarting,
		"Stopping": agent.StatusStopping,
		"Updating": agent.StatusUpdating,
		"Deleting": agent.StatusDeleting,
		"Failed":   agent.StatusFailed,
	}

	for input, want := range cases {
		if got := stateToStatus(input); got != want {
			t.Fatalf("stateToStatus(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestStateToStatusFallsBackToFailedForUnknownState(t *testing.T) {
	t.Parallel()

	if got := stateToStatus("mystery-state"); got != agent.StatusFailed {
		t.Fatalf("stateToStatus(unknown) = %q, want %q", got, agent.StatusFailed)
	}
}
