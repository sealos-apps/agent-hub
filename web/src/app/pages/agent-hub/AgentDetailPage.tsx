import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { DeleteAgentModal } from "../../../components/business/agents/DeleteAgentModal";
import { AgentChatWorkspace } from "../../../components/business/chat/AgentChatWorkspace";
import { AgentFilesWorkspace } from "../../../components/business/files/AgentFilesWorkspace";
import { AgentWebUIWorkspace } from "../../../components/business/web-ui/AgentWebUIWorkspace";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { SelectMenu } from "../../../components/ui/SelectMenu";
import {
  readBlueprintSettingValue,
  writeBlueprintSettingValue,
} from "../../../domains/agents/blueprintFields";
import { createBlueprintFromAgentItem } from "../../../domains/agents/mappers";
import {
  createEmptyBlueprint,
  RESOURCE_PRESETS,
} from "../../../domains/agents/templates";
import type {
  AgentBlueprint,
  AgentFileItem,
  AgentListItem,
  AgentSettingField,
  AgentTemplateDefinition,
  ChatSessionState,
  FilesSessionState,
} from "../../../domains/agents/types";
import { AgentDetailHeader } from "./components/AgentDetailHeader";
import { AgentSettingsWorkspace } from "./components/AgentSettingsWorkspace";
import {
  AgentDetailSidebar,
  HIDDEN_AGENT_DETAIL_TABS,
  type AgentDetailTab,
} from "./components/AgentDetailSidebar";
import { AgentPageHeader } from "./components/AgentPageHeader";
import { AgentHubOverview } from "./components/AgentHubOverview";
import { AgentWorkspaceShell } from "./components/AgentWorkspaceShell";
import { useAgentHub } from "./hooks/AgentHubControllerContext";
import { useAgentChat } from "./hooks/useAgentChat";
import { useAgentFiles } from "./hooks/useAgentFiles";
import { applyBlueprintPreset, updateBlueprintField } from "./lib/blueprint";
import type { AgentDetailRouteState } from "./lib/navigation";
import { openAgentConsoleDesktopWindow } from "./lib/consoleWindow";
import { cn } from "../../../lib/format";

const MOCK_AGENT_ID_PREFIX = "mock-agent-";
const DETAIL_SCALE_BREAKPOINT = 1180;
const DETAIL_SCALE_CANVAS_WIDTH = 1024;
const DETAIL_SCALE_MAX_CANVAS_HEIGHT = 840;
const DETAIL_SCALE_PADDING = 24;

type DetailScaleState = {
  enabled: boolean;
  scale: number;
  canvasHeight: number;
};

function isMockAgentItem(item: AgentListItem | null | undefined) {
  return Boolean(item?.id?.startsWith(MOCK_AGENT_ID_PREFIX));
}

function resolveDetailScaleState(): DetailScaleState {
  if (typeof window === "undefined") {
    return { enabled: false, scale: 1, canvasHeight: 0 };
  }

  const availableWidth = Math.max(320, window.innerWidth - DETAIL_SCALE_PADDING);
  const widthScale = Math.min(1, availableWidth / DETAIL_SCALE_CANVAS_WIDTH);
  const scale = Number(widthScale.toFixed(4));
  const canvasHeight = DETAIL_SCALE_MAX_CANVAS_HEIGHT;

  return {
    enabled: window.innerWidth < DETAIL_SCALE_BREAKPOINT || scale < 0.995,
    scale,
    canvasHeight,
  };
}

function parseStorageGi(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return 10;
  if (normalized.endsWith("gi")) {
    const numeric = Number(normalized.slice(0, -2));
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 10;
  }
  if (normalized.endsWith("mi")) {
    const numeric = Number(normalized.slice(0, -2));
    return Number.isFinite(numeric) && numeric > 0 ? Math.max(1, Math.round(numeric / 1024)) : 10;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 10;
}

function formatCpuLabel(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "--";
  if (normalized.endsWith("m")) {
    const numeric = Number(normalized.slice(0, -1));
    return Number.isFinite(numeric) ? `${numeric / 1000} 核` : value;
  }
  return `${value} 核`;
}

function formatMemoryLabel(value = "") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "--";
  if (normalized.endsWith("mi")) {
    const numeric = Number(normalized.slice(0, -2));
    return Number.isFinite(numeric) ? `${numeric / 1024} GiB` : value;
  }
  if (normalized.endsWith("gi")) {
    return `${normalized.slice(0, -2)} GiB`;
  }
  return value;
}

