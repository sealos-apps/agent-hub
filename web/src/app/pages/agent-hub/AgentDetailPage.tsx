import { useEffect, useMemo, useRef, useState } from "react";
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
import { writeBlueprintSettingValue } from "../../../domains/agents/blueprintFields";
import { createBlueprintFromAgentItem } from "../../../domains/agents/mappers";
import { createEmptyBlueprint } from "../../../domains/agents/templates";
import type {
  AgentBlueprint,
  AgentFileItem,
  AgentListItem,
  ChatSessionState,
  FilesSessionState,
} from "../../../domains/agents/types";
import { AgentDetailHeader } from "./components/AgentDetailHeader";
import { AgentDetailOverview } from "./components/AgentDetailOverview";
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

const MOCK_AGENT_ID_PREFIX = "mock-agent-";

function isMockAgentItem(item: AgentListItem | null | undefined) {
  return Boolean(item?.id?.startsWith(MOCK_AGENT_ID_PREFIX));
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

  const closeRuntimeEditFlow = () => {
    setRuntimeEditingItem(null);
    setRuntimeEditBlueprint(createEmptyBlueprint());
  };

  const closeSettingsEditFlow = () => {
    setSettingsEditingItem(null);
    setSettingsEditBlueprint(createEmptyBlueprint());
  };

  const handleSubmitRuntime = async (
    targetItem: AgentListItem,
    nextBlueprint: AgentBlueprint,
  ) => {
    try {
      await controller.updateAgentRuntimeFromBlueprint(
        targetItem,
        nextBlueprint,
      );
      closeRuntimeEditFlow();
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "更新失败",
      );
    }
  };

  const handleSubmitSettings = async (
    targetItem: AgentListItem,
    nextBlueprint: AgentBlueprint,
  ) => {
    try {
      await controller.updateAgentSettingsFromBlueprint(
        targetItem,
        nextBlueprint,
      );
      closeSettingsEditFlow();
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : "更新失败",
      );
    }
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

  const renderTabContent = () => {
    if (!item) return null;
    const runtimeBlueprint =
      runtimeEditingItem?.name === item.name
        ? runtimeEditBlueprint
        : createBlueprintFromAgentItem(item);
    const settingsBlueprint =
      settingsEditingItem?.name === item.name
        ? settingsEditBlueprint
        : createBlueprintFromAgentItem(item);

    switch (currentTab) {
      case "overview":
        return (
          <AgentDetailOverview
            clusterContext={controller.clusterContext}
            item={item}
            onErrorMessage={controller.setMessage}
          />
        );
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
        return (
          <AgentSettingsWorkspace
            item={item}
            onRuntimeChange={(field, value) => {
              setRuntimeEditingItem(item);
              setRuntimeEditBlueprint((current) => {
                const base =
                  current.appName === item.name ? current : runtimeBlueprint;
                return updateBlueprintField(base, field, value);
              });
            }}
            onRuntimePreset={(presetId) => {
              setRuntimeEditingItem(item);
              setRuntimeEditBlueprint((current) => {
                const base =
                  current.appName === item.name ? current : runtimeBlueprint;
                return applyBlueprintPreset(base, presetId);
              });
            }}
            onSaveRuntime={() =>
              void handleSubmitRuntime(item, runtimeBlueprint)
            }
            onSaveSettings={() =>
              void handleSubmitSettings(item, settingsBlueprint)
            }
            onSettingsChange={(field, value) => {
              setSettingsEditingItem(item);
              setSettingsEditBlueprint((current) => {
                const base =
                  current.appName === item.name ? current : settingsBlueprint;
                return updateBlueprintField(base, field, value);
              });
            }}
            onSettingsFieldChange={(field, value) => {
              setSettingsEditingItem(item);
              setSettingsEditBlueprint((current) => {
                const base =
                  current.appName === item.name ? current : settingsBlueprint;
                return writeBlueprintSettingValue(base, field, value);
              });
            }}
            runtimeBlueprint={runtimeBlueprint}
            settingsBlueprint={settingsBlueprint}
            submitting={controller.submitting}
            template={controller.findTemplateById(item.templateId)}
            workspaceModelBaseURL={controller.workspaceAIProxyModelBaseURL}
            workspaceModelKeyReady={Boolean(
              controller.workspaceAIProxyToken?.key,
            )}
            workspaceRegion={controller.workspaceRegion}
          />
        );
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
      <div className="flex h-full min-w-0 flex-col px-6 lg:px-12">
        <AgentDetailHeader
          item={item}
          onDelete={() => {
            if (isMockAgentItem(item)) {
              return;
            }
            setDeleteTarget(item);
          }}
          onOpenConfig={() => setCurrentTab("settings")}
          onOpenTerminalWindow={() => void handleOpenTerminalWindow()}
          onToggleState={handleToggleState}
        />

        <main className="flex min-h-0 flex-1 flex-col gap-5 pb-8 lg:pb-10">
          <AgentHubOverview
            message={controller.message}
            onClose={() => controller.setMessage("")}
          />

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-5 overflow-hidden min-[860px]:flex-row">
            <AgentDetailSidebar
              currentTab={currentTab}
              item={item}
              onTabChange={setCurrentTab}
            />
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
              {renderTabContent()}
            </div>
          </div>
        </main>

        <DeleteAgentModal
          item={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={handleDelete}
          open={Boolean(deleteTarget)}
          submitting={controller.deleting}
        />
      </div>
    </AgentWorkspaceShell>
  );
}
