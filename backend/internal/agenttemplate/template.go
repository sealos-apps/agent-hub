package agenttemplate

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"

	"sigs.k8s.io/yaml"
)

const templateRootDir = "template"

type Definition struct {
	ID                   string                   `yaml:"id"`
	Name                 string                   `yaml:"name"`
	ShortName            string                   `yaml:"shortName"`
	Description          string                   `yaml:"description"`
	Image                string                   `yaml:"image"`
	Port                 int32                    `yaml:"port"`
	DefaultArgs          []string                 `yaml:"defaultArgs"`
	BackendSupported     bool                     `yaml:"backendSupported"`
	CreateDisabledReason string                   `yaml:"createDisabledReason"`
	WorkingDir           string                   `yaml:"workingDir"`
	ManifestDir          string                   `yaml:"manifestDir"`
	User                 string                   `yaml:"user"`
	Presentation         Presentation             `yaml:"presentation"`
	Workspaces           []WorkspaceDefinition    `yaml:"workspaces"`
	Access               []AccessDefinition       `yaml:"access"`
	Actions              []ActionDefinition       `yaml:"actions"`
	Settings             SettingsSchema           `yaml:"settings"`
	RegionModelPresets   map[string][]ModelPreset `yaml:"regionModelPresets"`
	Bootstrap            ScriptSpec               `yaml:"bootstrap"`
	Healthcheck          ScriptSpec               `yaml:"healthcheck"`
	rootDir              string
}

type ScriptSpec struct {
	Script         string `yaml:"script"`
	Shell          string `yaml:"shell"`
	TimeoutSeconds int    `yaml:"timeoutSeconds"`
}

type Presentation struct {
	LogoKey    string `yaml:"logoKey"`
	BrandColor string `yaml:"brandColor"`
	DocsLabel  string `yaml:"docsLabel"`
}

type WorkspaceDefinition struct {
	Key   string `yaml:"key"`
	Label string `yaml:"label"`
}

type AccessDefinition struct {
	Key      string   `yaml:"key"`
	Label    string   `yaml:"label"`
	Path     string   `yaml:"path"`
	Auth     string   `yaml:"auth"`
	RootPath string   `yaml:"rootPath"`
	Modes    []string `yaml:"modes"`
}

type ActionDefinition struct {
	Key   string `yaml:"key"`
	Label string `yaml:"label"`
}

type SettingsSchema struct {
	Runtime []SettingField `yaml:"runtime"`
	Agent   []SettingField `yaml:"agent"`
}

type SettingField struct {
	Key         string          `yaml:"key"`
	Label       string          `yaml:"label"`
	Type        string          `yaml:"type"`
	Description string          `yaml:"description"`
	Required    bool            `yaml:"required"`
	ReadOnly    bool            `yaml:"readOnly"`
	Binding     SettingBinding  `yaml:"binding"`
	Rebootstrap bool            `yaml:"rebootstrap"`
	Options     []SettingOption `yaml:"options"`
}

type SettingBinding struct {
	Kind string `yaml:"kind"`
	Key  string `yaml:"key"`
	Name string `yaml:"name"`
}

type SettingOption struct {
	Value       string `yaml:"value"`
	Label       string `yaml:"label"`
	Description string `yaml:"description"`
}

type ModelPreset struct {
	Value    string `yaml:"value"`
	Label    string `yaml:"label"`
	Helper   string `yaml:"helper"`
	Provider string `yaml:"provider"`
	APIMode  string `yaml:"apiMode"`
}

func Resolve(templateID, override string) (Definition, error) {
	id := strings.TrimSpace(templateID)
	if id == "" {
		return Definition{}, fmt.Errorf("template id is required")
	}

	rootDir, err := resolveTemplateRootDir(id, override)
	if err != nil {
		return Definition{}, err
	}

	raw, err := os.ReadFile(filepath.Join(rootDir, "template.yaml"))
	if err != nil {
		return Definition{}, fmt.Errorf("read template metadata: %w", err)
	}

	var definition Definition
	if err := yaml.Unmarshal(raw, &definition); err != nil {
		return Definition{}, fmt.Errorf("parse template metadata: %w", err)
	}

	if err := validateDefinition(definition); err != nil {
		return Definition{}, fmt.Errorf("invalid template metadata: %w", err)
	}
	definition.rootDir = rootDir

	return definition, nil
}

func List(override string) ([]Definition, error) {
	baseDir, err := resolveTemplateBaseDir(override)
	if err != nil {
		return nil, err
	}

	entries, err := os.ReadDir(baseDir)
	if err != nil {
		return nil, fmt.Errorf("read template base dir: %w", err)
	}

	definitions := make([]Definition, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		rootDir := filepath.Join(baseDir, entry.Name())
		raw, readErr := os.ReadFile(filepath.Join(rootDir, "template.yaml"))
		if readErr != nil {
			continue
		}

		var definition Definition
		if err := yaml.Unmarshal(raw, &definition); err != nil {
			return nil, fmt.Errorf("parse template metadata %s: %w", entry.Name(), err)
		}
		if err := validateDefinition(definition); err != nil {
			return nil, fmt.Errorf("invalid template metadata %s: %w", entry.Name(), err)
		}
		definition.rootDir = rootDir
		definitions = append(definitions, definition)
	}

	sort.Slice(definitions, func(i, j int) bool {
		return definitions[i].ID < definitions[j].ID
	})
	return definitions, nil
}

