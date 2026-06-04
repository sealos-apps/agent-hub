package handler

import (
	"net/http"
	"sort"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func ListTemplates(c *gin.Context) {
	cfg := runtimeConfig(c)
	region, regionErr := requiredRegion(cfg)
	if regionErr != nil {
		writeAppError(c, http.StatusInternalServerError, regionErr)
		return
	}

	definitions, err := agenttemplate.ListFromSource(templateSourceFromConfig(cfg))
	if err != nil {
		writeAppError(c, http.StatusInternalServerError, appErr.New(appErr.CodeKubernetesOperation, err.Error()))
		return
	}

	items := make([]dto.TemplateCatalogItem, 0, len(definitions))
	for _, definition := range definitions {
		items = append(items, toTemplateCatalogItem(definition, region))
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].ID < items[j].ID
	})

	writeSuccess(c, http.StatusOK, dto.TemplateCatalogResponse{
		Items:  items,
		Region: region,
	})
}

func requiredRegion(cfg config.Config) (string, *appErr.AppError) {
	region := strings.TrimSpace(cfg.Region)
	if region == "" {
		return "", appErr.New(appErr.CodeNotImplemented, "REGION is required").WithDetails(map[string]any{
			"field":  "REGION",
			"reason": "missing_or_invalid",
		})
	}
	return region, nil
}

func toTemplateCatalogItem(definition agenttemplate.Definition, region string) dto.TemplateCatalogItem {
	return dto.TemplateCatalogItem{
		ID:                   definition.ID,
		Name:                 definition.Name,
		ShortName:            definition.ShortName,
		Description:          definition.Description,
		Image:                definition.Image,
		Port:                 definition.Port,
		DefaultArgs:          append([]string(nil), definition.DefaultArgs...),
		WorkingDir:           definition.WorkingDir,
		User:                 definition.User,
		BackendSupported:     definition.BackendSupported,
		CreateDisabledReason: definition.CreateDisabledReason,
		Presentation: dto.TemplatePresentation{
			LogoKey:    definition.Presentation.LogoKey,
			BrandColor: definition.Presentation.BrandColor,
			DocsLabel:  definition.Presentation.DocsLabel,
		},
		Workspaces:       toTemplateWorkspaceItems(definition.Workspaces),
		Access:           toTemplateAccessItems(definition.Access),
		Actions:          toTemplateActionItems(definition.Actions),
		Settings:         toTemplateSettings(definition, region),
		ModelOptions:     toTemplateModelOptions(definition.RegionModelPresets[region]),
		ModelTypes:       toTemplateModelTypes(definition.RegionModelTypes[region]),
		ModelIntegration: toTemplateModelIntegration(definition.ModelIntegration),
	}
}

func toTemplateWorkspaceItems(items []agenttemplate.WorkspaceDefinition) []dto.TemplateWorkspaceItem {
	result := make([]dto.TemplateWorkspaceItem, 0, len(items))
	for _, item := range items {
		result = append(result, dto.TemplateWorkspaceItem{
			Key:   item.Key,
			Label: item.Label,
		})
	}
	return result
}

func toTemplateAccessItems(items []agenttemplate.AccessDefinition) []dto.TemplateAccessItem {
	result := make([]dto.TemplateAccessItem, 0, len(items))
	for _, item := range items {
		result = append(result, dto.TemplateAccessItem{
			Key:      item.Key,
			Label:    item.Label,
			Path:     item.Path,
			Auth:     item.Auth,
			RootPath: item.RootPath,
			Modes:    append([]string(nil), item.Modes...),
		})
	}
	return result
}

func toTemplateActionItems(items []agenttemplate.ActionDefinition) []dto.TemplateActionItem {
	result := make([]dto.TemplateActionItem, 0, len(items))
	for _, item := range items {
		result = append(result, dto.TemplateActionItem{
			Key:   item.Key,
			Label: item.Label,
		})
	}
	return result
}

func toTemplateSettings(definition agenttemplate.Definition, region string) dto.TemplateSettingsSchema {
	return dto.TemplateSettingsSchema{
		Runtime: toSettingFields(definition.Settings.Runtime, definition, region, nil),
		Agent:   toSettingFields(definition.Settings.Agent, definition, region, nil),
	}
}

func toTemplateModelOptions(items []agenttemplate.ModelPreset) []dto.TemplateModelOption {
	result := make([]dto.TemplateModelOption, 0, len(items))
	for _, item := range items {
		result = append(result, toTemplateModelOption(item))
	}
	return result
}

