package handler

import (
	"context"
	"fmt"

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
	profile, err := resolveAIProxyHermesProvider(requestedProvider)
	if err != nil {
		return resolvedModelAccess{}, err
	}
	modelBaseURL := resolveAIProxyProviderBaseURL(firstNonEmpty(explicitBaseURL, cfg.AIProxyModelBaseURL), factory.ClusterServer(), profile.Provider)

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
		Provider:  profile.Provider,
		BaseURL:   modelBaseURL,
		APIKey:    token.Key,
		TokenName: tokenName,
	}, nil
}
