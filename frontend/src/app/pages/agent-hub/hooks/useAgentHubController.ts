import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createAgent,
  createClusterContext,
  deleteAgent,
  deriveAIProxyModelBaseURL,
  ensureAIProxyToken,
  getAgent,
  getClusterInfo,
  getCreateBlueprint,
  getSystemConfig,
  listAgentTemplates,
  listAgents,
  pauseAgent,
  runAgent,
  updateAgentRuntime,
  updateAgentSettings,
} from "../../../../api";
import {
  createBlueprintFromAgentItem,
  ensureDns1035Name,
  mapBackendAgentsToListItems,
} from "../../../../domains/agents/mappers";
import {
  getRequiredTemplateSettingError,
  readBlueprintSettingValue,
} from "../../../../domains/agents/blueprintFields";
import {
  createEmptyBlueprint,
  buildModelSlotsPayload,
  findTemplateById,
  getDefaultModelOption,
  getTemplateModelSlots,
  hydrateTemplateCatalog,
  indexTemplatesById,
} from "../../../../domains/agents/templates";
import type {
  AgentBlueprint,
  AgentContract,
  AgentHubRegion,
  AgentListItem,
  AgentTemplateDefinition,
  ClusterContext,
  ClusterInfo,
  SystemConfig,
  WorkspaceAIProxyToken,
} from "../../../../domains/agents/types";
import { useI18n } from "../../../../i18n";
import { getSealosSession } from "../../../../sealosSdk";
import {
  MOCK_AGENT_ID_PREFIX,
  buildMockClusterContext,
  buildMockClusterInfo,
  buildMockItems,
  buildMockSystemConfig,
  buildMockTemplates,
} from "../lib/mockData";

const WORKSPACE_AIPROXY_TOKEN_NAME = "Agent-Hub";
const WORKSPACE_TOKEN_RETRY_COOLDOWN_MS = 30_000;
const ENABLE_MOCK_AGENTS =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_AGENTHUB_LOCAL_DEMO || "").toLowerCase() === "true";

type LoadedSnapshot = {
  clusterContext: ClusterContext;
  clusterInfo: ClusterInfo;
  templates: AgentTemplateDefinition[];
  items: AgentListItem[];
  systemConfig: SystemConfig;
};

const isSameClusterContext = (
  current: ClusterContext | null,
  next: ClusterContext,
) =>
  Boolean(current) &&
  current?.namespace === next.namespace &&
  current?.server === next.server &&
  current?.kubeconfig === next.kubeconfig;

const toWorkspaceAIProxyToken = (
  payload: unknown,
): WorkspaceAIProxyToken | null => {
  const source = payload as {
    token?: { id?: number; name?: string; key?: string; status?: number };
    existed?: boolean;
  };
  if (!source?.token) {
    return null;
  }

  return {
    id: Number(source.token.id || 0),
    name: String(source.token.name || ""),
    key: String(source.token.key || ""),
    status: Number(source.token.status || 0),
    existed: Boolean(source.existed),
  };
};