func (d Definition) ManifestPath() string {
	return filepath.Join(d.rootDir, d.ManifestDir)
}

func (d Definition) BootstrapScriptPath() string {
	return filepath.Join(d.rootDir, d.Bootstrap.Script)
}

func (d Definition) HealthcheckScriptPath() string {
	return filepath.Join(d.rootDir, d.Healthcheck.Script)
}

func resolveTemplateRootDir(templateID, override string) (string, error) {
	candidates := []string{}

	if trimmed := strings.TrimSpace(override); trimmed != "" {
		candidates = append(candidates, filepath.Join(trimmed, templateID))
		candidates = append(candidates, trimmed)
	}

	if cwd, err := os.Getwd(); err == nil {
		relatives := []string{
			filepath.Join(templateRootDir, templateID),
			filepath.Join("..", templateRootDir, templateID),
			filepath.Join("..", "..", templateRootDir, templateID),
			filepath.Join("..", "..", "..", templateRootDir, templateID),
			filepath.Join("..", "..", "..", "..", templateRootDir, templateID),
		}
		for _, relative := range relatives {
			candidates = append(candidates, filepath.Join(cwd, relative))
		}
	}

	if _, file, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(file), "..", "..", "..", templateRootDir, templateID))
	}

	seen := map[string]struct{}{}
	attempted := []string{}
	for _, candidate := range candidates {
		root := normalizeTemplateRootCandidate(candidate)
		if root == "" {
			continue
		}
		if _, exists := seen[root]; exists {
			continue
		}
		seen[root] = struct{}{}
		attempted = append(attempted, root)

		info, err := os.Stat(filepath.Join(root, "template.yaml"))
		if err == nil && !info.IsDir() {
			return root, nil
		}
	}

	sort.Strings(attempted)
	return "", fmt.Errorf("template %q not found under %s", templateID, strings.Join(attempted, ", "))
}

func resolveTemplateBaseDir(override string) (string, error) {
	candidates := []string{}
	if trimmed := strings.TrimSpace(override); trimmed != "" {
		candidates = append(candidates, trimmed)
	}

	if cwd, err := os.Getwd(); err == nil {
		relatives := []string{
			templateRootDir,
			filepath.Join("..", templateRootDir),
			filepath.Join("..", "..", templateRootDir),
			filepath.Join("..", "..", "..", templateRootDir),
			filepath.Join("..", "..", "..", "..", templateRootDir),
		}
		for _, relative := range relatives {
			candidates = append(candidates, filepath.Join(cwd, relative))
		}
	}

	if _, file, _, ok := runtime.Caller(0); ok {
		candidates = append(candidates, filepath.Join(filepath.Dir(file), "..", "..", "..", templateRootDir))
	}

	seen := map[string]struct{}{}
	attempted := []string{}
	for _, candidate := range candidates {
		baseDir := normalizeTemplateBaseCandidate(candidate)
		if baseDir == "" {
			continue
		}
		if _, exists := seen[baseDir]; exists {
			continue
		}
		seen[baseDir] = struct{}{}
		attempted = append(attempted, baseDir)

		info, err := os.Stat(baseDir)
		if err == nil && info.IsDir() {
			return baseDir, nil
		}
	}

	sort.Strings(attempted)
	return "", fmt.Errorf("template base directory not found under %s", strings.Join(attempted, ", "))
}

func normalizeTemplateRootCandidate(candidate string) string {
	if strings.TrimSpace(candidate) == "" {
		return ""
	}

	cleaned := filepath.Clean(candidate)
	info, err := os.Stat(cleaned)
	if err != nil || !info.IsDir() {
		return ""
	}

	if manifestInfo, manifestErr := os.Stat(filepath.Join(cleaned, "devbox.yaml.tmpl")); manifestErr == nil && !manifestInfo.IsDir() {
		return filepath.Dir(cleaned)
	}

	return cleaned
}

func normalizeTemplateBaseCandidate(candidate string) string {
	if strings.TrimSpace(candidate) == "" {
		return ""
	}

	cleaned := filepath.Clean(candidate)
	info, err := os.Stat(cleaned)
	if err != nil || !info.IsDir() {
		return ""
	}

	if _, err := os.Stat(filepath.Join(cleaned, "template.yaml")); err == nil {
		return filepath.Dir(cleaned)
	}

	return cleaned
}

