package handler

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/dto"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime/schema"
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

func TestShouldServeEmptyAgentListForTransientListErrors(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want bool
	}{
		{
			name: "tls handshake timeout",
			err:  errors.New(`Get "https://example.test": net/http: TLS handshake timeout`),
			want: true,
		},
		{
			name: "server timeout",
			err:  apierrors.NewServerTimeout(schema.GroupResource{Group: "devbox.sealos.io", Resource: "devboxes"}, "list", 1),
			want: true,
		},
		{
			name: "service unavailable",
			err:  apierrors.NewServiceUnavailable("api server unavailable"),
			want: true,
		},
		{
			name: "too many requests",
			err:  apierrors.NewTooManyRequests("rate limited", 1),
			want: true,
		},
		{
			name: "forbidden",
			err:  apierrors.NewForbidden(schema.GroupResource{Group: "devbox.sealos.io", Resource: "devboxes"}, "devboxes", errors.New("forbidden")),
			want: false,
		},
		{
			name: "unauthorized",
			err:  apierrors.NewUnauthorized("unauthorized"),
			want: false,
		},
		{
			name: "not found",
			err:  apierrors.NewNotFound(schema.GroupResource{Group: "devbox.sealos.io", Resource: "devboxes"}, "devboxes"),
			want: false,
		},
		{
			name: "bad request",
			err:  apierrors.NewBadRequest("bad selector"),
			want: false,
		},
		{
			name: "client canceled",
			err:  http.ErrAbortHandler,
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldServeEmptyAgentList(tt.err); got != tt.want {
				t.Fatalf("shouldServeEmptyAgentList() = %v, want %v", got, tt.want)
			}
		})
	}
}
