package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/nightwhite/Agent-Hub/internal/agent"
	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/aiproxycatalog"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
	"k8s.io/client-go/kubernetes"
)

const agentModelSwitchTimeout = 90 * time.Second

type agentHubModelInitResult struct {
	ClientID   string `json:"clientId"`
	ProviderID string `json:"providerId"`
	ModelType  string `json:"modelType"`
	ModelID    string `json:"modelId"`
	ConfigPath string `json:"configPath"`
	Applied    bool   `json:"applied"`
}

type agentHubClientCurrentResult struct {
	ClientID   string `json:"clientId"`
	ProviderID string `json:"providerId"`
	ModelID    string `json:"modelId"`
	ConfigPath string `json:"configPath"`
}

func GetAgentModelCurrent(c *gin.Context) {
	factory, err := kubeFactory(c)
	if err != nil {
		writeHeaderKubeconfigError(c, err)
		return
	}
	agentName := c.Param("agentName")
	if err := validateAgentName(agentName); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}
	view, found := getAgentView(ctx, factory.Namespace(), agentName, repo, clientset, c)
	if !found {
		return
	}
	cfg := runtimeConfig(c)
	templateDef, resolveErr := resolveTemplateDefinition(cfg, view.Agent.TemplateID)
	if resolveErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, resolveErr.Error()))
		return
	}
	if !templateDef.ModelSwitch.Enabled {
		writeAppError(c, http.StatusBadRequest, appErr.New(appErr.CodeInvalidRequest, "agent template does not support model switch").WithDetails(map[string]any{
			"templateId": templateDef.ID,
		}))
		return
	}

	current, currentErr := runAgentHubModelCurrent(ctx, clientset, factory, templateDef, view.Agent)
	if currentErr != nil {
		writeAppError(c, http.StatusBadGateway, appErr.New(appErr.CodeKubernetesOperation, "failed to read agent model").WithDetails(map[string]any{
			"reason": currentErr.Error(),
		}))
		return
	}

	response := dto.AgentModelCurrentResponse{
		AgentName:  agentName,
		Client:     current.ClientID,
		ProviderID: current.ProviderID,
		ModelID:    current.ModelID,
		ConfigPath: current.ConfigPath,
	}
	if catalog, model, err := resolveCatalogModelForTemplate(cfg, templateDef, current.ModelID); err == nil {
		response.ProviderName = model.ProviderName
		response.ModelType = model.ModelType
		response.RequestFormat = model.RequestFormat
		response.BaseURL = catalog.BaseURL
	}
	writeSuccess(c, http.StatusOK, response)
}

func runAgentHubModelCurrent(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	templateDef agenttemplate.Definition,
	spec agent.Agent,
) (agentHubClientCurrentResult, error) {
	if !templateDef.ModelSwitch.Enabled {
		return agentHubClientCurrentResult{}, fmt.Errorf("template %s does not support model switch", templateDef.ID)
	}
	client := strings.TrimSpace(templateDef.ModelSwitch.Client)
	if client == "" {
		return agentHubClientCurrentResult{}, fmt.Errorf("model switch client is required")
	}

	argv := []string{"ai-agent-switch", "client", "show", client, "--json"}
	execCtx, cancel := context.WithTimeout(ctx, agentModelSwitchTimeout)
	defer cancel()

	stdout, stderr, execErr := execInAgentPodWithRetry(execCtx, clientset, factory, spec.Name, argv, nil, false, nil)
	if execErr != nil {
		return agentHubClientCurrentResult{}, fmt.Errorf("agent model current failed: %w (stdout=%q stderr=%q)", execErr, stdout, stderr)
	}
	if strings.TrimSpace(stderr) != "" {
		return agentHubClientCurrentResult{}, fmt.Errorf("agent model current emitted stderr: %s", strings.TrimSpace(stderr))
	}

	var result agentHubClientCurrentResult
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		return agentHubClientCurrentResult{}, fmt.Errorf("decode agent model current output: %w", err)
	}
	if strings.TrimSpace(result.ClientID) == "" {
		result.ClientID = client
	}
	return result, nil
}

func runAgentHubModelInit(
	ctx context.Context,
	clientset kubernetes.Interface,
	factory *kube.Factory,
	cfg config.Config,
	templateDef agenttemplate.Definition,
	spec agent.Agent,
) (agentHubModelInitResult, error) {
	if !templateDef.ModelSwitch.Enabled {
		return agentHubModelInitResult{}, fmt.Errorf("template %s does not support model switch", templateDef.ID)
	}
	regionCatalog, selectedModel, err := resolveCatalogModelForTemplate(cfg, templateDef, spec.Model)
	if err != nil {
		return agentHubModelInitResult{}, err
	}

	argv := buildAgentHubModelInitArgv(templateDef.ModelSwitch, regionCatalog, selectedModel)
	execCtx, cancel := context.WithTimeout(ctx, agentModelSwitchTimeout)
	defer cancel()

	stdout, stderr, execErr := execInAgentPodWithRetry(execCtx, clientset, factory, spec.Name, argv, nil, false, nil)
	if execErr != nil {
		return agentHubModelInitResult{}, fmt.Errorf("agent model init failed: %w (stdout=%q stderr=%q)", execErr, stdout, stderr)
	}
	if strings.TrimSpace(stderr) != "" {
		return agentHubModelInitResult{}, fmt.Errorf("agent model init emitted stderr: %s", strings.TrimSpace(stderr))
	}

	var result agentHubModelInitResult
	if err := json.Unmarshal([]byte(stdout), &result); err != nil {
		return agentHubModelInitResult{}, fmt.Errorf("decode agent model init output: %w", err)
	}
	if !result.Applied {
		return agentHubModelInitResult{}, fmt.Errorf("agent model init did not apply changes")
	}
	return result, nil
}

func buildAgentHubModelInitArgv(
	modelSwitch agenttemplate.ModelSwitch,
	regionCatalog aiproxycatalog.Region,
	model aiproxycatalog.Model,
) []string {
	argv := []string{
		"ai-agent-switch",
		"agent-hub",
		"init",
		"--client",
		strings.TrimSpace(modelSwitch.Client),
		"--provider-id",
		strings.TrimSpace(model.ProviderID),
		"--provider-name",
		strings.TrimSpace(model.ProviderName),
		"--model-type",
		strings.TrimSpace(model.ModelType),
		"--base-url",
		strings.TrimSpace(regionCatalog.BaseURL),
		"--api-key-env",
		strings.TrimSpace(modelSwitch.APIKeyEnv),
		"--model",
		strings.TrimSpace(model.ID),
	}
	for _, availableModel := range availableModelsForProviderAndType(regionCatalog, model.ProviderID, model.ModelType) {
		argv = append(argv, "--available-model", availableModel)
	}
	return append(argv, "-y", "--json")
}

func availableModelsForProviderAndType(regionCatalog aiproxycatalog.Region, providerID string, modelType string) []string {
	providerID = strings.TrimSpace(providerID)
	modelType = strings.TrimSpace(modelType)
	models := []string{}
	seen := map[string]struct{}{}
	for _, model := range regionCatalog.Models {
		if strings.TrimSpace(model.ProviderID) != providerID {
			continue
		}
		if strings.TrimSpace(model.ModelType) != modelType {
			continue
		}
		id := strings.TrimSpace(model.ID)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		models = append(models, id)
	}
	return models
}
