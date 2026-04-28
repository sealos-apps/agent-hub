package dto

type AgentSSHAccessResponse struct {
	Host             string `json:"host"`
	Port             int32  `json:"port"`
	UserName         string `json:"userName"`
	WorkingDir       string `json:"workingDir"`
	Base64PublicKey  string `json:"base64PublicKey"`
	Base64PrivateKey string `json:"base64PrivateKey"`
	Token            string `json:"token"`
	ConfigHost       string `json:"configHost"`
}