func toTemplateModelTypes(items []agenttemplate.ModelType) []dto.TemplateModelType {
	result := make([]dto.TemplateModelType, 0, len(items))
	for _, item := range items {
		result = append(result, dto.TemplateModelType{
			Key:         item.Key,
			Label:       item.Label,
			Description: item.Description,
			Models:      toTemplateModelOptions(item.Models),
		})
	}
	return result
}

func toTemplateModelOption(item agenttemplate.ModelPreset) dto.TemplateModelOption {
	return dto.TemplateModelOption{
		Value:            item.Value,
		Label:            item.Label,
		Helper:           item.Helper,
		Provider:         item.Provider,
		APIMode:          item.APIMode,
		Kind:             item.Kind,
		RuntimeProvider:  item.RuntimeProvider,
		Category:         item.Category,
		Capabilities:     append([]string(nil), item.Capabilities...),
		InputModalities:  append([]string(nil), item.InputModalities...),
		OutputModalities: append([]string(nil), item.OutputModalities...),
	}
}

func toTemplateModelIntegration(item agenttemplate.ModelIntegration) *dto.TemplateModelIntegration {
	if strings.TrimSpace(item.Type) == "" && strings.TrimSpace(item.Client) == "" && len(item.Slots) == 0 {
		return nil
	}
	return &dto.TemplateModelIntegration{
		Type:   item.Type,
		Client: item.Client,
		Provider: dto.TemplateModelIntegrationProvider{
			ID:        item.Provider.ID,
			Name:      toTemplateLocalizedText(item.Provider.Name),
			BaseURL:   dto.TemplateModelIntegrationValueSource{Source: item.Provider.BaseURL.Source},
			APIKeyEnv: item.Provider.APIKeyEnv,
		},
		Slots: toTemplateModelIntegrationSlots(item.Slots),
	}
}

func toTemplateModelIntegrationSlots(items []agenttemplate.ModelIntegrationSlot) []dto.TemplateModelIntegrationSlot {
	result := make([]dto.TemplateModelIntegrationSlot, 0, len(items))
	for _, item := range items {
		result = append(result, dto.TemplateModelIntegrationSlot{
			Key:           item.Key,
			Label:         toTemplateLocalizedText(item.Label),
			Required:      item.Required,
			Mutable:       item.Mutable,
			DefaultModels: copyStringMap(item.DefaultModels),
			ModelTypes:    append([]string(nil), item.ModelTypes...),
		})
	}
	return result
}

func toTemplateLocalizedText(item agenttemplate.LocalizedText) dto.TemplateLocalizedText {
	return dto.TemplateLocalizedText(copyStringMap(item))
}

func copyStringMap(item map[string]string) map[string]string {
	if item == nil {
		return nil
	}
	result := make(map[string]string, len(item))
	for key, value := range item {
		result[key] = value
	}
	return result
}

func toSettingFields(
	fields []agenttemplate.SettingField,
	definition agenttemplate.Definition,
	region string,
	values map[string]any,
) []dto.AgentSettingField {
	result := make([]dto.AgentSettingField, 0, len(fields))
	for _, field := range fields {
		item := dto.AgentSettingField{
			Key:         field.Key,
			Label:       field.Label,
			Type:        field.Type,
			Description: field.Description,
			Required:    field.Required,
			ReadOnly:    field.ReadOnly,
			Binding: dto.AgentSettingBinding{
				Kind: field.Binding.Kind,
				Key:  field.Binding.Key,
				Name: field.Binding.Name,
			},
			Options: make([]dto.AgentSettingOption, 0, len(field.Options)),
		}
		for _, option := range field.Options {
			item.Options = append(item.Options, dto.AgentSettingOption{
				Value:       option.Value,
				Label:       option.Label,
				Description: option.Description,
			})
		}
		if field.Key == "model" {
			item.Options = append(item.Options, modelOptionsAsSettings(definition.RegionModelPresets[region])...)
		}
		if values != nil {
			item.Value = values[field.Key]
		}
		result = append(result, item)
	}
	return result
}

func modelOptionsAsSettings(items []agenttemplate.ModelPreset) []dto.AgentSettingOption {
	result := make([]dto.AgentSettingOption, 0, len(items))
	for _, item := range items {
		description := strings.TrimSpace(item.Helper)
		result = append(result, dto.AgentSettingOption{
			Value:       item.Value,
			Label:       item.Label,
			Description: description,
		})
	}
	return result
}
