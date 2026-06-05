import { useEffect, useMemo, useRef, useState } from "react";
import {
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { DeleteAgentModal } from "../../../components/business/agents/DeleteAgentModal";
import { AgentConfigEditModal } from "../../../components/business/agents/AgentConfigEditModal";
import { AgentChatWorkspace } from "../../../components/business/chat/AgentChatWorkspace";
import { AgentFilesWorkspace } from "../../../components/business/files/AgentFilesWorkspace";
import { AgentWebUIWorkspace } from "../../../components/business/web-ui/AgentWebUIWorkspace";
import {
  writeBlueprintSettingValue,
} from "../../../domains/agents/blueprintFields";
import { createBlueprintFromAgentItem } from "../../../domains/agents/mappers";
import {
  createEmptyBlueprint,
} from "../../../domains/agents/templates";
import type {
  AgentBlueprint,
  AgentFileItem,
  AgentListItem,
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
import { AGENTHUB_CONSOLE_ROUTE, openAgentConsoleDesktopWindow } from "./lib/consoleWindow";
import { cn } from "../../../lib/format";
import { useI18n } from "../../../i18n";

const MOCK_AGENT_ID_PREFIX = "mock-agent-";
const DETAIL_SCALE_BREAKPOINT = 1180;
const DETAIL_SCALE_CANVAS_WIDTH = 1024;
const DETAIL_SCALE_CANVAS_HEIGHT = 900;
const DETAIL_SCALE_PADDING = 24;
const DETAIL_SCALE_SHELL_HEADER_HEIGHT = 58;

type DetailScaleState = {
  enabled: boolean;
  mode: "fixed" | "fluid" | "none";
  scale: number;
  canvasWidth: number;
  canvasHeight: number;
};

function isMockAgentItem(item: AgentListItem | null | undefined) {
  return Boolean(item?.id?.startsWith(MOCK_AGENT_ID_PREFIX));
}

function resolveDetailScaleState(): DetailScaleState {
  if (typeof window === "undefined") {
    return { enabled: false, mode: "none", scale: 1, canvasWidth: 0, canvasHeight: 0 };
  }

  const availableWidth = Math.max(320, window.innerWidth - DETAIL_SCALE_PADDING);
  const availableHeight = Math.max(
    360,
    window.innerHeight - DETAIL_SCALE_SHELL_HEADER_HEIGHT - DETAIL_SCALE_PADDING,
  );
  const widthScale = Math.min(1, availableWidth / DETAIL_SCALE_CANVAS_WIDTH);
  const heightScale = Math.min(1, availableHeight / DETAIL_SCALE_CANVAS_HEIGHT);

  if (window.innerWidth < DETAIL_SCALE_BREAKPOINT || widthScale < 0.995) {
    return {
      enabled: true,
      mode: "fixed",
      scale: Number(Math.min(widthScale, heightScale).toFixed(4)),
      canvasWidth: DETAIL_SCALE_CANVAS_WIDTH,
      canvasHeight: DETAIL_SCALE_CANVAS_HEIGHT,
    };
  }

  if (heightScale < 0.995) {
    return {
      enabled: true,
      mode: "fluid",
      scale: Number(heightScale.toFixed(4)),
      canvasWidth: 0,
      canvasHeight: DETAIL_SCALE_CANVAS_HEIGHT,
    };
  }

  return { enabled: false, mode: "none", scale: 1, canvasWidth: 0, canvasHeight: 0 };
}

export function AgentDetailPage() {
  const { t } = useI18n();
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
      t,
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
    t,
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
          t('agent.mockChatGreeting'),
        createdAt: "10:12:08",
      },
      {
        id: "mock-user-1",
        role: "user",
        content: t('agent.mockChatRequest'),
        createdAt: "10:12:19",
      },
      {
        id: "mock-assistant-2",
        role: "assistant",
        content:
          t('agent.mockChatResponse'),
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
      loadedPath: "/workspace",
      items,
      selectedItem: openedItem,
      openedItem,
      detailMode: "preview",
      previewContent:
        t('agent.mockFilesContent'),
      draftContent: "",
      previewObjectUrl: "",
      previewObjectType: "text/markdown",
      activity: t('agent.mockFilesLoaded'),
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
    activeSettingsBlueprint.modelAPIMode !== originalBlueprint.modelAPIMode ||
    activeSettingsBlueprint.modelBaseURL !== originalBlueprint.modelBaseURL ||
    activeSettingsBlueprint.keySource !== originalBlueprint.keySource ||
    JSON.stringify(activeSettingsBlueprint.modelSlots) !==
      JSON.stringify(originalBlueprint.modelSlots) ||
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
        error instanceof Error ? error.message : t('agent.deleteFailed'),
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
        error instanceof Error ? error.message : t('agent.toggleFailed'),
      );
    }
  };

  const handleOpenTerminalWindow = async () => {
    if (!item) return;

    if (isMockAgentItem(item)) {
      navigate(`${AGENTHUB_CONSOLE_ROUTE}?agentName=${encodeURIComponent(item.name)}`);
      return;
    }

    try {
      await openAgentConsoleDesktopWindow(item);
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : t('agent.openConsoleFailed'),
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
        error instanceof Error ? error.message : t('agent.saveFailed'),
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
            emptyDescription={t('agent.chatAutoInitDesc')}
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
                    content: t('agent.mockReply', { content }),
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
            {t('agent.detailLoading')}
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
            backLabel={t('nav.backAgentList')}
            backTo="/agents"
            title={t('agent.notFoundTitle')}
          />
          <main className="flex min-h-0 flex-1 flex-col gap-3 pb-6">
            <AgentHubOverview
              message={controller.message}
              onClose={() => controller.setMessage("")}
            />
            <div className="workbench-card-strong flex h-full min-h-[320px] flex-1 items-center justify-center px-6 py-16 text-center text-sm text-zinc-500">
              {t('agent.notFoundMessage', { name: agentName })}
            </div>
          </main>
        </div>
      </AgentWorkspaceShell>
    );
  }

  const fixedDetailScale = detailScale.mode === "fixed";
  const fluidDetailScale = detailScale.mode === "fluid";

  return (
    <AgentWorkspaceShell>
      <div
        className={
          fixedDetailScale
            ? "h-full w-full overflow-x-hidden overflow-y-auto p-3"
            : fluidDetailScale
              ? "h-full w-full overflow-hidden"
            : "h-full w-full overflow-hidden"
        }
      >
        <div
          className={fixedDetailScale ? "relative" : fluidDetailScale ? "relative h-full w-full overflow-hidden" : "contents"}
          style={
            fixedDetailScale
              ? {
                width: detailScale.canvasWidth * detailScale.scale,
                height: detailScale.canvasHeight * detailScale.scale,
              }
              : undefined
          }
        >
        <div
          className={cn(
            "flex min-w-0 flex-col",
            fixedDetailScale
              ? "absolute left-0 top-0 max-w-none px-0"
              : fluidDetailScale
                ? "absolute left-0 top-0 max-w-none px-5 lg:px-7 2xl:px-8"
              : "mx-auto h-full w-full max-w-[1600px] px-5 lg:px-7 2xl:px-8",
          )}
          style={
            fixedDetailScale
              ? {
                width: detailScale.canvasWidth,
                height: detailScale.canvasHeight,
                transform: `scale(${detailScale.scale})`,
                transformOrigin: "top left",
              }
              : fluidDetailScale
                ? {
                  width: `${100 / detailScale.scale}%`,
                  height: `${100 / detailScale.scale}%`,
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
