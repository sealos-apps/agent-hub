package handler

import (
	"reflect"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/aiproxycatalog"
)

func TestBuildAgentHubModelInitArgvUsesCatalogFields(t *testing.T) {
	t.Parallel()

	regionCatalog := aiproxycatalog.Region{
		BaseURL: "https://aiproxy.usw-1.sealos.io/v1",
		Models: []aiproxycatalog.Model{
			{ID: "claude-sonnet-4.6", ProviderID: "aiproxy", ModelType: "anthropic"},
			{ID: "claude-sonnet-4.5", ProviderID: "aiproxy", ModelType: "anthropic"},
			{ID: "gpt-5.4", ProviderID: "aiproxy", ModelType: "openai-responses"},
		},
	}
	model := aiproxycatalog.Model{
		ID:            "claude-sonnet-4.6",
		ProviderID:    "aiproxy",
		ProviderName:  "AI Proxy",
		ModelType:     "anthropic",
		RequestFormat: "anthropic-messages",
	}

	got := buildAgentHubModelInitArgv(agenttemplate.ModelSwitch{
		Enabled:   true,
		Client:    "hermes",
		APIKeyEnv: "AIPROXY_API_KEY",
	}, regionCatalog, model)

	want := []string{
		"ai-agent-switch",
		"agent-hub",
		"init",
		"--client",
		"hermes",
		"--provider-id",
		"aiproxy",
		"--provider-name",
		"AI Proxy",
		"--model-type",
		"anthropic",
		"--base-url",
		"https://aiproxy.usw-1.sealos.io/v1",
		"--api-key-env",
		"AIPROXY_API_KEY",
		"--model",
		"claude-sonnet-4.6",
		"--available-model",
		"claude-sonnet-4.6",
		"--available-model",
		"claude-sonnet-4.5",
		"-y",
		"--json",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("argv = %#v, want %#v", got, want)
	}
	forbiddenArgs := []string{"init-model", "--provider-type", "--request-format"}
	for _, forbidden := range forbiddenArgs {
		if containsArg(got, forbidden) {
			t.Fatalf("argv = %#v, must not include old agent-hub contract arg %q", got, forbidden)
		}
	}
}

func TestRunAgentHubModelCurrentRejectsTemplateWithoutModelSwitch(t *testing.T) {
	t.Parallel()

	_, err := runAgentHubModelCurrent(nil, nil, nil, agenttemplate.Definition{
		ID: "custom-agent",
		ModelSwitch: agenttemplate.ModelSwitch{
			Enabled: false,
		},
	}, agent.Agent{Name: "demo-agent"})
	if err == nil {
		t.Fatal("runAgentHubModelCurrent() error = nil, want unsupported template error")
	}
}

func containsArg(argv []string, value string) bool {
	for _, item := range argv {
		if item == value {
			return true
		}
	}
	return false
}
