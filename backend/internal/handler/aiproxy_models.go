package handler

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/aiproxycatalog"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func ListAIProxyModels(c *gin.Context) {
	cfg := runtimeConfig(c)

	templateID := strings.TrimSpace(c.Query("templateId"))
	if templateID == "" {
		writeValidationError(c, validationFieldError("templateId", "required", templateID))
		return
	}
	templateDef, err := resolveTemplateDefinition(cfg, templateID)
	if err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, err.Error()))
		return
	}
	region, regionCatalog, catalogErr := loadCatalogRegionForTemplate(cfg, templateDef)
	if catalogErr != nil {
		writeCatalogModelError(c, catalogErr)
		return
	}

	models := filterCatalogModels(regionCatalog.Models, templateDef.ModelSwitch)
	writeSuccess(c, http.StatusOK, dto.AIProxyModelCatalogResponse{
		Region:       region,
		BaseURL:      regionCatalog.BaseURL,
		DefaultModel: defaultModelIfAvailable(regionCatalog.DefaultModel, models),
		Models:       models,
	})
}

func writeCatalogModelError(c *gin.Context, err *appErr.AppError) {
	switch err.Code() {
	case appErr.CodeValidationFailed:
		writeValidationError(c, err)
	case appErr.CodeInvalidRequest:
		writeAppError(c, http.StatusBadRequest, err)
	default:
		writeAppError(c, http.StatusInternalServerError, err)
	}
}

func loadCatalogRegionForTemplate(cfg config.Config, templateDef agenttemplate.Definition) (string, aiproxycatalog.Region, *appErr.AppError) {
	region, regionErr := requiredRegion(cfg)
	if regionErr != nil {
		return "", aiproxycatalog.Region{}, regionErr
	}
	if !templateDef.ModelSwitch.Enabled {
		return "", aiproxycatalog.Region{}, appErr.New(appErr.CodeInvalidRequest, "agent template does not support model switch").WithDetails(map[string]any{
			"templateId": templateDef.ID,
			"reason":     "model_switch_disabled",
		})
	}

	catalog, err := aiproxycatalog.LoadCatalog(cfg.AIProxyModelCatalogPath)
	if err != nil {
		return "", aiproxycatalog.Region{}, appErr.New(appErr.CodeKubernetesOperation, err.Error())
	}
	regionCatalog, ok := catalog.Regions[region]
	if !ok {
		return "", aiproxycatalog.Region{}, appErr.New(appErr.CodeKubernetesOperation, "aiproxy model catalog region is missing").WithDetails(map[string]any{
			"region": region,
		})
	}
	return region, regionCatalog, nil
}

func resolveCatalogModelForTemplate(cfg config.Config, templateDef agenttemplate.Definition, modelID string) (aiproxycatalog.Region, aiproxycatalog.Model, *appErr.AppError) {
	_, regionCatalog, err := loadCatalogRegionForTemplate(cfg, templateDef)
	if err != nil {
		return aiproxycatalog.Region{}, aiproxycatalog.Model{}, err
	}
	modelID = strings.TrimSpace(modelID)
	if modelID == "" {
		return aiproxycatalog.Region{}, aiproxycatalog.Model{}, validationFieldError("settings.model", "required", modelID)
	}

	supported := make(map[string]struct{}, len(templateDef.ModelSwitch.SupportedModelTypes))
	for _, modelType := range templateDef.ModelSwitch.SupportedModelTypes {
		supported[strings.TrimSpace(modelType)] = struct{}{}
	}
	for _, model := range regionCatalog.Models {
		if strings.TrimSpace(model.ID) != modelID {
			continue
		}
		if _, ok := supported[strings.TrimSpace(model.ModelType)]; !ok {
			return aiproxycatalog.Region{}, aiproxycatalog.Model{}, validationFieldError("settings.model", "unsupported_field", modelID)
		}
		return regionCatalog, model, nil
	}
	return aiproxycatalog.Region{}, aiproxycatalog.Model{}, validationFieldError("settings.model", "unsupported_field", modelID)
}

func filterCatalogModels(models []aiproxycatalog.Model, modelSwitch agenttemplate.ModelSwitch) []dto.AIProxyModelOption {
	supported := make(map[string]struct{}, len(modelSwitch.SupportedModelTypes))
	for _, modelType := range modelSwitch.SupportedModelTypes {
		supported[strings.TrimSpace(modelType)] = struct{}{}
	}

	result := make([]dto.AIProxyModelOption, 0, len(models))
	for _, model := range models {
		if _, ok := supported[strings.TrimSpace(model.ModelType)]; !ok {
			continue
		}
		result = append(result, dto.AIProxyModelOption{
			ID:            model.ID,
			Label:         model.Label,
			ProviderID:    model.ProviderID,
			ProviderName:  model.ProviderName,
			ModelType:     model.ModelType,
			RequestFormat: model.RequestFormat,
		})
	}
	return result
}

func defaultModelIfAvailable(defaultModel string, models []dto.AIProxyModelOption) string {
	defaultModel = strings.TrimSpace(defaultModel)
	if defaultModel == "" {
		return ""
	}
	for _, model := range models {
		if strings.TrimSpace(model.ID) == defaultModel {
			return defaultModel
		}
	}
	return ""
}
