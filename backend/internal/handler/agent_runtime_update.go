package handler

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
	kubernetes "k8s.io/client-go/kubernetes"

	"github.com/nightwhite/Agent-Hub/internal/dto"
	"github.com/nightwhite/Agent-Hub/internal/kube"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func UpdateAgentRuntime(c *gin.Context) {
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

	var req dto.UpdateAgentRuntimeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeAppError(c, http.StatusBadRequest, appErr.ErrInvalidJSON)
		return
	}
	if err := validateRuntimeUpdateRequest(req); err != nil {
		writeValidationError(c, err)
		return
	}

	ctx := c.Request.Context()
	repo, clientset, ok := newClients(c, factory)
	if !ok {
		return
	}

	mapped := dto.UpdateAgentRequest{
		AgentCPU:         req.AgentCPU,
		AgentMemory:      req.AgentMemory,
		AgentStorage:     req.AgentStorage,
		RuntimeClassName: req.RuntimeClassName,
	}
	if _, err := retryUpdateDevbox(ctx, repo, agentName, mapped); err != nil {
		writeKubernetesError(c, err, "failed to update agent runtime")
		return
	}

	writeUpdatedAgentContract(c, ctx, factory.Namespace(), agentName, repo, clientset)
}

func validateRuntimeUpdateRequest(req dto.UpdateAgentRuntimeRequest) *appErr.AppError {
	if req.AgentCPU == nil && req.AgentMemory == nil && req.AgentStorage == nil && req.RuntimeClassName == nil {
		return appErr.New(appErr.CodeValidationFailed, "runtime update payload is required").WithDetails(map[string]any{
			"field":  "runtime",
			"reason": "required",
		})
	}

	return validateUpdateRequest(dto.UpdateAgentRequest{
		AgentCPU:         req.AgentCPU,
		AgentMemory:      req.AgentMemory,
		AgentStorage:     req.AgentStorage,
		RuntimeClassName: req.RuntimeClassName,
	})
}

func writeUpdatedAgentContract(
	c *gin.Context,
	ctx context.Context,
	namespace string,
	agentName string,
	repo *kube.Repository,
	clientset kubernetes.Interface,
) {
	view, found := getAgentView(ctx, namespace, agentName, repo, clientset, c)
	if !found {
		return
	}

	cfg := runtimeConfig(c)
	templateDef, resolveErr := resolveTemplateDefinition(cfg, view.Agent.TemplateID)
	if resolveErr != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, resolveErr.Error()))
		return
	}

	writeSuccess(c, http.StatusOK, dto.AgentDetailResponse{Agent: buildAgentContract(view, templateDef, cfg)})
}
