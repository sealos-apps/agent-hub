package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"

	"k8s.io/apimachinery/pkg/api/resource"

	"github.com/nightwhite/Agent-Hub/internal/agenttemplate"
	"github.com/nightwhite/Agent-Hub/internal/config"
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

func applyTemplateModelMetadata(
	update *dto.UpdateAgentRequest,
	templateDef agenttemplate.Definition,
	region string,
) {
	if update == nil {
		return
	}
	model := stringValue(update.Model)
	if model == "" {
		return
	}
	for _, preset := range templateDef.RegionModelPresets[region] {
		if strings.TrimSpace(preset.Value) != model {
			continue
		}
		if update.ModelProvider == nil && strings.TrimSpace(preset.Provider) != "" {
			update.ModelProvider = stringPtr(preset.Provider)
		}
		if strings.TrimSpace(preset.APIMode) != "" {
			update.ModelAPIMode = stringPtr(preset.APIMode)
		}
		return
	}
}

func buildModelSlotsUpdate(
	payload map[string]string,
	templateDef agenttemplate.Definition,
	cfg config.Config,
	region string,
	requireRequired bool,
) (dto.UpdateAgentRequest, *appErr.AppError) {
	modelSlots, err := resolveModelSlotSelections(payload, templateDef, region, requireRequired, !requireRequired)
	if err != nil {
		return dto.UpdateAgentRequest{}, err
	}
	update := dto.UpdateAgentRequest{
		ModelSlots: modelSlots,
	}
	if main, ok := modelSlots["main"]; ok {
		update.ModelProvider = stringPtr(main.Provider)
		update.Model = stringPtr(main.Model)
		update.ModelAPIMode = stringPtr(main.APIMode)
		baseURL, err := resolveModelIntegrationBaseURL(templateDef, cfg)
		if err != nil {
			return dto.UpdateAgentRequest{}, err
		}
		update.ModelBaseURL = stringPtr(baseURL)
	}
	return update, nil
}

func resolveModelIntegrationBaseURL(
	templateDef agenttemplate.Definition,
	cfg config.Config,
) (string, *appErr.AppError) {
	source := strings.TrimSpace(templateDef.ModelIntegration.Provider.BaseURL.Source)
	switch source {
	case "workspace", "system.aiProxyModelBaseURL":
		baseURL := strings.TrimSpace(cfg.AIProxyModelBaseURL)
		if baseURL == "" {
			return "", validationFieldError("modelIntegration.provider.baseURL.source", "required", source)
		}
		return baseURL, nil
	case "":
		return "", validationFieldError("modelIntegration.provider.baseURL.source", "required", source)
	default:
		return "", validationFieldError("modelIntegration.provider.baseURL.source", "unsupported_field", source)
	}
}

func resolveModelSlotSelections(
	payload map[string]string,
	templateDef agenttemplate.Definition,
	region string,
	requireRequired bool,
	requireMutable bool,
) (map[string]dto.ModelSlotSelection, *appErr.AppError) {
	if len(templateDef.ModelIntegration.Slots) == 0 && len(payload) == 0 {
		return nil, nil
	}
	slotIndex := map[string]agenttemplate.ModelIntegrationSlot{}
	for _, slot := range templateDef.ModelIntegration.Slots {
		key := strings.TrimSpace(slot.Key)
		if key != "" {
			slotIndex[key] = slot
		}
	}
	result := map[string]dto.ModelSlotSelection{}
	for key, value := range payload {
		trimmedKey := strings.TrimSpace(key)
		slot, ok := slotIndex[trimmedKey]
		if !ok {
			return nil, validationFieldError("modelSlots."+trimmedKey, "unsupported_field", value)
		}
		if requireMutable && !slot.Mutable {
			return nil, validationFieldError("modelSlots."+trimmedKey, "read_only", value)
		}
		selection, err := resolveModelSlotSelection(trimmedKey, strings.TrimSpace(value), slot, templateDef, region)
		if err != nil {
			return nil, err
		}
		result[trimmedKey] = selection
	}
	if requireRequired {
		for _, slot := range templateDef.ModelIntegration.Slots {
			key := strings.TrimSpace(slot.Key)
			if key == "" || !slot.Required {
				continue
			}
			if _, ok := result[key]; ok {
				continue
			}
			defaultModel := strings.TrimSpace(slot.DefaultModels[region])
			if defaultModel == "" {
				return nil, validationFieldError("modelSlots."+key, "required", "")
			}
			selection, err := resolveModelSlotSelection(key, defaultModel, slot, templateDef, region)
			if err != nil {
				return nil, err
			}
			result[key] = selection
		}
	}
	if len(result) == 0 {
		return nil, nil
	}
	return result, nil
}

