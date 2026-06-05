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
	_, err := updateAgentResources(context.Background(), repo, clientset, namespace, agentName, dto.UpdateAgentRequest{
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
	_, err := updateAgentResources(context.Background(), repo, clientset, namespace, agentName, dto.UpdateAgentRequest{
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

func TestUpdateAgentResourcesAllowsCowAgentOpenAICompatibleAPI(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "demo-agent"

	repo, clientset := newUpdateAgentTestFixtures(t, namespace, agentName)
	devbox, getErr := repo.Get(context.Background(), agentName)
	if getErr != nil {
		t.Fatalf("repo.Get() error = %v", getErr)
	}
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name":     "cowagent",
		"agent.sealos.io/name":       agentName,
		"agent.sealos.io/managed-by": kube.ManagedByValue(),
	})
	if err := kube.SetTemplateID(devbox, "cowagent"); err != nil {
		t.Fatalf("SetTemplateID() error = %v", err)
	}
	if _, err := repo.Update(context.Background(), devbox); err != nil {
		t.Fatalf("repo.Update() error = %v", err)
	}

	apiMode := "openai_compatible"
	_, err := updateAgentResources(context.Background(), repo, clientset, namespace, agentName, dto.UpdateAgentRequest{
		ModelAPIMode: &apiMode,
	})
	if err != nil {
		t.Fatalf("updateAgentResources() error = %v, want nil", err)
	}
	persisted, getErr := repo.Get(context.Background(), agentName)
	if getErr != nil {
		t.Fatalf("repo.Get() error = %v", getErr)
	}
	if got := readDevboxEnvValue(persisted, "AGENT_MODEL_API_MODE"); got != "openai_compatible" {
		t.Fatalf("AGENT_MODEL_API_MODE = %q, want openai_compatible", got)
	}
}

func TestUpdateAgentResourcesInfersCowAgentAnthropicModeOnAllResources(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "demo-agent"

	repo, clientset := newUpdateAgentTestFixtures(t, namespace, agentName)
	devbox, getErr := repo.Get(context.Background(), agentName)
	if getErr != nil {
		t.Fatalf("repo.Get() error = %v", getErr)
	}
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name":     "cowagent",
		"agent.sealos.io/name":       agentName,
		"agent.sealos.io/managed-by": kube.ManagedByValue(),
	})
	if err := kube.SetModelAPIMode(devbox, "chat_completions"); err != nil {
		t.Fatalf("SetModelAPIMode() error = %v", err)
	}
	if err := kube.SetEnvValue(devbox, "AGENT_MODEL_API_MODE", "chat_completions"); err != nil {
		t.Fatalf("SetEnvValue() error = %v", err)
	}
	if _, err := repo.Update(context.Background(), devbox); err != nil {
		t.Fatalf("repo.Update() error = %v", err)
	}
	service, serviceErr := clientset.CoreV1().Services(namespace).Get(context.Background(), agentName, metav1.GetOptions{})
	if serviceErr != nil {
		t.Fatalf("service get error = %v", serviceErr)
	}
	service.Annotations["agent.sealos.io/model-api-mode"] = "chat_completions"
	if _, err := clientset.CoreV1().Services(namespace).Update(context.Background(), service, metav1.UpdateOptions{}); err != nil {
		t.Fatalf("service update error = %v", err)
	}
	ingress, ingressErr := clientset.NetworkingV1().Ingresses(namespace).Get(context.Background(), agentName, metav1.GetOptions{})
	if ingressErr != nil {
		t.Fatalf("ingress get error = %v", ingressErr)
	}
	ingress.Annotations["agent.sealos.io/model-api-mode"] = "chat_completions"
	if _, err := clientset.NetworkingV1().Ingresses(namespace).Update(context.Background(), ingress, metav1.UpdateOptions{}); err != nil {
		t.Fatalf("ingress update error = %v", err)
	}
	provider := aiproxyAnthropicProvider

	_, err := updateAgentResources(context.Background(), repo, clientset, namespace, agentName, dto.UpdateAgentRequest{
		ModelProvider: &provider,
	})
	if err != nil {
		t.Fatalf("updateAgentResources() error = %v, want nil", err)
	}

	persisted, getErr := repo.Get(context.Background(), agentName)
	if getErr != nil {
		t.Fatalf("repo.Get() error = %v", getErr)
	}
	if got := persisted.GetAnnotations()["agent.sealos.io/model-api-mode"]; got != "anthropic_messages" {
		t.Fatalf("devbox model-api-mode = %q, want anthropic_messages", got)
	}
	service, serviceErr = clientset.CoreV1().Services(namespace).Get(context.Background(), agentName, metav1.GetOptions{})
	if serviceErr != nil {
		t.Fatalf("service get error = %v", serviceErr)
	}
	if got := service.Annotations["agent.sealos.io/model-api-mode"]; got != "anthropic_messages" {
		t.Fatalf("service model-api-mode = %q, want anthropic_messages", got)
	}
	ingress, ingressErr = clientset.NetworkingV1().Ingresses(namespace).Get(context.Background(), agentName, metav1.GetOptions{})
	if ingressErr != nil {
		t.Fatalf("ingress get error = %v", ingressErr)
	}
	if got := ingress.Annotations["agent.sealos.io/model-api-mode"]; got != "anthropic_messages" {
		t.Fatalf("ingress model-api-mode = %q, want anthropic_messages", got)
	}
}

