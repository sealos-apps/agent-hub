export type AgentTemplateId = string;
export type AgentHubRegion = "cn" | "us";

export type ResourceType = "devbox" | "service" | "ingress";

export type AgentRuntimeStatus = "running" | "creating" | "stopped" | "error";

export interface ResourcePreset {
  id: "minimum" | "recommended" | "luxury" | "custom";
  label: string;
  description: string;
  cpu: string;
  memory: string;
}

export interface AgentSettingOption {
  value: string;
  label: string;
  description?: string;
}

export interface AgentSettingBinding {
  kind: string;
  key?: string;
  name?: string;
}

export interface AgentSettingField {
  key: string;
  label: string;
  type: string;
  description?: string;
  required?: boolean;
  readOnly?: boolean;
  binding: AgentSettingBinding;
  value?: unknown;
  options?: AgentSettingOption[];
}

export interface TemplatePresentation {
  logoKey: string;
  brandColor: string;
  docsLabel: string;
}

export interface TemplateWorkspaceItem {
  key: string;
  label: string;
}

export interface TemplateAccessItem {
  key: string;
  label: string;
  path?: string;
  auth?: string;
  rootPath?: string;
  modes?: string[];
}

export interface TemplateActionItem {
  key: string;
  label: string;
}

export interface TemplateModelOption {
  value: string;
  label: string;
  helper?: string;
  provider: string;
  apiMode: string;
}

export interface TemplateSettingsSchema {
  runtime: AgentSettingField[];
  agent: AgentSettingField[];
}

export interface AgentTemplateCatalogItem {
  id: AgentTemplateId;
  name: string;
  shortName: string;
  description: string;
  image: string;
  port: number;
  defaultArgs: string[];
  workingDir: string;
  user: string;
  backendSupported: boolean;
  createDisabledReason?: string;
  presentation: TemplatePresentation;
  workspaces: TemplateWorkspaceItem[];
  access: TemplateAccessItem[];
  actions: TemplateActionItem[];
  settings: TemplateSettingsSchema;
  modelOptions: TemplateModelOption[];
}

export interface AgentTemplateDefinition extends AgentTemplateCatalogItem {
  logo: string;
  brandColor: string;
  docsLabel: string;
  defaultWorkingDirectory: string;
}

export interface AgentCoreContract {
  name: string;
  aliasName?: string;
  templateId: string;
  namespace: string;
  status: string;
  statusText: string;
  ready: boolean;
  bootstrapPhase?: string;
  bootstrapMessage?: string;
  createdAt?: string;
}

export interface AgentAccessItem {
  key: string;
  label: string;
  enabled: boolean;
  status?: string;
  reason?: string;
  url?: string;
  auth?: string;
  host?: string;
  port?: number;
  userName?: string;
  workingDir?: string;
  rootPath?: string;
  modes?: string[];
}

export interface AgentWorkspaceItem {
  key: string;
  label: string;
  enabled: boolean;
  reason?: string;
  url?: string;
}

export interface AgentActionItem {
  key: string;
  label: string;
  enabled: boolean;
  reason?: string;
}

export interface AgentRuntimeContract {
  cpu: string;
  memory: string;
  storage: string;
  runtimeClassName?: string;
  workingDir?: string;
  user?: string;
  networkType?: string;
  sshPort?: number;
  modelProvider?: string;
  modelBaseURL?: string;
  model?: string;
  hasModelAPIKey: boolean;
}

export interface AgentSettingsContract {
  runtime: AgentSettingField[];
  agent: AgentSettingField[];
}

export interface AgentContract {
  core: AgentCoreContract;
  workspaces: AgentWorkspaceItem[];
  access: AgentAccessItem[];
  runtime: AgentRuntimeContract;
  settings: AgentSettingsContract;
  actions: AgentActionItem[];
}

export interface AgentBlueprint {
  appName: string;
  aliasName: string;
  namespace: string;
  apiKey: string;
  apiUrl: string;
  domainPrefix: string;
  fullDomain: string;
  image: string;
  productType: AgentTemplateId;
  state: "Running" | "Paused";
  runtimeClassName: string;
  storageLimit: string;
  port: number;
  cpu: string;
  memory: string;
  profile: ResourcePreset["id"];
  serviceType: "ClusterIP";
  protocol: "TCP";
  user: string;
  workingDir: string;
  argsText: string;
  modelProvider: string;
  modelBaseURL: string;
  model: string;
  hasModelAPIKey: boolean;
  keySource: string;
  settingsValues: Record<string, string>;
}

export interface ClusterInfo {
  cluster: string;
  namespace: string;
  kc: string;
  server: string;
  operator: string;
  updatedAt: string;
}

export interface ClusterContext {
  server: string;
  namespace: string;
  token: string;
  sessionToken: string;
  authCandidates: Array<{ source: string; token: string }>;
  activeAuthToken: string;
  activeAuthSource: string;
  operator: string;
  agentLabel: string;
  kubeconfig: string;
}

