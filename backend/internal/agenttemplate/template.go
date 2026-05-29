package agenttemplate

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"sigs.k8s.io/yaml"
)

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
	ModelIntegration     ModelIntegration         `yaml:"modelIntegration"`
	RegionModelPresets   map[string][]ModelPreset `yaml:"regionModelPresets"`
	RegionModelTypes     map[string][]ModelType   `yaml:"regionModelTypes"`
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
	Value            string   `yaml:"value"`
	Label            string   `yaml:"label"`
	Helper           string   `yaml:"helper"`
	Provider         string   `yaml:"provider"`
	APIMode          string   `yaml:"apiMode"`
	Category         string   `yaml:"category"`
	Capabilities     []string `yaml:"capabilities"`
	InputModalities  []string `yaml:"inputModalities"`
	OutputModalities []string `yaml:"outputModalities"`
}

type ModelType struct {
	Key         string        `yaml:"key"`
	Label       string        `yaml:"label"`
	Description string        `yaml:"description"`
	Models      []ModelPreset `yaml:"models"`
	Options     []ModelPreset `yaml:"options"`
}

type ModelIntegration struct {
	Type     string                   `yaml:"type"`
	Client   string                   `yaml:"client"`
	Provider ModelIntegrationProvider `yaml:"provider"`
	Slots    []ModelIntegrationSlot   `yaml:"slots"`
}

type LocalizedText map[string]string

type ModelIntegrationProvider struct {
	ID        string                      `yaml:"id"`
	Name      LocalizedText               `yaml:"name"`
	BaseURL   ModelIntegrationValueSource `yaml:"baseURL"`
	APIKeyEnv string                      `yaml:"apiKeyEnv"`
}

type ModelIntegrationValueSource struct {
	Source string `yaml:"source"`
}

type ModelIntegrationSlot struct {
	Key           string            `yaml:"key"`
	Label         LocalizedText     `yaml:"label"`
	Required      bool              `yaml:"required"`
	Mutable       bool              `yaml:"mutable"`
	DefaultModels map[string]string `yaml:"defaultModels"`
	ModelTypes    []string          `yaml:"modelTypes"`
}

func Resolve(templateID, override string) (Definition, error) {
	return ResolveFromSource(templateID, Source{Dir: override})
}

func ResolveFromSource(templateID string, source Source) (Definition, error) {
	id := strings.TrimSpace(templateID)
	if id == "" {
		return Definition{}, fmt.Errorf("template id is required")
	}

	rootDir, err := source.ResolvedRootDir(id)
	if err != nil {
		return Definition{}, err
	}

	definition, err := readDefinition(rootDir)
	if err != nil {
		return Definition{}, err
	}
	if strings.TrimSpace(definition.ID) != id {
		return Definition{}, fmt.Errorf("template %q not found in %s", id, rootDir)
	}
	return definition, nil
}

func List(override string) ([]Definition, error) {
	return ListFromSource(Source{Dir: override})
}

func ListFromSource(source Source) ([]Definition, error) {
	baseDir, err := source.ResolvedBaseDir()
	if err != nil {
		return nil, err
	}

	if hasTemplateMetadata(baseDir) {
		definition, err := readDefinition(baseDir)
		if err != nil {
			return nil, err
		}
		return []Definition{definition}, nil
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
		if strings.HasPrefix(entry.Name(), "_") || strings.HasPrefix(entry.Name(), ".") {
			continue
		}

		rootDir := filepath.Join(baseDir, entry.Name())
		raw, readErr := os.ReadFile(filepath.Join(rootDir, "template.yaml"))
		if readErr != nil {
			continue
		}

		definition, err := parseDefinition(raw, rootDir)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", entry.Name(), err)
		}
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

func readDefinition(rootDir string) (Definition, error) {
	raw, err := os.ReadFile(filepath.Join(rootDir, "template.yaml"))
	if err != nil {
		return Definition{}, fmt.Errorf("read template metadata: %w", err)
	}
	return parseDefinition(raw, rootDir)
}

func parseDefinition(raw []byte, rootDir string) (Definition, error) {
	var definition Definition
	if err := yaml.Unmarshal(raw, &definition); err != nil {
		return Definition{}, fmt.Errorf("parse template metadata: %w", err)
	}
	normalizeDefinitionModels(&definition)
	if err := validateDefinition(definition); err != nil {
		return Definition{}, fmt.Errorf("invalid template metadata: %w", err)
	}
	definition.rootDir = rootDir
	return definition, nil
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

	if baseDir := findTemplateBaseCandidate(cleaned); baseDir != "" {
		return baseDir
	}

	return cleaned
}

func findTemplateBaseCandidate(rootDir string) string {
	for _, candidate := range append([]string{rootDir}, templateCollectionDirsUnder(rootDir)...) {
		if hasTemplateMetadata(candidate) {
			return filepath.Dir(candidate)
		}
		entries, err := os.ReadDir(candidate)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if !entry.IsDir() || strings.HasPrefix(entry.Name(), "_") || strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			if hasTemplateMetadata(filepath.Join(candidate, entry.Name())) {
				return candidate
			}
		}
	}
	return ""
}

