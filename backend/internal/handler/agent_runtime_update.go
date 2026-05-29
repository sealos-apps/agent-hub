package handler

import (
	"context"
	"log"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	kubernetes "k8s.io/client-go/kubernetes"

	"github.com/nightwhite/Agent-Hub/internal/config"
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
	updatedDevbox, updateErr := retryUpdateDevbox(ctx, repo, agentName, mapped)
	if updateErr != nil {
		writeKubernetesError(c, updateErr, "failed to update agent runtime")
		return
	}

	if kube.BootstrapPhase(updatedDevbox) == kube.BootstrapPhaseFailed {
		cfg := runtimeConfig(c)
		scheduleRuntimeBootstrapRetry(factory, cfg, repo, updatedDevbox.DeepCopy())
	}

	writeUpdatedAgentContract(c, ctx, factory.Namespace(), agentName, repo, clientset)
}

func scheduleRuntimeBootstrapRetry(factory *kube.Factory, cfg config.Config, repo *kube.Repository, devbox *unstructured.Unstructured) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		view, convErr := kube.DevboxToAgentView(devbox)
		if convErr != nil {
			log.Printf("failed to prepare runtime bootstrap retry: %v", convErr)
			return
		}
		templateDef, resolveErr := resolveTemplateDefinition(cfg, view.Agent.TemplateID)
		if resolveErr != nil {
			log.Printf("failed to resolve template for runtime bootstrap retry: %v", resolveErr)
			return
		}
		if err := markAgentBootstrapPending(ctx, repo, devbox, templateDef.ID); err != nil {
			log.Printf("failed to mark bootstrap pending after runtime update: %v", err)
			return
		}
		view, convErr = kube.DevboxToAgentView(devbox)
		if convErr != nil {
			log.Printf("failed to refresh bootstrap retry view: %v", convErr)
			return
		}
		scheduleAgentBootstrap(factory, cfg, templateDef, view.Agent)
	}()
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
	contract, contractErr := buildAgentContract(view, templateDef, cfg)
	if contractErr != nil {
		writeAppError(c, http.StatusInternalServerError, contractErr)
		return
	}

	writeSuccess(c, http.StatusOK, dto.AgentDetailResponse{Agent: contract})
}
