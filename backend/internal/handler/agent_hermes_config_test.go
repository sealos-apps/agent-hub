package handler

import "testing"

func TestNormalizeHermesProvider(t *testing.T) {
	t.Parallel()

	cases := map[string]struct {
		provider string
		want     string
	}{
		"empty provider stays auto": {
			provider: "",
			want:     "auto",
		},
		"openai keeps openai": {
			provider: "openai",
			want:     "openai",
		},
		"openrouter keeps openrouter": {
			provider: "openrouter",
			want:     "openrouter",
		},
		"aiproxy named provider stays named": {
			provider: "custom:aiproxy-chat",
			want:     "custom:aiproxy-chat",
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := normalizeHermesProvider(tc.provider); got != tc.want {
				t.Fatalf("normalizeHermesProvider(%q) = %q, want %q", tc.provider, got, tc.want)
			}
		})
	}
}
