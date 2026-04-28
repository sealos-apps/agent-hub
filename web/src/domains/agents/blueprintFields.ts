import type { AgentBlueprint, AgentSettingField } from "./types";

const trimBindingKind = (field: AgentSettingField) =>
  String(field.binding?.kind || "").trim();
const trimBindingKey = (field: AgentSettingField) =>
  String(field.binding?.key || "").trim();

export const readBlueprintSettingValue = (
  blueprint: AgentBlueprint,
  field: AgentSettingField,
): string => {
  const bindingKind = trimBindingKind(field);
  const bindingKey = trimBindingKey(field);

  if (bindingKind === "agent" || bindingKind === "derived") {
    switch (bindingKey) {
      case "modelProvider":
        return blueprint.modelProvider;
      case "model":
        return blueprint.model;
      case "modelBaseURL":
        return blueprint.modelBaseURL;
      case "keySource":
        return blueprint.keySource;
      default:
        break;
    }
  }

  return blueprint.settingsValues[field.key] || "";
};

export const writeBlueprintSettingValue = (
  blueprint: AgentBlueprint,
  field: AgentSettingField,
  value: string,
): AgentBlueprint => {
  const bindingKind = trimBindingKind(field);
  const bindingKey = trimBindingKey(field);

  if (bindingKind === "agent") {
    switch (bindingKey) {
      case "modelProvider":
        return { ...blueprint, modelProvider: value };
      case "model":
        return { ...blueprint, model: value };
      case "modelBaseURL":
        return { ...blueprint, modelBaseURL: value };
      default:
        break;
    }
  }

  return {
    ...blueprint,
    settingsValues: {
      ...blueprint.settingsValues,
      [field.key]: value,
    },
  };
};

export const getRequiredTemplateSettingError = (
  blueprint: AgentBlueprint,
  fields: AgentSettingField[] = [],
): string => {
  for (const field of fields) {
    if (!field.required) {
      continue;
    }
    const value = readBlueprintSettingValue(blueprint, field).trim();
    if (value) {
      continue;
    }
    if (field.readOnly) {
      return `${field.label} 未准备完成，请稍后重试`;
    }
    return `请填写${field.label}`;
  }
  return "";
};
