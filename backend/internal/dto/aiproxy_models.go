package dto

type AIProxyModelCatalogResponse struct {
	Region       string               `json:"region"`
	BaseURL      string               `json:"baseURL"`
	DefaultModel string               `json:"defaultModel,omitempty"`
	Models       []AIProxyModelOption `json:"models"`
}

type AIProxyModelOption struct {
	ID            string `json:"id"`
	Label         string `json:"label"`
	ProviderID    string `json:"providerId"`
	ProviderName  string `json:"providerName"`
	ModelType     string `json:"modelType"`
	RequestFormat string `json:"requestFormat"`
}
