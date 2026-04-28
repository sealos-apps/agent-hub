package handler

import (
	"fmt"
	"net/url"
	"strings"
)

const (
	aiproxyAPIKeyEnv             = "AIPROXY_API_KEY"
	aiproxyChatProvider          = "custom:aiproxy-chat"
	aiproxyResponsesProvider     = "custom:aiproxy-responses"
	aiproxyAnthropicProvider     = "custom:aiproxy-anthropic"
	aiproxyChatProviderName      = "aiproxy-chat"
	aiproxyResponsesProviderName = "aiproxy-responses"
	aiproxyAnthropicProviderName = "aiproxy-anthropic"
)

type hermesProviderProfile struct {
	Provider           string
	CustomProviderName string
	APIKeyEnv          string
	APIMode            string
	BasePath           string
}

var hermesAIProxyProviderProfiles = map[string]hermesProviderProfile{
	aiproxyChatProvider: {
		Provider:           aiproxyChatProvider,
		CustomProviderName: aiproxyChatProviderName,
		APIKeyEnv:          aiproxyAPIKeyEnv,
		APIMode:            "chat_completions",
		BasePath:           "/v1",
	},
	aiproxyResponsesProvider: {
		Provider:           aiproxyResponsesProvider,
		CustomProviderName: aiproxyResponsesProviderName,
		APIKeyEnv:          aiproxyAPIKeyEnv,
		APIMode:            "codex_responses",
		BasePath:           "/v1",
	},
	aiproxyAnthropicProvider: {
		Provider:           aiproxyAnthropicProvider,
		CustomProviderName: aiproxyAnthropicProviderName,
		APIKeyEnv:          aiproxyAPIKeyEnv,
		APIMode:            "anthropic_messages",
		BasePath:           "/anthropic",
	},
}

func resolveAIProxyHermesProvider(provider string) (hermesProviderProfile, error) {
	normalized := strings.ToLower(strings.TrimSpace(provider))
	if normalized == "" {
		return hermesProviderProfile{}, fmt.Errorf("model provider is required")
	}

	profile, ok := hermesAIProxyProviderProfiles[normalized]
	if !ok {
		return hermesProviderProfile{}, fmt.Errorf("unsupported model provider: %s", strings.TrimSpace(provider))
	}
	return profile, nil
}

func isAIProxyHermesProvider(provider string) bool {
	_, ok := hermesAIProxyProviderProfiles[strings.ToLower(strings.TrimSpace(provider))]
	return ok
}

func resolveAIProxyProviderBaseURL(explicitBaseURL, clusterServer, provider string) string {
	baseURL := resolveAIProxyModelBaseURL(explicitBaseURL, clusterServer)
	if baseURL == "" {
		return ""
	}

	profile, err := resolveAIProxyHermesProvider(provider)
	if err != nil {
		return baseURL
	}
	if profile.BasePath == "" || profile.BasePath == "/v1" {
		return baseURL
	}

	parsed, err := url.Parse(baseURL)
	if err != nil {
		return baseURL
	}
	if strings.TrimSpace(parsed.Scheme) == "" || strings.TrimSpace(parsed.Host) == "" {
		return baseURL
	}

	path := strings.TrimSpace(parsed.Path)
	if path != "" && path != "/" && path != "/v1" {
		return strings.TrimRight(parsed.String(), "/")
	}

	parsed.Path = profile.BasePath
	return strings.TrimRight(parsed.String(), "/")
}
