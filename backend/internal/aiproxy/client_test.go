package aiproxy

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestSearchTokenByNameFallsBackToLegacySearchPath(t *testing.T) {
	t.Parallel()

	var requests []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		switch r.URL.Path {
		case "/api/v2alpha/tokens":
			http.NotFound(w, r)
		case "/api/v2alpha/token/search":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":0,"data":{"items":[{"id":1,"name":"agent-hub","key":"sk-test","status":1}]}}`))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
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
	if got := strings.Join(requests, ","); got != "/api/v2alpha/tokens,/api/v2alpha/token/search" {
		t.Fatalf("request paths = %q, want fallback order", got)
	}
}

func TestCreateTokenFallsBackToLegacyCreatePath(t *testing.T) {
	t.Parallel()

	var requests []string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Path)
		switch r.URL.Path {
		case "/api/v2alpha/tokens":
			http.NotFound(w, r)
		case "/api/v2alpha/token":
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"code":0,"data":{"id":2,"name":"agent-hub","key":"sk-created","status":1}}`))
		default:
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
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
	if got := strings.Join(requests, ","); got != "/api/v2alpha/tokens,/api/v2alpha/token" {
		t.Fatalf("request paths = %q, want fallback order", got)
	}
}

func TestSearchTokenByNameReturnsHelpfulErrorWhenAllCandidatesMissing(t *testing.T) {
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
	if !strings.Contains(apiErr.Message, "aiproxy endpoint not found after trying") {
		t.Fatalf("SearchTokenByName() message = %q, want fallback summary", apiErr.Message)
	}
}

func TestCandidateBaseURLsIncludesAiproxyHostFallback(t *testing.T) {
	t.Parallel()

	client, err := NewClient("https://aiproxy-web.usw-1.sealos.io", nil)
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	bases := client.candidateBaseURLs()
	if len(bases) != 2 {
		t.Fatalf("candidateBaseURLs() len = %d, want 2", len(bases))
	}
	if bases[0].String() != "https://aiproxy-web.usw-1.sealos.io" {
		t.Fatalf("candidateBaseURLs()[0] = %q, want aiproxy-web host", bases[0].String())
	}
	if bases[1].String() != "https://aiproxy.usw-1.sealos.io" {
		t.Fatalf("candidateBaseURLs()[1] = %q, want aiproxy host", bases[1].String())
	}
}

func TestResolveRequestURLIncludesQuery(t *testing.T) {
	t.Parallel()

	base, err := url.Parse("https://aiproxy.usw-1.sealos.io")
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	got := resolveRequestURL(base, "/api/token/search", url.Values{"name": []string{"agent-hub"}})
	want := "https://aiproxy.usw-1.sealos.io/api/token/search?name=agent-hub"
	if got != want {
		t.Fatalf("resolveRequestURL() = %q, want %q", got, want)
	}
}

func TestMessageFromPayloadSummarizesHTMLString(t *testing.T) {
	t.Parallel()

	got := messageFromPayload("<!DOCTYPE html><html><body>404</body></html>", "fallback")
	if got != "upstream returned HTML response body" {
		t.Fatalf("messageFromPayload() = %q, want summarized html message", got)
	}
}

func TestMessageFromPayloadTruncatesLongText(t *testing.T) {
	t.Parallel()

	input := strings.Repeat("x", 600)
	got := messageFromPayload(input, "fallback")
	if len(got) != 515 {
		t.Fatalf("messageFromPayload() len = %d, want 515", len(got))
	}
	if !strings.HasSuffix(got, "...") {
		t.Fatalf("messageFromPayload() = %q, want suffix ...", got)
	}
}

func TestAlternateAIProxyBaseURLPreservesPort(t *testing.T) {
	t.Parallel()

	base, err := url.Parse("https://aiproxy-web.usw-1.sealos.io:7443")
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	alternate := alternateAIProxyBaseURL(base)
	if alternate == nil {
		t.Fatalf("alternateAIProxyBaseURL() = nil, want url")
	}
	if got := alternate.String(); got != "https://aiproxy.usw-1.sealos.io:7443" {
		t.Fatalf("alternateAIProxyBaseURL() = %q, want host switch with port", got)
	}
}

func TestDoJSONWithFallbackSkipsSecondBaseWhenFirstBaseSucceeds(t *testing.T) {
	t.Parallel()

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v2alpha/tokens" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{"items":[]}}`))
	}))
	defer upstream.Close()

	parsed, err := url.Parse(upstream.URL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}

	client := &Client{
		baseURL: parsed,
		httpClient: &http.Client{
			Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				// Ensure no host rewrite is needed here; this verifies first candidate success path.
				if !strings.Contains(r.URL.String(), "/api/v2alpha/tokens") {
					return nil, fmt.Errorf("unexpected url: %s", r.URL.String())
				}
				return http.DefaultTransport.RoundTrip(r)
			}),
		},
	}

	_, _, err = client.SearchTokenByName(context.Background(), "kubeconfig", "agent-hub")
	if err != nil {
		t.Fatalf("SearchTokenByName() error = %v", err)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}