function ConfigField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="grid min-h-12 grid-cols-[108px_minmax(0,1fr)] items-center gap-4 border-b border-zinc-100 py-3 last:border-b-0">
      <span className="text-[13px]/5 text-zinc-500">{label}</span>
      <div className="min-w-0">{children}</div>
    </label>
  );
}

function AgentConfigEditModal({
  open,
  item,
  template,
  runtimeBlueprint,
  settingsBlueprint,
  submitting,
  onClose,
  onRuntimePreset,
  onRuntimeChange,
  onSettingsChange,
  onSettingsFieldChange,
  onSave,
}: {
  open: boolean;
  item: AgentListItem;
  template: AgentTemplateDefinition | null;
  runtimeBlueprint: AgentBlueprint;
  settingsBlueprint: AgentBlueprint;
  submitting: boolean;
  onClose: () => void;
  onRuntimePreset: (presetId: AgentBlueprint["profile"]) => void;
  onRuntimeChange: (field: keyof AgentBlueprint, value: string) => void;
  onSettingsChange: (field: keyof AgentBlueprint, value: string) => void;
  onSettingsFieldChange: (field: AgentSettingField, value: string) => void;
  onSave: () => void;
}) {
  if (!template) return null;

  const modelField =
    template.settings.agent.find((field) => field.binding.key === "model") ||
    null;
  const modelProviderField =
    template.settings.agent.find((field) => field.binding.key === "modelProvider") ||
    null;
  const modelValue = modelField
    ? readBlueprintSettingValue(settingsBlueprint, modelField)
    : settingsBlueprint.model;
  const storageValue = parseStorageGi(runtimeBlueprint.storageLimit);
  const fixedPresets = RESOURCE_PRESETS.filter((preset) => preset.id !== "custom");
  const presetValue = fixedPresets.some((preset) => preset.id === runtimeBlueprint.profile)
    ? runtimeBlueprint.profile
    : "";

  const handleModelChange = (value: string) => {
    const option = template.modelOptions.find((entry) => entry.value === value) || null;
    if (modelField) {
      onSettingsFieldChange(modelField, value);
    } else {
      onSettingsChange("model", value);
    }

    if (modelProviderField) {
      onSettingsFieldChange(modelProviderField, option?.provider || "");
    } else {
      onSettingsChange("modelProvider", option?.provider || "");
    }
  };

  return (
    <Modal
      description="集中调整资源规格与 Agent 基础配置，保存后应用到当前实例。"
      footer={
        <>
          <Button disabled={submitting} onClick={onClose} type="button" variant="secondary">
            取消
          </Button>
          <Button disabled={submitting} onClick={onSave} type="button">
            {submitting ? "保存中..." : "保存配置"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title="修改配置"
      widthClassName="max-w-2xl"
    >
      <div className="rounded-[14px] border border-zinc-200 bg-white px-4">
        <ConfigField label="预设配置">
          <SelectMenu
            className="w-full"
            onChange={(value) => {
              if (!value) return;
              onRuntimePreset(value as AgentBlueprint["profile"]);
            }}
            options={[
              { label: "选择预设", value: "" },
              ...fixedPresets.map((preset) => ({
                label: `${preset.label} · CPU：${formatCpuLabel(preset.cpu)} / 内存：${formatMemoryLabel(preset.memory)}`,
                value: preset.id,
              })),
            ]}
            portal
            showSelectedState={false}
            value={presetValue}
          />
        </ConfigField>

        <ConfigField label="存储容量">
          <div className="flex items-center gap-2">
            <button
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
              onClick={() => onRuntimeChange("storageLimit", `${Math.max(1, storageValue - 1)}Gi`)}
              type="button"
            >
              -
            </button>
            <input
              className="h-9 min-w-0 flex-1 rounded-[8px] border border-zinc-200 bg-white px-3 text-center text-[14px]/5 font-medium text-zinc-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              min={1}
              onChange={(event) => {
                const numeric = Number(event.target.value);
                if (!Number.isFinite(numeric)) return;
                onRuntimeChange("storageLimit", `${Math.max(1, numeric)}Gi`);
              }}
              type="number"
              value={storageValue}
            />
            <span className="w-10 text-sm text-zinc-500">GiB</span>
            <button
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-zinc-200 bg-white text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900"
              onClick={() => onRuntimeChange("storageLimit", `${storageValue + 1}Gi`)}
              type="button"
            >
              +
            </button>
          </div>
        </ConfigField>

        <ConfigField label="别名">
          <input
            className="h-10 w-full rounded-[8px] border border-zinc-200 bg-white px-3 text-[14px]/5 font-medium text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
            onChange={(event) => onSettingsChange("aliasName", event.target.value)}
            placeholder="例如：客服助手"
            value={settingsBlueprint.aliasName}
          />
        </ConfigField>

        <ConfigField label="模型">
          <SelectMenu
            className="w-full"
            menuClassName="max-h-[188px] overflow-y-auto"
            onChange={handleModelChange}
            options={template.modelOptions.map((option) => ({
                label: option.helper ? `${option.label} · ${option.helper}` : option.label,
                value: option.value,
              }))}
            portal
            showSelectedState={false}
            value={modelValue}
          />
        </ConfigField>

        <ConfigField label="运行环境">
          <div className="text-[14px]/5 font-medium text-zinc-900">
            {item.contract.runtime.runtimeClassName || "devbox-runtime"}
          </div>
        </ConfigField>
      </div>
    </Modal>
  );
}

export function AgentDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { agentName = "" } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const controller = useAgentHub();
  const { findItemByName, primeItem } = controller;
  const resolvingMissingRef = useRef(false);
  const [resolvingMissing, setResolvingMissing] = useState(false);
  const [runtimeEditingItem, setRuntimeEditingItem] =
    useState<AgentListItem | null>(null);
  const [settingsEditingItem, setSettingsEditingItem] =
    useState<AgentListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentListItem | null>(null);
  const [runtimeEditBlueprint, setRuntimeEditBlueprint] =
    useState<AgentBlueprint>(() => createEmptyBlueprint());
  const [settingsEditBlueprint, setSettingsEditBlueprint] =
    useState<AgentBlueprint>(() => createEmptyBlueprint());
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [detailScale, setDetailScale] = useState<DetailScaleState>(() =>
    resolveDetailScaleState(),
  );
  const navigationState = location.state as AgentDetailRouteState | null;

  const { chatSession, openChat, sendChatMessage, setChatDraft } = useAgentChat(
    {
      clusterContext: controller.clusterContext,
      onErrorMessage: controller.setMessage,
    },
  );

  const {
    closeFiles,
    createDirectory,
    createEmptyFile,
    deleteEntry,
    downloadEntry,
    editEntry,
    filesSession,
    jumpToPath,
    openEntry,
    openFiles,
    openParentDirectory,
    prefetchDirectory,
    refreshDirectory,
    saveSelectedFile,
    selectEntry,
    updateSelectedContent,
    uploadFiles,
  } = useAgentFiles({
    clusterContext: controller.clusterContext,
  });

  const navigationItem =
    navigationState?.agent?.name === agentName ? navigationState.agent : null;
  useEffect(() => {
    if (!navigationItem) return;
    primeItem(navigationItem);
  }, [navigationItem, primeItem]);

  const item = findItemByName(agentName) || navigationItem;
  const isMockItem = isMockAgentItem(item);
  const [mockChatDraft, setMockChatDraft] = useState("");
  const [mockChatMessages, setMockChatMessages] = useState<
    ChatSessionState["messages"]
  >([]);

  const initialMockChatMessages = useMemo<ChatSessionState["messages"]>(() => {
    if (!item || !isMockItem) return [];
    return [
      {
        id: "mock-assistant-1",
        role: "assistant",
        content:
          "你好，我是示例 Agent。这个对话页是本地 mock 数据，用于预览消息气泡、输入区和状态样式。",
        createdAt: "10:12:08",
      },
      {
        id: "mock-user-1",
        role: "user",
        content: "请展示一下当前页面的交互布局。",
        createdAt: "10:12:19",
      },
      {
        id: "mock-assistant-2",
        role: "assistant",
        content:
          "已展示：顶部状态标签、消息列表、输入区和发送按钮。你可以继续精修间距和层级。",
        createdAt: "10:12:31",
      },
    ];
  }, [isMockItem, item]);

  useEffect(() => {
    if (!isMockItem) return;
    setMockChatDraft("");
    setMockChatMessages(initialMockChatMessages);
  }, [initialMockChatMessages, isMockItem]);

  useEffect(() => {
    const syncScale = () => {
      setDetailScale(resolveDetailScaleState());
    };

    syncScale();
    window.addEventListener("resize", syncScale);
    window.addEventListener("orientationchange", syncScale);

    return () => {
      window.removeEventListener("resize", syncScale);
      window.removeEventListener("orientationchange", syncScale);
    };
  }, []);

  const mockChatSession = useMemo<ChatSessionState | null>(() => {
    if (!item || !isMockItem) return null;
    return {
      resource: item,
      draft: mockChatDraft,
      status: "connected",
      transport: "mock",
      error: "",
      triedApiUrls: [],
      messages: mockChatMessages,
    };
  }, [isMockItem, item, mockChatDraft, mockChatMessages]);

  const mockFilesSession = useMemo<FilesSessionState | null>(() => {
    if (!item || !isMockItem) return null;
    const items: AgentFileItem[] = [
      { name: "docs", path: "/workspace/docs", type: "dir", size: 0 },
      { name: "src", path: "/workspace/src", type: "dir", size: 0 },
      {
        name: "README.md",
        path: "/workspace/README.md",
        type: "file",
        size: 3241,
      },
      {
        name: "agent.config.json",
        path: "/workspace/agent.config.json",
        type: "file",
        size: 892,
      },
      {
        name: "logs.txt",
        path: "/workspace/logs.txt",
        type: "file",
        size: 1432,
      },
    ];
    const openedItem = items.find((entry) => entry.name === "README.md") || null;
    return {
      resource: item,
      status: "connected",
      error: "",
      podName: "mock-agent-pod",
      containerName: "agent",
      namespace: item.namespace || "default",
      wsUrl: "ws://mock.local/files",
      rootPath: "/workspace",
      currentPath: "/workspace",
      items,
      selectedItem: openedItem,
      openedItem,
      detailMode: "preview",
      previewContent:
        "# Hermes Agent\n\n这是文件工作台的 mock 内容。\n\n- 支持目录与文件列表样式预览\n- 支持右侧预览区样式预览\n- 不连接后端，不执行真实读写操作\n",
      draftContent: "",
      previewObjectUrl: "",
      previewObjectType: "text/markdown",
      activity: "已加载 mock 文件目录",
      browsing: false,
      previewing: false,
      reading: false,
      saving: false,
      downloading: false,
      uploading: false,
      dirty: false,
    };
  }, [isMockItem, item]);

  useEffect(() => {
    if (!agentName || item || controller.loading || resolvingMissingRef.current) {
      return;
    }

    let cancelled = false;
    let pendingSleepTimer: number | null = null;
    let wakePendingSleep: (() => void) | null = null;
    resolvingMissingRef.current = true;
    setResolvingMissing(true);

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const finish = () => {
          if (pendingSleepTimer != null) {
            window.clearTimeout(pendingSleepTimer);
            pendingSleepTimer = null;
          }
          wakePendingSleep = null;
          resolve();
        };
        wakePendingSleep = finish;
        pendingSleepTimer = window.setTimeout(finish, ms);
      });

    const recoverItem = async () => {
      try {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const fetched = await controller.fetchAgentByName(agentName).catch(
            () => null,
          );
          if (fetched) {
            return;
          }
          await sleep(800);
          if (cancelled) {
            return;
          }
        }
      } finally {
        if (!cancelled) {
          setResolvingMissing(false);
        }
        resolvingMissingRef.current = false;
      }
    };

    void recoverItem();

    return () => {
      cancelled = true;
      resolvingMissingRef.current = false;
      if (wakePendingSleep) {
        wakePendingSleep();
      } else if (pendingSleepTimer != null) {
        window.clearTimeout(pendingSleepTimer);
        pendingSleepTimer = null;
      }
    };
  }, [agentName, item, controller]);

  const currentTab = useMemo<AgentDetailTab>(() => {
    const value = searchParams.get("tab");
    if (value === "chat" || value === "files" || value === "settings" || value === "web-ui") {
      if (HIDDEN_AGENT_DETAIL_TABS.has(value)) return "overview";
      return value;
    }
    return "overview";
  }, [searchParams]);

  const setCurrentTab = (tab: AgentDetailTab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!item || currentTab !== "chat") return;
    if (isMockAgentItem(item)) return;
    if (chatSession?.resource.name === item.name) return;
    openChat(item);
  }, [chatSession?.resource.name, currentTab, item, openChat]);

  useEffect(() => {
    if (!item) return;
    if (isMockAgentItem(item)) return;

    if (currentTab === "files") {
      if (filesSession?.resource.name !== item.name) {
        openFiles(item);
      }
      return;
    }

    if (filesSession) {
      closeFiles();
    }
  }, [closeFiles, currentTab, filesSession, item, openFiles]);

  useEffect(() => {
    setConfigModalOpen(false);
    setRuntimeEditingItem(null);
    setSettingsEditingItem(null);
    setRuntimeEditBlueprint(createEmptyBlueprint());
    setSettingsEditBlueprint(createEmptyBlueprint());
  }, [item?.name]);

  const activeRuntimeBlueprint = useMemo(() => {
    if (!item) return createEmptyBlueprint();
    return runtimeEditingItem?.name === item.name
      ? runtimeEditBlueprint
      : createBlueprintFromAgentItem(item);
  }, [item, runtimeEditBlueprint, runtimeEditingItem?.name]);

  const activeSettingsBlueprint = useMemo(() => {
    if (!item) return createEmptyBlueprint();
    return settingsEditingItem?.name === item.name
      ? settingsEditBlueprint
      : createBlueprintFromAgentItem(item);
  }, [item, settingsEditBlueprint, settingsEditingItem?.name]);

  const originalBlueprint = useMemo(
    () => (item ? createBlueprintFromAgentItem(item) : createEmptyBlueprint()),
    [item],
  );

  const runtimeDirty = Boolean(item) && (
    activeRuntimeBlueprint.profile !== originalBlueprint.profile ||
    activeRuntimeBlueprint.cpu !== originalBlueprint.cpu ||
    activeRuntimeBlueprint.memory !== originalBlueprint.memory ||
    activeRuntimeBlueprint.storageLimit !== originalBlueprint.storageLimit
  );

  const settingsDirty = Boolean(item) && (
    activeSettingsBlueprint.aliasName !== originalBlueprint.aliasName ||
    activeSettingsBlueprint.model !== originalBlueprint.model ||
    activeSettingsBlueprint.modelProvider !== originalBlueprint.modelProvider ||
    activeSettingsBlueprint.modelBaseURL !== originalBlueprint.modelBaseURL ||
    activeSettingsBlueprint.keySource !== originalBlueprint.keySource ||
    JSON.stringify(activeSettingsBlueprint.settingsValues) !==
      JSON.stringify(originalBlueprint.settingsValues)
  );

  const closeRuntimeEditFlow = () => {
    setRuntimeEditingItem(null);
    setRuntimeEditBlueprint(createEmptyBlueprint());
  };

  const closeSettingsEditFlow = () => {
    setSettingsEditingItem(null);
    setSettingsEditBlueprint(createEmptyBlueprint());
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    if (isMockAgentItem(deleteTarget)) {
      setDeleteTarget(null);
      return;
    }

    try {
      await controller.deleteAgentItem(deleteTarget);
      navigate("/agents");
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "删除失败",
      );
    }
  };

  const handleToggleState = async () => {
    if (!item) return;

    if (isMockAgentItem(item)) {
      return;
    }

    try {
      await controller.toggleItemState(item);
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "切换运行状态失败",
      );
    }
  };

  const handleOpenTerminalWindow = async () => {
    if (!item) return;

    if (isMockAgentItem(item)) {
      navigate(`/desktop/console?agentName=${encodeURIComponent(item.name)}`);
      return;
    }

    try {
      await openAgentConsoleDesktopWindow(item);
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "打开控制台窗口失败",
      );
    }
  };

  const openConfigModal = () => {
    if (!item) return;
    const blueprint = createBlueprintFromAgentItem(item);
    setRuntimeEditingItem(item);
    setSettingsEditingItem(item);
    setRuntimeEditBlueprint(blueprint);
    setSettingsEditBlueprint(blueprint);
    setConfigModalOpen(true);
  };

  const closeConfigModal = () => {
    closeRuntimeEditFlow();
    closeSettingsEditFlow();
    setConfigModalOpen(false);
  };

  const handleSaveConfig = async () => {
    if (!item) return;

    if (isMockAgentItem(item)) {
      closeConfigModal();
      return;
    }

    if (!runtimeDirty && !settingsDirty) {
      closeConfigModal();
      return;
    }

    try {
      if (runtimeDirty) {
        await controller.updateAgentRuntimeFromBlueprint(
          item,
          activeRuntimeBlueprint,
        );
      }
      if (settingsDirty) {
        await controller.updateAgentSettingsFromBlueprint(
          item,
          activeSettingsBlueprint,
        );
      }
      closeConfigModal();
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "保存失败",
      );
    }
  };

  const renderTabContent = () => {
    if (!item) return null;
    const renderUnifiedOverview = () => (
      <AgentSettingsWorkspace
        editing={false}
        item={item}
        onRuntimeChange={(field, value) => {
          setRuntimeEditingItem(item);
          setRuntimeEditBlueprint((current) => {
            const base =
              current.appName === item.name ? current : activeRuntimeBlueprint;
            return updateBlueprintField(base, field, value);
          });
        }}
        onRuntimePreset={(presetId) => {
          setRuntimeEditingItem(item);
          setRuntimeEditBlueprint((current) => {
            const base =
              current.appName === item.name ? current : activeRuntimeBlueprint;
            return applyBlueprintPreset(base, presetId);
          });
        }}
        onSettingsChange={(field, value) => {
          setSettingsEditingItem(item);
          setSettingsEditBlueprint((current) => {
            const base =
              current.appName === item.name ? current : activeSettingsBlueprint;
            return updateBlueprintField(base, field, value);
          });
        }}
        onSettingsFieldChange={(field, value) => {
          setSettingsEditingItem(item);
          setSettingsEditBlueprint((current) => {
            const base =
              current.appName === item.name ? current : activeSettingsBlueprint;
            return writeBlueprintSettingValue(base, field, value);
          });
        }}
        runtimeBlueprint={activeRuntimeBlueprint}
        settingsBlueprint={activeSettingsBlueprint}
        template={controller.findTemplateById(item.templateId)}
        workspaceModelBaseURL={controller.workspaceAIProxyModelBaseURL}
        workspaceModelKeyReady={Boolean(
          controller.workspaceAIProxyToken?.key,
        )}
        workspaceRegion={controller.workspaceRegion}
      />
    );

    switch (currentTab) {
      case "overview":
        return renderUnifiedOverview();
      case "chat":
        return (
          <AgentChatWorkspace
            emptyDescription="进入对话页后会自动初始化当前 Agent 的会话，你可以直接在这里进行功能验证。"
            onDraftChange={(value) => {
              if (isMockItem) {
                setMockChatDraft(value);
                return;
              }
              setChatDraft(value);
            }}
            onOpen={() => {
              if (!isMockItem) {
                openChat(item);
              }
            }}
            onSend={() => {
              if (isMockItem) {
                const content = mockChatDraft.trim();
                if (!content) return;
                const now = new Date();
                const time = now.toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: false,
                });
                setMockChatMessages((current) => [
                  ...current,
                  {
                    id: `mock-user-${Date.now()}`,
                    role: "user",
                    content,
                    createdAt: time,
                  },
                  {
                    id: `mock-assistant-${Date.now() + 1}`,
                    role: "assistant",
                    content: `已收到你的输入：“${content}”。这是本地 mock 回复，用于预览发送后的样式。`,
                    createdAt: time,
                  },
                ]);
                setMockChatDraft("");
                return;
              }
              void sendChatMessage();
            }}
            session={isMockItem ? mockChatSession : chatSession}
          />
        );
      case "files":
        return (
          <AgentFilesWorkspace
            onChangeContent={(value) => {
              if (!isMockItem) {
                updateSelectedContent(value);
              }
            }}
            onCreateDirectory={(name) => {
              if (!isMockItem) {
                createDirectory(name);
              }
            }}
            onCreateFile={(name) => {
              if (!isMockItem) {
                createEmptyFile(name);
              }
            }}
            onDelete={(path) => {
              if (!isMockItem) {
                deleteEntry(path);
              }
            }}
            onDownload={(path) => {
              if (!isMockItem) {
                downloadEntry(path);
              }
            }}
            onEditEntry={(entry) => {
              if (!isMockItem) {
                editEntry(entry);
              }
            }}
            onOpen={() => {
              if (!isMockItem) {
                openFiles(item);
              }
            }}
            onSelectEntry={(entry) => {
              if (!isMockItem) {
                selectEntry(entry);
              }
            }}
            onOpenEntry={(entry) => {
              if (!isMockItem) {
                openEntry(entry);
              }
            }}
            onPrefetchDirectory={(path) => {
              if (!isMockItem) {
                prefetchDirectory(path);
              }
            }}
            onOpenParent={() => {
              if (!isMockItem) {
                openParentDirectory();
              }
            }}
            onJumpToPath={(path) => {
              if (!isMockItem) {
                jumpToPath(path);
              }
            }}
            onRefresh={() => {
              if (!isMockItem) {
                refreshDirectory();
              }
            }}
            onSave={() => {
              if (!isMockItem) {
                void saveSelectedFile();
              }
            }}
            onUpload={(files) => {
              if (!isMockItem) {
                uploadFiles(files);
              }
            }}
            session={isMockItem ? mockFilesSession : filesSession}
          />
        );
      case "settings":
        return renderUnifiedOverview();
      case "web-ui":
        return (
          <AgentWebUIWorkspace
            reason={item.webUIAccess?.reason}
            url={
              item.webUIAccess?.url || item.workspacesByKey["web-ui"]?.url || ""
            }
          />
        );
    }
  };

  if ((controller.loading || resolvingMissing) && !item) {
    return (
      <AgentWorkspaceShell>
        <div className="flex h-full min-w-0 flex-col px-6 lg:px-12">
          <div className="flex min-h-20 w-full items-center text-sm text-zinc-500">
            正在加载 Agent 详情...
          </div>
        </div>
      </AgentWorkspaceShell>
    );
  }

  if (!item) {
    return (
      <AgentWorkspaceShell>
        <div className="flex h-full min-w-0 flex-col px-6 lg:px-12">
          <AgentPageHeader
            backLabel="返回 Agent 列表"
            backTo="/agents"
            title="实例不存在"
          />
          <main className="flex min-h-0 flex-1 flex-col gap-3 pb-6">
            <AgentHubOverview
              message={controller.message}
              onClose={() => controller.setMessage("")}
            />
            <div className="workbench-card-strong flex h-full min-h-[320px] flex-1 items-center justify-center px-6 py-16 text-center text-sm text-zinc-500">
              当前没有找到名为{" "}
              <span className="font-medium text-zinc-950">{agentName}</span> 的
              Agent。
            </div>
          </main>
        </div>
      </AgentWorkspaceShell>
    );
  }

  return (
    <AgentWorkspaceShell>
      <div
        className={
          detailScale.enabled
            ? "h-full w-full overflow-x-hidden overflow-y-auto p-3"
            : "h-full w-full overflow-hidden"
        }
      >
        <div
          className={detailScale.enabled ? "relative" : "contents"}
          style={
            detailScale.enabled
              ? {
                width: DETAIL_SCALE_CANVAS_WIDTH * detailScale.scale,
                height: detailScale.canvasHeight * detailScale.scale,
              }
              : undefined
          }
        >
        <div
          className={cn(
            "flex min-w-0 flex-col",
            detailScale.enabled
              ? "absolute left-0 top-0 max-w-none px-0"
              : "mx-auto h-full w-full max-w-[1600px] px-5 lg:px-7 2xl:px-8",
          )}
          style={
            detailScale.enabled
              ? {
                width: DETAIL_SCALE_CANVAS_WIDTH,
                height: detailScale.canvasHeight,
                transform: `scale(${detailScale.scale})`,
                transformOrigin: "top left",
              }
              : undefined
          }
        >
          <AgentDetailHeader
            item={item}
            onDelete={() => {
              if (isMockAgentItem(item)) {
                return;
              }
              setDeleteTarget(item);
            }}
            configActionDisabled={controller.submitting}
            configEditing={false}
            onOpenConfig={openConfigModal}
            onOpenTerminalWindow={() => void handleOpenTerminalWindow()}
            onToggleState={handleToggleState}
          />

          <main className="flex min-h-0 flex-1 flex-col gap-3 pb-5">
            <AgentHubOverview
              message={controller.message}
              onClose={() => controller.setMessage("")}
            />

            <div className="flex min-h-0 min-w-0 flex-1 flex-row gap-4 overflow-hidden">
              {currentTab === "overview" ? null : (
                <AgentDetailSidebar
                  currentTab={currentTab}
                  item={item}
                  onTabChange={setCurrentTab}
                />
              )}
              <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
                {renderTabContent()}
              </div>
            </div>
          </main>
        </div>
        </div>
      </div>

      <DeleteAgentModal
        item={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        open={Boolean(deleteTarget)}
        submitting={controller.deleting}
      />

      <AgentConfigEditModal
        item={item}
        onClose={closeConfigModal}
        onRuntimeChange={(field, value) => {
          setRuntimeEditingItem(item);
          setRuntimeEditBlueprint((current) => {
            const base =
              current.appName === item.name ? current : activeRuntimeBlueprint;
            return updateBlueprintField(base, field, value);
          });
        }}
        onRuntimePreset={(presetId) => {
          setRuntimeEditingItem(item);
          setRuntimeEditBlueprint((current) => {
            const base =
              current.appName === item.name ? current : activeRuntimeBlueprint;
            return applyBlueprintPreset(base, presetId);
          });
        }}
        onSave={() => void handleSaveConfig()}
        onSettingsChange={(field, value) => {
          setSettingsEditingItem(item);
          setSettingsEditBlueprint((current) => {
            const base =
              current.appName === item.name ? current : activeSettingsBlueprint;
            return updateBlueprintField(base, field, value);
          });
        }}
        onSettingsFieldChange={(field, value) => {
          setSettingsEditingItem(item);
          setSettingsEditBlueprint((current) => {
            const base =
              current.appName === item.name ? current : activeSettingsBlueprint;
            return writeBlueprintSettingValue(base, field, value);
          });
        }}
        open={configModalOpen}
        runtimeBlueprint={activeRuntimeBlueprint}
        settingsBlueprint={activeSettingsBlueprint}
        submitting={controller.submitting}
        template={controller.findTemplateById(item.templateId)}
      />
    </AgentWorkspaceShell>
  );
}
