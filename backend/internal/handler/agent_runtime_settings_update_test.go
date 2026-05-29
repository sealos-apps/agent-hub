package handler

import (
	"encoding/json"
	"testing"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
)

func modelSlotsTemplateDefinition() agenttemplate.Definition {
	return agenttemplate.Definition{
		ModelIntegration: agenttemplate.ModelIntegration{
			Provider: agenttemplate.ModelIntegrationProvider{
				BaseURL: agenttemplate.ModelIntegrationValueSource{Source: "workspace"},
			},
			Slots: []agenttemplate.ModelIntegrationSlot{
				{
					Key:           "main",
					Required:      true,
					Mutable:       true,
					DefaultModels: map[string]string{"us": "glm-5.1"},
					ModelTypes:    []string{"text"},
				},
				{
					Key:           "locked",
					Required:      false,
					Mutable:       false,
					DefaultModels: map[string]string{"us": "deepseek-v4-flash"},
					ModelTypes:    []string{"text"},
				},
			},
		},
		RegionModelTypes: map[string][]agenttemplate.ModelType{
			"us": {
				{
					Key: "text",
					Models: []agenttemplate.ModelPreset{
						{
							Value:    "glm-5.1",
							Provider: "custom:aiproxy-chat",
							APIMode:  "chat_completions",
						},
						{
							Value:    "deepseek-v4-flash",
							Provider: "custom:aiproxy-chat",
							APIMode:  "chat_completions",
						},
					},
				},
				{
					Key: "image",
					Models: []agenttemplate.ModelPreset{
						{
							Value:    "cogview-4",
							Provider: "custom:aiproxy-responses",
							APIMode:  "image_generation",
						},
					},
				},
			},
		},
	}
}

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
		ModelSlots: map[string]string{"main": "glm-4.6"},
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
		ModelSlots: map[string]string{"main": "gpt-5.4-mini"},
	}, templateDef, "cn")
	if validationErr == nil {
		t.Fatal("validateSettingsUpdateRequest() error = nil, want regional validation error")
	}
	if got := validationErr.Details()["field"]; got != "modelSlots.main" {
		t.Fatalf("validateSettingsUpdateRequest() field = %#v, want modelSlots.main", got)
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
		ModelSlots: map[string]string{"main": "glm-4.6"},
	}

	mapped, validationErr := buildSettingsUpdateRequest(req, templateDef, config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"}, "cn")
	if validationErr != nil {
		t.Fatalf("buildSettingsUpdateRequest() error = %v, want nil", validationErr)
	}
	if mapped.ModelProvider == nil || *mapped.ModelProvider != "custom:aiproxy-chat" {
		t.Fatalf("mapped.ModelProvider = %#v, want custom:aiproxy-chat", mapped.ModelProvider)
	}
	if mapped.Model == nil || *mapped.Model != "glm-4.6" {
		t.Fatalf("mapped.Model = %#v, want glm-4.6", mapped.Model)
	}
	if mapped.ModelAPIMode == nil || *mapped.ModelAPIMode != "chat_completions" {
		t.Fatalf("mapped.ModelAPIMode = %#v, want chat_completions", mapped.ModelAPIMode)
	}
	if mapped.ModelSlots["main"].Model != "glm-4.6" {
		t.Fatalf("mapped.ModelSlots[main].Model = %q, want glm-4.6", mapped.ModelSlots["main"].Model)
	}
}