func templateCollectionDirs() []string {
	return []string{templateRootDir, "agents"}
}

func templateCollectionDirsUnder(rootDir string) []string {
	dirs := templateCollectionDirs()
	result := make([]string, 0, len(dirs))
	for _, dir := range dirs {
		result = append(result, filepath.Join(rootDir, dir))
	}
	return result
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
	if err := validateModelIntegration(definition.ModelIntegration); err != nil {
		return err
	}

	if definition.BackendSupported {
		if strings.TrimSpace(definition.ManifestDir) == "" {
			return fmt.Errorf("manifestDir is required for backendSupported template")
		}
		if HasScriptSpec(definition.Bootstrap) && !isCompleteScriptSpec(definition.Bootstrap) {
			return fmt.Errorf("bootstrap is incomplete")
		}
		if HasScriptSpec(definition.Healthcheck) && !isCompleteScriptSpec(definition.Healthcheck) {
			return fmt.Errorf("healthcheck is incomplete")
		}
	}

	return nil
}

func validateModelIntegration(integration ModelIntegration) error {
	if strings.TrimSpace(integration.Type) == "" &&
		strings.TrimSpace(integration.Client) == "" &&
		strings.TrimSpace(integration.Provider.ID) == "" &&
		len(integration.Slots) == 0 {
		return nil
	}
	if strings.TrimSpace(integration.Type) != "ai-agent-switch" {
		return fmt.Errorf("modelIntegration.type must be ai-agent-switch")
	}
	if strings.TrimSpace(integration.Client) == "" {
		return fmt.Errorf("modelIntegration.client is required")
	}
	if strings.TrimSpace(integration.Provider.ID) == "" {
		return fmt.Errorf("modelIntegration.provider.id is required")
	}
	if strings.TrimSpace(integration.Provider.APIKeyEnv) == "" {
		return fmt.Errorf("modelIntegration.provider.apiKeyEnv is required")
	}
	baseURLSource := strings.TrimSpace(integration.Provider.BaseURL.Source)
	switch baseURLSource {
	case "workspace", "system.aiProxyModelBaseURL":
	case "":
		return fmt.Errorf("modelIntegration.provider.baseURL.source is required")
	default:
		return fmt.Errorf("modelIntegration.provider.baseURL.source %q is not supported", baseURLSource)
	}
	if len(integration.Slots) == 0 {
		return fmt.Errorf("modelIntegration.slots is required")
	}
	seenSlots := map[string]struct{}{}
	hasRequiredMainSlot := false
	for _, slot := range integration.Slots {
		key := strings.TrimSpace(slot.Key)
		if key == "" {
			return fmt.Errorf("modelIntegration.slots[].key is required")
		}
		if key != slot.Key {
			return fmt.Errorf("modelIntegration.slots.%s.key must not include leading or trailing whitespace", key)
		}
		if _, ok := seenSlots[key]; ok {
			return fmt.Errorf("modelIntegration.slots.%s is duplicated", key)
		}
		seenSlots[key] = struct{}{}
		if key == "main" && slot.Required {
			hasRequiredMainSlot = true
		}
		if strings.TrimSpace(slot.Label["zh"]) == "" || strings.TrimSpace(slot.Label["en"]) == "" {
			return fmt.Errorf("modelIntegration.slots.%s.label must include zh and en", key)
		}
		if len(slot.ModelTypes) == 0 {
			return fmt.Errorf("modelIntegration.slots.%s.modelTypes is required", key)
		}
		hasModelType := false
		for _, modelType := range slot.ModelTypes {
			if strings.TrimSpace(modelType) != "" {
				hasModelType = true
				break
			}
		}
		if !hasModelType {
			return fmt.Errorf("modelIntegration.slots.%s.modelTypes is required", key)
		}
	}
	if !hasRequiredMainSlot {
		return fmt.Errorf("modelIntegration.slots.main is required")
	}
	return nil
}

