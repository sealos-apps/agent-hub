package handler

import (
	"context"
	"errors"
	"fmt"
	"net/url"
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
	Client         string
	ProviderID     string
	ProviderName   string
	ProviderType   string
	BaseURL        string
	APIKeyEnv      string
	APIKeyValue    string
	Model          string
	APIMode        string
	Models         []string
	ExtraProviders []agentModelSyncProvider
	Slots          []agentModelSyncSlot
}

type agentModelSyncProvider struct {
	ProviderID   string
	ProviderName string
	ProviderType string
	BaseURL      string
	APIKeyEnv    string
	APIKeyValue  string
	Models       []string
}

type agentModelSyncSlot struct {
	Key        string
	ProviderID string
	Model      string
	Kind       string
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

func syncAgentBootstrapModelConfig(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	current agent.Agent,
	templateDef agenttemplate.Definition,
	region string,
) error {
	if templateDef.ModelIntegration.Type == "" && len(templateDef.ModelIntegration.Slots) == 0 {
		return nil
	}
	input, err := buildAgentModelSyncInput(current, dto.UpdateAgentRequest{}, templateDef, region)
	if err != nil {
		return fmt.Errorf("build bootstrap model sync command: %w", err)
	}

	if input.Client == "cowagent" {
		if err := waitForCowAgentModelAPI(ctx, clientset, factory, current.Name); err != nil {
			return err
		}
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
		message := execErr.Error()
		if trimmed := strings.TrimSpace(stderr); trimmed != "" {
			message += ": " + trimmed
		}
		return fmt.Errorf("sync bootstrap model config: %s", message)
	}
	return nil
}

func waitForCowAgentModelAPI(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	agentName string,
) error {
	waitCtx, cancel := context.WithTimeout(ctx, agentModelSyncTimeout)
	defer cancel()

	_, stderr, execErr := execAgentCommandWithRetry(
		waitCtx,
		clientset,
		factory,
		agentName,
		[]string{"sh", "-s"},
		[]byte(buildCowAgentModelAPIWaitScript()),
		false,
		nil,
	)
	if execErr != nil {
		message := execErr.Error()
		if trimmed := strings.TrimSpace(stderr); trimmed != "" {
			message += ": " + trimmed
		}
		return fmt.Errorf("wait for CowAgent model API: %s", message)
	}
	return nil
}

func buildCowAgentModelAPIWaitScript() string {
	return "set -eu\nfor i in $(seq 1 25); do\n  if python3 - <<'PY' >/dev/null 2>&1\nimport os\nfrom urllib.error import HTTPError\nfrom urllib.request import urlopen\nport = os.environ.get('WEB_PORT') or os.environ.get('AGENT_PORT') or '9899'\ntry:\n    with urlopen(f'http://127.0.0.1:{port}/auth/check', timeout=1) as response:\n        raise SystemExit(0 if response.status < 500 else 1)\nexcept HTTPError as err:\n    raise SystemExit(0 if err.code < 500 else 1)\nPY\n  then\n    exit 0\n  fi\n  sleep 1\ndone\necho 'CowAgent web API did not become ready' >&2\nexit 1\n"
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
		model = mainSlot.Model
		provider = templateDef.ModelIntegration.Provider.ID
		apiMode = ""
		if clientID == "cowagent" {
			var slotErr error
			slots, slotErr = applyCowAgentRuntimeProviderSlots(slots, templateDef, region)
			if slotErr != nil {
				return agentModelSyncInput{}, slotErr
			}
			mainSlot, _ = mainAgentModelSyncSlot(slots)
		}
		providerID = mainSlot.ProviderID
		baseURL = normalizeAgentModelSyncBaseURL(provider, providerID, baseURL)
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
	providerType := ""
	extraProviders := []agentModelSyncProvider{}
	models := []string{model + ":" + apiMode}
	if hasModelIntegration {
		var modelErr error
		if clientID == "cowagent" {
			providers, providersErr := cowAgentRuntimeModelSyncProviders(templateDef, region, baseURL, apiKey, apiKeyEnv)
			if providersErr != nil {
				return agentModelSyncInput{}, providersErr
			}
			mainProvider, ok := findAgentModelSyncProvider(providers, providerID)
			if !ok {
				return agentModelSyncInput{}, fmt.Errorf("provider models are empty for provider %s in region %s", providerID, strings.TrimSpace(region))
			}
			providerType = mainProvider.ProviderType
			baseURL = mainProvider.BaseURL
			apiKeyEnv = mainProvider.APIKeyEnv
			models = mainProvider.Models
			for _, extra := range providers {
				if extra.ProviderID != providerID {
					extraProviders = append(extraProviders, extra)
				}
			}
		} else {
			models, modelErr = agentHubProviderModels(templateDef, region, providerID)
		}
		if modelErr != nil {
			return agentModelSyncInput{}, modelErr
		}
		if len(models) == 0 {
			return agentModelSyncInput{}, fmt.Errorf("provider models are empty for provider %s in region %s", providerID, strings.TrimSpace(region))
		}
	}
	return agentModelSyncInput{
		Client:         clientID,
		ProviderID:     providerID,
		ProviderName:   agentModelSyncProviderNameForInput(provider, providerID, templateDef, providerType),
		ProviderType:   providerType,
		BaseURL:        baseURL,
		APIKeyEnv:      apiKeyEnv,
		APIKeyValue:    apiKey,
		Model:          model,
		APIMode:        apiMode,
		Models:         models,
		ExtraProviders: extraProviders,
		Slots:          slots,
	}, nil
}

func buildAgentModelSyncScript(input agentModelSyncInput) string {
	configureArgs := ""
	for _, slot := range input.Slots {
		configureArgs += " --slot " + shellQuote(slot.Key+"="+slot.ProviderID+"/"+slot.Model)
	}
	if configureArgs == "" {
		configureArgs = " --slot " + shellQuote("main="+input.ProviderID+"/"+input.Model)
	}
	liveApplyExport := ""
	if input.Client == "cowagent" {
		liveApplyExport = "export AI_AGENT_SWITCH_COWAGENT_LIVE_APPLY='required'\n"
	}
	providers := append([]agentModelSyncProvider{{
		ProviderID:   input.ProviderID,
		ProviderName: input.ProviderName,
		ProviderType: input.ProviderType,
		BaseURL:      input.BaseURL,
		APIKeyEnv:    input.APIKeyEnv,
		APIKeyValue:  input.APIKeyValue,
		Models:       input.Models,
	}}, input.ExtraProviders...)

	var builder strings.Builder
	builder.WriteString("set -eu\n")
	for index, provider := range providers {
		builder.WriteString(fmt.Sprintf("export %s=%s\n", provider.APIKeyEnv, shellQuote(provider.APIKeyValue)))
		if index == 0 {
			builder.WriteString(liveApplyExport)
		}
		builder.WriteString(agentModelSyncProviderInitCommand(provider, index == 0, input.Model))
	}
	builder.WriteString(fmt.Sprintf(
		"ai-agent-switch client configure --client %s%s -y --json >/dev/null\n",
		shellQuote(input.Client),
		configureArgs,
	))
	return builder.String()
}

func agentModelSyncProviderInitCommand(provider agentModelSyncProvider, includeDefault bool, defaultModel string) string {
	modelArgs := ""
	for _, model := range provider.Models {
		modelArgs += " --model " + shellQuote(model)
	}
	typeArg := ""
	if strings.TrimSpace(provider.ProviderType) != "" {
		typeArg = " --type " + shellQuote(provider.ProviderType)
	}
	defaultArg := ""
	if includeDefault {
		defaultArg = " --default-model " + shellQuote(defaultModel)
	}
	return fmt.Sprintf(
		"ai-agent-switch provider init --id %s --name %s%s --base-url %s --api-key-env %s%s%s --json >/dev/null\n",
		shellQuote(provider.ProviderID),
		shellQuote(provider.ProviderName),
		typeArg,
		shellQuote(provider.BaseURL),
		shellQuote(provider.APIKeyEnv),
		modelArgs,
		defaultArg,
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
			Kind:       strings.TrimSpace(selection.Kind),
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

func applyCowAgentRuntimeProviderSlots(slots []agentModelSyncSlot, templateDef agenttemplate.Definition, region string) ([]agentModelSyncSlot, error) {
	result := make([]agentModelSyncSlot, 0, len(slots))
	for _, slot := range slots {
		preset, ok := agentModelPresetByValue(templateDef, region, slot.Model)
		if !ok || strings.TrimSpace(preset.RuntimeProvider) == "" || agentHubProviderID(preset.Provider) != "aiproxy" {
			result = append(result, slot)
			continue
		}
		config, err := cowAgentRuntimeProviderConfig(strings.TrimSpace(preset.RuntimeProvider))
		if err != nil {
			return nil, err
		}
		slot.ProviderID = config.ProviderID
		result = append(result, slot)
	}
	return result, nil
}

func cowAgentRuntimeModelSyncProviders(
	templateDef agenttemplate.Definition,
	region string,
	baseURL string,
	apiKey string,
	defaultAPIKeyEnv string,
) ([]agentModelSyncProvider, error) {
	presets := templateDef.RegionModelPresets[strings.TrimSpace(region)]
	providers := []agentModelSyncProvider{}
	seenProviders := map[string]int{}
	seenModels := map[string]map[string]bool{}
	for _, preset := range presets {
		value := strings.TrimSpace(preset.Value)
		apiMode := normalizeAgentModelAPIMode(preset.APIMode)
		if value == "" || apiMode == "" {
			continue
		}
		kind := strings.TrimSpace(preset.Kind)
		if kind == "" {
			return nil, fmt.Errorf("provider model %s is missing kind", value)
		}
		providerID := agentHubProviderID(preset.Provider)
		providerName := agentHubProviderName(preset.Provider, providerID)
		providerType := ""
		providerBaseURL := normalizeAgentModelSyncBaseURL(preset.Provider, providerID, baseURL)
		apiKeyEnv := defaultAPIKeyEnv
		if runtimeProvider := strings.TrimSpace(preset.RuntimeProvider); runtimeProvider != "" && providerID == "aiproxy" {
			config, err := cowAgentRuntimeProviderConfig(runtimeProvider)
			if err != nil {
				return nil, err
			}
			runtimeBaseURL, baseErr := cowAgentRuntimeProviderBaseURL(baseURL, runtimeProvider)
			if baseErr != nil {
				return nil, baseErr
			}
			providerID = config.ProviderID
			providerName = config.ProviderName
			providerType = config.ProviderType
			providerBaseURL = runtimeBaseURL
			apiKeyEnv = config.APIKeyEnv
		}
		model := value + ":" + apiMode + ":" + kind
		if seenModels[providerID] == nil {
			seenModels[providerID] = map[string]bool{}
		}
		if seenModels[providerID][model] {
			continue
		}
		seenModels[providerID][model] = true
		index, ok := seenProviders[providerID]
		if !ok {
			seenProviders[providerID] = len(providers)
			providers = append(providers, agentModelSyncProvider{
				ProviderID:   providerID,
				ProviderName: providerName,
				ProviderType: providerType,
				BaseURL:      providerBaseURL,
				APIKeyEnv:    apiKeyEnv,
				APIKeyValue:  apiKey,
				Models:       []string{model},
			})
			continue
		}
		providers[index].Models = append(providers[index].Models, model)
	}
	return providers, nil
}

type cowAgentRuntimeProviderSettings struct {
	ProviderID   string
	ProviderName string
	ProviderType string
	APIKeyEnv    string
}

func cowAgentRuntimeProviderConfig(runtimeProvider string) (cowAgentRuntimeProviderSettings, error) {
	switch strings.TrimSpace(runtimeProvider) {
	case "openai":
		return cowAgentRuntimeProviderSettings{
			ProviderID:   "aiproxy-openai",
			ProviderName: "AI Proxy OpenAI",
			ProviderType: "openai-chat-compatible",
			APIKeyEnv:    "OPEN_AI_API_KEY",
		}, nil
	case "gemini":
		return cowAgentRuntimeProviderSettings{
			ProviderID:   "aiproxy-gemini",
			ProviderName: "AI Proxy Gemini",
			ProviderType: "gemini",
			APIKeyEnv:    "GEMINI_API_KEY",
		}, nil
	case "dashscope":
		return cowAgentRuntimeProviderSettings{
			ProviderID:   "aiproxy-dashscope",
			ProviderName: "AI Proxy DashScope",
			ProviderType: "dashscope",
			APIKeyEnv:    "DASHSCOPE_API_KEY",
		}, nil
	default:
		return cowAgentRuntimeProviderSettings{}, fmt.Errorf("unsupported CowAgent runtimeProvider %q", runtimeProvider)
	}
}

func cowAgentRuntimeProviderBaseURL(baseURL string, runtimeProvider string) (string, error) {
	switch strings.TrimSpace(runtimeProvider) {
	case "openai":
		return normalizeAIProxyModelBaseURL(baseURL), nil
	case "gemini", "dashscope":
		return stripAgentModelSyncBaseURLPath(baseURL)
	default:
		return "", fmt.Errorf("unsupported CowAgent runtimeProvider %q", runtimeProvider)
	}
}

func stripAgentModelSyncBaseURLPath(baseURL string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse AI Proxy base URL: %w", err)
	}
	if strings.TrimSpace(parsed.Scheme) == "" || strings.TrimSpace(parsed.Host) == "" {
		return "", fmt.Errorf("AI Proxy base URL is invalid: %s", baseURL)
	}
	parsed.Path = ""
	parsed.RawPath = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return strings.TrimRight(parsed.String(), "/"), nil
}

func agentModelPresetByValue(templateDef agenttemplate.Definition, region string, model string) (agenttemplate.ModelPreset, bool) {
	for _, preset := range templateDef.RegionModelPresets[strings.TrimSpace(region)] {
		if strings.TrimSpace(preset.Value) == strings.TrimSpace(model) {
			return preset, true
		}
	}
	return agenttemplate.ModelPreset{}, false
}

func findAgentModelSyncProvider(providers []agentModelSyncProvider, providerID string) (agentModelSyncProvider, bool) {
	for _, provider := range providers {
		if provider.ProviderID == providerID {
			return provider, true
		}
	}
	return agentModelSyncProvider{}, false
}

func normalizeAgentModelSyncBaseURL(provider string, providerID string, baseURL string) string {
	if providerID != "aiproxy" || agentHubProviderID(provider) != providerID {
		return baseURL
	}
	normalized := normalizeAIProxyModelBaseURL(baseURL)
	parsed, err := url.Parse(normalized)
	if err != nil {
		return normalized
	}
	if strings.TrimSpace(parsed.Scheme) == "" || strings.TrimSpace(parsed.Host) == "" {
		return normalized
	}
	if strings.TrimRight(strings.TrimSpace(parsed.Path), "/") == "/anthropic" {
		parsed.Path = "/v1"
		return strings.TrimRight(parsed.String(), "/")
	}
	return normalized
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

func agentModelSyncProviderNameForInput(provider string, providerID string, templateDef agenttemplate.Definition, providerType string) string {
	switch strings.TrimSpace(providerID) {
	case "aiproxy-openai":
		return "AI Proxy OpenAI"
	case "aiproxy-gemini":
		return "AI Proxy Gemini"
	case "aiproxy-dashscope":
		return "AI Proxy DashScope"
	}
	if strings.TrimSpace(providerType) != "" && strings.HasPrefix(strings.TrimSpace(providerID), "aiproxy-") {
		return providerID
	}
	return agentModelSyncProviderName(provider, providerID, templateDef)
}

func agentHubProviderModels(templateDef agenttemplate.Definition, region string, providerID string) ([]string, error) {
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
		kind := strings.TrimSpace(preset.Kind)
		if kind == "" {
			return nil, fmt.Errorf("provider model %s is missing kind", value)
		}
		model := value + ":" + apiMode + ":" + kind
		if seen[model] {
			continue
		}
		seen[model] = true
		result = append(result, model)
	}
	return result, nil
}

func normalizeAgentModelAPIMode(value string) string {
	switch strings.TrimSpace(value) {
	case "openai_compatible", "openai-compatible":
		return "openai_compatible"
	case "image-generation", "images_generations", "images/generations":
		return "image_generation"
	case "video-generation", "videos_generations", "video/generations":
		return "video_generation"
	case "audio-transcriptions", "audio/transcriptions":
		return "audio_transcriptions"
	case "audio-speech", "audio/speech":
		return "audio_speech"
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
