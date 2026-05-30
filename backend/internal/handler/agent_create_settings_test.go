package handler

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/client-go/kubernetes/fake"
)

func TestNormalizeCreateRequestSettingsSkipsEmptySettingKeys(t *testing.T) {
	t.Parallel()

	templateDef, err := agenttemplate.Resolve("hermes-agent", "")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	req := dto.CreateAgentRequest{
		Settings: map[string]any{
			"   ":          "unexpected",
			"gatewayToken": "  sk-gateway ",
		},
	}

	normalized := normalizeCreateRequestSettings(
		req,
		templateDef,
		config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"},
		"us",
	)

	if _, exists := normalized.Settings[""]; exists {
		t.Fatalf("normalizeCreateRequestSettings() kept empty key in settings: %#v", normalized.Settings)
	}
	if got := normalized.Settings["gatewayToken"]; got != "  sk-gateway " {
		t.Fatalf("normalizeCreateRequestSettings() gatewayToken = %#v, want original value", got)
	}
}

func TestNormalizeCreateRequestSettingsSkipsUndeclaredAutofillSettings(t *testing.T) {
	t.Parallel()

	templateDef, err := agenttemplate.Resolve("openclaw", "")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	model := "gpt-5.4-mini"
	provider := "custom:aiproxy-responses"
	baseURL := "https://aiproxy.usw-1.sealos.io/v1"
	req := dto.CreateAgentRequest{
		Model:         &model,
		ModelProvider: &provider,
		ModelBaseURL:  &baseURL,
	}

	normalized := normalizeCreateRequestSettings(
		req,
		templateDef,
		config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"},
		"us",
	)

	if len(normalized.Settings) != 0 {
		t.Fatalf("normalizeCreateRequestSettings() injected undeclared settings: %#v", normalized.Settings)
	}
}

func TestNormalizeCreateRequestSettingsFillsDefaultModelSlot(t *testing.T) {
	t.Parallel()

	templateDef := modelSlotsTemplateDefinition()
	normalized := normalizeCreateRequestSettings(
		dto.CreateAgentRequest{},
		templateDef,
		config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"},
		"us",
	)

	if got := normalized.ModelSlots["main"]; got != "glm-5.1" {
		t.Fatalf("normalizeCreateRequestSettings() main model slot = %q, want glm-5.1", got)
	}
	if _, ok := normalized.Settings["model"]; ok {
		t.Fatalf("normalizeCreateRequestSettings() injected settings.model: %#v", normalized.Settings)
	}
}

func TestNormalizeCreateRequestSettingsFillsOptionalDefaultModelSlots(t *testing.T) {
	t.Parallel()

	templateDef := modelSlotsTemplateDefinition()
	normalized := normalizeCreateRequestSettings(
		dto.CreateAgentRequest{},
		templateDef,
		config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"},
		"us",
	)

	if got := normalized.ModelSlots["locked"]; got != "deepseek-v4-flash" {
		t.Fatalf("normalizeCreateRequestSettings() optional slot = %q, want deepseek-v4-flash", got)
	}
}

func TestBuildCreateModelSlotsUpdatePersistsSlotsAndMainModel(t *testing.T) {
	t.Parallel()

	mapped, validationErr := buildModelSlotsUpdate(
		map[string]string{"main": "deepseek-v4-flash"},
		modelSlotsTemplateDefinition(),
		config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"},
		"us",
		false,
	)
	if validationErr != nil {
		t.Fatalf("buildModelSlotsUpdate() error = %v, want nil", validationErr)
	}
	if mapped.Model == nil || *mapped.Model != "deepseek-v4-flash" {
		t.Fatalf("mapped.Model = %#v, want deepseek-v4-flash", mapped.Model)
	}
	if mapped.ModelProvider == nil || *mapped.ModelProvider != "custom:aiproxy-chat" {
		t.Fatalf("mapped.ModelProvider = %#v, want custom:aiproxy-chat", mapped.ModelProvider)
	}
	if mapped.ModelAPIMode == nil || *mapped.ModelAPIMode != "chat_completions" {
		t.Fatalf("mapped.ModelAPIMode = %#v, want chat_completions", mapped.ModelAPIMode)
	}
	if mapped.ModelBaseURL == nil || *mapped.ModelBaseURL != "https://aiproxy.usw-1.sealos.io/v1" {
		t.Fatalf("mapped.ModelBaseURL = %#v, want https://aiproxy.usw-1.sealos.io/v1", mapped.ModelBaseURL)
	}
	if mapped.ModelSlots["main"].Model != "deepseek-v4-flash" {
		t.Fatalf("mapped.ModelSlots[main].Model = %q, want deepseek-v4-flash", mapped.ModelSlots["main"].Model)
	}

	devbox := &unstructured.Unstructured{}
	devbox.SetAnnotations(map[string]string{})
	if err := applyUpdateToDevbox(devbox, mapped); err != nil {
		t.Fatalf("applyUpdateToDevbox() error = %v, want nil", err)
	}
	var persisted map[string]dto.ModelSlotSelection
	if err := json.Unmarshal([]byte(devbox.GetAnnotations()["agent.sealos.io/model-slots"]), &persisted); err != nil {
		t.Fatalf("model-slots annotation is invalid JSON: %v", err)
	}
	if persisted["main"].Model != "deepseek-v4-flash" {
		t.Fatalf("persisted main model = %q, want deepseek-v4-flash", persisted["main"].Model)
	}
}

