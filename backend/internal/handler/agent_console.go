package handler

import (
	"fmt"
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/dto"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func GetAgentConsole(c *gin.Context) {
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

	contract := buildAgentContract(view, templateDef, cfg)
	workspaceRoot := contract.Runtime.WorkingDir
	if workspaceRoot == "" {
		for _, access := range contract.Access {
			if access.Key == "files" && access.RootPath != "" {
				workspaceRoot = access.RootPath
				break
			}
		}
	}

	services := make([]dto.AgentConsoleServiceItem, 0, len(contract.Access))
	for _, access := range contract.Access {
		if access.URL == "" {
			continue
		}
		services = append(services, dto.AgentConsoleServiceItem{
			Key:     access.Key,
			Label:   access.Label,
			URL:     access.URL,
			Enabled: access.Enabled,
			Status:  access.Status,
			Reason:  access.Reason,
		})
	}

	writeSuccess(c, http.StatusOK, dto.AgentConsoleBootstrapResponse{
		Agent:         contract,
		WorkspaceRoot: workspaceRoot,
		WebSocketPath: fmt.Sprintf("/api/v1/agents/%s/ws", url.PathEscape(agentName)),
		Services:      services,
	})
}
