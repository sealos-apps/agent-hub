package aiproxy

import (
	"context"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestSearchTokenByNameUsesConfiguredSearchPath(t *testing.T) {
	t.Parallel()

	var requests []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		if r.URL.Path != "/api/v2alpha/tokens" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("name") != "agent-hub" {
			t.Fatalf("search name = %q, want agent-hub", r.URL.Query().Get("name"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{"items":[{"id":1,"name":"agent-hub","key":"sk-test","status":1}]}}`))
	}))
	defer upstream.Close()

	client, err := NewClient(upstream.URL, nil)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	token, found, err := client.SearchTokenByName(context.Background(), "kubeconfig", "agent-hub")
	if err != nil {
		t.Fatalf("SearchTokenByName() error = %v", err)
	}
	if !found {
		t.Fatalf("SearchTokenByName() found = false, want true")
	}
	if token.Key != "sk-test" {
		t.Fatalf("SearchTokenByName() token.Key = %q, want sk-test", token.Key)
	}
	if got := strings.Join(requests, ","); got != "/api/v2alpha/tokens" {
		t.Fatalf("request paths = %q, want configured path only", got)
	}
}

func TestCreateTokenUsesConfiguredCreatePath(t *testing.T) {
	t.Parallel()

	var requests []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		if r.URL.Path != "/api/v2alpha/tokens" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{"id":2,"name":"agent-hub","key":"sk-created","status":1}}`))
	}))
	defer upstream.Close()

	client, err := NewClient(upstream.URL, nil)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	token, err := client.CreateToken(context.Background(), "kubeconfig", "agent-hub")
	if err != nil {
		t.Fatalf("CreateToken() error = %v", err)
	}
	if token.Key != "sk-created" {
		t.Fatalf("CreateToken() token.Key = %q, want sk-created", token.Key)
	}
	if got := strings.Join(requests, ","); got != "/api/v2alpha/tokens" {
		t.Fatalf("request paths = %q, want configured path only", got)
	}
}

func TestSearchTokenByNameDoesNotTryAlternateAIProxyHost(t *testing.T) {
	t.Parallel()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer upstream.Close()

	client, err := NewClient(upstream.URL, nil)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	_, _, err = client.SearchTokenByName(context.Background(), "kubeconfig", "agent-hub")
	if err == nil {
		t.Fatalf("SearchTokenByName() error = nil, want not nil")
	}

	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("SearchTokenByName() error type = %T, want *APIError", err)
	}
	if apiErr.Status != http.StatusNotFound {
		t.Fatalf("SearchTokenByName() status = %d, want %d", apiErr.Status, http.StatusNotFound)
	}
	if strings.Contains(apiErr.Message, "candidate") || strings.Contains(apiErr.Message, "fallback") {
		t.Fatalf("SearchTokenByName() message = %q, want direct upstream error", apiErr.Message)
	}
}

func TestMessageFromPayloadSummarizesHTMLString(t *testing.T) {
	t.Parallel()

	got := messageFromPayload("<!DOCTYPE html><html><body>404</body></html>", "default message")
	if got != "upstream returned HTML response body" {
		t.Fatalf("messageFromPayload() = %q, want summarized html message", got)
	}
}

func TestMessageFromPayloadTruncatesLongText(t *testing.T) {
	t.Parallel()

	input := strings.Repeat("x", 600)
	got := messageFromPayload(input, "default message")
	if len(got) != 515 {
		t.Fatalf("messageFromPayload() len = %d, want 515", len(got))
	}
	if !strings.HasSuffix(got, "...") {
		t.Fatalf("messageFromPayload() = %q, want suffix ...", got)
	}
}

func TestDoJSONUsesConfiguredBaseURL(t *testing.T) {
	t.Parallel()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2alpha/tokens" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.URL.Query().Get("name") != "agent-hub" {
			t.Fatalf("search name = %q, want agent-hub", r.URL.Query().Get("name"))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{"items":[]}}`))
	}))
	defer upstream.Close()

	parsed, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	client := &Client{baseURL: parsed, httpClient: upstream.Client()}
	_, _, err = client.SearchTokenByName(context.Background(), "kubeconfig", "agent-hub")
	if err != nil {
		t.Fatalf("SearchTokenByName() error = %v", err)
	}
}
