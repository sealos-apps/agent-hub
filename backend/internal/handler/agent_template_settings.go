package handler

import (
	"fmt"
	"net/url"
	"strings"

	"k8s.io/apimachinery/pkg/api/resource"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/dto"
	appErr "github.com/nightwhite/Agent-Hub/pkg/errors"
)

func validateTemplateSettingsPayload(
	payload map[string]any,
	fields []agenttemplate.SettingField,
	templateDef agenttemplate.Definition,
	region string,
	requireRequired bool,
	fieldPrefix string,
) *appErr.AppError {
	fieldIndex := make(map[string]agenttemplate.SettingField, len(fields))
	for _, field := range fields {
		fieldIndex[strings.TrimSpace(field.Key)] = field
	}

	for key, rawValue := range payload {
		field, ok := fieldIndex[strings.TrimSpace(key)]
		if !ok {
			return validationFieldError(fieldPrefix+key, "unsupported_field", fmt.Sprint(rawValue))
		}
		if field.ReadOnly && strings.TrimSpace(field.Binding.Kind) == "derived" {
			return validationFieldError(fieldPrefix+key, "read_only", fmt.Sprint(rawValue))
		}
		if err := validateTemplateSettingValue(fieldPrefix+key, field, rawValue, templateDef, region); err != nil {
			return err
		}
	}

	if !requireRequired {
		return nil
	}

	for _, field := range fields {
		if (field.ReadOnly && strings.TrimSpace(field.Binding.Kind) == "derived") || !field.Required {
			continue
		}
		value, ok := payload[field.Key]
		if !ok {
			return validationFieldError(fieldPrefix+field.Key, "required", "")
		}
		if strValue, ok := value.(string); ok && strings.TrimSpace(strValue) == "" {
			return validationFieldError(fieldPrefix+field.Key, "cannot_be_empty", strValue)
		}
	}

	return nil
}

func validateTemplateSettingValue(
	fieldPath string,
	field agenttemplate.SettingField,
	rawValue any,
	templateDef agenttemplate.Definition,
	region string,
) *appErr.AppError {
	value, ok := rawValue.(string)
	if !ok {
		return validationFieldError(fieldPath, "invalid_type", fmt.Sprintf("%T", rawValue))
	}
	trimmed := strings.TrimSpace(value)

	switch strings.TrimSpace(field.Type) {
	case "select":
		if trimmed == "" {
			return validationFieldError(fieldPath, "cannot_be_empty", value)
		}
		for _, option := range resolvedTemplateSettingOptions(field, templateDef, region) {
			if strings.TrimSpace(option.Value) == trimmed {
				return nil
			}
		}
		return validationFieldError(fieldPath, "unsupported_field", value)
	case "url":
		if trimmed == "" {
			if field.Required {
				return validationFieldError(fieldPath, "cannot_be_empty", value)
			}
			return nil
		}
		return validateURLField(fieldPath, trimmed)
	case "quantity":
		if trimmed == "" {
			return validationFieldError(fieldPath, "cannot_be_empty", value)
		}
		if _, err := resource.ParseQuantity(trimmed); err != nil {
			return validationFieldError(fieldPath, "invalid_quantity", value)
		}
		return nil
	default:
		if field.Required && trimmed == "" {
			return validationFieldError(fieldPath, "cannot_be_empty", value)
		}
		return nil
	}
}

func resolvedTemplateSettingOptions(
	field agenttemplate.SettingField,
	templateDef agenttemplate.Definition,
	region string,
) []agenttemplate.SettingOption {
	options := append([]agenttemplate.SettingOption(nil), field.Options...)
	if strings.EqualFold(strings.TrimSpace(field.Key), "model") {
		for _, preset := range templateDef.RegionModelPresets[region] {
			options = append(options, agenttemplate.SettingOption{
				Value:       preset.Value,
				Label:       preset.Label,
				Description: preset.Helper,
			})
		}
	}
	return options
}

func buildTemplateSettingsUpdate(
	payload map[string]any,
	fields []agenttemplate.SettingField,
) (dto.UpdateAgentRequest, *appErr.AppError) {
	update := dto.UpdateAgentRequest{
		EnvValues:        map[string]*string{},
		AnnotationValues: map[string]*string{},
	}

	for _, field := range fields {
		rawValue, ok := payload[field.Key]
		if !ok {
			continue
		}

		value, _ := rawValue.(string)
		trimmed := strings.TrimSpace(value)

		switch strings.TrimSpace(field.Binding.Kind) {
		case "agent":
			switch strings.TrimSpace(field.Binding.Key) {
			case "modelProvider":
				update.ModelProvider = stringPtr(trimmed)
			case "modelBaseURL":
				update.ModelBaseURL = stringPtr(trimmed)
			case "model":
				update.Model = stringPtr(trimmed)
			case "modelAPIKey":
				update.ModelAPIKey = stringPtr(trimmed)
			default:
				return dto.UpdateAgentRequest{}, validationFieldError("settings."+field.Key, "unsupported_field", value)
			}
		case "env":
			update.EnvValues[strings.TrimSpace(field.Binding.Name)] = stringPtr(trimmed)
		case "annotation":
			update.AnnotationValues[strings.TrimSpace(field.Binding.Name)] = stringPtr(trimmed)
		case "derived":
			return dto.UpdateAgentRequest{}, validationFieldError("settings."+field.Key, "read_only", value)
		default:
			return dto.UpdateAgentRequest{}, validationFieldError("settings."+field.Key, "unsupported_field", value)
		}

		if field.Rebootstrap {
			update.Rebootstrap = true
		}
	}

	return update, nil
}

func stringPtr(value string) *string {
	next := value
	return &next
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func validateURLField(fieldPath, value string) *appErr.AppError {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return validationFieldError(fieldPath, "required", value)
	}
	parsed, err := url.Parse(trimmed)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" {
		return validationFieldError(fieldPath, "invalid_url", value)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return validationFieldError(fieldPath, "unsupported_scheme", value)
	}
	return nil
}
