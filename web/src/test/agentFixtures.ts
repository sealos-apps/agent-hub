import type {
  AgentAccessItem,
  AgentActionItem,
  AgentContract,
  AgentListItem,
  AgentTemplateDefinition,
  AgentTemplateId,
} from "../domains/agents/types";

export function createTemplateFixture(
  overrides: Partial<AgentTemplateDefinition> = {},
): AgentTemplateDefinition {
  return {
    id: "hermes-agent",
    name: "Hermes Agent",
    shortName: "Hermes",
    description: "fixture",
    image: "fixture:image",
    port: 8642,
    defaultArgs: ["gateway", "run"],
    workingDir: "/opt/hermes",
    user: "hermes",
    backendSupported: true,
    createDisabledReason: "",
    presentation: {
      logoKey: "hermes-agent",
      brandColor: "#2563eb",
      docsLabel: "对话 + 终端",
    },
    workspaces: [
      { key: "overview", label: "概览" },
      { key: "chat", label: "对话" },
      { key: "terminal", label: "终端" },
      { key: "files", label: "文件" },
      { key: "settings", label: "设置" },
    ],
    access: [],
    actions: [],
    settings: {
      runtime: [
        {
          key: "cpu",
          label: "CPU",
          type: "quantity",
          binding: { kind: "runtime", key: "cpu" },
        },
        {
          key: "memory",
          label: "内存",
          type: "quantity",
          binding: { kind: "runtime", key: "memory" },
        },
        {
          key: "storage",
          label: "存储",
          type: "quantity",
          binding: { kind: "runtime", key: "storage" },
        },
      ],
      agent: [
        {
          key: "provider",
          label: "Provider",
          type: "select",
          binding: { kind: "agent", key: "modelProvider" },
        },
        {
          key: "model",
          label: "模型",
          type: "select",
          binding: { kind: "agent", key: "model" },
        },
        {
          key: "baseURL",
          label: "Base URL",
          type: "url",
          binding: { kind: "agent", key: "modelBaseURL" },
        },
        {
          key: "keySource",
          label: "密钥来源",
          type: "text",
          readOnly: true,
          binding: { kind: "derived", key: "keySource" },
        },
      ],
    },
    modelOptions: [],
    logo: "/brand/agent-hub.svg",
    brandColor: "#2563eb",
    docsLabel: "对话 + 终端",
    defaultWorkingDirectory: "/opt/hermes",
    ...overrides,
  };
}

function indexByKey<T extends { key: string }>(items: T[]) {
  return Object.fromEntries(items.map((item) => [item.key, item])) as Record<
    string,
    T
  >;
}

export function createAgentItemFixture({
  name = "demo-agent",
  templateId = "hermes-agent",
  template = createTemplateFixture({ id: templateId }),
  access = [],
  actions = [],
}: {
  name?: string;
  templateId?: AgentTemplateId;
  template?: AgentTemplateDefinition;
  access?: AgentAccessItem[];
  actions?: AgentActionItem[];
} = {}): AgentListItem {
  const accessByKey = indexByKey(access);
  const actionsByKey = indexByKey(actions);
  const workspaces = template.workspaces.map((workspace) => ({
    ...workspace,
    enabled: true,
    reason: "",
    url: workspace.key === "web-ui" ? accessByKey["web-ui"]?.url || "" : "",
  }));
  const workspacesByKey = indexByKey(workspaces);
  const contract: AgentContract = {
    core: {
      name,
      aliasName: name,
      templateId,
      namespace: "ns-test",
      status: "Running",
      statusText: "Running",
      ready: true,
      bootstrapPhase: "ready",
      bootstrapMessage: "ready",
      createdAt: "2026-04-18T00:00:00Z",
    },
    workspaces,
    access,
    runtime: {
      cpu: "2000m",
      memory: "4096Mi",
      storage: "10Gi",
      runtimeClassName: "devbox-runtime",
      workingDir: template.workingDir,
      user: template.user,
      networkType: "ClusterIP",
      sshPort: accessByKey.ssh?.port || 0,
      modelProvider: "custom:aiproxy-responses",
      modelBaseURL: "https://aiproxy.example.com/v1",
      model: "gpt-5.4-mini",
      hasModelAPIKey: true,
    },
    settings: {
      runtime: template.settings.runtime,
      agent: template.settings.agent,
    },
    actions,
  };

  return {
    id: name,
    name,
    aliasName: name,
    namespace: "ns-test",
    owner: "Sealos",
    status: "running",
    statusText: "Running",
    updatedAt: "2026-04-18T00:00:00Z",
    cpu: "2000m",
    memory: "4096Mi",
    storage: "10Gi",
    workingDir: template.workingDir,
    templateId,
    template,
    contract,
    workspaces,
    workspacesByKey,
    access,
    accessByKey,
    actions,
    actionsByKey,
    rawStatus: "Running",
    modelProvider: "custom:aiproxy-responses",
    modelBaseURL: "https://aiproxy.example.com/v1",
    model: "gpt-5.4-mini",
    hasModelAPIKey: true,
    keySource: "workspace-aiproxy",
    ready: true,
    bootstrapPhase: "ready",
    bootstrapMessage: "ready",
    chatAvailable: Boolean(
      actionsByKey["open-chat"]?.enabled && accessByKey.api?.enabled,
    ),
    chatDisabledReason: "",
    terminalAvailable: Boolean(
      actionsByKey["open-terminal"]?.enabled && accessByKey.terminal?.enabled,
    ),
    terminalDisabledReason: "",
    settingsAvailable: Boolean(actionsByKey["open-settings"]?.enabled),
    webUIAvailable: Boolean(accessByKey["web-ui"]?.enabled),
    sshAvailable: Boolean(accessByKey.ssh?.enabled),
    ideAvailable: Boolean(accessByKey.ide?.enabled),
    apiBaseURL: accessByKey.api?.url || "",
    sshAccess: accessByKey.ssh || null,
    ideAccess: accessByKey.ide || null,
    webUIAccess: accessByKey["web-ui"] || null,
  };
}
