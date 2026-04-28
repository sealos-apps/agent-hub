package dto

type AgentContract struct {
	Core       AgentCoreContract     `json:"core"`
	Workspaces []AgentWorkspaceItem  `json:"workspaces"`
	Access     []AgentAccessItem     `json:"access"`
	Runtime    AgentRuntimeContract  `json:"runtime"`
	Settings   AgentSettingsContract `json:"settings"`
	Actions    []AgentActionItem     `json:"actions"`
}

type AgentCoreContract struct {
	Name             string `json:"name"`
	AliasName        string `json:"aliasName,omitempty"`
	TemplateID       string `json:"templateId"`
	Namespace        string `json:"namespace"`
	Status           string `json:"status"`
	StatusText       string `json:"statusText"`
	Ready            bool   `json:"ready"`
	BootstrapPhase   string `json:"bootstrapPhase,omitempty"`
	BootstrapMessage string `json:"bootstrapMessage,omitempty"`
	CreatedAt        string `json:"createdAt,omitempty"`
}

type AgentAccessItem struct {
	Key        string   `json:"key"`
	Label      string   `json:"label"`
	Enabled    bool     `json:"enabled"`
	Status     string   `json:"status,omitempty"`
	Reason     string   `json:"reason,omitempty"`
	URL        string   `json:"url,omitempty"`
	Auth       string   `json:"auth,omitempty"`
	Host       string   `json:"host,omitempty"`
	Port       int32    `json:"port,omitempty"`
	UserName   string   `json:"userName,omitempty"`
	WorkingDir string   `json:"workingDir,omitempty"`
	RootPath   string   `json:"rootPath,omitempty"`
	Modes      []string `json:"modes,omitempty"`
}

type AgentWorkspaceItem struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Enabled bool   `json:"enabled"`
	Reason  string `json:"reason,omitempty"`
	URL     string `json:"url,omitempty"`
}

type AgentRuntimeContract struct {
	CPU              string `json:"cpu"`
	Memory           string `json:"memory"`
	Storage          string `json:"storage"`
	RuntimeClassName string `json:"runtimeClassName,omitempty"`
	WorkingDir       string `json:"workingDir,omitempty"`
	User             string `json:"user,omitempty"`
	NetworkType      string `json:"networkType,omitempty"`
	SSHPort          int32  `json:"sshPort,omitempty"`
	ModelProvider    string `json:"modelProvider,omitempty"`
	ModelBaseURL     string `json:"modelBaseURL,omitempty"`
	Model            string `json:"model,omitempty"`
	HasModelAPIKey   bool   `json:"hasModelAPIKey"`
}

type AgentSettingsContract struct {
	Runtime []AgentSettingField `json:"runtime"`
	Agent   []AgentSettingField `json:"agent"`
}

type AgentSettingField struct {
	Key         string               `json:"key"`
	Label       string               `json:"label"`
	Type        string               `json:"type"`
	Description string               `json:"description,omitempty"`
	Required    bool                 `json:"required,omitempty"`
	ReadOnly    bool                 `json:"readOnly,omitempty"`
	Binding     AgentSettingBinding  `json:"binding"`
	Value       any                  `json:"value,omitempty"`
	Options     []AgentSettingOption `json:"options,omitempty"`
}

type AgentSettingBinding struct {
	Kind string `json:"kind"`
	Key  string `json:"key,omitempty"`
	Name string `json:"name,omitempty"`
}

type AgentSettingOption struct {
	Value       string `json:"value"`
	Label       string `json:"label"`
	Description string `json:"description,omitempty"`
}

type AgentActionItem struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	Enabled bool   `json:"enabled"`
	Reason  string `json:"reason,omitempty"`
}
