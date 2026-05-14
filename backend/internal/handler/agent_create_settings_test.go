package handler

import (
	"context"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/aiproxycatalog"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
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
			"   ":      "unexpected",
			" model ":  "  gpt-5.4-mini ",
			"baseURL ": " https://aiproxy.usw-1.sealos.io/v1 ",
		},
	}

	normalized := normalizeCreateRequestSettings(
		req,
		templateDef,
		config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"},
		"us",
		aiproxycatalog.Region{},
		aiproxycatalog.Model{},
	)

	if _, exists := normalized.Settings[""]; exists {
		t.Fatalf("normalizeCreateRequestSettings() kept empty key in settings: %#v", normalized.Settings)
	}
	if got := normalized.Settings["model"]; got != "gpt-5.4-mini" {
		t.Fatalf("normalizeCreateRequestSettings() model = %#v, want gpt-5.4-mini", got)
	}
}

func TestNormalizeCreateRequestSettingsSkipsUndeclaredAutofillSettings(t *testing.T) {
	t.Parallel()

	templateDef, err := agenttemplate.Resolve("openclaw", "")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	model := "gpt-5.4-mini"
	provider := "aiproxy"
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
		aiproxycatalog.Region{},
		aiproxycatalog.Model{},
	)

	if len(normalized.Settings) != 0 {
		t.Fatalf("normalizeCreateRequestSettings() injected undeclared settings: %#v", normalized.Settings)
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
