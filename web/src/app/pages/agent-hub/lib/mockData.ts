import { hydrateTemplateCatalog } from "../../../../domains/agents/templates";
import { mapBackendAgentsToListItems } from "../../../../domains/agents/mappers";
import type {
  AgentContract,
  AgentListItem,
  AgentTemplateCatalogItem,
  AgentTemplateDefinition,
  ClusterContext,
  ClusterInfo,
  SystemConfig,
} from "../../../../domains/agents/types";

export const MOCK_AGENT_ID_PREFIX = "mock-agent-";

const nowIso = () => new Date().toISOString();

const templateCatalog: AgentTemplateCatalogItem[] = [
  {
    id: "hermes-agent",
    name: "Hermes Agent",
    shortName: "Hermes",
    description: "通用多模态 Agent，适合研发和自动化协作。",
    image: "labring/hermes-agent:latest",
    port: 8642,
    defaultArgs: ["gateway", "run"],
    workingDir: "/workspace",
    user: "root",
    backendSupported: true,
    createDisabledReason: "",
    presentation: {
      logoKey: "hermes-agent",
      brandColor: "#2563eb",
      docsLabel: "对话 + 终端 + 文件",
    },
    workspaces: [
      { key: "overview", label: "概览" },
      { key: "chat", label: "对话" },
      { key: "files", label: "文件" },
      { key: "settings", label: "设置" },
      { key: "web-ui", label: "Web UI" },
    ],
    access: [
      { key: "api", label: "API", auth: "apiKey", path: "/v1" },
      { key: "terminal", label: "终端", rootPath: "/workspace" },
      { key: "files", label: "文件", rootPath: "/workspace" },
      { key: "web-ui", label: "Web UI", path: "/" },
      { key: "ssh", label: "SSH", auth: "keypair" },
    ],
    actions: [
      { key: "open-chat", label: "对话" },
      { key: "open-terminal", label: "终端" },
      { key: "open-files", label: "文件" },
      { key: "open-settings", label: "设置" },
      { key: "run", label: "启动" },
      { key: "pause", label: "暂停" },
      { key: "delete", label: "删除" },
    ],
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
          key: "modelProvider",
          label: "模型提供方",
          type: "text",
          binding: { kind: "agent", key: "modelProvider" },
          required: true,
        },
        {
          key: "model",
          label: "模型",
          type: "text",
          binding: { kind: "agent", key: "model" },
          required: true,
        },
        {
          key: "modelBaseURL",
          label: "Base URL",
          type: "url",
          binding: { kind: "agent", key: "modelBaseURL" },
          required: true,
        },
        {
          key: "keySource",
          label: "密钥来源",
          type: "text",
          readOnly: true,
          binding: { kind: "agent", key: "keySource" },
        },
      ],
    },
    modelOptions: [
      {
        value: "gpt-4.1-mini",
        label: "GPT-4.1 mini",
        provider: "openai",
        apiMode: "chat.completions",
      },
      {
        value: "gpt-4o-mini",
        label: "GPT-4o mini",
        provider: "openai",
        apiMode: "chat.completions",
      },
    ],
  },
  {
    id: "openclaw",
    name: "OpenClaw Agent",
    shortName: "OpenClaw",
    description: "偏向网页交互与任务流执行的 Agent。",
    image: "labring/openclaw:latest",
    port: 8080,
    defaultArgs: ["server", "start"],
    workingDir: "/workspace",
    user: "root",
    backendSupported: true,
    createDisabledReason: "",
    presentation: {
      logoKey: "openclaw",
      brandColor: "#0f766e",
      docsLabel: "Web UI + 自动化",
    },
    workspaces: [
      { key: "overview", label: "概览" },
      { key: "chat", label: "对话" },
      { key: "files", label: "文件" },
      { key: "settings", label: "设置" },
      { key: "web-ui", label: "Web UI" },
    ],
    access: [
      { key: "api", label: "API", auth: "apiKey", path: "/v1" },
      { key: "terminal", label: "终端", rootPath: "/workspace" },
      { key: "files", label: "文件", rootPath: "/workspace" },
      { key: "web-ui", label: "Web UI", path: "/" },
      { key: "ssh", label: "SSH", auth: "keypair" },
      { key: "ide", label: "IDE", path: "/ide" },
    ],
    actions: [
      { key: "open-chat", label: "对话" },
      { key: "open-terminal", label: "终端" },
      { key: "open-files", label: "文件" },
      { key: "open-settings", label: "设置" },
      { key: "run", label: "启动" },
      { key: "pause", label: "暂停" },
      { key: "delete", label: "删除" },
    ],
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
          key: "modelProvider",
          label: "模型提供方",
          type: "text",
          binding: { kind: "agent", key: "modelProvider" },
          required: true,
        },
        {
          key: "model",
          label: "模型",
          type: "text",
          binding: { kind: "agent", key: "model" },
          required: true,
        },
        {
          key: "modelBaseURL",
          label: "Base URL",
          type: "url",
          binding: { kind: "agent", key: "modelBaseURL" },
          required: true,
        },
        {
          key: "keySource",
          label: "密钥来源",
          type: "text",
          readOnly: true,
          binding: { kind: "agent", key: "keySource" },
        },
      ],
    },
    modelOptions: [
      {
        value: "gpt-4.1-mini",
        label: "GPT-4.1 mini",
        provider: "openai",
        apiMode: "chat.completions",
      },
      {
        value: "claude-3-5-sonnet",
        label: "Claude 3.5 Sonnet",
        provider: "anthropic",
        apiMode: "chat.completions",
      },
    ],
  },
];

