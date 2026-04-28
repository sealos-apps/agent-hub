package dto

type TemplateCatalogItem struct {
	ID                   string                  `json:"id"`
	Name                 string                  `json:"name"`
	ShortName            string                  `json:"shortName"`
	Description          string                  `json:"description"`
	Image                string                  `json:"image"`
	Port                 int32                   `json:"port"`
	DefaultArgs          []string                `json:"defaultArgs"`
	WorkingDir           string                  `json:"workingDir"`
	User                 string                  `json:"user"`
	BackendSupported     bool                    `json:"backendSupported"`
	CreateDisabledReason string                  `json:"createDisabledReason,omitempty"`
	Presentation         TemplatePresentation    `json:"presentation"`
	Workspaces           []TemplateWorkspaceItem `json:"workspaces"`
	Access               []TemplateAccessItem    `json:"access"`
	Actions              []TemplateActionItem    `json:"actions"`
	Settings             TemplateSettingsSchema  `json:"settings"`
	ModelOptions         []TemplateModelOption   `json:"modelOptions"`
}

type TemplatePresentation struct {
	LogoKey    string `json:"logoKey"`
	BrandColor string `json:"brandColor"`
	DocsLabel  string `json:"docsLabel"`
}

type TemplateWorkspaceItem struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type TemplateAccessItem struct {
	Key      string   `json:"key"`
	Label    string   `json:"label"`
	Path     string   `json:"path,omitempty"`
	Auth     string   `json:"auth,omitempty"`
	RootPath string   `json:"rootPath,omitempty"`
	Modes    []string `json:"modes,omitempty"`
}

type TemplateActionItem struct {
	Key   string `json:"key"`
	Label string `json:"label"`
}

type TemplateSettingsSchema struct {
	Runtime []AgentSettingField `json:"runtime"`
	Agent   []AgentSettingField `json:"agent"`
}

type TemplateModelOption struct {
	Value    string `json:"value"`
	Label    string `json:"label"`
	Helper   string `json:"helper,omitempty"`
	Provider string `json:"provider"`
	APIMode  string `json:"apiMode"`
}

type TemplateCatalogResponse struct {
	Items  []TemplateCatalogItem `json:"items"`
	Region string                `json:"region"`
}
