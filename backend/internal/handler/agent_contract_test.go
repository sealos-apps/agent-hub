package handler

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func TestGenerateSSHAccessTokenUsesOneHourTTL(t *testing.T) {
	t.Parallel()

	now := time.Unix(1713500000, 0)
	token, err := generateSSHAccessToken("ns-test", "agent-test", []byte("secret"), now)
	if err != nil {
		t.Fatalf("generateSSHAccessToken() error = %v", err)
	}

	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("token parts len = %d, want 3", len(parts))
	}

	payloadRaw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		t.Fatalf("DecodeString(payload) error = %v", err)
	}

	var payload map[string]any
	if err := json.Unmarshal(payloadRaw, &payload); err != nil {
		t.Fatalf("json.Unmarshal(payload) error = %v", err)
	}

	gotIat, ok := payload["iat"].(float64)
	if !ok {
		t.Fatalf("payload iat missing or invalid: %v", payload["iat"])
	}
	gotExp, ok := payload["exp"].(float64)
	if !ok {
		t.Fatalf("payload exp missing or invalid: %v", payload["exp"])
	}

	if int64(gotExp-gotIat) != int64(sshAccessTokenTTL/time.Second) {
		t.Fatalf("token ttl seconds = %d, want %d", int64(gotExp-gotIat), int64(sshAccessTokenTTL/time.Second))
	}
}

func TestTemplateSourceFromConfigKeepsGitHubWhenLocalDirIsSet(t *testing.T) {
	t.Parallel()

	source := templateSourceFromConfig(config.Config{
		AgentTemplateDir:         "/tmp/local-agent-templates",
		AgentTemplateGitHubURL:   "https://github.com/nightwhite/Agent-Hub-Template",
		AgentTemplateGitHubToken: "token",
		AgentTemplateCacheDir:    "/tmp/agenthub-template-cache",
	})

	if source.GitHubURL != "https://github.com/nightwhite/Agent-Hub-Template" {
		t.Fatalf("templateSourceFromConfig().GitHubURL = %q, want configured GitHub URL", source.GitHubURL)
	}
	if source.Dir != "/tmp/local-agent-templates" {
		t.Fatalf("templateSourceFromConfig().Dir = %q, want configured local dir", source.Dir)
	}
}

func TestBuildAgentContractReturnsModelSlots(t *testing.T) {
	t.Parallel()

	contract, contractErr := buildAgentContract(kube.AgentView{
		Agent: agent.Agent{
			Name:       "agent-test",
			TemplateID: "template-test",
			Namespace:  "ns-test",
			Annotations: map[string]string{
				"agent.sealos.io/model-slots": `{"main":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions","kind":"llm"}}`,
			},
		},
	}, agenttemplate.Definition{}, config.Config{})
	if contractErr != nil {
		t.Fatalf("buildAgentContract() error = %v, want nil", contractErr)
	}

	main := contract.Runtime.ModelSlots["main"]
	if main.Provider != "custom:aiproxy-chat" {
		t.Fatalf("contract.Runtime.ModelSlots[main].Provider = %q, want custom:aiproxy-chat", main.Provider)
	}
	if main.Model != "glm-5.1" {
		t.Fatalf("contract.Runtime.ModelSlots[main].Model = %q, want glm-5.1", main.Model)
	}
	if main.APIMode != "chat_completions" {
		t.Fatalf("contract.Runtime.ModelSlots[main].APIMode = %q, want chat_completions", main.APIMode)
	}
}

func TestModelSlotsFromAnnotationsRejectsInvalidJSON(t *testing.T) {
	t.Parallel()

	_, err := modelSlotsFromAnnotations(map[string]string{
		"agent.sealos.io/model-slots": `{bad json`,
	})
	if err == nil {
		t.Fatal("modelSlotsFromAnnotations() error = nil, want invalid JSON error")
	}
	if err.Code() != appErr.CodeKubernetesOperation {
		t.Fatalf("modelSlotsFromAnnotations() code = %d, want %d", err.Code(), appErr.CodeKubernetesOperation)
	}
	if got := err.Details()["field"]; got != "agent.sealos.io/model-slots" {
		t.Fatalf("modelSlotsFromAnnotations() field = %#v, want agent.sealos.io/model-slots", got)
	}
	if got := err.Details()["reason"]; got != "invalid_json" {
		t.Fatalf("modelSlotsFromAnnotations() reason = %#v, want invalid_json", got)
	}
}

