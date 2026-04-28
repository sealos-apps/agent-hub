package handler

import (
	"context"
	"fmt"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/runtime/schema"
	dynamicfake "k8s.io/client-go/dynamic/fake"
	k8sfake "k8s.io/client-go/kubernetes/fake"
	k8stesting "k8s.io/client-go/testing"
)

func TestUpdateAgentResourcesRollsBackDevboxWhenServiceUpdateFails(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "demo-agent"

	repo, clientset := newUpdateAgentTestFixtures(t, namespace, agentName)
	clientset.PrependReactor("update", "services", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("service update boom")
	})

	newAlias := "New Alias"
	_, _, err := updateAgentResources(context.Background(), repo, clientset, namespace, agentName, dto.UpdateAgentRequest{
		AgentAliasName: &newAlias,
	})
	if err == nil {
		t.Fatal("updateAgentResources() error = nil, want service update failure")
	}

	devbox, getErr := repo.Get(context.Background(), agentName)
	if getErr != nil {
		t.Fatalf("repo.Get() error = %v", getErr)
	}
	if got := devbox.GetAnnotations()["agent.sealos.io/alias-name"]; got != "Old Alias" {
		t.Fatalf("devbox alias after rollback = %q, want Old Alias", got)
	}
}

func TestUpdateAgentResourcesRollsBackDevboxAndServiceWhenIngressUpdateFails(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "demo-agent"

	repo, clientset := newUpdateAgentTestFixtures(t, namespace, agentName)
	clientset.PrependReactor("update", "ingresses", func(action k8stesting.Action) (bool, runtime.Object, error) {
		return true, nil, fmt.Errorf("ingress update boom")
	})

	newAlias := "New Alias"
	_, _, err := updateAgentResources(context.Background(), repo, clientset, namespace, agentName, dto.UpdateAgentRequest{
		AgentAliasName: &newAlias,
	})
	if err == nil {
		t.Fatal("updateAgentResources() error = nil, want ingress update failure")
	}

	devbox, getErr := repo.Get(context.Background(), agentName)
	if getErr != nil {
		t.Fatalf("repo.Get() error = %v", getErr)
	}
	if got := devbox.GetAnnotations()["agent.sealos.io/alias-name"]; got != "Old Alias" {
		t.Fatalf("devbox alias after rollback = %q, want Old Alias", got)
	}

	service, serviceErr := clientset.CoreV1().Services(namespace).Get(context.Background(), agentName, metav1.GetOptions{})
	if serviceErr != nil {
		t.Fatalf("service get error = %v", serviceErr)
	}
	if got := service.Annotations["agent.sealos.io/alias-name"]; got != "Old Alias" {
		t.Fatalf("service alias after rollback = %q, want Old Alias", got)
	}
}

func newUpdateAgentTestFixtures(t *testing.T, namespace, agentName string) (*kube.Repository, *k8sfake.Clientset) {
	t.Helper()

	devbox := &unstructured.Unstructured{
		Object: map[string]any{
			"apiVersion": "devbox.sealos.io/v1alpha2",
			"kind":       "Devbox",
			"metadata": map[string]any{
				"name":      agentName,
				"namespace": namespace,
				"labels": map[string]any{
					"app.kubernetes.io/name":     "hermes-agent",
					"agent.sealos.io/name":       agentName,
					"agent.sealos.io/managed-by": kube.ManagedByValue(),
				},
				"annotations": map[string]any{
					"agent.sealos.io/alias-name":     "Old Alias",
					"agent.sealos.io/model-provider": "openai",
					"agent.sealos.io/model-baseurl":  "https://aiproxy.usw-1.sealos.io",
					"agent.sealos.io/model":          "gpt-4o-mini",
				},
			},
			"spec": map[string]any{
				"resource": map[string]any{
					"cpu":    "1000m",
					"memory": "2Gi",
				},
				"storageLimit": "10Gi",
				"config": map[string]any{
					"env": []any{
						map[string]any{"name": "AGENT_MODEL_PROVIDER", "value": "openai"},
						map[string]any{"name": "AGENT_MODEL_BASEURL", "value": "https://aiproxy.usw-1.sealos.io"},
						map[string]any{"name": "AGENT_MODEL", "value": "gpt-4o-mini"},
					},
				},
			},
		},
	}

	dynamicClient := dynamicfake.NewSimpleDynamicClientWithCustomListKinds(
		runtime.NewScheme(),
		map[schema.GroupVersionResource]string{
			kube.ResourceGVR(): "DevboxList",
		},
	)
	repo := kube.NewRepository(dynamicClient, namespace)
	if _, err := repo.Create(context.Background(), devbox); err != nil {
		t.Fatalf("repo.Create() error = %v", err)
	}

	clientset := k8sfake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{
				Name:      agentName,
				Namespace: namespace,
				Annotations: map[string]string{
					"agent.sealos.io/alias-name":     "Old Alias",
					"agent.sealos.io/model-provider": "openai",
					"agent.sealos.io/model-baseurl":  "https://aiproxy.usw-1.sealos.io",
					"agent.sealos.io/model":          "gpt-4o-mini",
				},
			},
		},
		&networkingv1.Ingress{
			ObjectMeta: metav1.ObjectMeta{
				Name:      agentName,
				Namespace: namespace,
				Annotations: map[string]string{
					"agent.sealos.io/alias-name":     "Old Alias",
					"agent.sealos.io/model-provider": "openai",
					"agent.sealos.io/model-baseurl":  "https://aiproxy.usw-1.sealos.io",
					"agent.sealos.io/model":          "gpt-4o-mini",
				},
			},
		},
	)

	return repo, clientset
}

