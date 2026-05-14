package config

import (
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port                    string
	IngressSuffix           string
	SSHDomain               string
	APIServerImage          string
	AgentTemplateDir        string
	WebDistDir              string
	AIProxyBaseURL          string
	AIProxyModelBaseURL     string
	AIProxyModelCatalogPath string
	Region                  string
	K8sProxyAllowHosts      []string
	WSAllowedOrigins        string
}

func Load() Config {
	loadDotEnv()

	aiProxyManagerBaseURL := normalizeAIProxyManagerBaseURL(strings.TrimSpace(os.Getenv("AIPROXY_MANAGER_BASE_URL")))
	if aiProxyManagerBaseURL == "" {
		aiProxyManagerBaseURL = normalizeAIProxyManagerBaseURL(strings.TrimSpace(os.Getenv("AIPROXY_BASE_URL")))
	}

	return Config{
		Port:                    getenv("PORT", "8999"),
		IngressSuffix:           getenv("INGRESS_SUFFIX", "agent.usw-1.sealos.app"),
		SSHDomain:               strings.TrimSpace(os.Getenv("SSH_DOMAIN")),
		APIServerImage:          getenv("AGENT_IMAGE", "nousresearch/hermes-agent:latest"),
		AgentTemplateDir:        getenv("AGENT_MANIFEST_TEMPLATE_DIR", ""),
		WebDistDir:              getenv("WEB_DIST_DIR", ""),
		AIProxyBaseURL:          aiProxyManagerBaseURL,
		AIProxyModelBaseURL:     strings.TrimSpace(os.Getenv("AIPROXY_MODEL_BASE_URL")),
		AIProxyModelCatalogPath: strings.TrimSpace(os.Getenv("AIPROXY_MODEL_CATALOG_PATH")),
		Region:                  resolveRegion(),
		K8sProxyAllowHosts:      parseCSV(getenv("K8S_PROXY_ALLOWED_HOSTS", ".sealos.io,.sealos.run")),
		WSAllowedOrigins:        getenv("WS_ALLOWED_ORIGINS", ""),
	}
}

func normalizeAIProxyManagerBaseURL(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return ""
	}
	return strings.Replace(trimmed, ".sealos.app", ".sealos.io", 1)
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func resolveRegion() string {
	return normalizeRegion(strings.TrimSpace(os.Getenv("REGION")))
}

func parseCSV(value string) []string {
	parts := strings.Split(strings.TrimSpace(value), ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.ToLower(strings.TrimSpace(part))
		if trimmed == "" {
			continue
		}
		result = append(result, trimmed)
	}
	return result
}

func normalizeRegion(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "cn":
		return "cn"
	case "us", "usw-1":
		return "us"
	default:
		return ""
	}
}

func loadDotEnv() {
	if !shouldLoadDotEnv(os.Getenv("LOAD_DOTENV")) {
		return
	}

	values, err := godotenv.Read(".env")
	if err != nil {
		return
	}
	for key, value := range values {
		if strings.TrimSpace(key) == "" {
			continue
		}
		if existing, exists := os.LookupEnv(key); exists && strings.TrimSpace(existing) != "" {
			continue
		}
		_ = os.Setenv(strings.TrimSpace(key), value)
	}
}

func shouldLoadDotEnv(flag string) bool {
	switch strings.ToLower(strings.TrimSpace(flag)) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return !isProductionLike()
	}
}

func isProductionLike() bool {
	if strings.TrimSpace(os.Getenv("KUBERNETES_SERVICE_HOST")) != "" {
		return true
	}

	if strings.EqualFold(strings.TrimSpace(os.Getenv("GO_ENV")), "production") {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production") {
		return true
	}
	if strings.EqualFold(strings.TrimSpace(os.Getenv("GIN_MODE")), "release") {
		return true
	}

	return false
}
