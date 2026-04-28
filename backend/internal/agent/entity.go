package agent

type Agent struct {
	Name             string
	TemplateID       string
	AliasName        string
	Namespace        string
	CPU              string
	Memory           string
	Storage          string
	RuntimeClassName string
	WorkingDir       string
	User             string
	NetworkType      string
	SSHPort          int32
	ModelProvider    string
	ModelBaseURL     string
	ModelAPIKey      string
	Model            string
	APIServerKey     string
	IngressDomain    string
	BootstrapPhase   string
	BootstrapMessage string
	Ready            bool
	Status           Status
	Annotations      map[string]string
	Env              map[string]string
}