func TestModelSlotsFromAnnotationsRejectsEmptySlotObject(t *testing.T) {
	t.Parallel()

	_, err := modelSlotsFromAnnotations(map[string]string{
		"agent.sealos.io/model-slots": `{"main":{}}`,
	})
	if err == nil {
		t.Fatal("modelSlotsFromAnnotations() error = nil, want invalid slot error")
	}
	if got := err.Details()["field"]; got != "agent.sealos.io/model-slots" {
		t.Fatalf("modelSlotsFromAnnotations() field = %#v, want agent.sealos.io/model-slots", got)
	}
	if got := err.Details()["reason"]; got != "invalid_slot" {
		t.Fatalf("modelSlotsFromAnnotations() reason = %#v, want invalid_slot", got)
	}
}

func TestModelSlotsFromAnnotationsRejectsSlotWithoutKind(t *testing.T) {
	t.Parallel()

	_, err := modelSlotsFromAnnotations(map[string]string{
		"agent.sealos.io/model-slots": `{"main":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions"}}`,
	})
	if err == nil {
		t.Fatal("modelSlotsFromAnnotations() error = nil, want missing kind error")
	}
	if got := err.Details()["field"]; got != "agent.sealos.io/model-slots" {
		t.Fatalf("modelSlotsFromAnnotations() field = %#v, want agent.sealos.io/model-slots", got)
	}
	if got := err.Details()["reason"]; got != "invalid_slot" {
		t.Fatalf("modelSlotsFromAnnotations() reason = %#v, want invalid_slot", got)
	}
}

func TestModelSlotsFromAnnotationsRejectsInvalidTopLevelStructure(t *testing.T) {
	t.Parallel()

	cases := []string{
		`{}`,
		`null`,
		`[]`,
		`"string"`,
	}
	for _, annotation := range cases {
		_, err := modelSlotsFromAnnotations(map[string]string{
			"agent.sealos.io/model-slots": annotation,
		})
		if err == nil {
			t.Fatalf("modelSlotsFromAnnotations(%s) error = nil, want invalid annotation error", annotation)
		}
		if got := err.Details()["reason"]; got != "invalid_slot" {
			t.Fatalf("modelSlotsFromAnnotations(%s) reason = %#v, want invalid_slot", annotation, got)
		}
	}
}

func TestBuildAgentContractRejectsInvalidModelSlotsAnnotation(t *testing.T) {
	t.Parallel()

	_, contractErr := buildAgentContract(kube.AgentView{
		Agent: agent.Agent{
			Name:       "agent-test",
			TemplateID: "template-test",
			Namespace:  "ns-test",
			Annotations: map[string]string{
				"agent.sealos.io/model-slots": `{bad json`,
			},
		},
	}, agenttemplate.Definition{}, config.Config{})
	if contractErr == nil {
		t.Fatal("buildAgentContract() error = nil, want invalid annotation error")
	}
	if contractErr.Code() != appErr.CodeKubernetesOperation {
		t.Fatalf("buildAgentContract() code = %d, want %d", contractErr.Code(), appErr.CodeKubernetesOperation)
	}
}

func TestBuildAgentContractWithConfigErrorPreservesAgentInErrorState(t *testing.T) {
	t.Parallel()

	view := kube.AgentView{
		Agent: agent.Agent{
			Name:       "agent-test",
			TemplateID: "template-test",
			Namespace:  "ns-test",
			Ready:      true,
			Annotations: map[string]string{
				"agent.sealos.io/model-slots": `{bad json`,
			},
		},
	}
	_, contractErr := buildAgentContract(view, agenttemplate.Definition{}, config.Config{})
	if contractErr == nil {
		t.Fatal("buildAgentContract() error = nil, want invalid annotation error")
	}

	contract := buildAgentContractWithConfigError(view, agenttemplate.Definition{}, config.Config{}, contractErr)
	if contract.Core.Name != "agent-test" {
		t.Fatalf("contract.Core.Name = %q, want agent-test", contract.Core.Name)
	}
	if contract.Core.Status != "Error" {
		t.Fatalf("contract.Core.Status = %q, want Error", contract.Core.Status)
	}
	if contract.Core.Ready {
		t.Fatal("contract.Core.Ready = true, want false")
	}
	if contract.Core.ConfigError != "invalid model slots annotation" {
		t.Fatalf("contract.Core.ConfigError = %q, want invalid model slots annotation", contract.Core.ConfigError)
	}
}
