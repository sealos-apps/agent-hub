package kube

import (
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func TestBuildReturnsKubernetesObjects(t *testing.T) {
	t.Parallel()

	ag := agent.Agent{
		Name:          "e2e-repro",
		AliasName:     "E2E测试",
		Namespace:     "ns-38cq5qwz",
		CPU:           "1000m",
		Memory:        "2Gi",
		Storage:       "10Gi",
		ModelProvider: "openai",
		ModelBaseURL:  "https://api.openai.com/v1",
		ModelAPIKey:   "secret-key",
		Model:         "gpt-4o-mini",
		APIServerKey:  "generated-api-key",
	}

	objects, err := Build(ag, BuildOptions{
		IngressDomain: "example-agent.usw-1.sealos.app",
		Image:         "nousresearch/hermes-agent:latest",
	})
	if err != nil {
		t.Fatalf("Build() returned error: %v", err)
	}
	if objects.Devbox == nil {
		t.Fatal("Build() returned nil devbox")
	}
	if objects.Service == nil {
		t.Fatal("Build() returned nil service")
	}
	if objects.Ingress == nil {
		t.Fatal("Build() returned nil ingress")
	}
	if got := objects.Devbox.GetName(); got != ag.Name {
		t.Fatalf("Build() devbox name = %q, want %q", got, ag.Name)
	}
	if got := objects.Service.Name; got != ag.Name {
		t.Fatalf("Build() service name = %q, want %q", got, ag.Name)
	}
	if got := IngressDomain(objects.Ingress); got != "example-agent.usw-1.sealos.app" {
		t.Fatalf("Build() ingress host = %q, want %q", got, "example-agent.usw-1.sealos.app")
	}
	if got := envValue(objects.Devbox, "API_SERVER_KEY"); got != ag.APIServerKey {
		t.Fatalf("Build() API_SERVER_KEY = %q, want %q", got, ag.APIServerKey)
	}
	if got := envValue(objects.Devbox, "HERMES_INFERENCE_PROVIDER"); got != ag.ModelProvider {
		t.Fatalf("Build() HERMES_INFERENCE_PROVIDER = %q, want %q", got, ag.ModelProvider)
	}
	if got := envValue(objects.Devbox, "OPENAI_BASE_URL"); got != ag.ModelBaseURL {
		t.Fatalf("Build() OPENAI_BASE_URL = %q, want %q", got, ag.ModelBaseURL)
	}
	if got := envValue(objects.Devbox, "OPENAI_API_KEY"); got != ag.ModelAPIKey {
		t.Fatalf("Build() OPENAI_API_KEY = %q, want %q", got, ag.ModelAPIKey)
	}
	if got := envValue(objects.Devbox, "AIPROXY_API_KEY"); got != "" {
		t.Fatalf("Build() AIPROXY_API_KEY = %q, want empty for non-managed provider", got)
	}
	if got := objects.Service.Spec.Selector["agent.sealos.io/name"]; got != ag.Name {
		t.Fatalf("Build() service selector agent.sealos.io/name = %q, want %q", got, ag.Name)
	}
	configLabels, found, err := unstructured.NestedStringMap(objects.Devbox.Object, "spec", "config", "labels")
	if err != nil || !found {
		t.Fatalf("Build() config labels missing: found=%v err=%v", found, err)
	}
	if got := configLabels["agent.sealos.io/name"]; got != ag.Name {
		t.Fatalf("Build() config label agent.sealos.io/name = %q, want %q", got, ag.Name)
	}
	if got := configLabels["agent.sealos.io/managed-by"]; got != ManagedByValue() {
		t.Fatalf("Build() config label agent.sealos.io/managed-by = %q, want %q", got, ManagedByValue())
	}
	configUser, found, err := unstructured.NestedString(objects.Devbox.Object, "spec", "config", "user")
	if err != nil || !found {
		t.Fatalf("Build() config user missing: found=%v err=%v", found, err)
	}
	if configUser != "hermes" {
		t.Fatalf("Build() config user = %q, want hermes", configUser)
	}
}

func TestBuildDoesNotLeakIngressAnnotationsToOtherResources(t *testing.T) {
	t.Parallel()

	ag := agent.Agent{
		Name:          "annotation-isolation",
		Namespace:     "ns-test",
		CPU:           "1000m",
		Memory:        "2Gi",
		Storage:       "10Gi",
		ModelProvider: "openai",
		ModelBaseURL:  "https://api.openai.com/v1",
		Model:         "gpt-4o-mini",
		APIServerKey:  "generated-api-key",
	}

	objects, err := Build(ag, BuildOptions{
		IngressDomain: "annotation-isolation.agent.usw-1.sealos.app",
		Image:         "nousresearch/hermes-agent:latest",
	})
	if err != nil {
		t.Fatalf("Build() returned error: %v", err)
	}

	if got := objects.Service.Annotations["nginx.ingress.kubernetes.io/proxy-body-size"]; got != "" {
		t.Fatalf("Build() service unexpectedly leaked ingress annotation = %q", got)
	}

	devboxAnnotations := objects.Devbox.GetAnnotations()
	if got := devboxAnnotations["nginx.ingress.kubernetes.io/proxy-body-size"]; got != "" {
		t.Fatalf("Build() devbox unexpectedly leaked ingress annotation = %q", got)
	}

	if got := objects.Ingress.Annotations["nginx.ingress.kubernetes.io/proxy-body-size"]; got != "32m" {
		t.Fatalf("Build() ingress proxy-body-size = %q, want 32m", got)
	}
}

func TestBuildWithManagedAIProxyProviderClearsOpenAIBaseURL(t *testing.T) {
	t.Parallel()

	ag := agent.Agent{
		Name:          "managed-aiproxy",
		Namespace:     "ns-test",
		CPU:           "1000m",
		Memory:        "2Gi",
		Storage:       "10Gi",
		ModelProvider: "custom:aiproxy-responses",
		ModelBaseURL:  "https://aiproxy.usw-1.sealos.io/v1",
		ModelAPIKey:   "secret-key",
		Model:         "gpt-5.4-mini",
		APIServerKey:  "generated-api-key",
	}

	objects, err := Build(ag, BuildOptions{
		IngressDomain: "managed-aiproxy.agent.usw-1.sealos.app",
		Image:         "nousresearch/hermes-agent:latest",
	})
	if err != nil {
		t.Fatalf("Build() returned error: %v", err)
	}

	if got := envValue(objects.Devbox, "HERMES_INFERENCE_PROVIDER"); got != ag.ModelProvider {
		t.Fatalf("Build() HERMES_INFERENCE_PROVIDER = %q, want %q", got, ag.ModelProvider)
	}
	if got := envValue(objects.Devbox, "OPENAI_BASE_URL"); got != "" {
		t.Fatalf("Build() OPENAI_BASE_URL = %q, want empty for managed AIProxy provider", got)
	}
	if got := envValue(objects.Devbox, "AIPROXY_API_KEY"); got != ag.ModelAPIKey {
		t.Fatalf("Build() AIPROXY_API_KEY = %q, want %q", got, ag.ModelAPIKey)
	}
	if got := envValue(objects.Devbox, "OPENAI_API_KEY"); got != "" {
		t.Fatalf("Build() OPENAI_API_KEY = %q, want empty for managed AIProxy provider", got)
	}
}

func TestEnvValueReturnsEmptyStringWhenValueMissing(t *testing.T) {
	t.Parallel()

	devbox := map[string]any{
		"spec": map[string]any{
			"config": map[string]any{
				"env": []any{
					map[string]any{"name": "AGENT_MODEL_APIKEY"},
				},
			},
		},
	}

	obj := &unstructured.Unstructured{Object: devbox}
	if got := envValue(obj, "AGENT_MODEL_APIKEY"); got != "" {
		t.Fatalf("envValue() = %q, want empty string when value is missing", got)
	}
}
