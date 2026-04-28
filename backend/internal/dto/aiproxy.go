package dto

type EnsureAIProxyTokenRequest struct {
	Name string `json:"name,omitempty"`
}

type AIProxyToken struct {
	ID     int    `json:"id,omitempty"`
	Name   string `json:"name"`
	Key    string `json:"key,omitempty"`
	Status int    `json:"status,omitempty"`
}

type EnsureAIProxyTokenResponse struct {
	Token   AIProxyToken `json:"token"`
	Existed bool         `json:"existed"`
}
