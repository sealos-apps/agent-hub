package handler

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/remotecommand"
)

const agentModelSyncTimeout = 30 * time.Second

type agentModelSyncInput struct {
	Client       string
	ProviderID   string
	ProviderName string
	BaseURL      string
	APIKeyEnv    string
	APIKeyValue  string
	Model        string
	APIMode      string
	Models       []string
	Slots        []agentModelSyncSlot
}

type agentModelSyncSlot struct {
	Key        string
	ProviderID string
	Model      string
}

type agentExecFunc func(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
	command []string,
	stdinPayload []byte,
	tty bool,
	sizeQueue remotecommand.TerminalSizeQueue,
) (string, string, error)

var execAgentCommandWithRetry agentExecFunc = execInAgentPodWithRetry

func syncAgentModelConfig(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	current agent.Agent,
	req dto.UpdateAgentRequest,
	templateDef agenttemplate.Definition,
	region string,
) *appErr.AppError {
	if !hasModelUpdate(req) || shouldRebootstrap(req) {
		return nil
	}
	input, err := buildAgentModelSyncInput(current, req, templateDef, region)
	if err != nil {
		return appErr.New(appErr.CodeValidationFailed, "failed to build agent model sync command").WithDetails(map[string]any{
			"reason": err.Error(),
		})
	}

	syncCtx, cancel := context.WithTimeout(ctx, agentModelSyncTimeout)
	defer cancel()

	_, stderr, execErr := execAgentCommandWithRetry(
		syncCtx,
		clientset,
		factory,
		current.Name,
		[]string{"sh", "-s"},
		[]byte(buildAgentModelSyncScript(input)),
		false,
		nil,
	)
	if execErr != nil {
		details := map[string]any{
			"reason": execErr.Error(),
		}
		if trimmed := strings.TrimSpace(stderr); trimmed != "" {
			details["stderr"] = trimmed
		}
		return appErr.New(appErr.CodeKubernetesOperation, "failed to sync agent model config").WithDetails(details)
	}
	return nil
}

func hasModelUpdate(req dto.UpdateAgentRequest) bool {
	return req.ModelProvider != nil || req.ModelBaseURL != nil || req.Model != nil || req.ModelAPIKey != nil || req.ModelAPIMode != nil || len(req.ModelSlots) > 0
}

func shouldRebootstrap(req dto.UpdateAgentRequest) bool {
	return req.Rebootstrap
}

