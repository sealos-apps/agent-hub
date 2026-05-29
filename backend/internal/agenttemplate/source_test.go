package agenttemplate

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestGitHubSourceListsTemplatesFromArchive(t *testing.T) {
	t.Parallel()

	server := newTemplateArchiveServer(t)
	defer server.Close()

	source := Source{
		GitHubURL:    server.URL + "/archive.tar.gz",
		CacheDir:     t.TempDir(),
		ForceRefresh: true,
	}

	definitions, err := ListFromSource(source)
	if err != nil {
		t.Fatalf("ListFromSource() error = %v", err)
	}
	if len(definitions) != 2 {
		t.Fatalf("ListFromSource() len = %d, want 2", len(definitions))
	}
	if definitions[0].ID != "hermes-agent" || definitions[1].ID != "openclaw" {
		t.Fatalf("ListFromSource() ids = %q, %q; want hermes-agent, openclaw", definitions[0].ID, definitions[1].ID)
	}
}

func TestGitHubSourceListsSingleTemplateArchive(t *testing.T) {
	t.Parallel()

	server := newSingleTemplateArchiveServer(t)
	defer server.Close()

	source := Source{
		GitHubURL:    server.URL + "/archive.tar.gz",
		CacheDir:     t.TempDir(),
		ForceRefresh: true,
	}

	definitions, err := ListFromSource(source)
	if err != nil {
		t.Fatalf("ListFromSource() error = %v", err)
	}
	if len(definitions) != 1 || definitions[0].ID != "hermes-agent" {
		t.Fatalf("ListFromSource() = %#v, want only hermes-agent", definitions)
	}
}

func TestGitHubSourceResolvesSingleTemplateArchive(t *testing.T) {
	t.Parallel()

	server := newSingleTemplateArchiveServer(t)
	defer server.Close()

	source := Source{
		GitHubURL:    server.URL + "/archive.tar.gz",
		CacheDir:     t.TempDir(),
		ForceRefresh: true,
	}

	definition, err := ResolveFromSource("hermes-agent", source)
	if err != nil {
		t.Fatalf("ResolveFromSource() error = %v", err)
	}
	if definition.ID != "hermes-agent" {
		t.Fatalf("ResolveFromSource() ID = %q, want hermes-agent", definition.ID)
	}
}

func TestGitHubSourceResolvesModelIntegration(t *testing.T) {
	t.Parallel()

	server := newSingleTemplateArchiveServer(t)
	defer server.Close()

	source := Source{
		GitHubURL:    server.URL + "/archive.tar.gz",
		CacheDir:     t.TempDir(),
		ForceRefresh: true,
	}

	definition, err := ResolveFromSource("hermes-agent", source)
	if err != nil {
		t.Fatalf("ResolveFromSource() error = %v", err)
	}
	if definition.ModelIntegration.Type != "ai-agent-switch" {
		t.Fatalf("ModelIntegration.Type = %q, want ai-agent-switch", definition.ModelIntegration.Type)
	}
	if definition.ModelIntegration.Client != "hermes-agent" {
		t.Fatalf("ModelIntegration.Client = %q, want hermes-agent", definition.ModelIntegration.Client)
	}
	if definition.ModelIntegration.Provider.ID != "aiproxy" {
		t.Fatalf("ModelIntegration.Provider.ID = %q, want aiproxy", definition.ModelIntegration.Provider.ID)
	}
	if definition.ModelIntegration.Provider.Name["zh"] != "AI Proxy" {
		t.Fatalf("ModelIntegration.Provider.Name[zh] = %q, want AI Proxy", definition.ModelIntegration.Provider.Name["zh"])
	}
	if definition.ModelIntegration.Provider.BaseURL.Source != "system.aiProxyModelBaseURL" {
		t.Fatalf("ModelIntegration.Provider.BaseURL.Source = %q, want system.aiProxyModelBaseURL", definition.ModelIntegration.Provider.BaseURL.Source)
	}
	if definition.ModelIntegration.Provider.APIKeyEnv != "ANTHROPIC_API_KEY" {
		t.Fatalf("ModelIntegration.Provider.APIKeyEnv = %q, want ANTHROPIC_API_KEY", definition.ModelIntegration.Provider.APIKeyEnv)
	}
	if len(definition.ModelIntegration.Slots) != 1 {
		t.Fatalf("slots len = %d, want 1", len(definition.ModelIntegration.Slots))
	}
	slot := definition.ModelIntegration.Slots[0]
	if slot.Key != "main" {
		t.Fatalf("slot.Key = %q, want main", slot.Key)
	}
	if slot.Label["en"] != "Primary model" {
		t.Fatalf("slot.Label[en] = %q, want Primary model", slot.Label["en"])
	}
	if !slot.Required {
		t.Fatal("slot.Required = false, want true")
	}
	if !slot.Mutable {
		t.Fatal("slot.Mutable = false, want true")
	}
	if slot.DefaultModels["cn"] != "glm-4.6" {
		t.Fatalf("slot.DefaultModels[cn] = %q, want glm-4.6", slot.DefaultModels["cn"])
	}
	if len(slot.ModelTypes) != 2 || slot.ModelTypes[0] != "text" || slot.ModelTypes[1] != "multimodal" {
		t.Fatalf("slot.ModelTypes = %#v, want text and multimodal", slot.ModelTypes)
	}
}

