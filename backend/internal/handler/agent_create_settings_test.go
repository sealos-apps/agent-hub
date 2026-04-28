package handler

import (
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
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
