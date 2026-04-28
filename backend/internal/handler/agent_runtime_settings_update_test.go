package handler

import (
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/dto"
)

func TestValidateRuntimeUpdateRequestRejectsEmptyPayload(t *testing.T) {
	t.Parallel()

	err := validateRuntimeUpdateRequest(dto.UpdateAgentRuntimeRequest{})
	if err == nil {
		t.Fatal("validateRuntimeUpdateRequest() error = nil, want validation error")
	}
	if got := err.Details()["field"]; got != "runtime" {
		t.Fatalf("validateRuntimeUpdateRequest() field = %#v, want runtime", got)
	}
	if got := err.Details()["reason"]; got != "required" {
		t.Fatalf("validateRuntimeUpdateRequest() reason = %#v, want required", got)
	}
}

func TestValidateRuntimeUpdateRequestAcceptsResourcePatch(t *testing.T) {
	t.Parallel()

	cpu := "2000m"
	memory := "4Gi"
	storage := "20Gi"
	runtimeClassName := "devbox-runtime"

	err := validateRuntimeUpdateRequest(dto.UpdateAgentRuntimeRequest{
		AgentCPU:         &cpu,
		AgentMemory:      &memory,
		AgentStorage:     &storage,
		RuntimeClassName: &runtimeClassName,
	})
	if err != nil {
		t.Fatalf("validateRuntimeUpdateRequest() error = %v, want nil", err)
	}
}

func TestValidateSettingsUpdateRequestAcceptsHermesRegionalModel(t *testing.T) {
	t.Parallel()

	templateDef, err := agenttemplate.Resolve("hermes-agent", "")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	req := dto.UpdateAgentSettingsRequest{
		Settings: map[string]any{
			"provider": "custom:aiproxy-chat",
			"model":    "glm-4.6",
			"baseURL":  "https://aiproxy.example.com/v1",
		},
	}

	if err := validateSettingsUpdateRequest(req, templateDef, "cn"); err != nil {
		t.Fatalf("validateSettingsUpdateRequest() error = %v, want nil", err)
	}
}

func TestValidateSettingsUpdateRequestRejectsModelOutsideRegionCatalog(t *testing.T) {
	t.Parallel()

	templateDef, err := agenttemplate.Resolve("hermes-agent", "")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	validationErr := validateSettingsUpdateRequest(dto.UpdateAgentSettingsRequest{
		Settings: map[string]any{
			"provider": "custom:aiproxy-responses",
			"model":    "gpt-5.4-mini",
			"baseURL":  "https://aiproxy.example.com/v1",
		},
	}, templateDef, "cn")
	if validationErr == nil {
		t.Fatal("validateSettingsUpdateRequest() error = nil, want regional validation error")
	}
	if got := validationErr.Details()["field"]; got != "settings.model" {
		t.Fatalf("validateSettingsUpdateRequest() field = %#v, want settings.model", got)
	}
	if got := validationErr.Details()["reason"]; got != "unsupported_field" {
		t.Fatalf("validateSettingsUpdateRequest() reason = %#v, want unsupported_field", got)
	}
}

func TestBuildSettingsUpdateRequestMapsSupportedFields(t *testing.T) {
	t.Parallel()

	templateDef, err := agenttemplate.Resolve("hermes-agent", "")
	if err != nil {
		t.Fatalf("Resolve() error = %v", err)
	}

	req := dto.UpdateAgentSettingsRequest{
		Settings: map[string]any{
			"provider": "custom:aiproxy-chat",
			"model":    "glm-4.6",
			"baseURL":  "https://aiproxy.example.com/v1",
		},
	}

	mapped, validationErr := buildSettingsUpdateRequest(req, templateDef)
	if validationErr != nil {
		t.Fatalf("buildSettingsUpdateRequest() error = %v, want nil", validationErr)
	}
	if mapped.ModelProvider == nil || *mapped.ModelProvider != "custom:aiproxy-chat" {
		t.Fatalf("mapped.ModelProvider = %#v, want custom:aiproxy-chat", mapped.ModelProvider)
	}
	if mapped.Model == nil || *mapped.Model != "glm-4.6" {
		t.Fatalf("mapped.Model = %#v, want glm-4.6", mapped.Model)
	}
	if mapped.ModelBaseURL == nil || *mapped.ModelBaseURL != "https://aiproxy.example.com/v1" {
		t.Fatalf("mapped.ModelBaseURL = %#v, want https://aiproxy.example.com/v1", mapped.ModelBaseURL)
	}
}