func buildAgentModelSyncInput(
	current agent.Agent,
	req dto.UpdateAgentRequest,
	templateDef agenttemplate.Definition,
	region string,
) (agentModelSyncInput, error) {
	hasModelIntegration := templateDef.ModelIntegration.Type != "" || len(templateDef.ModelIntegration.Slots) > 0
	provider := firstNonEmpty(stringValue(req.ModelProvider), current.ModelProvider)
	baseURL := current.ModelBaseURL
	model := firstNonEmpty(stringValue(req.Model), current.Model)
	apiKey := firstNonEmpty(stringValue(req.ModelAPIKey), current.ModelAPIKey)
	apiMode := normalizeAgentModelAPIMode(firstNonEmpty(stringValue(req.ModelAPIMode), current.ModelAPIMode))
	providerID := agentHubProviderID(provider)
	apiKeyEnv := strings.TrimSpace(templateDef.ModelIntegration.Provider.APIKeyEnv)
	if hasModelIntegration && apiKeyEnv == "" {
		return agentModelSyncInput{}, errors.New("modelIntegration.provider.apiKeyEnv is required")
	}
	if apiKeyEnv == "" {
		apiKeyEnv = "AGENT_MODEL_APIKEY"
	}
	if !hasModelIntegration && strings.HasPrefix(strings.ToLower(strings.TrimSpace(provider)), "custom:aiproxy-") {
		apiKeyEnv = aiproxyAPIKeyEnv
	}
	if !hasModelIntegration && agentHubClientID(current.TemplateID) == "cowagent" && strings.HasPrefix(strings.ToLower(strings.TrimSpace(provider)), "custom:aiproxy-") {
		apiKeyEnv = "OPEN_AI_API_KEY"
	}
	if !isValidShellEnvName(apiKeyEnv) {
		return agentModelSyncInput{}, fmt.Errorf("invalid apiKeyEnv: %s", apiKeyEnv)
	}
	if strings.TrimSpace(apiKey) == "" {
		return agentModelSyncInput{}, fmt.Errorf("%s is empty", apiKeyEnv)
	}
	clientID := strings.TrimSpace(templateDef.ModelIntegration.Client)
	if clientID == "" && !hasModelIntegration {
		clientID = agentHubClientID(current.TemplateID)
	}
	if clientID == "" {
		if hasModelIntegration {
			return agentModelSyncInput{}, errors.New("modelIntegration.client is required")
		}
		return agentModelSyncInput{}, fmt.Errorf("unsupported agent template: %s", current.TemplateID)
	}
	slots, err := buildAgentModelSyncSlots(current, templateDef)
	if err != nil {
		return agentModelSyncInput{}, err
	}
	if len(slots) > 0 {
		mainSlot, ok := mainAgentModelSyncSlot(slots)
		if !ok {
			return agentModelSyncInput{}, errors.New("agent.sealos.io/model-slots missing main slot")
		}
		providerID = mainSlot.ProviderID
		model = mainSlot.Model
		provider = templateDef.ModelIntegration.Provider.ID
		apiMode = ""
	} else if provider == "" || model == "" {
		return agentModelSyncInput{}, fmt.Errorf("provider, base URL, and model are required")
	}
	if baseURL == "" {
		return agentModelSyncInput{}, fmt.Errorf("provider, base URL, and model are required")
	}
	if apiMode == "" {
		apiMode = "chat_completions"
	}
	if strings.TrimSpace(providerID) == "" {
		return agentModelSyncInput{}, fmt.Errorf("provider id is empty")
	}
	models := []string{model + ":" + apiMode}
	if hasModelIntegration {
		models = agentHubProviderModels(templateDef, region, providerID)
		if len(models) == 0 {
			return agentModelSyncInput{}, fmt.Errorf("provider models are empty for provider %s in region %s", providerID, strings.TrimSpace(region))
		}
	}
	return agentModelSyncInput{
		Client:       clientID,
		ProviderID:   providerID,
		ProviderName: agentModelSyncProviderName(provider, providerID, templateDef),
		BaseURL:      baseURL,
		APIKeyEnv:    apiKeyEnv,
		APIKeyValue:  apiKey,
		Model:        model,
		APIMode:      apiMode,
		Models:       models,
		Slots:        slots,
	}, nil
}

func buildAgentModelSyncScript(input agentModelSyncInput) string {
	modelArgs := ""
	for _, model := range input.Models {
		modelArgs += " --model " + shellQuote(model)
	}
	configureArgs := ""
	for _, slot := range input.Slots {
		configureArgs += " --slot " + shellQuote(slot.Key+"="+slot.ProviderID+"/"+slot.Model)
	}
	if configureArgs == "" {
		configureArgs = " --slot " + shellQuote("main="+input.ProviderID+"/"+input.Model)
	}
	return fmt.Sprintf(
		"set -eu\n"+
			"export %s=%s\n"+
			"ai-agent-switch provider init --id %s --name %s --base-url %s --api-key-env %s%s --default-model %s --json >/dev/null\n"+
			"ai-agent-switch client configure --client %s%s -y --json >/dev/null\n",
		input.APIKeyEnv,
		shellQuote(input.APIKeyValue),
		shellQuote(input.ProviderID),
		shellQuote(input.ProviderName),
		shellQuote(input.BaseURL),
		shellQuote(input.APIKeyEnv),
		modelArgs,
		shellQuote(input.Model),
		shellQuote(input.Client),
		configureArgs,
	)
}

func buildAgentModelSyncSlots(current agent.Agent, templateDef agenttemplate.Definition) ([]agentModelSyncSlot, error) {
	if templateDef.ModelIntegration.Type == "" && len(templateDef.ModelIntegration.Slots) == 0 {
		return nil, nil
	}
	annotation := ""
	if current.Annotations != nil {
		annotation = current.Annotations["agent.sealos.io/model-slots"]
	}
	modelSlots, err := decodeModelSlotsAnnotation(annotation)
	if err != nil {
		return nil, err
	}
	if len(modelSlots) == 0 {
		return nil, errors.New("agent.sealos.io/model-slots is required for modelIntegration templates")
	}
	slotIndex := map[string]bool{}
	for _, slot := range templateDef.ModelIntegration.Slots {
		key := strings.TrimSpace(slot.Key)
		if key != "" {
			slotIndex[key] = true
		}
	}
	result := make([]agentModelSyncSlot, 0, len(modelSlots))
	for _, slot := range templateDef.ModelIntegration.Slots {
		key := strings.TrimSpace(slot.Key)
		if key == "" {
			continue
		}
		selection, ok := modelSlots[key]
		if !ok {
			if slot.Required {
				return nil, fmt.Errorf("agent.sealos.io/model-slots missing required slot %s", key)
			}
			continue
		}
		providerID := agentHubProviderID(selection.Provider)
		if providerID == "" {
			return nil, fmt.Errorf("provider id is empty for slot %s", key)
		}
		result = append(result, agentModelSyncSlot{
			Key:        key,
			ProviderID: providerID,
			Model:      selection.Model,
		})
	}
	for key := range modelSlots {
		if !slotIndex[key] {
			return nil, fmt.Errorf("agent.sealos.io/model-slots contains unsupported slot %s", key)
		}
	}
	if len(result) == 0 {
		return nil, errors.New("agent.sealos.io/model-slots has no configurable slots")
	}
	return result, nil
}