func TestParseDefinitionRejectsEmptyModelIntegrationSlotModelTypes(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile(filepath.Join(testTemplateBaseDir(t), "hermes-agent", "template.yaml"))
	if err != nil {
		t.Fatalf("read template fixture: %v", err)
	}
	invalid := strings.Replace(string(raw), "      modelTypes:\n        - text\n        - multimodal\n", "      modelTypes: []\n", 1)

	_, err = parseDefinition([]byte(invalid), t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "modelIntegration.slots.main.modelTypes is required") {
		t.Fatalf("parseDefinition() error = %v, want modelTypes required", err)
	}
}

func TestParseDefinitionRejectsUnsupportedModelIntegrationBaseURLSource(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile(filepath.Join(testTemplateBaseDir(t), "hermes-agent", "template.yaml"))
	if err != nil {
		t.Fatalf("read template fixture: %v", err)
	}
	invalid := strings.Replace(string(raw), "      source: system.aiProxyModelBaseURL\n", "      source: unsupported.source\n", 1)

	_, err = parseDefinition([]byte(invalid), t.TempDir())
	if err == nil || !strings.Contains(err.Error(), `modelIntegration.provider.baseURL.source "unsupported.source" is not supported`) {
		t.Fatalf("parseDefinition() error = %v, want unsupported baseURL source", err)
	}
}

func TestParseDefinitionRejectsModelIntegrationSlotKeyWhitespace(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile(filepath.Join(testTemplateBaseDir(t), "hermes-agent", "template.yaml"))
	if err != nil {
		t.Fatalf("read template fixture: %v", err)
	}
	invalid := strings.Replace(string(raw), "    - key: main\n", "    - key: \" main \"\n", 1)

	_, err = parseDefinition([]byte(invalid), t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "modelIntegration.slots.main.key must not include leading or trailing whitespace") {
		t.Fatalf("parseDefinition() error = %v, want slot key whitespace error", err)
	}
}

func TestParseDefinitionRejectsMissingRequiredMainModelIntegrationSlot(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile(filepath.Join(testTemplateBaseDir(t), "hermes-agent", "template.yaml"))
	if err != nil {
		t.Fatalf("read template fixture: %v", err)
	}
	invalid := strings.Replace(string(raw), "    - key: main\n", "    - key: secondary\n", 1)

	_, err = parseDefinition([]byte(invalid), t.TempDir())
	if err == nil || !strings.Contains(err.Error(), "modelIntegration.slots.main is required") {
		t.Fatalf("parseDefinition() error = %v, want required main slot error", err)
	}
}

func TestGitHubSourceRejectsMismatchedSingleTemplateArchive(t *testing.T) {
	t.Parallel()

	server := newSingleTemplateArchiveServer(t)
	defer server.Close()

	source := Source{
		GitHubURL:    server.URL + "/archive.tar.gz",
		CacheDir:     t.TempDir(),
		ForceRefresh: true,
	}

	_, err := ResolveFromSource("openclaw", source)
	if err == nil || !strings.Contains(err.Error(), `template "openclaw" not found`) {
		t.Fatalf("ResolveFromSource() error = %v, want template not found", err)
	}
}

func TestParseGitHubTemplateURLSupportsTreePath(t *testing.T) {
	t.Parallel()

	repo, err := parseGitHubTemplateURL("https://github.com/example/templates/tree/main/template")
	if err != nil {
		t.Fatalf("parseGitHubTemplateURL() error = %v", err)
	}
	if repo.Owner != "example" || repo.Repo != "templates" || repo.Ref != "main" || repo.Path != "template" {
		t.Fatalf("parseGitHubTemplateURL() = %#v, want owner/repo/main/template", repo)
	}
}

