package handler

import (
	"context"
	"log"
	"strings"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
)

const templateCacheRefreshInterval = 5 * time.Minute

func StartAgentTemplateCacheRefresh(ctx context.Context, cfg config.Config) {
	source := templateSourceFromConfig(cfg)
	if strings.TrimSpace(source.GitHubURL) == "" {
		return
	}

	go func() {
		refreshAgentTemplateCache(ctx, source)

		ticker := time.NewTicker(templateCacheRefreshInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				refreshAgentTemplateCache(ctx, source)
			}
		}
	}()
}

func refreshAgentTemplateCache(ctx context.Context, source agenttemplate.Source) {
	select {
	case <-ctx.Done():
		return
	default:
	}

	source.ForceRefresh = true
	if _, err := agenttemplate.ListFromSource(source); err != nil {
		log.Printf("agent template cache refresh failed: githubURL=%s cacheDir=%s err=%v", source.GitHubURL, source.CacheDir, err)
		return
	}
	log.Printf("agent template cache refreshed: githubURL=%s cacheDir=%s", source.GitHubURL, source.CacheDir)
}
