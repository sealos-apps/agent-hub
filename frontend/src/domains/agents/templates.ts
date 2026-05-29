import cowagentLogo from "../../assets/cowagent-logo.png?inline";
import hermesAgentLogo from "../../assets/hermes-agent-logo.png?inline";
import openclawLogo from "../../assets/openclaw-logo.jpg?inline";
import type {
  AgentBlueprint,
  AgentHubRegion,
  AgentTemplateCatalogItem,
  AgentTemplateDefinition,
  ResourcePreset,
  TemplateModelOption,
  TemplateModelType,
  TemplateModelIntegrationSlot,
} from "./types";
import {
  flattenModelTypes,
  normalizeModelTypes,
} from "./modelCapabilities";

export const RESOURCE_PRESETS: ResourcePreset[] = [
  {
    id: "minimum",
    label: "最小",
    description: "1c2g · 轻量运行",
    cpu: "1000m",
    memory: "2048Mi",
  },
  {
    id: "recommended",
    label: "推荐",
    description: "2c4g · 默认配置",
    cpu: "2000m",
    memory: "4096Mi",
  },
  {
    id: "luxury",
    label: "豪华",
    description: "4c8g · 更高性能",
    cpu: "4000m",
    memory: "8192Mi",
  },
  {
    id: "custom",
    label: "自定义",
    description: "手动输入 CPU / 内存",
    cpu: "",
    memory: "",
  },
];

const TEMPLATE_LOGOS: Record<string, string> = {
  cowagent: cowagentLogo,
  "hermes-agent": hermesAgentLogo,
  openclaw: openclawLogo,
};

export const resolveResourcePreset = (cpu = "", memory = "") => {
  const match = RESOURCE_PRESETS.find(
    (preset) => preset.cpu === cpu && preset.memory === memory,
  );
  return match?.id || "custom";
};

export const resolveTemplateLogo = (logoKey = "") =>
  TEMPLATE_LOGOS[String(logoKey || "").trim()] ||
  TEMPLATE_LOGOS["hermes-agent"];

export const hydrateTemplateCatalogItem = (
  template: AgentTemplateCatalogItem,
): AgentTemplateDefinition => {
  const modelTypes = normalizeModelTypes(template.modelTypes || [], template.modelOptions || []);
  const modelOptions = template.modelOptions?.length
    ? template.modelOptions
    : flattenModelTypes(modelTypes);

  return {
    ...template,
    modelOptions,
    modelTypes,
    logo: resolveTemplateLogo(template.presentation.logoKey || template.id),
    brandColor: template.presentation.brandColor,
    docsLabel: template.presentation.docsLabel,
    defaultWorkingDirectory: template.workingDir,
  };
};

export const hydrateTemplateCatalog = (
  templates: AgentTemplateCatalogItem[] = [],
) => templates.map(hydrateTemplateCatalogItem);

export const indexTemplatesById = (templates: AgentTemplateDefinition[] = []) =>
  Object.fromEntries(
    templates.map((template) => [template.id, template]),
  ) as Record<string, AgentTemplateDefinition>;

export const findTemplateById = (
  templates: AgentTemplateDefinition[] = [],
  templateId = "",
) => templates.find((template) => template.id === templateId) || null;

export const getDefaultModelOption = (
  template?: Pick<AgentTemplateDefinition, "modelOptions"> | null,
) => template?.modelOptions?.[0] || null;

export const getModelOptionByValue = (
  template: Pick<AgentTemplateDefinition, "modelOptions"> | null | undefined,
  value = "",
): TemplateModelOption | null =>
  template?.modelOptions?.find((option) => option.value === value) || null;

export const getTemplateModelSlots = (
  template?: Pick<AgentTemplateDefinition, "modelIntegration"> | null,
) => template?.modelIntegration?.slots?.filter((slot) => slot.key) || [];

export const hasTemplateModelSlots = (
  template?: Pick<AgentTemplateDefinition, "modelIntegration"> | null,
) => getTemplateModelSlots(template).length > 0;

export const getTemplateLocalizedText = (
  value: Record<string, string> | undefined,
  locale = "zh-CN",
) => {
  if (locale === "en-US") {
    return value?.en || "";
  }
  return value?.zh || "";
};

export const filterModelTypesForSlot = (
  modelTypes: TemplateModelType[] = [],
  slot: Pick<TemplateModelIntegrationSlot, "modelTypes">,
) => {
  const allowedTypes = new Set(slot.modelTypes || []);
  if (!allowedTypes.size) {
    return modelTypes;
  }
  return modelTypes.filter((type) => allowedTypes.has(type.key));
};

export const filterModelOptionsForSlot = (
  modelOptions: TemplateModelOption[] = [],
  modelTypes: TemplateModelType[] = [],
  slot: Pick<TemplateModelIntegrationSlot, "modelTypes">,
) => {
  const allowedTypes = new Set(slot.modelTypes || []);
  if (!allowedTypes.size) {
    return modelOptions;
  }
  const allowedValues = new Set(
    modelTypes
      .filter((type) => allowedTypes.has(type.key))
      .flatMap((type) => type.models.map((model) => model.value)),
  );
  return modelOptions.filter((option) => allowedValues.has(option.value));
};

export const buildModelSlotsPayload = (
  modelSlots: Record<string, string> = {},
) =>
  Object.fromEntries(
    Object.entries(modelSlots)
      .map(([key, value]) => [key, String(value || "").trim()])
      .filter(([, value]) => value),
  ) as Record<string, string>;

export const createEmptyBlueprint = (): AgentBlueprint => ({
  appName: "",
  aliasName: "",
  namespace: "",
  apiKey: "",
  apiUrl: "",
  domainPrefix: "",
  fullDomain: "",
  image: "",
  productType: "",
  state: "Running",
  runtimeClassName: "devbox-runtime",
  storageLimit: "10Gi",
  port: 0,
  cpu: "2000m",
  memory: "4096Mi",
  profile: "recommended",
  serviceType: "ClusterIP",
  protocol: "TCP",
  user: "",
  workingDir: "",
  argsText: "",
  modelProvider: "",
  modelBaseURL: "",
  model: "",
  modelAPIMode: "",
  modelSlots: {},
  hasModelAPIKey: false,
  keySource: "unset",
  settingsValues: {},
});

export const describeRegionModelPreset = (
  region: AgentHubRegion,
  template: AgentTemplateDefinition,
) => {
  if (!template.modelOptions.length) {
    return "当前模板没有预设模型。";
  }
  if (region === "cn") {
    return "当前为 CN 模型预设，模型列表完全由后端模板目录提供。";
  }
  return "当前为 US 模型预设，模型列表完全由后端模板目录提供。";
};

export const getStatusText = (
  status: "running" | "creating" | "stopped" | "error",
) => {
  switch (status) {
    case "running":
      return "运行中";
    case "creating":
      return "创建中";
    case "stopped":
      return "已暂停";
    case "error":
      return "异常";
  }
};