func TestValidateModelUpdateCompatibilityAllowsCowAgentChatAlias(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox("custom:aiproxy-chat", "https://aiproxy.usw-1.sealos.io/v1", "glm-5.1", "aiproxy-key")
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name": "cowagent",
	})
	apiMode := "openai_chat"

	if err := validateModelUpdateCompatibility(devbox, dto.UpdateAgentRequest{ModelAPIMode: &apiMode}); err != nil {
		t.Fatalf("validateModelUpdateCompatibility() error = %v, want nil for chat alias", err)
	}
}

func TestValidateModelUpdateCompatibilityAllowsCowAgentOpenAICompatible(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox("custom:aiproxy-chat", "https://aiproxy.usw-1.sealos.io/v1", "qwen-image-2.0-pro", "aiproxy-key")
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name": "cowagent",
	})
	apiMode := "openai_compatible"

	if err := validateModelUpdateCompatibility(devbox, dto.UpdateAgentRequest{ModelAPIMode: &apiMode}); err != nil {
		t.Fatalf("validateModelUpdateCompatibility() error = %v, want nil for openai_compatible", err)
	}
}

func TestValidateModelUpdateCompatibilityAllowsCowAgentNonLLMEndpoints(t *testing.T) {
	t.Parallel()

	for _, apiMode := range []string{"image_generation", "audio_transcriptions", "audio_speech", "embeddings"} {
		t.Run(apiMode, func(t *testing.T) {
			devbox := newModelUpdateDevbox("custom:aiproxy-chat", "https://aiproxy.usw-1.sealos.io/v1", "qwen-image-2.0-pro", "aiproxy-key")
			devbox.SetLabels(map[string]string{
				"app.kubernetes.io/name": "cowagent",
			})
			apiMode := apiMode

			if err := validateModelUpdateCompatibility(devbox, dto.UpdateAgentRequest{ModelAPIMode: &apiMode}); err != nil {
				t.Fatalf("validateModelUpdateCompatibility() error = %v, want nil", err)
			}
		})
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
	apiMode := "codex_responses"

	applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		ModelBaseURL:  &baseURL,
		Model:         &model,
		ModelAPIMode:  &apiMode,
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
	if got := readDevboxEnvValue(devbox, "AGENT_MODEL_API_MODE"); got != apiMode {
		t.Fatalf("AGENT_MODEL_API_MODE = %q, want %q", got, apiMode)
	}
	if got := devbox.GetAnnotations()["agent.sealos.io/model-api-mode"]; got != apiMode {
		t.Fatalf("model-api-mode annotation = %q, want %q", got, apiMode)
	}
}

func TestApplyUpdateToDevboxOpenAIClearsAIProxyEnv(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox(aiproxyResponsesProvider, "https://aiproxy.usw-1.sealos.io/v1", "gpt-5.4-mini", "aiproxy-key")
	provider := "openai"
	baseURL := "https://api.openai.com/v1"
	model := "gpt-4.1"
	apiKey := "openai-key"
	apiMode := "chat_completions"

	applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		ModelBaseURL:  &baseURL,
		Model:         &model,
		ModelAPIMode:  &apiMode,
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

func TestRollbackAgentResourceUpdateRestoresAllResources(t *testing.T) {
	t.Parallel()

	const namespace = "ns-test"
	const agentName = "demo-agent"

	repo, clientset := newUpdateAgentTestFixtures(t, namespace, agentName)
	newAlias := "New Alias"
	result, err := updateAgentResources(context.Background(), repo, clientset, namespace, agentName, dto.UpdateAgentRequest{
		AgentAliasName: &newAlias,
	})
	if err != nil {
		t.Fatalf("updateAgentResources() error = %v", err)
	}

	if err := rollbackAgentResourceUpdate(context.Background(), repo, clientset, namespace, result); err != nil {
		t.Fatalf("rollbackAgentResourceUpdate() error = %v", err)
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

	ingress, ingressErr := clientset.NetworkingV1().Ingresses(namespace).Get(context.Background(), agentName, metav1.GetOptions{})
	if ingressErr != nil {
		t.Fatalf("ingress get error = %v", ingressErr)
	}
	if got := ingress.Annotations["agent.sealos.io/alias-name"]; got != "Old Alias" {
		t.Fatalf("ingress alias after rollback = %q, want Old Alias", got)
	}
}

func TestValidateModelUpdateCompatibilityAllowsCowAgentAnthropicMessages(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox("custom:aiproxy-anthropic", "https://aiproxy.usw-1.sealos.io/v1", "claude-sonnet-4-6", "aiproxy-key")
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name": "cowagent",
	})
	req := dto.UpdateAgentRequest{}
	apiMode := "anthropic_messages"
	req.ModelAPIMode = &apiMode

	if err := validateModelUpdateCompatibility(devbox, req); err != nil {
		t.Fatalf("validateModelUpdateCompatibility() error = %v, want nil", err)
	}
}

func TestApplyUpdateToDevboxSyncsCowAgentAnthropicRuntimeEnv(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox("custom:aiproxy-chat", "https://aiproxy.usw-1.sealos.io/v1", "glm-5.1", "old-key")
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name": "cowagent",
	})
	provider := aiproxyAnthropicProvider
	baseURL := "https://aiproxy.usw-1.sealos.io"
	model := "claude-sonnet-4-6"
	apiKey := "anthropic-key"
	apiMode := "anthropic_messages"

	if err := applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		ModelBaseURL:  &baseURL,
		Model:         &model,
		ModelAPIKey:   &apiKey,
		ModelAPIMode:  &apiMode,
	}); err != nil {
		t.Fatalf("applyUpdateToDevbox() error = %v, want nil", err)
	}

	if got := readDevboxEnvValue(devbox, "CLAUDE_API_KEY"); got != apiKey {
		t.Fatalf("CLAUDE_API_KEY = %q, want %q", got, apiKey)
	}
	if got := readDevboxEnvValue(devbox, "CLAUDE_API_BASE"); got != "https://aiproxy.usw-1.sealos.io/anthropic" {
		t.Fatalf("CLAUDE_API_BASE = %q, want normalized anthropic base URL", got)
	}
	if got := readDevboxEnvValue(devbox, "OPEN_AI_API_KEY"); got != "" {
		t.Fatalf("OPEN_AI_API_KEY = %q, want empty for CowAgent anthropic mode", got)
	}
	if got := readDevboxEnvValue(devbox, "OPEN_AI_API_BASE"); got != "" {
		t.Fatalf("OPEN_AI_API_BASE = %q, want empty for CowAgent anthropic mode", got)
	}
	if got := readDevboxEnvValue(devbox, "OPENAI_API_KEY"); got != "" {
		t.Fatalf("OPENAI_API_KEY = %q, want empty for CowAgent anthropic mode", got)
	}
	if got := readDevboxEnvValue(devbox, "OPENAI_BASE_URL"); got != "" {
		t.Fatalf("OPENAI_BASE_URL = %q, want empty for CowAgent anthropic mode", got)
	}
	if got := readDevboxEnvValue(devbox, "AIPROXY_API_KEY"); got != "" {
		t.Fatalf("AIPROXY_API_KEY = %q, want empty for CowAgent anthropic mode", got)
	}
}

