package aiproxycatalog

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadCatalogValidatesRequiredRegionsAndDefaults(t *testing.T) {
	t.Parallel()

	path := writeCatalog(t, `
version: 1
regions:
  us:
    baseURL: https://aiproxy.usw-1.sealos.io/v1
    defaultModel: claude-sonnet-4.6
    models:
      - id: claude-sonnet-4.6
        label: Claude Sonnet 4.6
        providerId: aiproxy
        providerName: AI Proxy
        modelType: anthropic
        requestFormat: anthropic-messages
  cn:
    baseURL: https://aiproxy.hzh.sealos.run/v1
    defaultModel: glm-4.6
    models:
      - id: glm-4.6
        label: GLM-4.6
        providerId: aiproxy
        providerName: AI Proxy
        modelType: openai-chat-compatible
        requestFormat: openai-chat-completions
`)

	catalog, err := LoadCatalog(path)
	if err != nil {
		t.Fatalf("LoadCatalog() error = %v", err)
	}
	if catalog.Regions["us"].DefaultModel != "claude-sonnet-4.6" {
		t.Fatalf("us defaultModel = %q, want claude-sonnet-4.6", catalog.Regions["us"].DefaultModel)
	}
}

func TestRuntimeImagePackagesDefaultCatalog(t *testing.T) {
	t.Parallel()

	raw, err := os.ReadFile("../../../Dockerfile")
	if err != nil {
		t.Fatalf("ReadFile(Dockerfile) error = %v", err)
	}
	dockerfile := string(raw)

	required := []string{
		"ENV AIPROXY_MODEL_CATALOG_PATH=/app/config/aiproxy-models.yaml",
		"COPY config/ /app/config/",
	}
	for _, line := range required {
		if !strings.Contains(dockerfile, line) {
			t.Fatalf("Dockerfile must include %q so the runtime image can load the AIProxy model catalog", line)
		}
	}
}

func TestLoadCatalogRejectsMissingCNRegion(t *testing.T) {
	t.Parallel()

	path := writeCatalog(t, `
version: 1
regions:
  us:
    baseURL: https://aiproxy.usw-1.sealos.io/v1
    models:
      - id: gpt-5.4
        label: GPT-5.4
        providerId: aiproxy
        providerName: AI Proxy
        modelType: openai-responses
        requestFormat: openai-responses
`)

	_, err := LoadCatalog(path)
	if err == nil || !strings.Contains(err.Error(), "regions.cn is required") {
		t.Fatalf("LoadCatalog() error = %v, want missing cn region", err)
	}
}

func TestLoadCatalogRejectsInvalidModelFields(t *testing.T) {
	t.Parallel()

	path := writeCatalog(t, `
version: 1
regions:
  us:
    baseURL: https://aiproxy.usw-1.sealos.io/v1
    defaultModel: missing
    models:
      - id: gpt-5.4
        label: GPT-5.4
        providerId: aiproxy
        providerName: AI Proxy
        modelType: unknown-provider
        requestFormat: openai-responses
  cn:
    baseURL: https://aiproxy.hzh.sealos.run/v1
    models:
      - id: glm-4.6
        label: GLM-4.6
        providerId: aiproxy
        providerName: AI Proxy
        modelType: openai-chat-compatible
        requestFormat: openai-chat-completions
`)

	_, err := LoadCatalog(path)
	if err == nil || !strings.Contains(err.Error(), "modelType") {
		t.Fatalf("LoadCatalog() error = %v, want modelType validation", err)
	}
}

func TestValidateRejectsDefaultOutsideModels(t *testing.T) {
	t.Parallel()

	catalog := validCatalog()
	catalog.Regions["us"] = Region{
		BaseURL:      "https://aiproxy.usw-1.sealos.io/v1",
		DefaultModel: "missing",
		Models: []Model{{
			ID:            "gpt-5.4",
			Label:         "GPT-5.4",
			ProviderID:    "aiproxy",
			ProviderName:  "AI Proxy",
			ModelType:     "openai-responses",
			RequestFormat: "openai-responses",
		}},
	}

	err := Validate(catalog)
	if err == nil || !strings.Contains(err.Error(), "defaultModel") {
		t.Fatalf("Validate() error = %v, want defaultModel validation", err)
	}
}

func TestValidateRejectsUnsupportedRequestFormat(t *testing.T) {
	t.Parallel()

	catalog := validCatalog()
	model := catalog.Regions["cn"].Models[0]
	model.RequestFormat = "chat"
	catalog.Regions["cn"] = Region{
		BaseURL: "https://aiproxy.hzh.sealos.run/v1",
		Models:  []Model{model},
	}

	err := Validate(catalog)
	if err == nil || !strings.Contains(err.Error(), "requestFormat") {
		t.Fatalf("Validate() error = %v, want requestFormat validation", err)
	}
}

func TestValidateRejectsDuplicateModelIDs(t *testing.T) {
	t.Parallel()

	catalog := validCatalog()
	entry := catalog.Regions["cn"]
	entry.Models = append(entry.Models, entry.Models[0])
	catalog.Regions["cn"] = entry

	err := Validate(catalog)
	if err == nil || !strings.Contains(err.Error(), "duplicate") {
		t.Fatalf("Validate() error = %v, want duplicate validation", err)
	}
}

func validCatalog() Catalog {
	return Catalog{
		Version: 1,
		Regions: map[string]Region{
			"us": {
				BaseURL: "https://aiproxy.usw-1.sealos.io/v1",
				Models: []Model{{
					ID:            "gpt-5.4",
					Label:         "GPT-5.4",
					ProviderID:    "aiproxy",
					ProviderName:  "AI Proxy",
					ModelType:     "openai-responses",
					RequestFormat: "openai-responses",
				}},
			},
			"cn": {
				BaseURL: "https://aiproxy.hzh.sealos.run/v1",
				Models: []Model{{
					ID:            "glm-4.6",
					Label:         "GLM-4.6",
					ProviderID:    "aiproxy",
					ProviderName:  "AI Proxy",
					ModelType:     "openai-chat-compatible",
					RequestFormat: "openai-chat-completions",
				}},
			},
		},
	}
}

func writeCatalog(t *testing.T, raw string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "catalog.yaml")
	if err := os.WriteFile(path, []byte(strings.TrimSpace(raw)+"\n"), 0o600); err != nil {
		t.Fatalf("write catalog: %v", err)
	}
	return path
}
