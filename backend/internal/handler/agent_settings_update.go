package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func UpdateAgentSettings(c *gin.Context) {
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

	var req dto.UpdateAgentSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		writeAppError(c, http.StatusBadRequest, appErr.ErrInvalidJSON)
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

	region, regionErr := requiredRegion(cfg)
	if regionErr != nil {
		writeAppError(c, http.StatusInternalServerError, regionErr)
		return
	}
	if err := validateSettingsUpdateRequest(req, templateDef, region); err != nil {
		writeValidationError(c, err)
		return
	}

	mapped, err := buildSettingsUpdateRequest(req, templateDef)
	if err != nil {
		writeValidationError(c, err)
		return
	}

	updatedDevbox, _, updateErr := updateAgentResources(ctx, repo, clientset, factory.Namespace(), agentName, mapped)
	if updateErr != nil {
		writeKubernetesError(c, updateErr, "failed to update agent settings")
		return
	}

	if shouldRebootstrap(mapped) {
		if err := markAgentBootstrapPending(ctx, repo, updatedDevbox, templateDef.ID); err != nil {
			writeKubernetesError(c, err, "failed to mark bootstrap pending")
			return
		}
	}

	view, found = getAgentView(ctx, factory.Namespace(), agentName, repo, clientset, c)
	if !found {
		return
	}
	if shouldRebootstrap(mapped) {
		scheduleAgentBootstrap(factory, cfg, templateDef, view.Agent)
	}

	writeSuccess(c, http.StatusOK, dto.AgentDetailResponse{Agent: buildAgentContract(view, templateDef, cfg)})
}

func validateSettingsUpdateRequest(
	req dto.UpdateAgentSettingsRequest,
	templateDef agenttemplate.Definition,
	region string,
) *appErr.AppError {
	if req.AgentAliasName == nil && len(req.Settings) == 0 {
		return appErr.New(appErr.CodeValidationFailed, "settings update payload is required").WithDetails(map[string]any{
			"field":  "settings",
			"reason": "required",
		})
	}
	if req.AgentAliasName != nil && strings.TrimSpace(*req.AgentAliasName) == "" {
		return validationFieldError("agent-alias-name", "cannot_be_empty", *req.AgentAliasName)
	}
	return validateTemplateSettingsPayload(req.Settings, templateDef.Settings.Agent, templateDef, region, false, "settings.")
}

func buildSettingsUpdateRequest(
	req dto.UpdateAgentSettingsRequest,
	templateDef agenttemplate.Definition,
) (dto.UpdateAgentRequest, *appErr.AppError) {
	mapped, err := buildTemplateSettingsUpdate(req.Settings, templateDef.Settings.Agent)
	if err != nil {
		return dto.UpdateAgentRequest{}, err
	}
	mapped.AgentAliasName = req.AgentAliasName
	return mapped, nil
}