func TestApplyUpdateToDevboxKeepsCowAgentDirectAnthropicBaseURL(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox("custom:aiproxy-chat", "https://aiproxy.usw-1.sealos.io/v1", "glm-5.1", "old-key")
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name": "cowagent",
	})
	provider := "anthropic"
	baseURL := "https://api.anthropic.com"
	model := "claude-sonnet-4-6"
	apiKey := "anthropic-key"
	apiMode := "anthropic_messages"

	if err := applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		ModelBaseURL:  &baseURL,
		Model:         &model,
		ModelAPIKey:   &apiKey,
		ModelAPIMode:  &apiMode,
	}); err != nil {
		t.Fatalf("applyUpdateToDevbox() error = %v, want nil", err)
	}

	if got := readDevboxEnvValue(devbox, "CLAUDE_API_BASE"); got != baseURL {
		t.Fatalf("CLAUDE_API_BASE = %q, want direct Anthropic base URL unchanged", got)
	}
}

func TestApplyUpdateToDevboxInfersCowAgentAnthropicModeFromProvider(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox(aiproxyChatProvider, "https://aiproxy.usw-1.sealos.io/v1", "glm-5.1", "old-key")
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name": "cowagent",
	})
	_ = kube.SetEnvValue(devbox, "AGENT_MODEL_API_MODE", "chat_completions")
	annotations := devbox.GetAnnotations()
	annotations["agent.sealos.io/model-api-mode"] = "chat_completions"
	devbox.SetAnnotations(annotations)
	provider := aiproxyAnthropicProvider
	baseURL := "https://aiproxy.usw-1.sealos.io"
	apiKey := "anthropic-key"

	if err := applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		ModelBaseURL:  &baseURL,
		ModelAPIKey:   &apiKey,
	}); err != nil {
		t.Fatalf("applyUpdateToDevbox() error = %v, want nil", err)
	}

	if got := readDevboxEnvValue(devbox, "AGENT_MODEL_API_MODE"); got != "anthropic_messages" {
		t.Fatalf("AGENT_MODEL_API_MODE = %q, want inferred anthropic_messages", got)
	}
	if got := readDevboxEnvValue(devbox, "CLAUDE_API_KEY"); got != apiKey {
		t.Fatalf("CLAUDE_API_KEY = %q, want %q", got, apiKey)
	}
	if got := readDevboxEnvValue(devbox, "OPEN_AI_API_KEY"); got != "" {
		t.Fatalf("OPEN_AI_API_KEY = %q, want empty for inferred CowAgent anthropic mode", got)
	}
}

