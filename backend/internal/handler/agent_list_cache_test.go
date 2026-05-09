package handler

import (
	"errors"
	"testing"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/dto"
)

func TestReadStaleCachedAgentListAfterFreshExpiry(t *testing.T) {
	key := "cluster|namespace|hash"
	response := dto.AgentListResponse{
		Items: []dto.AgentContract{},
		Total: 0,
		Meta:  map[string]any{"namespace": "ns-test"},
	}

	agentListCacheMu.Lock()
	agentListCache = map[string]cachedAgentList{
		key: {
			response:       response,
			expiresAt:      time.Now().Add(-time.Second),
			staleExpiresAt: time.Now().Add(time.Minute),
		},
	}
	agentListCacheMu.Unlock()
	t.Cleanup(func() {
		agentListCacheMu.Lock()
		agentListCache = map[string]cachedAgentList{}
		agentListCacheMu.Unlock()
	})

	if _, ok := readCachedAgentList(key); ok {
		t.Fatalf("readCachedAgentList() ok = true, want false after fresh expiry")
	}

	got, ok := readStaleCachedAgentList(key)
	if !ok {
		t.Fatalf("readStaleCachedAgentList() ok = false, want true before stale expiry")
	}
	if got.Meta["namespace"] != "ns-test" {
		t.Fatalf("stale response namespace = %v, want ns-test", got.Meta["namespace"])
	}
}

func TestMarkAgentListResponseStalePreservesMeta(t *testing.T) {
	response := dto.AgentListResponse{
		Meta: map[string]any{"namespace": "ns-test"},
	}

	got := markAgentListResponseStale(response, errors.New("deadline exceeded"))

	if got.Meta["namespace"] != "ns-test" {
		t.Fatalf("namespace = %v, want ns-test", got.Meta["namespace"])
	}
	if got.Meta["stale"] != true {
		t.Fatalf("stale = %v, want true", got.Meta["stale"])
	}
	if got.Meta["reason"] == "" {
		t.Fatalf("reason is empty, want timeout detail")
	}
}