func normalizeDefinitionModels(definition *Definition) {
	if definition == nil {
		return
	}

	if len(definition.RegionModelTypes) > 0 {
		if definition.RegionModelPresets == nil {
			definition.RegionModelPresets = map[string][]ModelPreset{}
		}
		for region, modelTypes := range definition.RegionModelTypes {
			normalizedTypes, flattened := normalizeModelTypes(modelTypes)
			definition.RegionModelTypes[region] = normalizedTypes
			definition.RegionModelPresets[region] = flattened
		}
	}

	if len(definition.RegionModelPresets) > 0 {
		if definition.RegionModelTypes == nil {
			definition.RegionModelTypes = map[string][]ModelType{}
		}
		for region, presets := range definition.RegionModelPresets {
			if _, ok := definition.RegionModelTypes[region]; ok {
				continue
			}
			definition.RegionModelTypes[region] = groupModelPresetsByType(presets)
		}
	}
}

func normalizeModelTypes(modelTypes []ModelType) ([]ModelType, []ModelPreset) {
	normalized := make([]ModelType, 0, len(modelTypes))
	flattened := []ModelPreset{}
	for _, modelType := range modelTypes {
		key := normalizeModelTypeKey(modelType.Key)
		models := append([]ModelPreset(nil), modelType.Models...)
		models = append(models, modelType.Options...)
		if key == "" {
			key = inferModelPresetCategory(firstModelPreset(models))
		}
		if key == "" {
			key = "other"
		}

		items := make([]ModelPreset, 0, len(models))
		for _, model := range models {
			if strings.TrimSpace(model.Category) == "" {
				model.Category = key
			}
			items = append(items, model)
			flattened = append(flattened, model)
		}
		if len(items) == 0 {
			continue
		}

		normalized = append(normalized, ModelType{
			Key:         key,
			Label:       firstNonEmptyString(modelType.Label, defaultModelTypeLabel(key)),
			Description: strings.TrimSpace(modelType.Description),
			Models:      items,
		})
	}
	return normalized, flattened
}

func groupModelPresetsByType(presets []ModelPreset) []ModelType {
	order := []string{}
	groups := map[string][]ModelPreset{}
	for _, preset := range presets {
		key := inferModelPresetCategory(preset)
		if key == "" {
			key = "text"
		}
		if strings.TrimSpace(preset.Category) == "" {
			preset.Category = key
		}
		if _, ok := groups[key]; !ok {
			order = append(order, key)
		}
		groups[key] = append(groups[key], preset)
	}

	result := make([]ModelType, 0, len(order))
	for _, key := range order {
		result = append(result, ModelType{
			Key:    key,
			Label:  defaultModelTypeLabel(key),
			Models: groups[key],
		})
	}
	return result
}

func firstModelPreset(items []ModelPreset) ModelPreset {
	if len(items) == 0 {
		return ModelPreset{}
	}
	return items[0]
}

func inferModelPresetCategory(preset ModelPreset) string {
	if category := normalizeModelTypeKey(preset.Category); category != "" {
		return category
	}

	tokens := make([]string, 0, len(preset.Capabilities)+len(preset.InputModalities)+len(preset.OutputModalities)+1)
	tokens = append(tokens, preset.Capabilities...)
	tokens = append(tokens, preset.InputModalities...)
	tokens = append(tokens, preset.OutputModalities...)
	tokens = append(tokens, preset.APIMode)

	normalized := map[string]struct{}{}
	for _, token := range tokens {
		value := normalizeModelTypeKey(token)
		if value == "" {
			continue
		}
		normalized[value] = struct{}{}
	}

	if _, ok := normalized["image_generation"]; ok {
		return "image"
	}
	if _, ok := normalized["image"]; ok {
		if presetOutputsImage(preset) {
			return "image"
		}
		return "multimodal"
	}
	if _, ok := normalized["vision"]; ok {
		return "multimodal"
	}
	if _, ok := normalized["multimodal"]; ok {
		return "multimodal"
	}
	if _, ok := normalized["audio"]; ok {
		return "audio"
	}
	return "text"
}

func presetOutputsImage(preset ModelPreset) bool {
	for _, value := range preset.OutputModalities {
		if normalizeModelTypeKey(value) == "image" {
			return true
		}
	}
	return false
}

func normalizeModelTypeKey(value string) string {
	return strings.ReplaceAll(strings.ToLower(strings.TrimSpace(value)), "-", "_")
}

func defaultModelTypeLabel(key string) string {
	switch normalizeModelTypeKey(key) {
	case "text":
		return "普通模型"
	case "multimodal":
		return "多模态模型"
	case "image", "image_generation":
		return "生图模型"
	case "audio":
		return "音频模型"
	case "embedding":
		return "向量模型"
	default:
		return "其他模型"
	}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func HasScriptSpec(spec ScriptSpec) bool {
	return strings.TrimSpace(spec.Script) != "" || strings.TrimSpace(spec.Shell) != "" || spec.TimeoutSeconds > 0
}

func isCompleteScriptSpec(spec ScriptSpec) bool {
	return strings.TrimSpace(spec.Script) != "" && strings.TrimSpace(spec.Shell) != "" && spec.TimeoutSeconds > 0
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