func TestApplyUpdateToDevboxPrefersCowAgentAPIModeAnnotationOverStaleEnv(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox(aiproxyAnthropicProvider, "https://aiproxy.usw-1.sealos.io/anthropic", "claude-sonnet-4-6", "old-key")
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name": "cowagent",
	})
	_ = kube.SetEnvValue(devbox, "AGENT_MODEL_API_MODE", "anthropic_messages")
	_ = kube.SetEnvValue(devbox, "CLAUDE_API_KEY", "old-key")
	_ = kube.SetEnvValue(devbox, "CLAUDE_API_BASE", "https://aiproxy.usw-1.sealos.io/anthropic")
	annotations := devbox.GetAnnotations()
	annotations["agent.sealos.io/model-api-mode"] = "chat_completions"
	devbox.SetAnnotations(annotations)
	provider := aiproxyChatProvider
	baseURL := "https://aiproxy.usw-1.sealos.io"
	apiKey := "chat-key"

	if err := applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		ModelBaseURL:  &baseURL,
		ModelAPIKey:   &apiKey,
	}); err != nil {
		t.Fatalf("applyUpdateToDevbox() error = %v, want nil", err)
	}

	if got := readDevboxEnvValue(devbox, "OPEN_AI_API_KEY"); got != apiKey {
		t.Fatalf("OPEN_AI_API_KEY = %q, want %q", got, apiKey)
	}
	if got := readDevboxEnvValue(devbox, "CLAUDE_API_KEY"); got != "" {
		t.Fatalf("CLAUDE_API_KEY = %q, want empty after annotation selects chat mode", got)
	}
	if got := readDevboxEnvValue(devbox, "AGENT_MODEL_API_MODE"); got != "chat_completions" {
		t.Fatalf("AGENT_MODEL_API_MODE = %q, want refreshed annotation mode", got)
	}
}

