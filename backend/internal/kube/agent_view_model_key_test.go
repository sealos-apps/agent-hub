package kube

import (
	"testing"

	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestResolveModelAPIKeyPrefersAgentModelAPIKey(t *testing.T) {
	t.Parallel()

	devbox := &unstructured.Unstructured{
		Object: map[string]any{
			"spec": map[string]any{
				"config": map[string]any{
					"env": []any{
						map[string]any{"name": "AGENT_MODEL_APIKEY", "value": "agent-key"},
						map[string]any{"name": "AIPROXY_API_KEY", "value": "aiproxy-key"},
						map[string]any{"name": "OPENAI_API_KEY", "value": "openai-key"},
					},
				},
			},
		},
	}

	got := resolveModelAPIKey(devbox, "custom:aiproxy-chat")
	if got != "agent-key" {
		t.Fatalf("resolveModelAPIKey() = %q, want agent-key", got)
	}
}

func TestResolveModelAPIKeyUsesAIProxyKeyForManagedProvider(t *testing.T) {
	t.Parallel()

	devbox := &unstructured.Unstructured{
		Object: map[string]any{
			"spec": map[string]any{
				"config": map[string]any{
					"env": []any{
						map[string]any{"name": "AIPROXY_API_KEY", "value": "aiproxy-key"},
						map[string]any{"name": "OPENAI_API_KEY", "value": "openai-key"},
					},
				},
			},
		},
	}

	got := resolveModelAPIKey(devbox, "custom:aiproxy-responses")
	if got != "aiproxy-key" {
		t.Fatalf("resolveModelAPIKey() = %q, want aiproxy-key", got)
	}
}

func TestResolveModelAPIKeyUsesOpenAIKeyForNonManagedProvider(t *testing.T) {
	t.Parallel()

	devbox := &unstructured.Unstructured{
		Object: map[string]any{
			"spec": map[string]any{
				"config": map[string]any{
					"env": []any{
						map[string]any{"name": "AIPROXY_API_KEY", "value": "aiproxy-key"},
						map[string]any{"name": "OPENAI_API_KEY", "value": "openai-key"},
					},
				},
			},
		},
	}

	got := resolveModelAPIKey(devbox, "openai")
	if got != "openai-key" {
		t.Fatalf("resolveModelAPIKey() = %q, want openai-key", got)
	}
}
