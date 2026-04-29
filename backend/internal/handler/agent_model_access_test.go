package handler

import (
	"net/url"
	"strings"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/kube"
)

func TestResolveManagedModelAccessWithoutToken(t *testing.T) {
	t.Parallel()

	factory, appErr := kube.NewFactoryFromEncodedKubeconfig(testEncodedKubeconfig())
	if appErr != nil {
		t.Fatalf("NewFactoryFromEncodedKubeconfig() error = %v", appErr)
	}

	got, err := resolveManagedModelAccessWithoutToken(
		config.Config{},
		factory,
		"custom:aiproxy-responses",
		"https://aiproxy.usw-1.sealos.io",
	)
	if err != nil {
		t.Fatalf("resolveManagedModelAccessWithoutToken() error = %v", err)
	}
	if got.Provider != "custom:aiproxy-responses" {
		t.Fatalf("Provider = %q, want custom:aiproxy-responses", got.Provider)
	}
	if got.BaseURL != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("BaseURL = %q, want https://aiproxy.usw-1.sealos.io/v1", got.BaseURL)
	}
	if got.APIKey != "" {
		t.Fatalf("APIKey = %q, want empty fallback api key", got.APIKey)
	}
}

func testEncodedKubeconfig() string {
	raw := strings.TrimSpace(`
apiVersion: v1
kind: Config
current-context: test
clusters:
  - name: local
    cluster:
      server: https://usw-1.sealos.io:6443
contexts:
  - name: test
    context:
      cluster: local
      user: test-user
      namespace: ns-test
users:
  - name: test-user
    user:
      token: test-token
`)
	return url.QueryEscape(raw)
}