func TestNormalizeUpdatedModelBaseURLOnlyNormalizesCustomProvider(t *testing.T) {
	t.Parallel()

	customProvider := "custom"
	if got := normalizeUpdatedModelBaseURL("https://aiproxy.usw-1.sealos.io", "openai", &customProvider); got != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("normalizeUpdatedModelBaseURL() for custom = %q, want /v1 suffix", got)
	}

	aiproxyAnthropic := aiproxyAnthropicProvider
	if got := normalizeUpdatedModelBaseURL("https://aiproxy.usw-1.sealos.io", "openai", &aiproxyAnthropic); got != "https://aiproxy.usw-1.sealos.io/anthropic" {
		t.Fatalf("normalizeUpdatedModelBaseURL() for aiproxy anthropic = %q, want /anthropic suffix", got)
	}

	anthropicProvider := "anthropic"
	if got := normalizeUpdatedModelBaseURL("https://api.anthropic.com", "custom", &anthropicProvider); got != "https://api.anthropic.com" {
		t.Fatalf("normalizeUpdatedModelBaseURL() for anthropic = %q, want unchanged", got)
	}
}

func TestApplyUpdateToDevboxManagedAIProxySyncsDedicatedEnv(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox("openai", "https://api.openai.com/v1", "gpt-4o-mini", "openai-key")
	provider := aiproxyResponsesProvider
	baseURL := "https://aiproxy.usw-1.sealos.io"
	model := "gpt-5.4-mini"
	apiKey := "aiproxy-key"

	applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		ModelBaseURL:  &baseURL,
		Model:         &model,
		ModelAPIKey:   &apiKey,
	})

	if got := readDevboxEnvValue(devbox, "HERMES_INFERENCE_PROVIDER"); got != aiproxyResponsesProvider {
		t.Fatalf("HERMES_INFERENCE_PROVIDER = %q, want %q", got, aiproxyResponsesProvider)
	}
	if got := readDevboxEnvValue(devbox, "OPENAI_BASE_URL"); got != "" {
		t.Fatalf("OPENAI_BASE_URL = %q, want empty for managed AIProxy", got)
	}
	if got := readDevboxEnvValue(devbox, "OPENAI_API_KEY"); got != "" {
		t.Fatalf("OPENAI_API_KEY = %q, want empty for managed AIProxy", got)
	}
	if got := readDevboxEnvValue(devbox, "AIPROXY_API_KEY"); got != apiKey {
		t.Fatalf("AIPROXY_API_KEY = %q, want %q", got, apiKey)
	}
	if got := readDevboxEnvValue(devbox, "AGENT_MODEL_BASEURL"); got != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("AGENT_MODEL_BASEURL = %q, want normalized /v1 suffix", got)
	}
}

func TestApplyUpdateToDevboxOpenAIClearsAIProxyEnv(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox(aiproxyResponsesProvider, "https://aiproxy.usw-1.sealos.io/v1", "gpt-5.4-mini", "aiproxy-key")
	provider := "openai"
	baseURL := "https://api.openai.com/v1"
	model := "gpt-4.1"
	apiKey := "openai-key"

	applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		ModelBaseURL:  &baseURL,
		Model:         &model,
		ModelAPIKey:   &apiKey,
	})

	if got := readDevboxEnvValue(devbox, "HERMES_INFERENCE_PROVIDER"); got != "openai" {
		t.Fatalf("HERMES_INFERENCE_PROVIDER = %q, want openai", got)
	}
	if got := readDevboxEnvValue(devbox, "OPENAI_BASE_URL"); got != baseURL {
		t.Fatalf("OPENAI_BASE_URL = %q, want %q", got, baseURL)
	}
	if got := readDevboxEnvValue(devbox, "OPENAI_API_KEY"); got != apiKey {
		t.Fatalf("OPENAI_API_KEY = %q, want %q", got, apiKey)
	}
	if got := readDevboxEnvValue(devbox, "AIPROXY_API_KEY"); got != "" {
		t.Fatalf("AIPROXY_API_KEY = %q, want empty after leaving managed AIProxy", got)
	}
}

func newModelUpdateDevbox(provider, baseURL, model, apiKey string) *unstructured.Unstructured {
	return &unstructured.Unstructured{
		Object: map[string]any{
			"metadata": map[string]any{
				"annotations": map[string]any{
					"agent.sealos.io/model-provider": provider,
					"agent.sealos.io/model-baseurl":  baseURL,
					"agent.sealos.io/model":          model,
				},
			},
			"spec": map[string]any{
				"config": map[string]any{
					"env": []any{
						map[string]any{"name": "AGENT_MODEL_PROVIDER", "value": provider},
						map[string]any{"name": "AGENT_MODEL_BASEURL", "value": baseURL},
						map[string]any{"name": "AGENT_MODEL", "value": model},
						map[string]any{"name": "AGENT_MODEL_APIKEY", "value": apiKey},
						map[string]any{"name": "OPENAI_BASE_URL", "value": baseURL},
						map[string]any{"name": "OPENAI_API_KEY", "value": apiKey},
						map[string]any{"name": "AIPROXY_API_KEY", "value": apiKey},
					},
				},
			},
		},
	}
}
