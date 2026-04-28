package dto

type UpdateAgentRuntimeRequest struct {
	AgentCPU         *string `json:"agent-cpu,omitempty"`
	AgentMemory      *string `json:"agent-memory,omitempty"`
	AgentStorage     *string `json:"agent-storage,omitempty"`
	RuntimeClassName *string `json:"runtime-class-name,omitempty"`
}
