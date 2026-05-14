import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AgentConfigEditModal } from '../../../components/business/agents/AgentConfigEditModal'
import { DeleteAgentModal } from '../../../components/business/agents/DeleteAgentModal'
import {
  AgentInstancesTable,
  type AgentListSortKey,
  type AgentListSortOrder,
  type AgentListStatusFilter,
} from '../../../components/business/agents/AgentInstancesTable'
import type {
  AgentAccessItem,
  AgentActionItem,
  AgentBlueprint,
  AgentContract,
  AgentListItem,
  AgentTemplateDefinition,
  ClusterInfo,
} from '../../../domains/agents/types'
import {
  applyCurrentModelToBlueprint,
  writeBlueprintSettingValue,
} from '../../../domains/agents/blueprintFields'
import { createEmptyBlueprint } from '../../../domains/agents/templates'
import { AgentCapabilityOverlays } from './components/AgentCapabilityOverlays'
import { AgentHubOverview } from './components/AgentHubOverview'
import { AgentListHeroEmpty } from './components/AgentListHeroEmpty'
import { AgentWorkspaceShell } from './components/AgentWorkspaceShell'
import { useAgentHub } from './hooks/AgentHubControllerContext'
import { useAgentChat } from './hooks/useAgentChat'
import { useAgentFiles } from './hooks/useAgentFiles'
import { applyBlueprintPreset, updateBlueprintField } from './lib/blueprint'
import { openAgentConsoleDesktopWindow } from './lib/consoleWindow'

const MOCK_AGENT_ID_PREFIX = 'mock-agent-'
const ALL_STATUS_FILTERS: AgentListStatusFilter = [
  'running',
  'creating',
  'stopped',
  'error',
]
const ENABLE_MOCK_AGENTS =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_ENABLE_MOCK_AGENTS || '').toLowerCase() === 'true'

function isMockAgentItem(item: AgentListItem) {
  return item.id.startsWith(MOCK_AGENT_ID_PREFIX)
}

function indexByKey<T extends { key: string }>(items: T[]) {
  return Object.fromEntries(items.map((item) => [item.key, item])) as Record<
    string,
    T
  >
}

function buildMockAccess(template: AgentTemplateDefinition): AgentAccessItem[] {
  return template.access.map((access) => {
    if (access.key === 'web-ui') {
      return {
        key: access.key,
        label: access.label,
        enabled: true,
        status: 'ready',
        url: 'https://demo-agent.usw-1.sealos.app',
        auth: access.auth,
        rootPath: access.rootPath,
        modes: access.modes,
      }
    }

    if (access.key === 'files') {
      return {
        key: access.key,
        label: access.label,
        enabled: true,
        status: 'ready',
        rootPath: access.rootPath || template.workingDir,
        modes: access.modes,
      }
    }

    if (access.key === 'terminal') {
      return {
        key: access.key,
        label: access.label,
        enabled: true,
        status: 'ready',
        auth: access.auth,
        rootPath: access.rootPath || template.workingDir,
        modes: access.modes,
      }
    }

    if (access.key === 'api') {
      return {
        key: access.key,
        label: access.label,
        enabled: true,
        status: 'ready',
        url: 'https://demo-agent.usw-1.sealos.app/v1',
        auth: access.auth,
        rootPath: access.rootPath,
        modes: access.modes,
      }
    }

    if (access.key === 'ssh') {
      return {
        key: access.key,
        label: access.label,
        enabled: true,
        status: 'ready',
        host: 'demo-agent.usw-1.sealos.app',
        port: 22,
        userName: template.user,
        workingDir: template.workingDir,
      }
    }

    if (access.key === 'ide') {
      return {
        key: access.key,
        label: access.label,
        enabled: true,
        status: 'ready',
        url: 'https://demo-agent.usw-1.sealos.app/ide',
        auth: access.auth,
      }
    }

    return {
      key: access.key,
      label: access.label,
      enabled: true,
      status: 'ready',
      auth: access.auth,
      rootPath: access.rootPath,
      modes: access.modes,
    }
  })
}

