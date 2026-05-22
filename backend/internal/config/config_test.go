package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadPrefersRegionEnv(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("REGION", "cn")

	cfg := Load()
	if cfg.Region != "cn" {
		t.Fatalf("Load().Region = %q, want cn", cfg.Region)
	}
}

func TestLoadInvalidRegionReturnsEmpty(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("REGION", "hzh")

	cfg := Load()
	if cfg.Region != "" {
		t.Fatalf("Load().Region = %q, want empty region for invalid REGION", cfg.Region)
	}
}

func TestLoadRejectsClusterAliasRegion(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("REGION", "usw-1")

	cfg := Load()
	if cfg.Region != "" {
		t.Fatalf("Load().Region = %q, want empty region for cluster alias REGION", cfg.Region)
	}
}

func TestLoadMissingRegionReturnsEmpty(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("REGION", "")

	cfg := Load()
	if cfg.Region != "" {
		t.Fatalf("Load().Region = %q, want empty region when REGION is missing", cfg.Region)
	}
}

func TestLoadReadsRegionFromDotEnvInCurrentDir(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "1")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("REGION", "")

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}

	tempDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(tempDir, ".env"), []byte("REGION=us\nPORT=9777\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(.env) error = %v", err)
	}
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("Chdir(tempDir) error = %v", err)
	}
	defer func() {
		_ = os.Chdir(cwd)
	}()

	cfg := Load()
	if cfg.Region != "us" {
		t.Fatalf("Load().Region = %q, want us from .env", cfg.Region)
	}
	if cfg.Port != "9777" {
		t.Fatalf("Load().Port = %q, want 9777 from .env", cfg.Port)
	}
}

func TestLoadPrefersProcessEnvOverDotEnv(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "1")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("REGION", "cn")

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}

	tempDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(tempDir, ".env"), []byte("REGION=us\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(.env) error = %v", err)
	}
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("Chdir(tempDir) error = %v", err)
	}
	defer func() {
		_ = os.Chdir(cwd)
	}()

	cfg := Load()
	if cfg.Region != "cn" {
		t.Fatalf("Load().Region = %q, want cn from process env", cfg.Region)
	}
}

func TestLoadNormalizesUSW1AIProxyManagerBaseURLToSealosIO(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("AIPROXY_MANAGER_BASE_URL", "https://aiproxy-web.usw-1.sealos.app")
	t.Setenv("AIPROXY_BASE_URL", "")

	cfg := Load()
	if cfg.AIProxyBaseURL != "https://aiproxy-web.usw-1.sealos.io" {
		t.Fatalf("Load().AIProxyBaseURL = %q, want https://aiproxy-web.usw-1.sealos.io", cfg.AIProxyBaseURL)
	}
}

func TestLoadNormalizesLegacyAIProxyBaseURLToSealosIO(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("AIPROXY_MANAGER_BASE_URL", "")
	t.Setenv("AIPROXY_BASE_URL", "https://aiproxy-web.usw-1.sealos.app")

	cfg := Load()
	if cfg.AIProxyBaseURL != "https://aiproxy-web.usw-1.sealos.io" {
		t.Fatalf("Load().AIProxyBaseURL = %q, want https://aiproxy-web.usw-1.sealos.io", cfg.AIProxyBaseURL)
	}
}

func TestLoadParsesK8sProxyAllowedHostsFromEnv(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("K8S_PROXY_ALLOWED_HOSTS", ".sealos.io, usw-1.sealos.run,")

	cfg := Load()
	if len(cfg.K8sProxyAllowHosts) != 2 {
		t.Fatalf("Load().K8sProxyAllowHosts len = %d, want 2", len(cfg.K8sProxyAllowHosts))
	}
	if cfg.K8sProxyAllowHosts[0] != ".sealos.io" {
		t.Fatalf("Load().K8sProxyAllowHosts[0] = %q, want .sealos.io", cfg.K8sProxyAllowHosts[0])
	}
	if cfg.K8sProxyAllowHosts[1] != "usw-1.sealos.run" {
		t.Fatalf("Load().K8sProxyAllowHosts[1] = %q, want usw-1.sealos.run", cfg.K8sProxyAllowHosts[1])
	}
}