func TestApplyUpdateToDevboxNormalizesCowAgentAIProxyAnthropicBaseForChatMode(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox(aiproxyAnthropicProvider, "https://aiproxy.usw-1.sealos.io/anthropic", "claude-sonnet-4-6", "old-key")
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name": "cowagent",
	})
	provider := aiproxyChatProvider
	apiMode := "chat_completions"
	apiKey := "chat-key"

	if err := applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		ModelAPIMode:  &apiMode,
		ModelAPIKey:   &apiKey,
	}); err != nil {
		t.Fatalf("applyUpdateToDevbox() error = %v, want nil", err)
	}

	if got := readDevboxEnvValue(devbox, "OPEN_AI_API_BASE"); got != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("OPEN_AI_API_BASE = %q, want AIProxy /v1 base URL after leaving Anthropic mode", got)
	}
	if got := readDevboxEnvValue(devbox, "OPENAI_BASE_URL"); got != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("OPENAI_BASE_URL = %q, want AIProxy /v1 base URL after leaving Anthropic mode", got)
	}
}

func TestApplyUpdateToDevboxClearsCowAgentClaudeEnvForChatMode(t *testing.T) {
	t.Parallel()

	devbox := newModelUpdateDevbox(aiproxyAnthropicProvider, "https://aiproxy.usw-1.sealos.io/anthropic", "claude-sonnet-4-6", "old-key")
	devbox.SetLabels(map[string]string{
		"app.kubernetes.io/name": "cowagent",
	})
	_ = kube.SetEnvValue(devbox, "CLAUDE_API_KEY", "old-key")
	_ = kube.SetEnvValue(devbox, "CLAUDE_API_BASE", "https://aiproxy.usw-1.sealos.io/anthropic")
	provider := aiproxyChatProvider
	baseURL := "https://aiproxy.usw-1.sealos.io"
	model := "glm-5.1"
	apiKey := "chat-key"
	apiMode := "chat_completions"

	if err := applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelProvider: &provider,
		ModelBaseURL:  &baseURL,
		Model:         &model,
		ModelAPIKey:   &apiKey,
		ModelAPIMode:  &apiMode,
	}); err != nil {
		t.Fatalf("applyUpdateToDevbox() error = %v, want nil", err)
	}

	if got := readDevboxEnvValue(devbox, "OPEN_AI_API_KEY"); got != apiKey {
		t.Fatalf("OPEN_AI_API_KEY = %q, want %q", got, apiKey)
	}
	if got := readDevboxEnvValue(devbox, "OPEN_AI_API_BASE"); got != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("OPEN_AI_API_BASE = %q, want normalized OpenAI base URL", got)
	}
	if got := readDevboxEnvValue(devbox, "OPENAI_API_KEY"); got != apiKey {
		t.Fatalf("OPENAI_API_KEY = %q, want %q", got, apiKey)
	}
	if got := readDevboxEnvValue(devbox, "OPENAI_BASE_URL"); got != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("OPENAI_BASE_URL = %q, want normalized OpenAI base URL", got)
	}
	if got := readDevboxEnvValue(devbox, "CLAUDE_API_KEY"); got != "" {
		t.Fatalf("CLAUDE_API_KEY = %q, want empty for CowAgent chat mode", got)
	}
	if got := readDevboxEnvValue(devbox, "CLAUDE_API_BASE"); got != "" {
		t.Fatalf("CLAUDE_API_BASE = %q, want empty for CowAgent chat mode", got)
	}
	if got := readDevboxEnvValue(devbox, "AIPROXY_API_KEY"); got != "" {
		t.Fatalf("AIPROXY_API_KEY = %q, want empty for CowAgent chat mode", got)
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
