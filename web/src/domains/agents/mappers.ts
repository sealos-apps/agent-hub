import { getDefaultModelOption, resolveResourcePreset } from "./templates";
import type {
  AgentAccessItem,
  AgentActionItem,
  AgentBlueprint,
  AgentContract,
  AgentListItem,
  AgentRuntimeStatus,
  AgentSettingField,
  AgentWorkspaceItem,
  AgentTemplateDefinition,
  ClusterInfo,
} from "./types";

export const normalizeName = (value: string) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);

export const ensureDns1035Name = (value: string, fallback = "agent") => {
  const normalized = normalizeName(value) || normalizeName(fallback) || "agent";
  const candidate = /^[a-z]/.test(normalized) ? normalized : `a${normalized}`;
  return candidate.slice(0, 63).replace(/^-+|-+$/g, "") || "agent";
};

export const splitArgsText = (value = "") =>
  value
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const mapRawStatusToRuntimeStatus = (
  status = "",
): AgentRuntimeStatus => {
  const normalized = String(status || "").toLowerCase();

  if (
    normalized.includes("running") ||
    normalized.includes("healthy") ||
    normalized.includes("active")
  ) {
    return "running";
  }

  if (
    normalized.includes("pending") ||
    normalized.includes("creating") ||
    normalized.includes("initial") ||
    normalized.includes("starting") ||
    normalized.includes("updating") ||
    normalized.includes("deleting") ||
    normalized.includes("stopping")
  ) {
    return "creating";
  }

  if (normalized.includes("paused") || normalized.includes("stop")) {
    return "stopped";
  }

  return "error";
};

export const indexAccessItems = (items: AgentAccessItem[] = []) =>
  Object.fromEntries(items.map((item) => [item.key, item])) as Record<
    string,
    AgentAccessItem
  >;

export const indexActionItems = (items: AgentActionItem[] = []) =>
  Object.fromEntries(items.map((item) => [item.key, item])) as Record<
    string,
    AgentActionItem
  >;

export const indexWorkspaceItems = (items: AgentWorkspaceItem[] = []) =>
  Object.fromEntries(items.map((item) => [item.key, item])) as Record<
    string,
    AgentWorkspaceItem
  >;

export const getSettingFieldValue = (
  fields: AgentSettingField[] = [],
  key = "",
) => {
  const field = fields.find((item) => item.key === key);
  return field?.value;
};

export const getSettingFieldStringValue = (
  fields: AgentSettingField[] = [],
  key = "",
) => {
  const value = getSettingFieldValue(fields, key);
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  return String(value);
};

export const getAccessItem = (
  item: Pick<AgentListItem, "accessByKey">,
  key: string,
) => item.accessByKey[key] || null;

export const getActionItem = (
  item: Pick<AgentListItem, "actionsByKey">,
  key: string,
) => item.actionsByKey[key] || null;

export const getWorkspaceItem = (
  item: Pick<AgentListItem, "workspacesByKey">,
  key: string,
) => item.workspacesByKey[key] || null;

const collectBlueprintSettingsValues = (fields: AgentSettingField[] = []) =>
  fields.reduce<Record<string, string>>((result, field) => {
    if (typeof field.value === "string") {
      result[field.key] = field.value;
      return result;
    }
    if (field.value == null) {
      result[field.key] = "";
      return result;
    }
    result[field.key] = String(field.value);
    return result;
  }, {});

export const createBlueprintFromAgentItem = (
  item: AgentListItem,
): AgentBlueprint => {
  const apiAccess = getAccessItem(item, "api");
  const defaultModelOption = getDefaultModelOption(item.template);

  return {
    appName: item.name,
    aliasName: item.aliasName || item.name,
    namespace: item.namespace,
    apiKey: "",
    apiUrl: apiAccess?.url || "",
    domainPrefix: "",
    fullDomain: "",
    image: item.template.image,
    productType: item.templateId,
    state: item.rawStatus === "Paused" ? "Paused" : "Running",
    runtimeClassName:
      item.contract.runtime.runtimeClassName || "devbox-runtime",
    storageLimit: item.storage,
    port: item.template.port,
    cpu: item.cpu,
    memory: item.memory,
    profile: resolveResourcePreset(item.cpu, item.memory),
    serviceType: "ClusterIP",
    protocol: "TCP",
    user: item.contract.runtime.user || item.template.user,
    workingDir: item.workingDir || item.template.workingDir,
    argsText: item.template.defaultArgs.join(" "),
    modelProvider: item.modelProvider || defaultModelOption?.provider || "",
    modelBaseURL: item.modelBaseURL || "",
    model: item.model || defaultModelOption?.value || "",
    hasModelAPIKey: item.hasModelAPIKey,
    keySource: item.keySource,
    settingsValues: collectBlueprintSettingsValues(
      item.contract.settings.agent,
    ),
  };
};

