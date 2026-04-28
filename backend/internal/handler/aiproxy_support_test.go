package handler

import "testing"

func TestResolveAIProxyBaseURLPrefersExplicitValue(t *testing.T) {
	t.Parallel()

	got := resolveAIProxyBaseURL("https://aiproxy-web.usw-1.sealos.io", "https://hzh.sealos.run:6443")
	if got != "https://aiproxy-web.usw-1.sealos.io" {
		t.Fatalf("resolveAIProxyBaseURL() = %q, want explicit value", got)
	}
}

func TestResolveAIProxyBaseURLDerivesFromClusterServer(t *testing.T) {
	t.Parallel()

	got := resolveAIProxyBaseURL("", "https://usw-1.sealos.io:6443")
	if got != "https://aiproxy-web.usw-1.sealos.io" {
		t.Fatalf("resolveAIProxyBaseURL() = %q, want derived usw-1 url", got)
	}
}

func TestResolveAIProxyBaseURLFallsBackWhenClusterServerIsUnsupported(t *testing.T) {
	t.Parallel()

	got := resolveAIProxyBaseURL("", "https://127.0.0.1:6443")
	if got != fallbackAIProxyBaseURL {
		t.Fatalf("resolveAIProxyBaseURL() = %q, want fallback %q", got, fallbackAIProxyBaseURL)
	}
}

func TestDefaultAIProxyTokenNamesIncludesPreferredAndLegacyNames(t *testing.T) {
	t.Parallel()

	got := defaultAIProxyTokenNames("ns-test")
	if len(got) != 3 {
		t.Fatalf("defaultAIProxyTokenNames() len = %d, want 3", len(got))
	}
	if got[0] != "agent-hub" {
		t.Fatalf("defaultAIProxyTokenNames()[0] = %q, want agent-hub", got[0])
	}
	if got[1] != "agent-hub-ns-test" {
		t.Fatalf("defaultAIProxyTokenNames()[1] = %q, want agent-hub-ns-test", got[1])
	}
	if got[2] != "agenthub-ns-test" {
		t.Fatalf("defaultAIProxyTokenNames()[2] = %q, want agenthub-ns-test", got[2])
	}
}

func TestResolveAIProxyModelBaseURLPrefersExplicitValue(t *testing.T) {
	t.Parallel()

	got := resolveAIProxyModelBaseURL("https://aiproxy.usw-1.sealos.io", "https://hzh.sealos.run:6443")
	if got != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("resolveAIProxyModelBaseURL() = %q, want explicit value", got)
	}
}

func TestResolveAIProxyModelBaseURLDerivesFromClusterServer(t *testing.T) {
	t.Parallel()

	got := resolveAIProxyModelBaseURL("", "https://usw-1.sealos.io:6443")
	if got != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("resolveAIProxyModelBaseURL() = %q, want derived usw-1 url", got)
	}
}

func TestResolveAIProxyModelBaseURLFallsBackWhenClusterServerIsUnsupported(t *testing.T) {
	t.Parallel()

	got := resolveAIProxyModelBaseURL("", "https://127.0.0.1:6443")
	if got != fallbackAIProxyModelBaseURL {
		t.Fatalf("resolveAIProxyModelBaseURL() = %q, want fallback %q", got, fallbackAIProxyModelBaseURL)
	}
}

func TestNormalizeAIProxyModelBaseURLAppendsV1ForRootURL(t *testing.T) {
	t.Parallel()

	got := normalizeAIProxyModelBaseURL("https://aiproxy.usw-1.sealos.io")
	if got != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("normalizeAIProxyModelBaseURL() = %q, want /v1 suffix", got)
	}
}

func TestNormalizeAIProxyModelBaseURLPreservesNonRootPath(t *testing.T) {
	t.Parallel()

	got := normalizeAIProxyModelBaseURL("https://aiproxy.usw-1.sealos.io/anthropic")
	if got != "https://aiproxy.usw-1.sealos.io/anthropic" {
		t.Fatalf("normalizeAIProxyModelBaseURL() = %q, want existing path preserved", got)
	}
}