func mainAgentModelSyncSlot(slots []agentModelSyncSlot) (agentModelSyncSlot, bool) {
	for _, slot := range slots {
		if slot.Key == "main" {
			return slot, true
		}
	}
	return agentModelSyncSlot{}, false
}

func agentModelSyncProviderName(provider string, providerID string, templateDef agenttemplate.Definition) string {
	if agentHubProviderID(templateDef.ModelIntegration.Provider.ID) == providerID {
		for _, lang := range []string{"en", "zh"} {
			if name := strings.TrimSpace(templateDef.ModelIntegration.Provider.Name[lang]); name != "" {
				return name
			}
		}
		for _, name := range templateDef.ModelIntegration.Provider.Name {
			if trimmed := strings.TrimSpace(name); trimmed != "" {
				return trimmed
			}
		}
	}
	return agentHubProviderName(provider, providerID)
}

func agentHubProviderModels(templateDef agenttemplate.Definition, region string, providerID string) []string {
	presets := templateDef.RegionModelPresets[strings.TrimSpace(region)]
	result := make([]string, 0, len(presets))
	seen := map[string]bool{}
	for _, preset := range presets {
		value := strings.TrimSpace(preset.Value)
		apiMode := normalizeAgentModelAPIMode(preset.APIMode)
		if value == "" || apiMode == "" {
			continue
		}
		if agentHubProviderID(preset.Provider) != providerID {
			continue
		}
		model := value + ":" + apiMode
		if seen[model] {
			continue
		}
		seen[model] = true
		result = append(result, model)
	}
	return result
}

func normalizeAgentModelAPIMode(value string) string {
	switch strings.TrimSpace(value) {
	case "openai-responses", "responses":
		return "codex_responses"
	case "anthropic":
		return "anthropic_messages"
	case "openai-chat-compatible", "openai_chat":
		return "chat_completions"
	default:
		return strings.TrimSpace(value)
	}
}

func agentHubClientID(templateID string) string {
	switch strings.TrimSpace(templateID) {
	case "hermes-agent":
		return "hermes"
	case "openclaw":
		return "openclaw"
	case "cowagent":
		return "cowagent"
	default:
		return ""
	}
}

func agentHubProviderID(provider string) string {
	switch strings.TrimSpace(provider) {
	case aiproxyChatProvider, aiproxyResponsesProvider, aiproxyAnthropicProvider:
		return "aiproxy"
	default:
		return sanitizeAgentHubProviderID(provider)
	}
}

func agentHubProviderName(provider, providerID string) string {
	switch strings.TrimSpace(provider) {
	case aiproxyChatProvider, aiproxyResponsesProvider, aiproxyAnthropicProvider:
		return "AI Proxy"
	default:
		return providerID
	}
}

func sanitizeAgentHubProviderID(provider string) string {
	value := strings.ToLower(strings.TrimSpace(provider))
	value = strings.TrimPrefix(value, "custom:")
	var builder strings.Builder
	lastDash := false
	for _, r := range value {
		valid := (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '.' || r == '_' || r == '-'
		if valid {
			builder.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			builder.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(strings.TrimSpace(builder.String()), "-")
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func isValidShellEnvName(value string) bool {
	if value == "" {
		return false
	}
	for index, r := range value {
		validLetter := (r >= 'A' && r <= 'Z') || (r >= 'a' && r <= 'z')
		validDigit := r >= '0' && r <= '9'
		if index == 0 {
			if !validLetter && r != '_' {
				return false
			}
			continue
		}
		if !validLetter && !validDigit && r != '_' {
			return false
		}
	}
	return true
}
