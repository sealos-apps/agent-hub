package handler

import (
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/aiproxycatalog"
	"github.com/nightwhite/Agent-Hub/internal/dto"
)

func TestFilterCatalogModelsUsesTemplateModelTypes(t *testing.T) {
	t.Parallel()

	models := filterCatalogModels([]aiproxycatalog.Model{
		{
			ID:            "gpt-5.4",
			Label:         "GPT-5.4",
			ProviderID:    "aiproxy",
			ProviderName:  "AI Proxy",
			ModelType:     "openai-responses",
			RequestFormat: "openai-responses",
		},
		{
			ID:            "claude-sonnet-4.6",
			Label:         "Claude Sonnet 4.6",
			ProviderID:    "aiproxy",
			ProviderName:  "AI Proxy",
			ModelType:     "anthropic",
			RequestFormat: "anthropic-messages",
		},
	}, agenttemplate.ModelSwitch{
		Enabled:             true,
		Client:              "cowagent",
		APIKeyEnv:           "AIPROXY_API_KEY",
		SupportedModelTypes: []string{"anthropic"},
	})

	if len(models) != 1 {
		t.Fatalf("filtered models = %d, want 1", len(models))
	}
	if models[0].ID != "claude-sonnet-4.6" {
		t.Fatalf("filtered model = %q, want claude-sonnet-4.6", models[0].ID)
	}
	if models[0].RequestFormat != "anthropic-messages" {
		t.Fatalf("requestFormat = %q, want anthropic-messages", models[0].RequestFormat)
	}
}

func TestDefaultModelIfAvailableRequiresFilteredModel(t *testing.T) {
	t.Parallel()

	models := []dto.AIProxyModelOption{{ID: "glm-4.6"}}

	if got := defaultModelIfAvailable("claude-sonnet-4.6", models); got != "" {
		t.Fatalf("defaultModelIfAvailable() = %q, want empty", got)
	}
	if got := defaultModelIfAvailable("glm-4.6", models); got != "glm-4.6" {
		t.Fatalf("defaultModelIfAvailable() = %q, want glm-4.6", got)
	}
}
