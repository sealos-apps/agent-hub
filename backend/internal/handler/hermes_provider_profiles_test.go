package handler

import "testing"

func TestResolveAIProxyHermesProvider(t *testing.T) {
	t.Parallel()

	cases := map[string]struct {
		provider string
		want     string
		wantErr  bool
	}{
		"explicit chat provider wins": {
			provider: aiproxyChatProvider,
			want:     aiproxyChatProvider,
		},
		"explicit anthropic provider wins": {
			provider: aiproxyAnthropicProvider,
			want:     aiproxyAnthropicProvider,
		},
		"missing provider is rejected": {
			provider: "",
			wantErr:  true,
		},
		"unknown provider is rejected": {
			provider: "openai-compatible",
			wantErr:  true,
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			got, err := resolveAIProxyHermesProvider(tc.provider)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("resolveAIProxyHermesProvider(%q) error = nil, want error", tc.provider)
				}
				return
			}

			if err != nil {
				t.Fatalf("resolveAIProxyHermesProvider(%q) error = %v, want nil", tc.provider, err)
			}
			if got.Provider != tc.want {
				t.Fatalf("resolveAIProxyHermesProvider(%q).Provider = %q, want %q", tc.provider, got.Provider, tc.want)
			}
		})
	}
}

func TestResolveAIProxyProviderBaseURL(t *testing.T) {
	t.Parallel()

	if got := resolveAIProxyProviderBaseURL("https://aiproxy.usw-1.sealos.io", "", aiproxyResponsesProvider); got != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("resolveAIProxyProviderBaseURL() for responses = %q, want /v1 suffix", got)
	}

	if got := resolveAIProxyProviderBaseURL("https://aiproxy.usw-1.sealos.io", "", aiproxyAnthropicProvider); got != "https://aiproxy.usw-1.sealos.io/anthropic" {
		t.Fatalf("resolveAIProxyProviderBaseURL() for anthropic = %q, want /anthropic suffix", got)
	}

	if got := resolveAIProxyProviderBaseURL("https://aiproxy.usw-1.sealos.io/custom-claude", "", aiproxyAnthropicProvider); got != "https://aiproxy.usw-1.sealos.io/custom-claude" {
		t.Fatalf("resolveAIProxyProviderBaseURL() should preserve explicit path, got %q", got)
	}
}
