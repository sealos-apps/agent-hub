package handler

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agent"
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
) *appErr.AppError {
	if !hasModelUpdate(req) {
		return nil
	}
	input, err := buildAgentModelSyncInput(current, req)
	if err != nil {
		return appErr.New(appErr.CodeKubernetesOperation, "failed to build agent model sync command").WithDetails(map[string]any{
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
	return req.ModelProvider != nil || req.ModelBaseURL != nil || req.Model != nil || req.ModelAPIKey != nil || req.ModelAPIMode != nil
}

func shouldRebootstrap(req dto.UpdateAgentRequest) bool {
	return req.Rebootstrap
}

func buildAgentModelSyncInput(current agent.Agent, req dto.UpdateAgentRequest) (agentModelSyncInput, error) {
	provider := firstNonEmpty(stringValue(req.ModelProvider), current.ModelProvider)
	baseURL := current.ModelBaseURL
	model := firstNonEmpty(stringValue(req.Model), current.Model)
	apiKey := firstNonEmpty(stringValue(req.ModelAPIKey), current.ModelAPIKey)
	apiMode := normalizeAgentModelAPIMode(firstNonEmpty(stringValue(req.ModelAPIMode), current.ModelAPIMode))
	if provider == "" || baseURL == "" || model == "" {
		return agentModelSyncInput{}, fmt.Errorf("provider, base URL, and model are required")
	}
	if apiMode == "" {
		apiMode = "chat_completions"
	}

	providerID := agentHubProviderID(provider)
	apiKeyEnv := "AGENT_MODEL_APIKEY"
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(provider)), "custom:aiproxy-") {
		apiKeyEnv = aiproxyAPIKeyEnv
	}
	if agentHubClientID(current.TemplateID) == "cowagent" && strings.HasPrefix(strings.ToLower(strings.TrimSpace(provider)), "custom:aiproxy-") {
		apiKeyEnv = "OPEN_AI_API_KEY"
	}
	if strings.TrimSpace(providerID) == "" {
		return agentModelSyncInput{}, fmt.Errorf("provider id is empty")
	}
	if strings.TrimSpace(apiKey) == "" {
		return agentModelSyncInput{}, fmt.Errorf("%s is empty", apiKeyEnv)
	}

	clientID := agentHubClientID(current.TemplateID)
	if clientID == "" {
		return agentModelSyncInput{}, fmt.Errorf("unsupported agent template: %s", current.TemplateID)
	}
	return agentModelSyncInput{
		Client:       clientID,
		ProviderID:   providerID,
		ProviderName: agentHubProviderName(provider, providerID),
		BaseURL:      baseURL,
		APIKeyEnv:    apiKeyEnv,
		APIKeyValue:  apiKey,
		Model:        model,
		APIMode:      apiMode,
	}, nil
}

func buildAgentModelSyncScript(input agentModelSyncInput) string {
	modelWithMode := input.Model + ":" + input.APIMode
	return fmt.Sprintf(
		"set -eu\n"+
			"export %s=%s\n"+
			"ai-agent-switch provider init --id %s --name %s --base-url %s --api-key-env %s --model %s --default-model %s --json >/dev/null\n"+
			"ai-agent-switch switch --client %s --provider %s --model %s -y --json >/dev/null\n",
		input.APIKeyEnv,
		shellQuote(input.APIKeyValue),
		shellQuote(input.ProviderID),
		shellQuote(input.ProviderName),
		shellQuote(input.BaseURL),
		shellQuote(input.APIKeyEnv),
		shellQuote(modelWithMode),
		shellQuote(input.Model),
		shellQuote(input.Client),
		shellQuote(input.ProviderID),
		shellQuote(input.Model),
	)
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
