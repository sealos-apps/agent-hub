package dto

type CreateAgentRequest struct {
	TemplateID     string            `json:"template-id,omitempty"`
	AgentName      string            `json:"agent-name" binding:"required"`
	AgentCPU       string            `json:"agent-cpu" binding:"required"`
	AgentMemory    string            `json:"agent-memory" binding:"required"`
	AgentStorage   string            `json:"agent-storage" binding:"required"`
	AgentAliasName string            `json:"agent-alias-name,omitempty"`
	Settings       map[string]any    `json:"settings,omitempty"`
	ModelSlots     map[string]string `json:"modelSlots,omitempty"`
	ModelProvider  *string           `json:"agent-model-provider,omitempty"`
	ModelBaseURL   *string           `json:"agent-model-baseurl,omitempty"`
	ModelAPIKey    *string           `json:"agent-model-apikey,omitempty"`
	Model          *string           `json:"agent-model,omitempty"`
	ModelAPIMode   *string           `json:"agent-model-api-mode,omitempty"`
}

type UpdateAgentRequest struct {
	AgentCPU         *string                       `json:"agent-cpu,omitempty"`
	AgentMemory      *string                       `json:"agent-memory,omitempty"`
	AgentStorage     *string                       `json:"agent-storage,omitempty"`
	RuntimeClassName *string                       `json:"runtime-class-name,omitempty"`
	ModelProvider    *string                       `json:"agent-model-provider,omitempty"`
	ModelBaseURL     *string                       `json:"agent-model-baseurl,omitempty"`
	ModelAPIKey      *string                       `json:"agent-model-apikey,omitempty"`
	Model            *string                       `json:"agent-model,omitempty"`
	ModelAPIMode     *string                       `json:"agent-model-api-mode,omitempty"`
	ModelSlots       map[string]ModelSlotSelection `json:"-"`
	AgentAliasName   *string                       `json:"agent-alias-name,omitempty"`
	EnvValues        map[string]*string            `json:"-"`
	AnnotationValues map[string]*string            `json:"-"`
	Rebootstrap      bool                          `json:"-"`
}

type ModelSlotSelection struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	APIMode  string `json:"apiMode"`
}

type AgentListResponse struct {
	Items []AgentContract `json:"items"`
	Total int             `json:"total"`
	Meta  map[string]any  `json:"meta,omitempty"`
}

type AgentDetailResponse struct {
	Agent AgentContract `json:"agent"`
}

type CreateAgentResponse struct {
	Agent AgentContract `json:"agent"`
}

type AgentKeyRotateResponse struct {
	AgentName string `json:"agentName"`
	Rotated   bool   `json:"rotated"`
}