func TestBuildCreateModelSlotsUpdatePersistsOptionalDefaultSlots(t *testing.T) {
	t.Parallel()

	normalized := normalizeCreateRequestSettings(
		dto.CreateAgentRequest{},
		modelSlotsTemplateDefinition(),
		config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"},
		"us",
	)
	mapped, validationErr := buildModelSlotsUpdate(
		normalized.ModelSlots,
		modelSlotsTemplateDefinition(),
		config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"},
		"us",
		true,
	)
	if validationErr != nil {
		t.Fatalf("buildModelSlotsUpdate() error = %v, want nil", validationErr)
	}
	if got := mapped.ModelSlots["locked"].Model; got != "deepseek-v4-flash" {
		t.Fatalf("mapped.ModelSlots[locked].Model = %q, want deepseek-v4-flash", got)
	}

	devbox := &unstructured.Unstructured{}
	devbox.SetAnnotations(map[string]string{})
	if err := applyUpdateToDevbox(devbox, mapped); err != nil {
		t.Fatalf("applyUpdateToDevbox() error = %v, want nil", err)
	}
	var persisted map[string]dto.ModelSlotSelection
	if err := json.Unmarshal([]byte(devbox.GetAnnotations()["agent.sealos.io/model-slots"]), &persisted); err != nil {
		t.Fatalf("model-slots annotation is invalid JSON: %v", err)
	}
	if got := persisted["locked"].Model; got != "deepseek-v4-flash" {
		t.Fatalf("persisted locked model = %q, want deepseek-v4-flash", got)
	}
}

func TestMergeUpdateModelSlotsPreservesModelBaseURL(t *testing.T) {
	t.Parallel()

	modelProvider := "custom:aiproxy-chat"
	model := "glm-5.1"
	apiMode := "chat_completions"
	modelBaseURL := "https://aiproxy.usw-1.sealos.io/v1"

	target := dto.UpdateAgentRequest{}
	mergeUpdateModelSlots(&target, dto.UpdateAgentRequest{
		ModelProvider: &modelProvider,
		Model:         &model,
		ModelAPIMode:  &apiMode,
		ModelBaseURL:  &modelBaseURL,
	})

	if target.ModelBaseURL == nil || *target.ModelBaseURL != modelBaseURL {
		t.Fatalf("target.ModelBaseURL = %#v, want %q", target.ModelBaseURL, modelBaseURL)
	}
}

func TestBuildCreateModelSlotsUpdateRequiresConfiguredBaseURL(t *testing.T) {
	t.Parallel()

	_, validationErr := buildModelSlotsUpdate(
		map[string]string{"main": "deepseek-v4-flash"},
		modelSlotsTemplateDefinition(),
		config.Config{},
		"us",
		false,
	)
	if validationErr == nil {
		t.Fatal("buildModelSlotsUpdate() error = nil, want baseURL source validation error")
	}
	if got := validationErr.Details()["field"]; got != "modelIntegration.provider.baseURL.source" {
		t.Fatalf("buildModelSlotsUpdate() field = %#v, want modelIntegration.provider.baseURL.source", got)
	}
	if got := validationErr.Details()["reason"]; got != "required" {
		t.Fatalf("buildModelSlotsUpdate() reason = %#v, want required", got)
	}
}

func TestValidateCreateResourceQuotaRejectsExceededMemory(t *testing.T) {
	t.Parallel()

	clientset := fake.NewSimpleClientset(&corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "quota-test",
			Namespace: "ns-test",
		},
		Status: corev1.ResourceQuotaStatus{
			Hard: corev1.ResourceList{
				corev1.ResourceLimitsMemory: resource.MustParse("4Gi"),
				corev1.ResourceLimitsCPU:    resource.MustParse("4"),
			},
			Used: corev1.ResourceList{
				corev1.ResourceLimitsMemory: resource.MustParse("4Gi"),
				corev1.ResourceLimitsCPU:    resource.MustParse("3"),
			},
		},
	})

	err := validateCreateResourceQuota(context.Background(), clientset, "ns-test", dto.CreateAgentRequest{
		AgentCPU:    "1",
		AgentMemory: "2Gi",
	})
	if err == nil {
		t.Fatal("validateCreateResourceQuota() error = nil, want quota error")
	}
	if got := err.Details()["reason"]; got != "resource_quota_exceeded" {
		t.Fatalf("reason = %#v, want resource_quota_exceeded", got)
	}
	if got := err.Details()["field"]; got != "agent-memory" {
		t.Fatalf("field = %#v, want agent-memory", got)
	}
}

func TestValidateCreateResourceQuotaAllowsEqualLimit(t *testing.T) {
	t.Parallel()

	clientset := fake.NewSimpleClientset(&corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "quota-test",
			Namespace: "ns-test",
		},
		Status: corev1.ResourceQuotaStatus{
			Hard: corev1.ResourceList{
				corev1.ResourceLimitsMemory: resource.MustParse("4Gi"),
				corev1.ResourceLimitsCPU:    resource.MustParse("4"),
			},
			Used: corev1.ResourceList{
				corev1.ResourceLimitsMemory: resource.MustParse("2Gi"),
				corev1.ResourceLimitsCPU:    resource.MustParse("3"),
			},
		},
	})

	if err := validateCreateResourceQuota(context.Background(), clientset, "ns-test", dto.CreateAgentRequest{
		AgentCPU:    "1",
		AgentMemory: "2Gi",
	}); err != nil {
		t.Fatalf("validateCreateResourceQuota() error = %v, want nil", err)
	}
}
