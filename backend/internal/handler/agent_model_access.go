package handler

import (
	"context"
	"fmt"
	"strings"

	"github.com/nightwhite/Agent-Hub/internal/aiproxy"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/kube"
)

type resolvedModelAccess struct {
	Provider  string
	BaseURL   string
	APIKey    string
	TokenName string
}

func ensureManagedModelAccess(
	ctx context.Context,
	cfg config.Config,
	factory *kube.Factory,
	authorization string,
	requestedProvider string,
	explicitBaseURL string,
) (resolvedModelAccess, error) {
	managerBaseURL := resolveAIProxyBaseURL(cfg.AIProxyBaseURL, factory.ClusterServer())
	provider := strings.TrimSpace(requestedProvider)
	if provider == "" {
		return resolvedModelAccess{}, fmt.Errorf("model provider is required")
	}
	modelBaseURL := normalizeAIProxyModelBaseURL(firstNonEmpty(explicitBaseURL, cfg.AIProxyModelBaseURL))
	if strings.TrimSpace(modelBaseURL) == "" {
		return resolvedModelAccess{}, fmt.Errorf("model base url is required")
	}

	client, err := aiproxy.NewClient(managerBaseURL, nil)
	if err != nil {
		return resolvedModelAccess{}, fmt.Errorf("invalid aiproxy manager base url: %w", err)
	}

	token, _, tokenName, err := ensureAgentHubAIProxyToken(
		ctx,
		client,
		authorization,
		factory.Namespace(),
		"",
	)
	if err != nil {
		return resolvedModelAccess{}, err
	}

	return resolvedModelAccess{
		Provider:  provider,
		BaseURL:   modelBaseURL,
		APIKey:    token.Key,
		TokenName: tokenName,
	}, nil
}
