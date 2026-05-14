package aiproxycatalog

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"sigs.k8s.io/yaml"
)

const DefaultCatalogRelPath = "config/aiproxy-models.yaml"

var supportedModelTypes = map[string]struct{}{
	"openai-responses":       {},
	"openai-chat-compatible": {},
	"openai":                 {},
	"anthropic":              {},
	"gemini":                 {},
	"openai-compatible":      {},
	"openrouter":             {},
	"dashscope":              {},
	"deepseek":               {},
	"moonshot":               {},
	"siliconflow":            {},
	"ollama":                 {},
	"lmstudio":               {},
	"custom":                 {},
}

var supportedRequestFormats = map[string]struct{}{
	"openai-responses":        {},
	"openai-chat-completions": {},
	"anthropic-messages":      {},
	"gemini-native":           {},
}

type Catalog struct {
	Version int               `yaml:"version" json:"version"`
	Regions map[string]Region `yaml:"regions" json:"regions"`
}

type Region struct {
	BaseURL      string  `yaml:"baseURL" json:"baseURL"`
	DefaultModel string  `yaml:"defaultModel,omitempty" json:"defaultModel,omitempty"`
	Models       []Model `yaml:"models" json:"models"`
}

type Model struct {
	ID            string `yaml:"id" json:"id"`
	Label         string `yaml:"label" json:"label"`
	ProviderID    string `yaml:"providerId" json:"providerId"`
	ProviderName  string `yaml:"providerName" json:"providerName"`
	ModelType     string `yaml:"modelType" json:"modelType"`
	RequestFormat string `yaml:"requestFormat" json:"requestFormat"`
}

func LoadCatalog(path string) (Catalog, error) {
	catalogPath := strings.TrimSpace(path)
	if catalogPath == "" {
		resolved, err := ResolveDefaultCatalogPath()
		if err != nil {
			return Catalog{}, err
		}
		catalogPath = resolved
	}

	raw, err := os.ReadFile(catalogPath)
	if err != nil {
		return Catalog{}, fmt.Errorf("read aiproxy model catalog: %w", err)
	}

	var catalog Catalog
	if err := yaml.Unmarshal(raw, &catalog); err != nil {
		return Catalog{}, fmt.Errorf("parse aiproxy model catalog: %w", err)
	}
	if err := Validate(catalog); err != nil {
		return Catalog{}, err
	}
	return catalog, nil
}

func ResolveDefaultCatalogPath() (string, error) {
	candidates := []string{}
	if cwd, err := os.Getwd(); err == nil {
		for _, relative := range []string{
			DefaultCatalogRelPath,
			filepath.Join("..", DefaultCatalogRelPath),
			filepath.Join("..", "..", DefaultCatalogRelPath),
			filepath.Join("..", "..", "..", DefaultCatalogRelPath),
			filepath.Join("..", "..", "..", "..", DefaultCatalogRelPath),
		} {
			candidates = append(candidates, filepath.Join(cwd, relative))
		}
	}
	if _, file, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(file), "..", "..", "..", DefaultCatalogRelPath))
	}

	seen := map[string]struct{}{}
	attempted := []string{}
	for _, candidate := range candidates {
		cleaned := filepath.Clean(candidate)
		if _, ok := seen[cleaned]; ok {
			continue
		}
		seen[cleaned] = struct{}{}
		attempted = append(attempted, cleaned)
		info, err := os.Stat(cleaned)
		if err == nil && !info.IsDir() {
			return cleaned, nil
		}
	}

	sort.Strings(attempted)
	return "", fmt.Errorf("default aiproxy model catalog not found under %s", strings.Join(attempted, ", "))
}

func Validate(catalog Catalog) error {
	if catalog.Version != 1 {
		return fmt.Errorf("aiproxy model catalog version must be 1")
	}
	if catalog.Regions == nil {
		return fmt.Errorf("aiproxy model catalog regions is required")
	}
	for _, region := range []string{"us", "cn"} {
		entry, ok := catalog.Regions[region]
		if !ok {
			return fmt.Errorf("aiproxy model catalog regions.%s is required", region)
		}
		if err := validateRegion(region, entry); err != nil {
			return err
		}
	}
	return nil
}

func validateRegion(region string, entry Region) error {
	if strings.TrimSpace(entry.BaseURL) == "" {
		return fmt.Errorf("aiproxy model catalog regions.%s.baseURL is required", region)
	}
	if err := validateURL("regions."+region+".baseURL", entry.BaseURL); err != nil {
		return err
	}
	if len(entry.Models) == 0 {
		return fmt.Errorf("aiproxy model catalog regions.%s.models is required", region)
	}

	modelIDs := map[string]struct{}{}
	for index, model := range entry.Models {
		if err := validateModel(region, index, model); err != nil {
			return err
		}
		id := strings.TrimSpace(model.ID)
		if _, exists := modelIDs[id]; exists {
			return fmt.Errorf("aiproxy model catalog regions.%s.models contains duplicate id %q", region, id)
		}
		modelIDs[id] = struct{}{}
	}

	defaultModel := strings.TrimSpace(entry.DefaultModel)
	if defaultModel != "" {
		if _, ok := modelIDs[defaultModel]; !ok {
			return fmt.Errorf("aiproxy model catalog regions.%s.defaultModel %q is not in models", region, defaultModel)
		}
	}
	return nil
}

func validateModel(region string, index int, model Model) error {
	prefix := fmt.Sprintf("aiproxy model catalog regions.%s.models[%d]", region, index)
	required := map[string]string{
		"id":            model.ID,
		"label":         model.Label,
		"providerId":    model.ProviderID,
		"providerName":  model.ProviderName,
		"modelType":     model.ModelType,
		"requestFormat": model.RequestFormat,
	}
	for field, value := range required {
		if strings.TrimSpace(value) == "" {
			return fmt.Errorf("%s.%s is required", prefix, field)
		}
	}
	if _, ok := supportedModelTypes[strings.TrimSpace(model.ModelType)]; !ok {
		return fmt.Errorf("%s.modelType %q is not supported", prefix, strings.TrimSpace(model.ModelType))
	}
	if _, ok := supportedRequestFormats[strings.TrimSpace(model.RequestFormat)]; !ok {
		return fmt.Errorf("%s.requestFormat %q is not supported", prefix, strings.TrimSpace(model.RequestFormat))
	}
	return nil
}

func validateURL(field string, value string) error {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("aiproxy model catalog %s is invalid", field)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return fmt.Errorf("aiproxy model catalog %s must start with http or https", field)
	}
	return nil
}

func ModelTypeSupported(value string) bool {
	_, ok := supportedModelTypes[strings.TrimSpace(value)]
	return ok
}

func RequestFormatSupported(value string) bool {
	_, ok := supportedRequestFormats[strings.TrimSpace(value)]
	return ok
}