function buildMockActions(status: AgentListItem['status']): AgentActionItem[] {
  const isRunning = status === 'running'
  const isStopped = status === 'stopped'

  return [
    { key: 'open-chat', label: '对话', enabled: isRunning },
    { key: 'open-terminal', label: '终端', enabled: isRunning },
    { key: 'open-files', label: '文件', enabled: true },
    { key: 'open-settings', label: '配置', enabled: true },
    { key: 'run', label: '启动', enabled: isStopped },
    { key: 'pause', label: '暂停', enabled: isRunning },
    { key: 'delete', label: '删除', enabled: true },
  ]
}

function buildMockContract({
  name,
  aliasName,
  namespace,
  status,
  statusText,
  cpu,
  memory,
  storage,
  template,
  modelProvider,
  modelBaseURL,
  model,
  hasModelAPIKey,
  keySource,
  bootstrapPhase = '',
  bootstrapMessage = '',
}: {
  name: string
  aliasName: string
  namespace: string
  status: string
  statusText: string
  cpu: string
  memory: string
  storage: string
  template: AgentTemplateDefinition
  modelProvider: string
  modelBaseURL: string
  model: string
  hasModelAPIKey: boolean
  keySource: string
  bootstrapPhase?: string
  bootstrapMessage?: string
}): AgentContract {
  const access = buildMockAccess(template)
  const actions = buildMockActions(
    status === 'Running'
      ? 'running'
      : status === 'Paused'
        ? 'stopped'
        : 'creating',
  )

  return {
    core: {
      name,
      aliasName,
      templateId: template.id,
      namespace,
      status,
      statusText,
      ready: status === 'Running',
      bootstrapPhase,
      bootstrapMessage,
      createdAt: new Date().toISOString(),
    },
    workspaces: template.workspaces.map((workspace) => ({
      key: workspace.key,
      label: workspace.label,
      enabled: true,
      url: workspace.key === 'files' ? '/agents/mock?tab=files' : undefined,
    })),
    access,
    runtime: {
      cpu,
      memory,
      storage,
      runtimeClassName: 'devbox-runtime',
      workingDir: template.workingDir,
      user: template.user,
      networkType: 'public',
      sshPort: 22,
      modelProvider,
      modelBaseURL,
      model,
      hasModelAPIKey,
    },
    settings: {
      runtime: [],
      agent: [
        {
          key: 'keySource',
          label: '密钥来源',
          type: 'text',
          binding: { kind: 'literal' },
          readOnly: true,
          value: keySource,
        },
      ],
    },
    actions,
  }
}