func resolveModelSlotSelection(
	slotKey string,
	model string,
	slot agenttemplate.ModelIntegrationSlot,
	templateDef agenttemplate.Definition,
	region string,
) (dto.ModelSlotSelection, *appErr.AppError) {
	if model == "" {
		return dto.ModelSlotSelection{}, validationFieldError("modelSlots."+slotKey, "cannot_be_empty", model)
	}
	allowedTypes := map[string]bool{}
	for _, modelType := range slot.ModelTypes {
		trimmedType := strings.TrimSpace(modelType)
		if trimmedType != "" {
			allowedTypes[trimmedType] = true
		}
	}
	if len(allowedTypes) == 0 {
		return dto.ModelSlotSelection{}, validationFieldError("modelIntegration.slots."+slotKey+".modelTypes", "required", "")
	}
	for _, modelType := range templateDef.RegionModelTypes[region] {
		if !allowedTypes[strings.TrimSpace(modelType.Key)] {
			continue
		}
		for _, candidate := range modelType.Models {
			if strings.TrimSpace(candidate.Value) != model {
				continue
			}
			provider := strings.TrimSpace(candidate.Provider)
			apiMode := strings.TrimSpace(candidate.APIMode)
			kind := strings.TrimSpace(candidate.Kind)
			if provider == "" || apiMode == "" || kind == "" {
				return dto.ModelSlotSelection{}, validationFieldError("modelSlots."+slotKey, "unsupported_field", model)
			}
			if !modelKindAllowedForSlot(slotKey, kind) {
				return dto.ModelSlotSelection{}, validationFieldError("modelSlots."+slotKey, "unsupported_field", model)
			}
			return dto.ModelSlotSelection{
				Provider: provider,
				Model:    model,
				APIMode:  apiMode,
				Kind:     kind,
			}, nil
		}
	}
	return dto.ModelSlotSelection{}, validationFieldError("modelSlots."+slotKey, "unsupported_field", model)
}

func modelKindAllowedForSlot(slotKey, kind string) bool {
	switch strings.TrimSpace(slotKey) {
	case "main":
		return kind == "llm" || kind == "vision"
	case "vision":
		return kind == "llm" || kind == "vision"
	case "image":
		return kind == "image_generation"
	case "video":
		return kind == "video_generation"
	case "asr":
		return kind == "asr"
	case "tts":
		return kind == "tts"
	case "embedding":
		return kind == "embedding"
	default:
		return true
	}
}

func mergeUpdateModelSlots(target *dto.UpdateAgentRequest, source dto.UpdateAgentRequest) {
	if target == nil {
		return
	}
	if len(source.ModelSlots) > 0 {
		target.ModelSlots = source.ModelSlots
	}
	if source.ModelProvider != nil {
		target.ModelProvider = source.ModelProvider
	}
	if source.Model != nil {
		target.Model = source.Model
	}
	if source.ModelAPIMode != nil {
		target.ModelAPIMode = source.ModelAPIMode
	}
	if source.ModelBaseURL != nil {
		target.ModelBaseURL = source.ModelBaseURL
	}
}

func encodeModelSlotsAnnotation(modelSlots map[string]dto.ModelSlotSelection) (string, error) {
	if len(modelSlots) == 0 {
		return "", nil
	}
	raw, err := json.Marshal(modelSlots)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

func mergeModelSlotsAnnotation(
	current string,
	updates map[string]dto.ModelSlotSelection,
) (string, error) {
	if len(updates) == 0 {
		return strings.TrimSpace(current), nil
	}
	merged := map[string]dto.ModelSlotSelection{}
	if strings.TrimSpace(current) != "" {
		existing, err := decodeModelSlotsAnnotation(current)
		if err != nil {
			return "", err
		}
		for key, slot := range existing {
			merged[key] = slot
		}
	}
	for key, slot := range updates {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			continue
		}
		merged[trimmedKey] = dto.ModelSlotSelection{
			Provider: strings.TrimSpace(slot.Provider),
			Model:    strings.TrimSpace(slot.Model),
			APIMode:  strings.TrimSpace(slot.APIMode),
			Kind:     strings.TrimSpace(slot.Kind),
		}
	}
	return encodeModelSlotsAnnotation(merged)
}

func decodeModelSlotsAnnotation(value string) (map[string]dto.ModelSlotSelection, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil, nil
	}
	var modelSlots map[string]dto.ModelSlotSelection
	if err := json.Unmarshal([]byte(trimmed), &modelSlots); err != nil {
		return nil, err
	}
	if len(modelSlots) == 0 {
		return nil, errors.New("model slots annotation must be a non-empty object")
	}
	result := make(map[string]dto.ModelSlotSelection, len(modelSlots))
	for key, slot := range modelSlots {
		trimmedKey := strings.TrimSpace(key)
		if trimmedKey == "" {
			return nil, errors.New("model slot key is required")
		}
		provider := strings.TrimSpace(slot.Provider)
		model := strings.TrimSpace(slot.Model)
		apiMode := strings.TrimSpace(slot.APIMode)
		kind := strings.TrimSpace(slot.Kind)
		if provider == "" || model == "" || apiMode == "" || kind == "" {
			return nil, errors.New("model slot provider, model, apiMode, and kind are required")
		}
		result[trimmedKey] = dto.ModelSlotSelection{
			Provider: provider,
			Model:    model,
			APIMode:  apiMode,
			Kind:     kind,
		}
	}
	return result, nil
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
