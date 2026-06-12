package handler

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
)

func TestStartAgentTemplateCacheRefreshSkipsWithoutGitHubURL(t *testing.T) {
	cacheDir := t.TempDir()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	StartAgentTemplateCacheRefresh(ctx, config.Config{AgentTemplateCacheDir: cacheDir})

	if entries, err := os.ReadDir(cacheDir); err != nil {
		t.Fatalf("ReadDir() error = %v", err)
	} else if len(entries) != 0 {
		t.Fatalf("cache dir entries = %d, want 0", len(entries))
	}
}

func TestStartAgentTemplateCacheRefreshDownloadsImmediately(t *testing.T) {
	requested := make(chan struct{}, 1)
	originalList := listAgentTemplatesFromSource
	t.Cleanup(func() {
		listAgentTemplatesFromSource = originalList
	})
	listAgentTemplatesFromSource = func(source agenttemplate.Source) ([]agenttemplate.Definition, error) {
		select {
		case requested <- struct{}{}:
		default:
		}
		readyDir := filepath.Join(source.CacheDir, "test-cache")
		if err := os.MkdirAll(readyDir, 0o755); err != nil {
			return nil, err
		}
		if err := os.WriteFile(filepath.Join(readyDir, ".ready"), []byte("ready\n"), 0o644); err != nil {
			return nil, err
		}
		return []agenttemplate.Definition{}, nil
	}

	cacheDir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	StartAgentTemplateCacheRefresh(ctx, config.Config{
		AgentTemplateGitHubURL: "https://github.com/sealos-apps/Agent-Hub-Template",
		AgentTemplateCacheDir:  cacheDir,
	})

	select {
	case <-requested:
	case <-time.After(time.Second):
		cancel()
		t.Fatal("template cache refresh did not request archive")
	}

	if !waitForTemplateCacheReady(cacheDir, time.Second) {
		cancel()
		t.Fatal("template cache ready marker was not written")
	}
	cancel()
}

func templateCacheReady(cacheDir string) bool {
	entries, err := os.ReadDir(cacheDir)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.IsDir() {
			if _, err := os.Stat(filepath.Join(cacheDir, entry.Name(), ".ready")); err == nil {
				return true
			}
		}
	}
	return false
}

func waitForTemplateCacheReady(cacheDir string, timeout time.Duration) bool {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if templateCacheReady(cacheDir) {
			return true
		}
		time.Sleep(10 * time.Millisecond)
	}
	return templateCacheReady(cacheDir)
}