function createMockAgentItem({
  id,
  name,
  aliasName,
  template,
  namespace,
  owner,
  status,
  statusText,
  cpu,
  memory,
  storage,
  modelProvider,
  modelBaseURL,
  model,
  hasModelAPIKey,
  keySource,
  bootstrapPhase = '',
  bootstrapMessage = '',
}: {
  id: string
  name: string
  aliasName: string
  template: AgentTemplateDefinition
  namespace: string
  owner: string
  status: AgentListItem['status']
  statusText: string
  cpu: string
  memory: string
  storage: string
  modelProvider: string
  modelBaseURL: string
  model: string
  hasModelAPIKey: boolean
  keySource: string
  bootstrapPhase?: string
  bootstrapMessage?: string
}): AgentListItem {
  const rawStatus =
    status === 'running'
      ? 'Running'
      : status === 'stopped'
        ? 'Paused'
        : 'Creating'
  const contract = buildMockContract({
    name,
    aliasName,
    namespace,
    status: rawStatus,
    statusText,
    cpu,
    memory,
    storage,
    template,
    modelProvider,
    modelBaseURL,
    model,
    hasModelAPIKey,
    keySource,
    bootstrapPhase,
    bootstrapMessage,
  })
  const accessByKey = indexByKey(contract.access)
  const actionsByKey = indexByKey(contract.actions)
  const workspacesByKey = indexByKey(contract.workspaces)

  return {
    id,
    name,
    aliasName,
    namespace,
    owner,
    status,
    statusText,
    updatedAt: new Date().toISOString(),
    cpu,
    memory,
    storage,
    workingDir: template.workingDir,
    templateId: template.id,
    template,
    contract,
    workspaces: contract.workspaces,
    workspacesByKey,
    access: contract.access,
    accessByKey,
    actions: contract.actions,
    actionsByKey,
    rawStatus,
    modelProvider,
    modelBaseURL,
    model,
    hasModelAPIKey,
    keySource,
    ready: status === 'running',
    bootstrapPhase,
    bootstrapMessage,
    chatAvailable: status === 'running',
    chatDisabledReason: status === 'running' ? '' : '实例未运行，暂不可对话',
    terminalAvailable: status === 'running',
    terminalDisabledReason:
      status === 'running' ? '' : '实例未运行，暂不可进入终端',
    settingsAvailable: true,
    webUIAvailable: true,
    sshAvailable: true,
    ideAvailable: true,
    apiBaseURL: 'https://demo-agent.usw-1.sealos.app/v1',
    sshAccess: accessByKey.ssh || null,
    ideAccess: accessByKey.ide || null,
    webUIAccess: accessByKey['web-ui'] || null,
    resourceGroup: {
      devbox: null,
      service: null,
      ingress: null,
    },
    yaml: {},
  }
}

function buildMockAgentItems(
  templates: AgentTemplateDefinition[],
  clusterInfo: ClusterInfo | null,
): AgentListItem[] {
  if (!templates.length) return []

  const namespace = clusterInfo?.namespace || 'agent-hub'
  const owner = clusterInfo?.operator || 'Sealos'
  const fallbackTemplate = templates[0]
  const hermesTemplate =
    templates.find((template) => template.id === 'hermes-agent') ||
    fallbackTemplate
  const openclawTemplate =
    templates.find((template) => template.id === 'openclaw') || fallbackTemplate

  return [
    createMockAgentItem({
      id: `${MOCK_AGENT_ID_PREFIX}hermes-1`,
      name: 'hermes-agent-demo',
      aliasName: 'Hermes Agent',
      template: hermesTemplate,
      namespace,
      owner,
      status: 'running',
      statusText: '运行中',
      cpu: '2000m',
      memory: '4096Mi',
      storage: '10Gi',
      modelProvider: 'openai',
      modelBaseURL: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      hasModelAPIKey: true,
      keySource: 'workspace',
    }),
    createMockAgentItem({
      id: `${MOCK_AGENT_ID_PREFIX}openclaw-1`,
      name: 'openclaw-agent-demo',
      aliasName: 'OpenClaw Agent',
      template: openclawTemplate,
      namespace,
      owner,
      status: 'creating',
      statusText: '创建中',
      cpu: '1000m',
      memory: '2048Mi',
      storage: '10Gi',
      modelProvider: 'openrouter',
      modelBaseURL: 'https://openrouter.ai/api/v1',
      model: 'anthropic/claude-3.5-sonnet',
      hasModelAPIKey: false,
      keySource: 'workspace',
      bootstrapPhase: 'bootstrap',
      bootstrapMessage: '正在初始化工作目录和依赖，请稍候…',
    }),
    createMockAgentItem({
      id: `${MOCK_AGENT_ID_PREFIX}hermes-2`,
      name: 'daily-ops-agent',
      aliasName: 'Hermes Daily Ops',
      template: hermesTemplate,
      namespace,
      owner,
      status: 'stopped',
      statusText: '已暂停',
      cpu: '4000m',
      memory: '8192Mi',
      storage: '20Gi',
      modelProvider: 'openai',
      modelBaseURL: 'https://api.openai.com/v1',
      model: 'gpt-4.1',
      hasModelAPIKey: true,
      keySource: 'workspace',
    }),
  ]
}

