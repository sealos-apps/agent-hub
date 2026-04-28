package handler

import (
	"context"
	"net/url"
	"strings"

	"github.com/nightwhite/Agent-Hub/internal/aiproxy"
)

const fallbackAIProxyBaseURL = "https://aiproxy-web.hzh.sealos.run"
const fallbackAIProxyModelBaseURL = "https://aiproxy.hzh.sealos.run/v1"
const agentHubAIProxyTokenDisplayName = "Agent-Hub"

func resolveAIProxyBaseURL(explicitBaseURL, clusterServer string) string {
	if baseURL := strings.TrimSpace(explicitBaseURL); baseURL != "" {
		return baseURL
	}

	if derived := deriveAIProxyBaseURL(clusterServer); derived != "" {
		return derived
	}

	return fallbackAIProxyBaseURL
}

func deriveAIProxyBaseURL(clusterServer string) string {
	return deriveClusterServiceURL(clusterServer, "aiproxy-web")
}

func resolveAIProxyModelBaseURL(explicitBaseURL, clusterServer string) string {
	if baseURL := strings.TrimSpace(explicitBaseURL); baseURL != "" {
		return normalizeAIProxyModelBaseURL(baseURL)
	}

	if derived := deriveAIProxyModelBaseURL(clusterServer); derived != "" {
		return normalizeAIProxyModelBaseURL(derived)
	}

	return normalizeAIProxyModelBaseURL(fallbackAIProxyModelBaseURL)
}

func deriveAIProxyModelBaseURL(clusterServer string) string {
	return normalizeAIProxyModelBaseURL(deriveClusterServiceURL(clusterServer, "aiproxy"))
}

func deriveClusterServiceURL(clusterServer, subdomain string) string {
	parsed, err := url.Parse(strings.TrimSpace(clusterServer))
	if err != nil {
		return ""
	}

	host := strings.TrimSpace(parsed.Hostname())
	if host == "" {
		return ""
	}
	if !strings.Contains(host, "sealos.") {
		return ""
	}

	return "https://" + subdomain + "." + host
}

func normalizeAIProxyModelBaseURL(value string) string {
	baseURL := strings.TrimSpace(value)
	if baseURL == "" {
		return ""
	}

	parsed, err := url.Parse(baseURL)
	if err != nil {
		return baseURL
	}
	if strings.TrimSpace(parsed.Scheme) == "" || strings.TrimSpace(parsed.Host) == "" {
		return baseURL
	}

	path := strings.TrimSpace(parsed.Path)
	switch path {
	case "", "/":
		parsed.Path = "/v1"
	default:
		parsed.Path = strings.TrimRight(path, "/")
	}

	return strings.TrimRight(parsed.String(), "/")
}

func isAIProxyConflictLike(err error) bool {
	apiErr, ok := err.(*aiproxy.APIError)
	if ok && apiErr.Status == 409 {
		return true
	}

	message := strings.ToLower(strings.TrimSpace(err.Error()))
	return strings.Contains(message, "exist") || strings.Contains(message, "duplicate") || strings.Contains(message, "conflict")
}

func defaultAIProxyTokenNames(namespace string) []string {
	values := []string{
		sanitizeAIProxyTokenName(agentHubAIProxyTokenDisplayName),
		sanitizeAIProxyTokenName("agent-hub-" + strings.TrimSpace(namespace)),
		sanitizeAIProxyTokenName("agenthub-" + strings.TrimSpace(namespace)),
	}

	names := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		names = append(names, value)
	}

	return names
}

func preferredAIProxyTokenName(namespace string) string {
	_ = namespace
	names := defaultAIProxyTokenNames(namespace)
	if len(names) == 0 {
		return ""
	}
	return names[0]
}

func ensureAgentHubAIProxyToken(
	ctx context.Context,
	client *aiproxy.Client,
	authorization string,
	namespace string,
	requestedName string,
) (aiproxy.Token, bool, string, error) {
	if customName := sanitizeAIProxyTokenName(requestedName); customName != "" {
		token, existed, err := client.EnsureToken(ctx, authorization, customName)
		return token, existed, customName, err
	}

	candidates := defaultAIProxyTokenNames(namespace)
	for _, name := range candidates {
		token, found, err := client.SearchTokenByName(ctx, authorization, name)
		if err != nil {
			return aiproxy.Token{}, false, name, err
		}
		if found {
			return token, true, name, nil
		}
	}

	preferredName := preferredAIProxyTokenName(namespace)
	token, err := client.CreateToken(ctx, authorization, preferredName)
	if err == nil {
		return token, false, preferredName, nil
	}
	if !isAIProxyConflictLike(err) {
		return aiproxy.Token{}, false, preferredName, err
	}

	token, found, searchErr := client.SearchTokenByName(ctx, authorization, preferredName)
	if searchErr != nil {
		return aiproxy.Token{}, false, preferredName, searchErr
	}
	if found {
		return token, true, preferredName, nil
	}

	return aiproxy.Token{}, false, preferredName, err
}