func TestBuildSettingsUpdateRequestMapsImageGenerationAPIMode(t *testing.T) {
	t.Parallel()

	templateDef := modelSlotsTemplateDefinition()
	templateDef.ModelIntegration.Slots[0].ModelTypes = []string{"image"}

	req := dto.UpdateAgentSettingsRequest{
		ModelSlots: map[string]string{"main": "cogview-4"},
	}

	mapped, validationErr := buildSettingsUpdateRequest(req, templateDef, config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"}, "us")
	if validationErr != nil {
		t.Fatalf("buildSettingsUpdateRequest() error = %v, want nil", validationErr)
	}
	if mapped.ModelAPIMode == nil || *mapped.ModelAPIMode != "image_generation" {
		t.Fatalf("mapped.ModelAPIMode = %#v, want image_generation", mapped.ModelAPIMode)
	}
}

func TestValidateSettingsUpdateRequestRejectsUnknownModelSlot(t *testing.T) {
	t.Parallel()

	validationErr := validateSettingsUpdateRequest(dto.UpdateAgentSettingsRequest{
		ModelSlots: map[string]string{"unknown": "glm-5.1"},
	}, modelSlotsTemplateDefinition(), "us")
	if validationErr == nil {
		t.Fatal("validateSettingsUpdateRequest() error = nil, want slot validation error")
	}
	if got := validationErr.Details()["field"]; got != "modelSlots.unknown" {
		t.Fatalf("validateSettingsUpdateRequest() field = %#v, want modelSlots.unknown", got)
	}
	if got := validationErr.Details()["reason"]; got != "unsupported_field" {
		t.Fatalf("validateSettingsUpdateRequest() reason = %#v, want unsupported_field", got)
	}
}

func TestValidateSettingsUpdateRequestRejectsImmutableModelSlot(t *testing.T) {
	t.Parallel()

	validationErr := validateSettingsUpdateRequest(dto.UpdateAgentSettingsRequest{
		ModelSlots: map[string]string{"locked": "glm-5.1"},
	}, modelSlotsTemplateDefinition(), "us")
	if validationErr == nil {
		t.Fatal("validateSettingsUpdateRequest() error = nil, want immutable slot validation error")
	}
	if got := validationErr.Details()["field"]; got != "modelSlots.locked" {
		t.Fatalf("validateSettingsUpdateRequest() field = %#v, want modelSlots.locked", got)
	}
	if got := validationErr.Details()["reason"]; got != "read_only" {
		t.Fatalf("validateSettingsUpdateRequest() reason = %#v, want read_only", got)
	}
}

func TestValidateSettingsUpdateRequestRejectsModelOutsideSlotTypes(t *testing.T) {
	t.Parallel()

	validationErr := validateSettingsUpdateRequest(dto.UpdateAgentSettingsRequest{
		ModelSlots: map[string]string{"main": "cogview-4"},
	}, modelSlotsTemplateDefinition(), "us")
	if validationErr == nil {
		t.Fatal("validateSettingsUpdateRequest() error = nil, want slot model validation error")
	}
	if got := validationErr.Details()["field"]; got != "modelSlots.main" {
		t.Fatalf("validateSettingsUpdateRequest() field = %#v, want modelSlots.main", got)
	}
	if got := validationErr.Details()["reason"]; got != "unsupported_field" {
		t.Fatalf("validateSettingsUpdateRequest() reason = %#v, want unsupported_field", got)
	}
}

func TestBuildSettingsUpdateRequestMapsModelSlots(t *testing.T) {
	t.Parallel()

	mapped, validationErr := buildSettingsUpdateRequest(dto.UpdateAgentSettingsRequest{
		ModelSlots: map[string]string{"main": "glm-5.1"},
	}, modelSlotsTemplateDefinition(), config.Config{AIProxyModelBaseURL: "https://aiproxy.usw-1.sealos.io/v1"}, "us")
	if validationErr != nil {
		t.Fatalf("buildSettingsUpdateRequest() error = %v, want nil", validationErr)
	}
	if mapped.Model == nil || *mapped.Model != "glm-5.1" {
		t.Fatalf("mapped.Model = %#v, want glm-5.1", mapped.Model)
	}
	if mapped.ModelSlots["main"].Provider != "custom:aiproxy-chat" {
		t.Fatalf("mapped.ModelSlots[main].Provider = %q, want custom:aiproxy-chat", mapped.ModelSlots["main"].Provider)
	}
}

func TestApplyUpdateToDevboxMergesModelSlotsAnnotation(t *testing.T) {
	t.Parallel()

	devbox := &unstructured.Unstructured{}
	devbox.SetAnnotations(map[string]string{
		"agent.sealos.io/model-slots": `{"main":{"provider":"custom:aiproxy-chat","model":"glm-5.1","apiMode":"chat_completions"},"vision":{"provider":"custom:aiproxy-chat","model":"glm-4.6v","apiMode":"chat_completions"}}`,
	})
	if err := applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelSlots: map[string]dto.ModelSlotSelection{
			"main": {
				Provider: "custom:aiproxy-chat",
				Model:    "deepseek-v4-flash",
				APIMode:  "chat_completions",
			},
		},
	}); err != nil {
		t.Fatalf("applyUpdateToDevbox() error = %v, want nil", err)
	}

	var persisted map[string]dto.ModelSlotSelection
	if err := json.Unmarshal([]byte(devbox.GetAnnotations()["agent.sealos.io/model-slots"]), &persisted); err != nil {
		t.Fatalf("model-slots annotation is invalid JSON: %v", err)
	}
	if persisted["main"].Model != "deepseek-v4-flash" {
		t.Fatalf("persisted main model = %q, want deepseek-v4-flash", persisted["main"].Model)
	}
	if persisted["vision"].Model != "glm-4.6v" {
		t.Fatalf("persisted vision model = %q, want glm-4.6v", persisted["vision"].Model)
	}
}

func TestApplyUpdateToDevboxRejectsInvalidModelSlotsAnnotation(t *testing.T) {
	t.Parallel()

	devbox := &unstructured.Unstructured{}
	devbox.SetAnnotations(map[string]string{
		"agent.sealos.io/model-slots": `{bad json`,
	})

	err := applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelSlots: map[string]dto.ModelSlotSelection{
			"main": {
				Provider: "custom:aiproxy-chat",
				Model:    "glm-5.1",
				APIMode:  "chat_completions",
			},
		},
	})
	if err == nil {
		t.Fatal("applyUpdateToDevbox() error = nil, want invalid annotation error")
	}
}

func TestApplyUpdateToDevboxRejectsEmptyModelSlotsAnnotationFields(t *testing.T) {
	t.Parallel()

	devbox := &unstructured.Unstructured{}
	devbox.SetAnnotations(map[string]string{
		"agent.sealos.io/model-slots": `{"main":{"provider":"","model":"","apiMode":""}}`,
	})

	err := applyUpdateToDevbox(devbox, dto.UpdateAgentRequest{
		ModelSlots: map[string]dto.ModelSlotSelection{
			"vision": {
				Provider: "custom:aiproxy-chat",
				Model:    "glm-4.6v",
				APIMode:  "chat_completions",
			},
		},
	})
	if err == nil {
		t.Fatal("applyUpdateToDevbox() error = nil, want invalid annotation error")
	}
}