export function AgentsListPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const controller = useAgentHub()
  const [deleteTarget, setDeleteTarget] = useState<AgentListItem | null>(null)
  const [configTarget, setConfigTarget] = useState<AgentListItem | null>(null)
  const [runtimeEditBlueprint, setRuntimeEditBlueprint] =
    useState<AgentBlueprint>(() => createEmptyBlueprint())
  const [settingsEditBlueprint, setSettingsEditBlueprint] =
    useState<AgentBlueprint>(() => createEmptyBlueprint())
  const [sortKey, setSortKey] = useState<AgentListSortKey>('updatedAt')
  const [sortOrder, setSortOrder] = useState<AgentListSortOrder>('desc')
  const [statusFilter, setStatusFilter] =
    useState<AgentListStatusFilter>(ALL_STATUS_FILTERS)
  const keyword = String(searchParams.get('q') || '')

  const { chatSession, closeChat, openChat, sendChatMessage, setChatDraft } =
    useAgentChat({
      clusterContext: controller.clusterContext,
      onErrorMessage: controller.setMessage,
    })

  const {
    closeFiles,
    createDirectory,
    createEmptyFile,
    deleteEntry,
    downloadEntry,
    editEntry,
    filesSession,
    jumpToPath,
    openFiles,
    openEntry,
    openParentDirectory,
    prefetchDirectory,
    refreshDirectory,
    saveSelectedFile,
    selectEntry,
    updateSelectedContent,
    uploadFiles,
  } = useAgentFiles({
    clusterContext: controller.clusterContext,
  })

  const previewItems = useMemo(
    () =>
      controller.items.length > 0
        ? controller.items
        : ENABLE_MOCK_AGENTS
          ? buildMockAgentItems(controller.templates, controller.clusterInfo)
          : [],
    [controller.clusterInfo, controller.items, controller.templates],
  )

  const filteredItems = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    const keywordMatched = normalized
      ? previewItems.filter((item) =>
          [
            item.name,
            item.aliasName,
            item.namespace,
            item.template.name,
            item.model,
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalized),
        )
      : previewItems

    const statusMatched =
      statusFilter.length === ALL_STATUS_FILTERS.length
        ? keywordMatched
        : keywordMatched.filter((item) => statusFilter.includes(item.status))

    return [...statusMatched].sort((left, right) => {
      if (sortKey === 'name') {
        const leftValue = (left.aliasName || left.name).toLowerCase()
        const rightValue = (right.aliasName || right.name).toLowerCase()
        const result = leftValue.localeCompare(rightValue, 'zh-CN')
        return sortOrder === 'asc' ? result : -result
      }

      const leftTime = new Date(left.updatedAt).getTime()
      const rightTime = new Date(right.updatedAt).getTime()
      const result = leftTime - rightTime
      return sortOrder === 'asc' ? result : -result
    })
  }, [keyword, previewItems, sortKey, sortOrder, statusFilter])

  const toggleSort = (nextKey: AgentListSortKey) => {
    if (sortKey === nextKey) {
      setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(nextKey)
    setSortOrder(nextKey === 'updatedAt' ? 'desc' : 'asc')
  }

  const handleMockPreview = () => {
    // mock 数据仅用于样式预览：静默拦截交互，不展示提示横幅
  }

  const handleOpenConfig = async (item: AgentListItem) => {
    if (!item.settingsAvailable) {
      controller.setMessage('当前实例暂不支持修改配置')
      return
    }
    try {
      const currentModel = await controller.readAgentCurrentModel(item)
      const blueprint = currentModel
        ? applyCurrentModelToBlueprint(
            controller.createBlueprintFromAgentItem(item),
            currentModel,
          )
        : controller.createBlueprintFromAgentItem(item)
      setConfigTarget(item)
      setRuntimeEditBlueprint(blueprint)
      setSettingsEditBlueprint(blueprint)
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : '读取当前模型失败',
      )
    }
  }

  const handleCloseConfig = () => {
    setConfigTarget(null)
    setRuntimeEditBlueprint(createEmptyBlueprint())
    setSettingsEditBlueprint(createEmptyBlueprint())
  }

  const handleSubmitConfig = async () => {
    if (!configTarget) return

    if (isMockAgentItem(configTarget)) {
      handleCloseConfig()
      handleMockPreview()
      return
    }

    const originalBlueprint =
      controller.createBlueprintFromAgentItem(configTarget)
    const runtimeDirty =
      runtimeEditBlueprint.profile !== originalBlueprint.profile ||
      runtimeEditBlueprint.cpu !== originalBlueprint.cpu ||
      runtimeEditBlueprint.memory !== originalBlueprint.memory ||
      runtimeEditBlueprint.storageLimit !== originalBlueprint.storageLimit
    const settingsDirty =
      settingsEditBlueprint.aliasName !== originalBlueprint.aliasName ||
      settingsEditBlueprint.model !== originalBlueprint.model ||
      settingsEditBlueprint.modelProvider !== originalBlueprint.modelProvider ||
      settingsEditBlueprint.modelBaseURL !== originalBlueprint.modelBaseURL ||
      settingsEditBlueprint.keySource !== originalBlueprint.keySource ||
      JSON.stringify(settingsEditBlueprint.settingsValues) !==
        JSON.stringify(originalBlueprint.settingsValues)

    if (!runtimeDirty && !settingsDirty) {
      handleCloseConfig()
      return
    }

    try {
      if (runtimeDirty) {
        await controller.updateAgentRuntimeFromBlueprint(
          configTarget,
          runtimeEditBlueprint,
        )
      }
      if (settingsDirty) {
        await controller.updateAgentSettingsFromBlueprint(
          configTarget,
          settingsEditBlueprint,
        )
      }
      handleCloseConfig()
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : '保存配置失败',
      )
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return

    if (isMockAgentItem(deleteTarget)) {
      setDeleteTarget(null)
      handleMockPreview()
      return
    }

    try {
      await controller.deleteAgentItem(deleteTarget)
      setDeleteTarget(null)
    } catch (error) {
      controller.setMessage(error instanceof Error ? error.message : '删除失败')
    }
  }

  const handleToggleState = async (item: AgentListItem) => {
    if (isMockAgentItem(item)) {
      handleMockPreview()
      return
    }

    try {
      await controller.toggleItemState(item)
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : '切换运行状态失败',
      )
    }
  }

  const handleRenameAlias = async (item: AgentListItem, aliasName: string) => {
    try {
      await controller.updateAgentAlias(item, aliasName)
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : '修改别名失败',
      )
      throw error
    }
  }

  const handleOpenTerminal = async (item: AgentListItem) => {
    if (isMockAgentItem(item)) {
      navigate(`/desktop/console?agentName=${encodeURIComponent(item.name)}`)
      return
    }

    try {
      await openAgentConsoleDesktopWindow(item)
    } catch (error) {
      controller.setMessage(
        error instanceof Error ? error.message : '打开控制台窗口失败',
      )
    }
  }

  const handleOpenWebUI = (item: AgentListItem) => {
    if (isMockAgentItem(item)) {
      handleMockPreview()
      return
    }

    if (!item.webUIAccess?.enabled || !item.webUIAccess.url) {
      controller.setMessage(
        item.webUIAccess?.reason || '当前模板没有可用的 Web UI 地址',
      )
      return
    }
    window.open(item.webUIAccess.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <AgentWorkspaceShell>
      <div className="flex h-full w-full min-w-0 flex-col">
        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-0 pt-6 sm:px-5 min-[960px]:px-2 lg:px-8">
          <AgentHubOverview
            message={controller.message}
            onClose={() => controller.setMessage('')}
          />

          {controller.loading ? (
            <div className="flex h-full min-h-[420px] flex-1 items-center justify-center rounded-[16px] border border-zinc-200 bg-white px-6 py-16 text-center text-sm text-zinc-500">
              正在加载 Agent 实例...
            </div>
          ) : filteredItems.length === 0 && previewItems.length > 0 ? (
            <AgentListHeroEmpty
              mode="search"
              onAction={() => {
                const next = new URLSearchParams(searchParams)
                next.delete('q')
                setSearchParams(next, { replace: true })
                setStatusFilter(ALL_STATUS_FILTERS)
              }}
            />
          ) : filteredItems.length === 0 ? (
            <AgentListHeroEmpty
              mode="create"
              onAction={() => navigate('/agents/templates')}
            />
          ) : (
            <AgentInstancesTable
              items={filteredItems}
              onStatusFilterChange={setStatusFilter}
              onChat={openChat}
              onDelete={setDeleteTarget}
              onEdit={(item) => void handleOpenConfig(item)}
              onFiles={openFiles}
              onOpenDetail={(item) => void handleOpenConfig(item)}
              onRenameAlias={handleRenameAlias}
              onTerminal={handleOpenTerminal}
              onToggleState={handleToggleState}
              onToggleNameSort={() => toggleSort('name')}
              onToggleUpdatedAtSort={() => toggleSort('updatedAt')}
              onWebUI={handleOpenWebUI}
              sortKey={sortKey}
              sortOrder={sortOrder}
              statusFilter={statusFilter}
            />
          )}
        </main>
      </div>

      {configTarget ? (
        <AgentConfigEditModal
          onClose={handleCloseConfig}
          onRuntimeChange={(field, value) => {
            setRuntimeEditBlueprint((current) =>
              updateBlueprintField(current, field, value),
            )
          }}
          onRuntimePreset={(presetId) => {
            setRuntimeEditBlueprint((current) =>
              applyBlueprintPreset(current, presetId),
            )
          }}
          onSave={() => void handleSubmitConfig()}
          onSettingsChange={(field, value) => {
            setSettingsEditBlueprint((current) =>
              updateBlueprintField(current, field, value),
            )
          }}
          onSettingsFieldChange={(field, value) => {
            setSettingsEditBlueprint((current) =>
              writeBlueprintSettingValue(current, field, value),
            )
          }}
          open={Boolean(configTarget)}
          runtimeBlueprint={runtimeEditBlueprint}
          settingsBlueprint={settingsEditBlueprint}
          submitting={controller.submitting}
          template={configTarget?.template || null}
        />
      ) : null}

      <DeleteAgentModal
        item={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        open={Boolean(deleteTarget)}
        submitting={controller.deleting}
      />

      <AgentCapabilityOverlays
        chatSession={chatSession}
        filesSession={filesSession}
        onChangeFileContent={updateSelectedContent}
        onChatDraftChange={setChatDraft}
        onCloseChat={closeChat}
        onCloseFiles={closeFiles}
        onCreateDirectory={createDirectory}
        onCreateFile={createEmptyFile}
        onDeleteFile={deleteEntry}
        onDownloadFile={downloadEntry}
        onEditFileEntry={editEntry}
        onSelectFileEntry={selectEntry}
        onOpenFileEntry={openEntry}
        onPrefetchDirectory={prefetchDirectory}
        onOpenParentDirectory={openParentDirectory}
        onOpenPath={jumpToPath}
        onRefreshFiles={refreshDirectory}
        onSaveFile={() => void saveSelectedFile()}
        onSendChat={sendChatMessage}
        onUploadFiles={uploadFiles}
      />
    </AgentWorkspaceShell>
  )
}