export function useAgentHubController() {
  const { t } = useI18n();
  const [items, setItems] = useState<AgentListItem[]>([]);
  const [templates, setTemplates] = useState<AgentTemplateDefinition[]>([]);
  const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null);
  const [clusterContext, setClusterContext] = useState<ClusterContext | null>(
    null,
  );
  const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [workspaceAIProxyToken, setWorkspaceAIProxyToken] =
    useState<WorkspaceAIProxyToken | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const refreshTimerRef = useRef<number | null>(null);
  const initialLoadStartedRef = useRef(false);
  const workspaceTokenPromiseRef =
    useRef<Promise<WorkspaceAIProxyToken | null> | null>(null);
  const workspaceTokenFailureAtRef = useRef(0);

  const templatesById = useMemo(
    () => indexTemplatesById(templates),
    [templates],
  );
  const workspaceRegion: AgentHubRegion = systemConfig?.region || "us";
  const workspaceAIProxyModelBaseURL =
    systemConfig?.aiProxyModelBaseURL ||
    deriveAIProxyModelBaseURL(clusterContext?.server || clusterInfo?.server || "");
  const getAgentLabel = useCallback((aliasName: string, agentName: string) => {
    const displayName = aliasName.trim();
    if (!displayName || displayName === agentName) {
      return agentName;
    }
    return `${displayName} (${agentName})`;
  }, []);

  const resolveClusterContext = useCallback(async () => {
    const session = await getSealosSession().catch(() => null);
    const nextClusterContext = createClusterContext(session);

    if (clusterContext && isSameClusterContext(clusterContext, nextClusterContext)) {
      return clusterContext;
    }

    return nextClusterContext;
  }, [clusterContext]);

  const ensureWorkspaceTokenReady = useCallback(
    async (context: ClusterContext) => {
      if (mockMode) {
        const token = {
          id: 1,
          name: WORKSPACE_AIPROXY_TOKEN_NAME,
          key: "mock-aiproxy-token",
          status: 1,
          existed: true,
        } satisfies WorkspaceAIProxyToken;
        setWorkspaceAIProxyToken(token);
        return token;
      }

      if (workspaceAIProxyToken?.key) {
        return workspaceAIProxyToken;
      }

      if (workspaceTokenPromiseRef.current) {
        const token = await workspaceTokenPromiseRef.current;
        if (token?.key) {
          setWorkspaceAIProxyToken(token);
        }
        return token;
      }

      if (
        workspaceTokenFailureAtRef.current &&
        Date.now() - workspaceTokenFailureAtRef.current <
          WORKSPACE_TOKEN_RETRY_COOLDOWN_MS
      ) {
        return null;
      }

      workspaceTokenPromiseRef.current = ensureAIProxyToken(context, {
        name: WORKSPACE_AIPROXY_TOKEN_NAME,
      })
        .then((payload) => toWorkspaceAIProxyToken(payload))
        .catch((error) => {
          workspaceTokenFailureAtRef.current = Date.now();
          const detail = (() => {
            const payload = (error as { payload?: unknown })?.payload as
              | { error?: { details?: { upstreamMessage?: string; reason?: string } }; message?: string }
              | undefined;
            return (
              payload?.error?.details?.upstreamMessage ||
              payload?.error?.details?.reason ||
              payload?.message ||
              ""
            );
          })();
          const message =
            error instanceof Error ? error.message : String(error || "");
          console.warn("[aiproxy] ensure workspace token failed", {
            message,
            detail,
            payload: (error as { payload?: unknown })?.payload,
          });
          return null;
        })
        .finally(() => {
          workspaceTokenPromiseRef.current = null;
        });

      const token = await workspaceTokenPromiseRef.current;
      if (token?.key) {
        setWorkspaceAIProxyToken(token);
      }
      return token;
    },
    [mockMode, workspaceAIProxyToken],
  );

  const loadAll = useCallback(
    async ({
      ensureWorkspaceToken = false,
    }: {
      ensureWorkspaceToken?: boolean;
    } = {}): Promise<LoadedSnapshot | null> => {
      setLoading(true);
      let resolvedClusterContext: ClusterContext | null = null;

      try {
        const [templatePayload, nextSystemConfig] = await Promise.all([
          listAgentTemplates(),
          getSystemConfig(),
        ]);
        const nextTemplates = hydrateTemplateCatalog(templatePayload.items);

        setTemplates(nextTemplates);
        setSystemConfig(nextSystemConfig);

        const nextClusterContext = await resolveClusterContext();
        resolvedClusterContext = nextClusterContext;
        const nextClusterInfo = await getClusterInfo(nextClusterContext);
        let agentsPayload: { items: AgentContract[]; total: number } | null = null;
        let agentsLoadMessage = "";
        try {
          agentsPayload = await listAgents(nextClusterContext);
        } catch (agentsError) {
          agentsLoadMessage =
            agentsError instanceof Error ? agentsError.message : "加载 Agent 列表失败";
          console.warn("[agent-hub] list agents failed", agentsError);
        }

        const nextItems = mapBackendAgentsToListItems(
          agentsPayload?.items || [],
          nextTemplates,
          nextClusterInfo,
        );

        setClusterContext((current) =>
          isSameClusterContext(current, nextClusterContext)
            ? current
            : nextClusterContext,
        );
        setClusterInfo(nextClusterInfo);
        setTemplates(nextTemplates);
        setItems(nextItems);
        setSystemConfig(nextSystemConfig);
        setMockMode(false);
        setMessage(agentsLoadMessage);

        if (ensureWorkspaceToken) {
          void ensureWorkspaceTokenReady(nextClusterContext);
        }

        return {
          clusterContext: nextClusterContext,
          clusterInfo: nextClusterInfo,
          templates: nextTemplates,
          items: nextItems,
          systemConfig: nextSystemConfig,
        };
      } catch (error) {
        if (ENABLE_MOCK_AGENTS && !resolvedClusterContext?.kubeconfig) {
          const nextClusterContext = buildMockClusterContext();
          const nextClusterInfo = buildMockClusterInfo();
          const nextTemplates = buildMockTemplates();
          const nextSystemConfig = buildMockSystemConfig();
          const nextItems = buildMockItems(nextTemplates, nextClusterInfo);

          setClusterContext(nextClusterContext);
          setClusterInfo(nextClusterInfo);
          setTemplates(nextTemplates);
          setItems(nextItems);
          setSystemConfig(nextSystemConfig);
          setMockMode(true);
          setMessage("");
          return {
            clusterContext: nextClusterContext,
            clusterInfo: nextClusterInfo,
            templates: nextTemplates,
            items: nextItems,
            systemConfig: nextSystemConfig,
          };
        }

        setMessage(error instanceof Error ? error.message : "加载失败");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [ensureWorkspaceTokenReady, resolveClusterContext],
  );

  const loadItemsSilently = useCallback(async () => {
    if (mockMode) {
      setItems((current) => current);
      return items;
    }

    try {
      const nextClusterContext = await resolveClusterContext();
      const nextClusterInfo =
        clusterInfo || (await getClusterInfo(nextClusterContext));
      const nextTemplates =
        templates.length > 0
          ? templates
          : hydrateTemplateCatalog((await listAgentTemplates()).items);
      const agentsPayload = await listAgents(nextClusterContext);
      const nextItems = mapBackendAgentsToListItems(
        agentsPayload?.items || [],
        nextTemplates,
        nextClusterInfo,
      );

      setClusterContext(nextClusterContext);
      setClusterInfo(nextClusterInfo);
      setTemplates(nextTemplates);
      setItems((current) => {
        const currentSignature = current
          .map(
            (item) =>
              `${item.name}:${item.status}:${item.ready}:${item.updatedAt}:${item.bootstrapPhase}:${item.bootstrapMessage}`,
          )
          .join("|");
        const nextSignature = nextItems
          .map(
            (item) =>
              `${item.name}:${item.status}:${item.ready}:${item.updatedAt}:${item.bootstrapPhase}:${item.bootstrapMessage}`,
          )
          .join("|");
        return currentSignature === nextSignature ? current : nextItems;
      });

      return nextItems;
    } catch (error) {
      console.warn("[agent-hub] silent refresh failed", error);
      return null;
    }
  }, [clusterInfo, items, mockMode, resolveClusterContext, templates]);

  useEffect(() => {
    if (mockMode || initialLoadStartedRef.current) return;
    initialLoadStartedRef.current = true;
    void loadAll({ ensureWorkspaceToken: true });
  }, [loadAll, mockMode]);

  useEffect(() => {
    const hasPendingItems = items.some(
      (item) =>
        item.status === "creating" ||
        (item.status === "running" && !item.ready),
    );

    if (!hasPendingItems) {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    if (!refreshTimerRef.current) {
      refreshTimerRef.current = window.setInterval(() => {
        void loadItemsSilently();
      }, 3000);
    }

    return () => {
      if (refreshTimerRef.current) {
        window.clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [items, loadItemsSilently]);

  const primeItem = useCallback((item: AgentListItem) => {
    setItems((current) => {
      const nextIndex = current.findIndex((entry) => entry.name === item.name);
      if (nextIndex === -1) {
        return [item, ...current];
      }

      const nextItems = [...current];
      nextItems[nextIndex] = item;
      return nextItems;
    });
  }, []);

  const prepareCreateBlueprint = useCallback(
    async (templateId: string): Promise<AgentBlueprint> => {
      const currentContext = await resolveClusterContext();
      const template = templatesById[templateId] || null;

      if (!template) {
        throw new Error("没有找到对应的模板目录项。");
      }
      if (!template.backendSupported) {
        throw new Error(
          template.createDisabledReason || "当前模板暂未接入后端管理 API。",
        );
      }

      const seed = getCreateBlueprint(currentContext, undefined, []);
      const defaultModelOption = getDefaultModelOption(template);
      const modelBaseURL =
        workspaceAIProxyModelBaseURL ||
        deriveAIProxyModelBaseURL(currentContext.server);

      const workspaceToken = defaultModelOption
        ? await ensureWorkspaceTokenReady(currentContext)
        : null;
      const modelSlots = Object.fromEntries(
        getTemplateModelSlots(template)
          .map((slot) => [
            slot.key,
            String(slot.defaultModels?.[workspaceRegion] || "").trim(),
          ])
          .filter(([, value]) => value),
      ) as Record<string, string>;

      return {
        ...createEmptyBlueprint(),
        appName: ensureDns1035Name(seed.appName, "agent"),
        aliasName: "",
        namespace: currentContext.namespace,
        image: template.image,
        productType: template.id,
        state: seed.state === "Paused" ? "Paused" : "Running",
        runtimeClassName: seed.runtimeClassName,
        storageLimit: seed.storageLimit,
        port: template.port,
        cpu: "2000m",
        memory: "4096Mi",
        serviceType: "ClusterIP",
        protocol: "TCP",
        user: template.user || seed.user,
        workingDir: template.workingDir || seed.workingDir,
        argsText: template.defaultArgs.join(" "),
        modelProvider: defaultModelOption?.provider || "",
        modelBaseURL,
        model: defaultModelOption?.value || "",
        modelAPIMode: defaultModelOption?.apiMode || "",
        modelSlots,
        hasModelAPIKey: Boolean(workspaceToken?.key),
        keySource: workspaceToken?.key ? "workspace-aiproxy" : "unset",
      };
    },
    [
      clusterContext,
      ensureWorkspaceTokenReady,
      resolveClusterContext,
      templatesById,
      workspaceAIProxyModelBaseURL,
      workspaceRegion,
    ],
  );

  const buildCreatePayload = useCallback(
    (source: AgentBlueprint) => ({
      "template-id": source.productType,
      "agent-name": ensureDns1035Name(source.appName, "agent"),
      "agent-cpu": source.cpu,
      "agent-memory": source.memory,
      "agent-storage": source.storageLimit,
      "agent-alias-name": source.aliasName.trim(),
    }),
    [],
  );

  const buildRuntimeUpdatePayload = useCallback(
    (source: AgentBlueprint) => ({
      "agent-cpu": source.cpu,
      "agent-memory": source.memory,
      "agent-storage": source.storageLimit,
    }),
    [],
  );

  const buildSettingsPayload = useCallback(
    (template: AgentTemplateDefinition, source: AgentBlueprint) =>
      template.settings.agent.reduce<Record<string, string>>(
        (result, field) => {
          if (field.readOnly && field.binding.kind === "derived") {
            return result;
          }
          let value = readBlueprintSettingValue(source, field).trim();
          if (
            String(field.binding?.kind || "").trim() === "agent" &&
            String(field.binding?.key || "").trim() === "modelProvider" &&
            !value
          ) {
            const selectedModel = source.model.trim();
            if (selectedModel) {
              const matchedOption = template.modelOptions.find(
                (option) => option.value === selectedModel,
              );
              value = String(matchedOption?.provider || "").trim();
            }
          }
          if (
            String(field.binding?.kind || "").trim() === "agent" &&
            String(field.binding?.key || "").trim() === "modelAPIMode" &&
            !value
          ) {
            const selectedModel = source.model.trim();
            if (selectedModel) {
              const matchedOption = template.modelOptions.find(
                (option) => option.value === selectedModel,
              );
              value = String(matchedOption?.apiMode || "").trim();
            }
          }
          result[field.key] = value;
          return result;
        },
        {},
      ),
    [],
  );

  const buildSettingsUpdatePayload = useCallback(
    (template: AgentTemplateDefinition, source: AgentBlueprint) => {
      const modelSlots = buildModelSlotsPayload(source.modelSlots);
      return {
        "agent-alias-name": source.aliasName.trim(),
        settings: buildSettingsPayload(template, source),
        ...(Object.keys(modelSlots).length ? { modelSlots } : {}),
      };
    },
    [buildSettingsPayload],
  );

  const createAgentFromBlueprint = useCallback(
    async (blueprint: AgentBlueprint) => {
      const currentContext = await resolveClusterContext();
      const aliasName = blueprint.aliasName.trim();
      const template = templatesById[blueprint.productType];

      if (!template) {
        throw new Error("没有找到对应的模板目录项。");
      }
      if (!aliasName) {
        throw new Error("请填写 Agent 别名");
      }
      const requiredSettingError = getRequiredTemplateSettingError(
        blueprint,
        template.settings.agent,
      );
      if (requiredSettingError) {
        throw new Error(requiredSettingError);
      }

      setSubmitting(true);
      try {
        if (mockMode) {
          const createdName = ensureDns1035Name(blueprint.appName, "agent");
          const createdContract: AgentContract = {
            core: {
              name: createdName,
              aliasName: aliasName,
              templateId: template.id,
              namespace: currentContext.namespace,
              status: "Running",
              statusText: "运行中",
              ready: true,
              createdAt: new Date().toISOString(),
            },
            workspaces: template.workspaces.map((workspace) => ({
              key: workspace.key,
              label: workspace.label,
              enabled: true,
            })),
            access: [
              { key: "api", label: "API", enabled: true, url: `https://${createdName}.usw-1.sealos.app/v1` },
              { key: "terminal", label: "终端", enabled: true, rootPath: template.workingDir },
              { key: "files", label: "文件", enabled: true, rootPath: template.workingDir },
              { key: "web-ui", label: "Web UI", enabled: true, url: `https://${createdName}.usw-1.sealos.app` },
              {
                key: "ssh",
                label: "SSH",
                enabled: true,
                host: `${createdName}.usw-1.sealos.app`,
                port: 22,
                userName: template.user,
                workingDir: template.workingDir,
              },
            ],
            runtime: {
              cpu: blueprint.cpu,
              memory: blueprint.memory,
              storage: blueprint.storageLimit,
              runtimeClassName: blueprint.runtimeClassName,
              workingDir: blueprint.workingDir,
              user: blueprint.user,
              networkType: "public",
              sshPort: 22,
              modelProvider: blueprint.modelProvider,
              modelBaseURL: blueprint.modelBaseURL,
              model: blueprint.model,
              modelAPIMode: blueprint.modelAPIMode,
              modelSlots: {},
              hasModelAPIKey: true,
            },
            settings: {
              runtime: template.settings.runtime,
              agent: template.settings.agent,
            },
            actions: [
              { key: "open-chat", label: "对话", enabled: true },
              { key: "open-terminal", label: "终端", enabled: true },
              { key: "open-files", label: "文件", enabled: true },
              { key: "open-settings", label: "设置", enabled: true },
              { key: "run", label: "启动", enabled: false },
              { key: "pause", label: "暂停", enabled: true },
              { key: "delete", label: "删除", enabled: true },
            ],
          };
          const createdItem = mapBackendAgentsToListItems(
            [createdContract],
            templates,
            clusterInfo,
          )[0];
          const mockCreatedItem = createdItem
            ? { ...createdItem, id: `${MOCK_AGENT_ID_PREFIX}${createdItem.name}` }
            : null;
          if (mockCreatedItem) {
            primeItem(mockCreatedItem);
          }
          setMessage(
            t("agent.createSuccess", {
              name: getAgentLabel(aliasName, createdName),
            }),
          );
          return {
            agentName: createdName,
            aliasName: aliasName,
            item: mockCreatedItem,
            response: { agent: createdContract },
          };
        }

        if (template.modelOptions.length > 0) {
          await ensureWorkspaceTokenReady(currentContext);
        }

        const modelSlots = buildModelSlotsPayload(blueprint.modelSlots);
        const response = await createAgent(
          {
            ...buildCreatePayload({
              ...blueprint,
              appName: ensureDns1035Name(blueprint.appName, "agent"),
              aliasName,
            }),
            settings: buildSettingsPayload(template, blueprint),
            ...(Object.keys(modelSlots).length ? { modelSlots } : {}),
          },
          currentContext,
        );

        const createdAgent = response?.agent || null;
        const snapshot = await loadAll();
        const createdItem =
          snapshot?.items.find(
            (item) => item.name === createdAgent?.core?.name,
          ) ||
          (createdAgent && templates.length
            ? mapBackendAgentsToListItems(
                [createdAgent as AgentContract],
                templates,
                snapshot?.clusterInfo || clusterInfo,
              )[0]
            : null) ||
          null;

        setMessage(
          t("agent.createSuccess", {
            name: getAgentLabel(
              aliasName,
              createdAgent?.core?.name || blueprint.appName,
            ),
          }),
        );

        return {
          agentName: createdAgent?.core?.name || blueprint.appName,
          aliasName: aliasName,
          item: createdItem,
          response,
        };
      } finally {
        setSubmitting(false);
      }
    },
    [
      buildCreatePayload,
      buildSettingsPayload,
      clusterContext,
      clusterInfo,
      ensureWorkspaceTokenReady,
      getAgentLabel,
      loadAll,
      resolveClusterContext,
      templates,
      templatesById,
      mockMode,
      primeItem,
      t,
    ],
  );

  const updateAgentRuntimeFromBlueprint = useCallback(
    async (item: AgentListItem, blueprint: AgentBlueprint) => {
      const currentContext = await resolveClusterContext();
      const cpu = blueprint.cpu.trim();
      const memory = blueprint.memory.trim();
      const storage = blueprint.storageLimit.trim();

      if (!cpu) {
        throw new Error("请填写 CPU");
      }
      if (!memory) {
        throw new Error("请填写内存");
      }
      if (!storage) {
        throw new Error("请填写存储");
      }

      setSubmitting(true);
      try {
        if (mockMode) {
          setItems((current) =>
            current.map((entry) =>
              entry.name === item.name
                ? {
                    ...entry,
                    cpu,
                    memory,
                    storage,
                    contract: {
                      ...entry.contract,
                      runtime: {
                        ...entry.contract.runtime,
                        cpu,
                        memory,
                        storage,
                      },
                    },
                  }
                : entry,
            ),
          );
          setMessage(`已更新 ${getAgentLabel(item.aliasName, item.name)} 的运行时设置`);
          return { agentName: item.name, response: { ok: true } };
        }

        const response = await updateAgentRuntime(
          item.name,
          buildRuntimeUpdatePayload({
            ...blueprint,
            appName: ensureDns1035Name(blueprint.appName, "agent"),
          }),
          currentContext,
        );

        setMessage(
          `已更新 ${getAgentLabel(item.aliasName, item.name)} 的运行时设置`,
        );
        const updatedItem = response?.agent
          ? mapBackendAgentsToListItems([response.agent], templates, clusterInfo)[0]
          : null;
        if (updatedItem) {
          primeItem(updatedItem);
        }
        void loadItemsSilently();

        return {
          agentName: item.name,
          response,
        };
      } finally {
        setSubmitting(false);
      }
    },
    [
      buildRuntimeUpdatePayload,
      clusterContext,
      clusterInfo,
      getAgentLabel,
      loadItemsSilently,
      primeItem,
      resolveClusterContext,
      templates,
      mockMode,
    ],
  );

  const updateAgentSettingsFromBlueprint = useCallback(
    async (item: AgentListItem, blueprint: AgentBlueprint) => {
      const currentContext = await resolveClusterContext();
      const aliasName = blueprint.aliasName.trim();
      const template = templatesById[item.templateId];

      if (!template) {
        throw new Error("没有找到对应的模板目录项。");
      }
      if (!aliasName) {
        throw new Error("请填写 Agent 别名");
      }
      const requiredSettingError = getRequiredTemplateSettingError(
        blueprint,
        template.settings.agent,
      );
      if (requiredSettingError) {
        throw new Error(requiredSettingError);
      }

      setSubmitting(true);
      try {
        if (mockMode) {
          setItems((current) =>
            current.map((entry) =>
              entry.name === item.name
                ? {
                    ...entry,
                    aliasName,
                    modelProvider: blueprint.modelProvider || entry.modelProvider,
                    modelBaseURL: blueprint.modelBaseURL || entry.modelBaseURL,
                    model: blueprint.model || entry.model,
                    modelAPIMode: blueprint.modelAPIMode || entry.modelAPIMode,
                  }
                : entry,
            ),
          );
          setMessage(`已更新 ${getAgentLabel(aliasName, item.name)} 的 Agent 设置`);
          return { agentName: item.name, aliasName, response: { ok: true } };
        }

        if (template.modelOptions.length > 0) {
          await ensureWorkspaceTokenReady(currentContext);
        }
        const response = await updateAgentSettings(
          item.name,
          buildSettingsUpdatePayload(template, {
            ...blueprint,
            appName: ensureDns1035Name(blueprint.appName, "agent"),
            aliasName,
          }),
          currentContext,
        );

        setMessage(
          `已更新 ${getAgentLabel(aliasName, item.name)} 的 Agent 设置`,
        );
        const updatedItem = response?.agent
          ? mapBackendAgentsToListItems([response.agent], templates, clusterInfo)[0]
          : null;
        if (updatedItem) {
          primeItem(updatedItem);
        }
        void loadItemsSilently();

        return {
          agentName: item.name,
          aliasName,
          response,
        };
      } finally {
        setSubmitting(false);
      }
    },
    [
      buildSettingsUpdatePayload,
      clusterContext,
      clusterInfo,
      ensureWorkspaceTokenReady,
      getAgentLabel,
      loadItemsSilently,
      primeItem,
      resolveClusterContext,
      templates,
      templatesById,
      mockMode,
    ],
  );

  const updateAgentAlias = useCallback(
    async (item: AgentListItem, nextAliasName: string) => {
      const aliasName = nextAliasName.trim();
      if (!aliasName) {
        throw new Error("请填写 Agent 别名");
      }
      if (aliasName === item.aliasName) {
        return { agentName: item.name, aliasName, response: { ok: true } };
      }

      const currentContext = await resolveClusterContext();
      setSubmitting(true);
      try {
        if (mockMode) {
          setItems((current) =>
            current.map((entry) =>
              entry.name === item.name
                ? {
                    ...entry,
                    aliasName,
                    contract: {
                      ...entry.contract,
                      core: {
                        ...entry.contract.core,
                        aliasName,
                      },
                    },
                  }
                : entry,
            ),
          );
          setMessage(`已更新 ${getAgentLabel(aliasName, item.name)} 的别名`);
          return { agentName: item.name, aliasName, response: { ok: true } };
        }

        const response = await updateAgentSettings(
          item.name,
          { "agent-alias-name": aliasName },
          currentContext,
        );
        setMessage(`已更新 ${getAgentLabel(aliasName, item.name)} 的别名`);

        const updatedItem = response?.agent
          ? mapBackendAgentsToListItems([response.agent], templates, clusterInfo)[0]
          : null;
        if (updatedItem) {
          primeItem(updatedItem);
        } else {
          setItems((current) =>
            current.map((entry) =>
              entry.name === item.name
                ? {
                    ...entry,
                    aliasName,
                    contract: {
                      ...entry.contract,
                      core: {
                        ...entry.contract.core,
                        aliasName,
                      },
                    },
                  }
                : entry,
            ),
          );
        }
        void loadItemsSilently();

        return { agentName: item.name, aliasName, response };
      } finally {
        setSubmitting(false);
      }
    },
    [
      clusterInfo,
      getAgentLabel,
      loadItemsSilently,
      mockMode,
      primeItem,
      resolveClusterContext,
      templates,
    ],
  );

  const deleteAgentItem = useCallback(
    async (item: AgentListItem) => {
      const currentContext = await resolveClusterContext();
      setDeleting(true);
      try {
        if (mockMode) {
          setItems((current) => current.filter((entry) => entry.name !== item.name));
          setMessage(`已删除 ${getAgentLabel(item.aliasName, item.name)}`);
          return;
        }
        await deleteAgent(item.name, currentContext);
        setMessage(`已删除 ${getAgentLabel(item.aliasName, item.name)}`);
        await loadAll();
      } finally {
        setDeleting(false);
      }
    },
    [clusterContext, getAgentLabel, loadAll, mockMode, resolveClusterContext],
  );

  const toggleItemState = useCallback(
    async (item: AgentListItem) => {
      const currentContext = await resolveClusterContext();

      if (mockMode) {
        setItems((current) =>
          current.map((entry) => {
            if (entry.name !== item.name) return entry;
            if (entry.status === "running") {
              return { ...entry, status: "stopped", statusText: "已暂停", rawStatus: "Paused", ready: false };
            }
            if (entry.status === "stopped") {
              return { ...entry, status: "running", statusText: "运行中", rawStatus: "Running", ready: true };
            }
            return entry;
          }),
        );
        if (item.status === "running") {
          setMessage(`已暂停 ${getAgentLabel(item.aliasName, item.name)}`);
        } else if (item.status === "stopped") {
          setMessage(`已启动 ${getAgentLabel(item.aliasName, item.name)}`);
        }
        return;
      }

      if (item.status === "running") {
        await pauseAgent(item.name, currentContext);
        setMessage(`已暂停 ${getAgentLabel(item.aliasName, item.name)}`);
      } else if (item.status === "stopped") {
        await runAgent(item.name, currentContext);
        setMessage(`已启动 ${getAgentLabel(item.aliasName, item.name)}`);
      } else {
        return;
      }

      await loadAll();
    },
    [clusterContext, getAgentLabel, loadAll, mockMode, resolveClusterContext],
  );

  const findItemByName = useCallback(
    (agentName: string) =>
      items.find((item) => item.name === agentName) || null,
    [items],
  );

  const fetchAgentByName = useCallback(
    async (agentName: string) => {
      const name = String(agentName || "").trim();
      if (!name) return null;
      if (mockMode) {
        return items.find((item) => item.name === name) || null;
      }

      const currentContext = await resolveClusterContext();
      const currentClusterInfo =
        clusterInfo || (await getClusterInfo(currentContext));
      const currentTemplates =
        templates.length > 0
          ? templates
          : hydrateTemplateCatalog((await listAgentTemplates()).items);

      const payload = await getAgent(name, currentContext).catch(() => null);
      if (!payload?.agent) {
        return null;
      }

      const mapped = mapBackendAgentsToListItems(
        [payload.agent as AgentContract],
        currentTemplates,
        currentClusterInfo,
      )[0];

      if (!mapped) {
        return null;
      }

      setClusterContext(currentContext);
      setClusterInfo(currentClusterInfo);
      setTemplates(currentTemplates);
      primeItem(mapped);
      return mapped;
    },
    [
      clusterContext,
      clusterInfo,
      primeItem,
      resolveClusterContext,
      templates,
      items,
      mockMode,
    ],
  );

  const findLoadedTemplateById = useCallback(
    (templateId: string) => findTemplateById(templates, templateId),
    [templates],
  );

  return {
    items,
    templates,
    templatesById,
    clusterInfo,
    clusterContext,
    loading,
    submitting,
    deleting,
    message,
    setMessage,
    systemConfig,
    workspaceAIProxyToken,
    workspaceRegion,
    workspaceAIProxyModelBaseURL,
    loadAll,
    loadItemsSilently,
    prepareCreateBlueprint,
    createAgentFromBlueprint,
    updateAgentRuntimeFromBlueprint,
    updateAgentSettingsFromBlueprint,
    updateAgentAlias,
    deleteAgentItem,
    toggleItemState,
    ensureWorkspaceTokenReady,
    findItemByName,
    fetchAgentByName,
    findTemplateById: findLoadedTemplateById,
    primeItem,
    createBlueprintFromAgentItem,
  };
}