export interface WorkspaceAIProxyToken {
  id: number;
  name: string;
  key: string;
  status: number;
  existed: boolean;
}

export interface ResourceItem {
  id: string;
  name: string;
  owner: string;
  port: number | string;
  status: string;
  updatedAt: string;
  desc: string;
  apiKey: string;
  apiUrl: string;
  yaml: {
    metadata?: Record<string, unknown>;
    spec?: Record<string, unknown>;
    status?: Record<string, unknown>;
    [key: string]: unknown;
  };
  image?: string;
}

export interface ResourceCollection {
  devbox: ResourceItem[];
  service: ResourceItem[];
  ingress: ResourceItem[];
}

export interface ResourceGroup {
  devbox: ResourceItem | null;
  service: ResourceItem | null;
  ingress: ResourceItem | null;
}

export interface AgentListItem {
  id: string;
  name: string;
  aliasName: string;
  namespace: string;
  owner: string;
  status: AgentRuntimeStatus;
  statusText: string;
  updatedAt: string;
  cpu: string;
  memory: string;
  storage: string;
  workingDir: string;
  templateId: AgentTemplateId;
  template: AgentTemplateDefinition;
  contract: AgentContract;
  workspaces: AgentWorkspaceItem[];
  workspacesByKey: Record<string, AgentWorkspaceItem>;
  access: AgentAccessItem[];
  accessByKey: Record<string, AgentAccessItem>;
  actions: AgentActionItem[];
  actionsByKey: Record<string, AgentActionItem>;
  rawStatus: string;
  modelProvider: string;
  modelBaseURL: string;
  model: string;
  hasModelAPIKey: boolean;
  keySource: string;
  ready: boolean;
  bootstrapPhase: string;
  bootstrapMessage: string;
  chatAvailable: boolean;
  chatDisabledReason: string;
  terminalAvailable: boolean;
  terminalDisabledReason: string;
  settingsAvailable: boolean;
  webUIAvailable: boolean;
  sshAvailable: boolean;
  ideAvailable: boolean;
  apiBaseURL: string;
  sshAccess: AgentAccessItem | null;
  ideAccess: AgentAccessItem | null;
  webUIAccess: AgentAccessItem | null;
  resourceGroup?: ResourceGroup;
  yaml?: Record<string, unknown>;
}

export interface CreateBlueprintSeed {
  appName: string;
  aliasName: string;
  namespace: string;
  apiKey: string;
  apiUrl: string;
  domainPrefix: string;
  fullDomain: string;
  state: "Running" | "Paused";
  runtimeClassName: string;
  storageLimit: string;
  serviceType: "ClusterIP";
  protocol: "TCP";
  user: string;
  workingDir: string;
  args: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  streaming?: boolean;
}

export interface ChatSessionState {
  resource: AgentListItem;
  draft: string;
  status: "idle" | "connecting" | "connected" | "error";
  transport: string;
  error: string;
  triedApiUrls: string[];
  messages: ChatMessage[];
}

export interface TerminalSessionState {
  resource: AgentListItem;
  status:
    | "initializing"
    | "connecting"
    | "reconnecting"
    | "connected"
    | "disconnected"
    | "error";
  error: string;
  podName: string;
  containerName: string;
  namespace: string;
  wsUrl: string;
  terminalId: string;
  cwd: string;
}

export interface AgentFileItem {
  name: string;
  path: string;
  type: "file" | "dir" | "other";
  size: number;
}

export interface FilesSessionState {
  resource: AgentListItem;
  status:
    | "initializing"
    | "connecting"
    | "connected"
    | "working"
    | "disconnected"
    | "error";
  error: string;
  podName: string;
  containerName: string;
  namespace: string;
  wsUrl: string;
  rootPath: string;
  currentPath: string;
  items: AgentFileItem[];
  selectedItem: AgentFileItem | null;
  openedItem: AgentFileItem | null;
  detailMode: "preview" | "edit";
  previewContent: string;
  draftContent: string;
  previewObjectUrl: string;
  previewObjectType: string;
  activity: string;
  browsing: boolean;
  previewing: boolean;
  reading: boolean;
  saving: boolean;
  downloading: boolean;
  uploading: boolean;
  dirty: boolean;
}

export interface AgentConsoleServiceItem {
  key: string;
  label: string;
  url: string;
  enabled: boolean;
  status?: string;
  reason?: string;
}

export interface AgentConsoleBootstrap {
  agent: AgentContract;
  workspaceRoot?: string;
  webSocketPath: string;
  services: AgentConsoleServiceItem[];
}

export interface AgentSSHAccessPayload {
  host: string;
  port: number;
  userName: string;
  workingDir: string;
  base64PublicKey: string;
  base64PrivateKey: string;
  token: string;
  configHost: string;
}

export interface SystemConfig {
  region: AgentHubRegion;
  sshDomain: string;
  aiProxyModelBaseURL: string;
}