func TestGitHubSourceListsTemplatesFromAgentsDirectory(t *testing.T) {
	t.Parallel()

	server := newTemplateArchiveServerAtPath(t, "agents")
	defer server.Close()

	source := Source{
		GitHubURL:    server.URL + "/archive.tar.gz",
		CacheDir:     t.TempDir(),
		ForceRefresh: true,
	}

	definitions, err := ListFromSource(source)
	if err != nil {
		t.Fatalf("ListFromSource() error = %v", err)
	}
	if len(definitions) != 2 {
		t.Fatalf("ListFromSource() len = %d, want 2", len(definitions))
	}
	if definitions[0].ID != "hermes-agent" || definitions[1].ID != "openclaw" {
		t.Fatalf("ListFromSource() ids = %q, %q; want hermes-agent, openclaw", definitions[0].ID, definitions[1].ID)
	}
}

func TestGitHubSourceResolvesTemplateFromAgentsDirectory(t *testing.T) {
	t.Parallel()

	server := newTemplateArchiveServerAtPath(t, "agents")
	defer server.Close()

	source := Source{
		GitHubURL:    server.URL + "/archive.tar.gz",
		CacheDir:     t.TempDir(),
		ForceRefresh: true,
	}

	definition, err := ResolveFromSource("hermes-agent", source)
	if err != nil {
		t.Fatalf("ResolveFromSource() error = %v", err)
	}
	if definition.ID != "hermes-agent" {
		t.Fatalf("ResolveFromSource() ID = %q, want hermes-agent", definition.ID)
	}
}

func TestGitHubSourceRefreshesExpiredCache(t *testing.T) {
	t.Parallel()

	var requestCount int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(makeArchive(t, testTemplateBaseDir(t), filepath.Base(testTemplateBaseDir(t))))
	}))
	defer server.Close()

	source := Source{
		GitHubURL: server.URL + "/archive.tar.gz",
		CacheDir:  t.TempDir(),
	}

	if _, err := ListFromSource(source); err != nil {
		t.Fatalf("ListFromSource() first error = %v", err)
	}
	if requestCount != 1 {
		t.Fatalf("requestCount after first load = %d, want 1", requestCount)
	}
	if _, err := ListFromSource(source); err != nil {
		t.Fatalf("ListFromSource() cached error = %v", err)
	}
	if requestCount != 1 {
		t.Fatalf("requestCount after cached load = %d, want 1", requestCount)
	}

	readyPath := filepath.Join(source.cacheDir(), source.cacheKey(), ".ready")
	expired := time.Now().Add(-(source.cacheTTL() + time.Minute))
	if err := os.Chtimes(readyPath, expired, expired); err != nil {
		t.Fatalf("expire ready marker: %v", err)
	}
	if _, err := ListFromSource(source); err != nil {
		t.Fatalf("ListFromSource() refresh error = %v", err)
	}
	if requestCount != 2 {
		t.Fatalf("requestCount after expired load = %d, want 2", requestCount)
	}
}

func newTemplateArchiveServer(t *testing.T) *httptest.Server {
	t.Helper()
	templateDir := testTemplateBaseDir(t)
	archive := makeArchive(t, templateDir, filepath.Base(templateDir))
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("User-Agent"); !strings.Contains(got, "agent-hub-template-loader") {
			t.Fatalf("User-Agent = %q, want agent-hub-template-loader", got)
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(archive)
	}))
}

func newTemplateArchiveServerAtPath(t *testing.T, archivePath string) *httptest.Server {
	t.Helper()
	templateDir := testTemplateBaseDir(t)
	archive := makeArchive(t, templateDir, archivePath)
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(archive)
	}))
}

func newSingleTemplateArchiveServer(t *testing.T) *httptest.Server {
	t.Helper()
	templateDir := filepath.Join(testTemplateBaseDir(t), "hermes-agent")
	archive := makeArchive(t, templateDir, filepath.Base(templateDir))
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(archive)
	}))
}

func testTemplateBaseDir(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller unavailable")
	}
	return filepath.Join(filepath.Dir(file), "testdata", "template")
}

func makeArchive(t *testing.T, rootDir, archiveRoot string) []byte {
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