func TestLoadReadsTemplateAndFrontendSourceConfig(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("AGENT_TEMPLATE_GITHUB_URL", "https://github.com/example/agent-templates/tree/main/template")
	t.Setenv("AGENT_TEMPLATE_GITHUB_TOKEN", "secret-token")
	t.Setenv("AGENT_TEMPLATE_CACHE_DIR", "/tmp/agenthub-templates")
	t.Setenv("FRONTEND_DIST_DIR", "/app/frontend/dist")
	t.Setenv("WEB_DIST_DIR", "/app/web/dist")

	cfg := Load()
	if cfg.AgentTemplateGitHubURL != "https://github.com/example/agent-templates/tree/main/template" {
		t.Fatalf("Load().AgentTemplateGitHubURL = %q, want configured github url", cfg.AgentTemplateGitHubURL)
	}
	if cfg.AgentTemplateGitHubToken != "secret-token" {
		t.Fatalf("Load().AgentTemplateGitHubToken = %q, want configured token", cfg.AgentTemplateGitHubToken)
	}
	if cfg.AgentTemplateCacheDir != "/tmp/agenthub-templates" {
		t.Fatalf("Load().AgentTemplateCacheDir = %q, want configured cache dir", cfg.AgentTemplateCacheDir)
	}
	if cfg.FrontendDistDir != "/app/frontend/dist" {
		t.Fatalf("Load().FrontendDistDir = %q, want FRONTEND_DIST_DIR", cfg.FrontendDistDir)
	}
}

func TestLoadDefaultsTemplateGitHubURLWhenUnset(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")

	cfg := Load()
	if cfg.AgentTemplateGitHubURL != DefaultAgentTemplateGitHubURL {
		t.Fatalf("Load().AgentTemplateGitHubURL = %q, want default template github url", cfg.AgentTemplateGitHubURL)
	}
}

func TestLoadAllowsExplicitEmptyTemplateGitHubURL(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("AGENT_TEMPLATE_GITHUB_URL", "")

	cfg := Load()
	if cfg.AgentTemplateGitHubURL != "" {
		t.Fatalf("Load().AgentTemplateGitHubURL = %q, want explicit empty value", cfg.AgentTemplateGitHubURL)
	}
}

func TestLoadFallsBackToLegacyWebDistDir(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("FRONTEND_DIST_DIR", "")
	t.Setenv("WEB_DIST_DIR", "/legacy/web/dist")

	cfg := Load()
	if cfg.FrontendDistDir != "/legacy/web/dist" {
		t.Fatalf("Load().FrontendDistDir = %q, want legacy WEB_DIST_DIR", cfg.FrontendDistDir)
	}
}

func TestLoadDoesNotReadDotEnvInProductionByDefault(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "production")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("REGION", "")

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}

	tempDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(tempDir, ".env"), []byte("REGION=us\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(.env) error = %v", err)
	}
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("Chdir(tempDir) error = %v", err)
	}
	defer func() {
		_ = os.Chdir(cwd)
	}()

	cfg := Load()
	if cfg.Region != "" {
		t.Fatalf("Load().Region = %q, want empty region in production when LOAD_DOTENV is not enabled", cfg.Region)
	}
}

func TestLoadReadsDotEnvByDefaultInDevelopment(t *testing.T) {
	t.Setenv("LOAD_DOTENV", "")
	t.Setenv("GO_ENV", "")
	t.Setenv("APP_ENV", "")
	t.Setenv("GIN_MODE", "")
	t.Setenv("KUBERNETES_SERVICE_HOST", "")
	t.Setenv("REGION", "")

	cwd, err := os.Getwd()
	if err != nil {
		t.Fatalf("Getwd() error = %v", err)
	}

	tempDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(tempDir, ".env"), []byte("REGION=us\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(.env) error = %v", err)
	}
	if err := os.Chdir(tempDir); err != nil {
		t.Fatalf("Chdir(tempDir) error = %v", err)
	}
	defer func() {
		_ = os.Chdir(cwd)
	}()

	cfg := Load()
	if cfg.Region != "us" {
		t.Fatalf("Load().Region = %q, want us in development default", cfg.Region)
	}
}