export const buildMockClusterContext = (): ClusterContext => ({
  server: "https://mock-cluster.sealos.io:6443",
  namespace: "agent-hub",
  token: "mock-token",
  sessionToken: "mock-session",
  authCandidates: [{ source: "mock", token: "mock-token" }],
  activeAuthToken: "mock-token",
  activeAuthSource: "mock",
  operator: "Sealos",
  agentLabel: "Agent Hub",
  kubeconfig: "mock-kubeconfig",
});

export const buildMockClusterInfo = (): ClusterInfo => ({
  cluster: "mock-usw-1",
  namespace: "agent-hub",
  kc: "mock-kubeconfig",
  server: "https://mock-cluster.sealos.io:6443",
  operator: "Sealos",
  updatedAt: nowIso(),
});

export const buildMockSystemConfig = (): SystemConfig => ({
  region: "us",
  sshDomain: "mock-agent.usw-1.sealos.app",
  aiProxyModelBaseURL: "https://aiproxy.example.com/v1",
});

const createAccess = (host: string, template: AgentTemplateDefinition) => {
  const rootPath = template.workingDir;
  return [
    { key: "api", label: "API", enabled: true, status: "ready", auth: "apiKey", url: `https://${host}/v1` },
    { key: "terminal", label: "终端", enabled: true, status: "ready", rootPath },
    { key: "files", label: "文件", enabled: true, status: "ready", rootPath },
    { key: "web-ui", label: "Web UI", enabled: true, status: "ready", url: `https://${host}` },
    {
      key: "ssh",
      label: "SSH",
      enabled: true,
      status: "ready",
      host,
      port: 22,
      userName: template.user,
      workingDir: template.workingDir,
    },
    { key: "ide", label: "IDE", enabled: true, status: "ready", url: `https://${host}/ide` },
  ];
};

const createActions = (running: boolean) => [
  { key: "open-chat", label: "对话", enabled: true },
  { key: "open-terminal", label: "终端", enabled: running },
  { key: "open-files", label: "文件", enabled: true },
  { key: "open-settings", label: "设置", enabled: true },
  { key: "run", label: "启动", enabled: !running },
  { key: "pause", label: "暂停", enabled: running },
  { key: "delete", label: "删除", enabled: true },
];

