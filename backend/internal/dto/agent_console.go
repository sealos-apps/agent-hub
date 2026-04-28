package dto

type AgentConsoleServiceItem struct {
	Key     string `json:"key"`
	Label   string `json:"label"`
	URL     string `json:"url"`
	Enabled bool   `json:"enabled"`
	Status  string `json:"status,omitempty"`
	Reason  string `json:"reason,omitempty"`
}

type AgentConsoleBootstrapResponse struct {
	Agent         AgentContract             `json:"agent"`
	WorkspaceRoot string                    `json:"workspaceRoot,omitempty"`
	WebSocketPath string                    `json:"webSocketPath"`
	Services      []AgentConsoleServiceItem `json:"services"`
}