const buildAgentListItem = (
  contract: AgentContract,
  template: AgentTemplateDefinition,
  clusterInfo: ClusterInfo | null,
): AgentListItem => {
  const accessByKey = indexAccessItems(contract.access);
  const actionsByKey = indexActionItems(contract.actions);
  const workspacesByKey = indexWorkspaceItems(contract.workspaces);
  const status = mapRawStatusToRuntimeStatus(contract.core.status);
  const apiAccess = accessByKey.api || null;
  const terminalAccess = accessByKey.terminal || null;
  const sshAccess = accessByKey.ssh || null;
  const ideAccess = accessByKey.ide || null;
  const webUIAccess = accessByKey["web-ui"] || null;
  const chatAction = actionsByKey["open-chat"] || null;
  const terminalAction = actionsByKey["open-terminal"] || null;
  const settingsAction = actionsByKey["open-settings"] || null;
  const keySource =
    getSettingFieldStringValue(contract.settings.agent, "keySource") || "unset";

  return {
    id: contract.core.name,
    name: contract.core.name,
    aliasName: contract.core.aliasName || "",
    namespace: contract.core.namespace || clusterInfo?.namespace || "",
    owner: clusterInfo?.operator || "Sealos",
    status,
    statusText: contract.core.statusText || contract.core.status,
    updatedAt: contract.core.createdAt || "",
    cpu: contract.runtime.cpu,
    memory: contract.runtime.memory,
    storage: contract.runtime.storage,
    workingDir: contract.runtime.workingDir || template.workingDir,
    templateId: template.id,
    template,
    contract,
    workspaces: contract.workspaces,
    workspacesByKey,
    access: contract.access,
    accessByKey,
    actions: contract.actions,
    actionsByKey,
    rawStatus: contract.core.status,
    modelProvider: contract.runtime.modelProvider || "",
    modelBaseURL: contract.runtime.modelBaseURL || "",
    model: contract.runtime.model || "",
    hasModelAPIKey: Boolean(contract.runtime.hasModelAPIKey),
    keySource,
    ready: Boolean(contract.core.ready),
    bootstrapPhase: contract.core.bootstrapPhase || "",
    bootstrapMessage: contract.core.bootstrapMessage || "",
    chatAvailable: Boolean(chatAction?.enabled && apiAccess?.enabled),
    chatDisabledReason: chatAction?.reason || apiAccess?.reason || "",
    terminalAvailable: Boolean(
      terminalAction?.enabled && terminalAccess?.enabled,
    ),
    terminalDisabledReason:
      terminalAction?.reason || terminalAccess?.reason || "",
    settingsAvailable: Boolean(settingsAction?.enabled),
    webUIAvailable: Boolean(webUIAccess?.enabled),
    sshAvailable: Boolean(sshAccess?.enabled),
    ideAvailable: Boolean(ideAccess?.enabled),
    apiBaseURL: apiAccess?.url || "",
    sshAccess,
    ideAccess,
    webUIAccess,
  };
};

export const mapBackendAgentsToListItems = (
  items: AgentContract[] = [],
  templates: AgentTemplateDefinition[] = [],
  clusterInfo: ClusterInfo | null,
): AgentListItem[] => {
  const templatesById = Object.fromEntries(
    templates.map((template) => [template.id, template]),
  ) as Record<string, AgentTemplateDefinition>;

  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const template = templatesById[item.core.templateId];
      if (!template) {
        return null;
      }
      return buildAgentListItem(item, template, clusterInfo);
    })
    .filter(Boolean) as AgentListItem[];
};
