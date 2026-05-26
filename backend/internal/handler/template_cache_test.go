package handler

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"testing"
	"time"

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
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case requested <- struct{}{}:
		default:
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(templateCacheTestArchive(t))
	}))
	defer server.Close()

	cacheDir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	StartAgentTemplateCacheRefresh(ctx, config.Config{
		AgentTemplateGitHubURL: server.URL + "/archive.tar.gz",
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

func templateCacheTestArchive(t *testing.T) []byte {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller unavailable")
	}
	rootDir := filepath.Clean(filepath.Join(filepath.Dir(file), "..", "agenttemplate", "testdata", "template"))
	return makeTemplateCacheArchive(t, rootDir, filepath.Base(rootDir))
}

func makeTemplateCacheArchive(t *testing.T, rootDir, archiveRoot string) []byte {
	t.Helper()

	var buffer bytes.Buffer
	gzipWriter := gzip.NewWriter(&buffer)
	tarWriter := tar.NewWriter(gzipWriter)
	archivePrefix := "repo-" + archiveRoot + "-" + fmt.Sprint(time.Now().UnixNano())

	err := filepath.WalkDir(rootDir, func(filePath string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}

		relative, err := filepath.Rel(rootDir, filePath)
		if err != nil {
			return err
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}

		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = path.Join(archivePrefix, archiveRoot, filepath.ToSlash(relative))

		if err := tarWriter.WriteHeader(header); err != nil {
			return err
		}
		raw, err := os.ReadFile(filePath)
		if err != nil {
			return err
		}
		_, err = tarWriter.Write(raw)
		return err
	})
	if err != nil {
		t.Fatalf("make archive: %v", err)
	}

	if err := tarWriter.Close(); err != nil {
		t.Fatalf("close tar writer: %v", err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatalf("close gzip writer: %v", err)
	}
	return buffer.Bytes()
}
