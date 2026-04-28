package dto

type UpdateAgentSettingsRequest struct {
	AgentAliasName *string        `json:"agent-alias-name,omitempty"`
	Settings       map[string]any `json:"settings,omitempty"`
}