const createContract = ({
  name,
  aliasName,
  template,
  status,
  statusText,
  cpu,
  memory,
  storage,
  modelProvider,
  modelBaseURL,
  model,
  ready,
  bootstrapPhase = "",
  bootstrapMessage = "",
}: {
  name: string;
  aliasName: string;
  template: AgentTemplateDefinition;
  status: "Running" | "Paused" | "Creating";
  statusText: string;
  cpu: string;
  memory: string;
  storage: string;
  modelProvider: string;
  modelBaseURL: string;
  model: string;
  ready: boolean;
  bootstrapPhase?: string;
  bootstrapMessage?: string;
}): AgentContract => {
  const host = `${name}.usw-1.sealos.app`;
  const access = createAccess(host, template);
  const running = status === "Running";

  return {
    core: {
      name,
      aliasName,
      templateId: template.id,
      namespace: "agent-hub",
      status,
      statusText,
      ready,
      bootstrapPhase,
      bootstrapMessage,
      createdAt: nowIso(),
    },
    workspaces: template.workspaces.map((workspace) => ({
      key: workspace.key,
      label: workspace.label,
      enabled: true,
    })),
    access,
    runtime: {
      cpu,
      memory,
      storage,
      runtimeClassName: "devbox-runtime",
      workingDir: template.workingDir,
      user: template.user,
      networkType: "public",
      sshPort: 22,
      modelProvider,
      modelBaseURL,
      model,
      hasModelAPIKey: true,
    },
    settings: {
      runtime: template.settings.runtime,
      agent: template.settings.agent.map((field) =>
        field.key === "keySource"
          ? { ...field, value: "workspace-aiproxy" }
          : field.key === "modelProvider"
            ? { ...field, value: modelProvider }
            : field.key === "modelBaseURL"
              ? { ...field, value: modelBaseURL }
              : field.key === "model"
                ? { ...field, value: model }
                : field,
      ),
    },
    actions: createActions(running),
  };
};

export const buildMockTemplates = () => hydrateTemplateCatalog(templateCatalog);

export const buildMockItems = (
  templates: AgentTemplateDefinition[],
  clusterInfo: ClusterInfo | null,
): AgentListItem[] => {
  if (!templates.length) return [];
  const hermes = templates.find((item) => item.id === "hermes-agent") || templates[0];
  const openclaw = templates.find((item) => item.id === "openclaw") || templates[0];
  const contracts = [
    createContract({
      name: "hermes-agent-demo",
      aliasName: "Hermes Agent",
      template: hermes,
      status: "Running",
      statusText: "运行中",
      cpu: "2000m",
      memory: "4096Mi",
      storage: "10Gi",
      modelProvider: "openai",
      modelBaseURL: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      ready: true,
    }),
    createContract({
      name: "openclaw-agent-demo",
      aliasName: "OpenClaw Agent",
      template: openclaw,
      status: "Creating",
      statusText: "创建中",
      cpu: "1000m",
      memory: "2048Mi",
      storage: "10Gi",
      modelProvider: "anthropic",
      modelBaseURL: "https://openrouter.ai/api/v1",
      model: "claude-3-5-sonnet",
      ready: false,
      bootstrapPhase: "bootstrap",
      bootstrapMessage: "正在准备运行环境...",
    }),
    createContract({
      name: "daily-ops-agent",
      aliasName: "Daily Ops",
      template: hermes,
      status: "Paused",
      statusText: "已暂停",
      cpu: "4000m",
      memory: "8192Mi",
      storage: "20Gi",
      modelProvider: "openai",
      modelBaseURL: "https://api.openai.com/v1",
      model: "gpt-4.1",
      ready: false,
    }),
  ];
  return mapBackendAgentsToListItems(contracts, templates, clusterInfo).map((item) => ({
    ...item,
    id: `${MOCK_AGENT_ID_PREFIX}${item.name}`,
  }));
};

export const buildMockConsoleBootstrap = (
  agentName: string,
): {
  item: AgentListItem | null;
  services: Array<{ key: string; label: string; url: string; enabled: boolean; status?: string; reason?: string }>;
  workspaceRoot: string;
} => {
  const templates = buildMockTemplates();
  const clusterInfo = buildMockClusterInfo();
  const items = buildMockItems(templates, clusterInfo);
  const target = items.find((item) => item.name === agentName) || items[0] || null;
  const services = (target?.access || [])
    .filter((entry) => String(entry.url || "").trim())
    .map((entry) => ({
      key: entry.key,
      label: entry.label,
      url: String(entry.url || "").trim(),
      enabled: Boolean(entry.enabled),
      status: entry.status,
      reason: entry.reason,
    }));
  return {
    item: target,
    services,
    workspaceRoot: target?.workingDir || "/workspace",
  };
};