func validateDefinition(definition Definition) error {
	if strings.TrimSpace(definition.ID) == "" {
		return fmt.Errorf("id is required")
	}
	if strings.TrimSpace(definition.Name) == "" {
		return fmt.Errorf("name is required")
	}
	if strings.TrimSpace(definition.ShortName) == "" {
		return fmt.Errorf("shortName is required")
	}
	if strings.TrimSpace(definition.Description) == "" {
		return fmt.Errorf("description is required")
	}
	if strings.TrimSpace(definition.Image) == "" {
		return fmt.Errorf("image is required")
	}
	if definition.Port <= 0 {
		return fmt.Errorf("port must be greater than 0")
	}
	if len(definition.DefaultArgs) == 0 {
		return fmt.Errorf("defaultArgs is required")
	}
	if strings.TrimSpace(definition.WorkingDir) == "" {
		return fmt.Errorf("workingDir is required")
	}
	if strings.TrimSpace(definition.User) == "" {
		return fmt.Errorf("user is required")
	}
	if strings.TrimSpace(definition.Presentation.LogoKey) == "" {
		return fmt.Errorf("presentation.logoKey is required")
	}
	if strings.TrimSpace(definition.Presentation.BrandColor) == "" {
		return fmt.Errorf("presentation.brandColor is required")
	}
	if strings.TrimSpace(definition.Presentation.DocsLabel) == "" {
		return fmt.Errorf("presentation.docsLabel is required")
	}
	if len(definition.Workspaces) == 0 {
		return fmt.Errorf("workspaces is required")
	}
	if len(definition.Access) == 0 {
		return fmt.Errorf("access is required")
	}
	if definition.Settings.Runtime == nil || definition.Settings.Agent == nil {
		return fmt.Errorf("settings.runtime and settings.agent are required")
	}
	if definition.RegionModelPresets == nil {
		return fmt.Errorf("regionModelPresets is required")
	}
	if _, ok := definition.RegionModelPresets["us"]; !ok {
		return fmt.Errorf("regionModelPresets.us is required")
	}
	if _, ok := definition.RegionModelPresets["cn"]; !ok {
		return fmt.Errorf("regionModelPresets.cn is required")
	}
	for _, workspace := range definition.Workspaces {
		if strings.TrimSpace(workspace.Key) == "" {
			return fmt.Errorf("workspace.key is required")
		}
		if strings.TrimSpace(workspace.Label) == "" {
			return fmt.Errorf("workspace.label is required")
		}
	}
	for _, field := range definition.Settings.Runtime {
		if err := validateSettingField(field, "runtime"); err != nil {
			return err
		}
	}
	for _, field := range definition.Settings.Agent {
		if err := validateSettingField(field, "agent"); err != nil {
			return err
		}
	}

	if definition.BackendSupported {
		if strings.TrimSpace(definition.ManifestDir) == "" {
			return fmt.Errorf("manifestDir is required for backendSupported template")
		}
		if strings.TrimSpace(definition.Bootstrap.Script) == "" || strings.TrimSpace(definition.Bootstrap.Shell) == "" || definition.Bootstrap.TimeoutSeconds <= 0 {
			return fmt.Errorf("bootstrap is incomplete")
		}
		if strings.TrimSpace(definition.Healthcheck.Script) == "" || strings.TrimSpace(definition.Healthcheck.Shell) == "" || definition.Healthcheck.TimeoutSeconds <= 0 {
			return fmt.Errorf("healthcheck is incomplete")
		}
	}

	return nil
}

func validateSettingField(field SettingField, scope string) error {
	if strings.TrimSpace(field.Key) == "" {
		return fmt.Errorf("%s setting key is required", scope)
	}
	if strings.TrimSpace(field.Label) == "" {
		return fmt.Errorf("%s setting %s label is required", scope, field.Key)
	}
	if strings.TrimSpace(field.Type) == "" {
		return fmt.Errorf("%s setting %s type is required", scope, field.Key)
	}

	bindingKind := strings.TrimSpace(field.Binding.Kind)
	if bindingKind == "" {
		return fmt.Errorf("%s setting %s binding.kind is required", scope, field.Key)
	}

	switch bindingKind {
	case "runtime", "agent", "derived":
		if strings.TrimSpace(field.Binding.Key) == "" {
			return fmt.Errorf("%s setting %s binding.key is required", scope, field.Key)
		}
	case "env", "annotation":
		if strings.TrimSpace(field.Binding.Name) == "" {
			return fmt.Errorf("%s setting %s binding.name is required", scope, field.Key)
		}
	default:
		return fmt.Errorf("%s setting %s binding.kind %q is not supported", scope, field.Key, bindingKind)
	}

	if scope == "runtime" && bindingKind != "runtime" && bindingKind != "derived" {
		return fmt.Errorf("runtime setting %s binding.kind %q is not supported", field.Key, bindingKind)
	}
	if scope == "agent" && bindingKind == "runtime" {
		return fmt.Errorf("agent setting %s cannot use runtime binding", field.Key)
	}

	return nil
}
