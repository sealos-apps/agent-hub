import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileText,
  Folder,
  FolderOpen,
  Globe,
  Home,
  LoaderCircle,
  Plus,
  Search,
  Terminal,
  Undo2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { createClusterContext, getAgentConsole, getClusterInfo, listAgentTemplates } from '../../../api'
import { APP_NAME, APP_TERMINAL_ICON_URL } from '../../../branding'
import { AgentFileCodeEditor } from '../../../components/business/files/AgentFileCodeEditor'
import { isTextPreviewableFile } from '../../../components/business/files/fileHelpers'
import { AgentTerminalWorkspace } from '../../../components/business/terminal/AgentTerminalWorkspace'
import { mapBackendAgentsToListItems } from '../../../domains/agents/mappers'
import { hydrateTemplateCatalog } from '../../../domains/agents/templates'
import type {
  AgentConsoleServiceItem,
  AgentFileItem,
  AgentListItem,
  ClusterContext,
  TerminalSessionState,
} from '../../../domains/agents/types'
import { addSealosAppEventListener, getSealosSession } from '../../../sealosSdk'
import { useAgentFiles } from './hooks/useAgentFiles'
import { useAgentTerminal } from './hooks/useAgentTerminal'
import {
  applyAutoExpandChain,
  buildExplorerPathChain,
  explorerFileSystemRootPath,
  isTrustedDesktopMessageOrigin,
  normalizeExplorerPath,
} from './lib/consoleExplorerHelpers'
import { createInitialConsoleTabs, initialConsoleTabId } from './lib/consoleTabs'
import { parseAgentTerminalDesktopMessage } from './lib/desktopMessages'
import { buildMockClusterContext, buildMockConsoleBootstrap } from './lib/mockData'

type HomeTab = { id: string; type: 'home'; title: string }
type TerminalTab = { id: string; type: 'terminal'; title: string }
type WebTab = { id: string; type: 'web'; title: string; url: string; serviceKey: string; refreshKey: number }
type FileTab = {
  id: string
  type: 'file'
  title: string
  path: string
  entry: AgentFileItem
  loading: boolean
  loaded: boolean
  error: string
  content: string
  originalContent: string
  dirty: boolean
  saving: boolean
  fromCache: boolean
  stale: boolean
}
type ConsoleTab = HomeTab | TerminalTab | WebTab | FileTab
type TerminalTabStateMap = Record<string, TerminalSessionState['status']>
type ExplorerChildrenMap = Record<string, AgentFileItem[]>
type ExplorerFlagMap = Record<string, boolean>
type ExplorerErrorMap = Record<string, string>

const fileSystemRootPath = explorerFileSystemRootPath
const mockWorkspaceRoot = '/workspace'
const CONSOLE_SCALE_BREAKPOINT = 1180
const CONSOLE_SCALE_CANVAS_WIDTH = 1120
const CONSOLE_SCALE_CANVAS_HEIGHT = 720
const CONSOLE_SCALE_PADDING = 24

type ConsoleScaleState = {
  enabled: boolean
  scale: number
  canvasHeight: number
}

const resolveConsoleScaleState = (): ConsoleScaleState => {
  if (typeof window === 'undefined') {
    return { enabled: false, scale: 1, canvasHeight: CONSOLE_SCALE_CANVAS_HEIGHT }
  }

  const availableWidth = Math.max(320, window.innerWidth - CONSOLE_SCALE_PADDING)
  const scale = Number(Math.min(1, availableWidth / CONSOLE_SCALE_CANVAS_WIDTH).toFixed(4))

  return {
    enabled: window.innerWidth < CONSOLE_SCALE_BREAKPOINT || scale < 0.995,
    scale,
    canvasHeight: CONSOLE_SCALE_CANVAS_HEIGHT,
  }
}

const mockExplorerChildren: ExplorerChildrenMap = {
  '/workspace': [
    { name: 'src', path: '/workspace/src', type: 'dir', size: 0 },
    { name: 'docs', path: '/workspace/docs', type: 'dir', size: 0 },
    { name: 'scripts', path: '/workspace/scripts', type: 'dir', size: 0 },
    { name: 'config', path: '/workspace/config', type: 'dir', size: 0 },
    { name: 'README.md', path: '/workspace/README.md', type: 'file', size: 4280 },
    { name: 'package.json', path: '/workspace/package.json', type: 'file', size: 1624 },
  ],
  '/workspace/src': [
    { name: 'app', path: '/workspace/src/app', type: 'dir', size: 0 },
    { name: 'components', path: '/workspace/src/components', type: 'dir', size: 0 },
    { name: 'lib', path: '/workspace/src/lib', type: 'dir', size: 0 },
    { name: 'main.tsx', path: '/workspace/src/main.tsx', type: 'file', size: 824 },
    { name: 'styles.css', path: '/workspace/src/styles.css', type: 'file', size: 5312 },
  ],
  '/workspace/src/app': [
    { name: 'pages', path: '/workspace/src/app/pages', type: 'dir', size: 0 },
    { name: 'hooks', path: '/workspace/src/app/hooks', type: 'dir', size: 0 },
  ],
  '/workspace/src/app/pages': [
    { name: 'AgentListPage.tsx', path: '/workspace/src/app/pages/AgentListPage.tsx', type: 'file', size: 14320 },
    { name: 'AgentDetailPage.tsx', path: '/workspace/src/app/pages/AgentDetailPage.tsx', type: 'file', size: 18760 },
    { name: 'AgentConsolePage.tsx', path: '/workspace/src/app/pages/AgentConsolePage.tsx', type: 'file', size: 22480 },
  ],
  '/workspace/src/app/hooks': [
    { name: 'useAgentList.ts', path: '/workspace/src/app/hooks/useAgentList.ts', type: 'file', size: 6480 },
    { name: 'useConsoleTabs.ts', path: '/workspace/src/app/hooks/useConsoleTabs.ts', type: 'file', size: 3920 },
  ],
  '/workspace/src/components': [
    { name: 'ui', path: '/workspace/src/components/ui', type: 'dir', size: 0 },
    { name: 'business', path: '/workspace/src/components/business', type: 'dir', size: 0 },
  ],
  '/workspace/src/components/ui': [
    { name: 'Button.tsx', path: '/workspace/src/components/ui/Button.tsx', type: 'file', size: 2810 },
    { name: 'DropdownMenu.tsx', path: '/workspace/src/components/ui/DropdownMenu.tsx', type: 'file', size: 3670 },
    { name: 'SearchField.tsx', path: '/workspace/src/components/ui/SearchField.tsx', type: 'file', size: 1880 },
  ],
  '/workspace/src/components/business': [
    { name: 'AgentHeader.tsx', path: '/workspace/src/components/business/AgentHeader.tsx', type: 'file', size: 4210 },
    { name: 'AgentFileTree.tsx', path: '/workspace/src/components/business/AgentFileTree.tsx', type: 'file', size: 5140 },
  ],
  '/workspace/src/lib': [
    { name: 'api.ts', path: '/workspace/src/lib/api.ts', type: 'file', size: 4260 },
    { name: 'format.ts', path: '/workspace/src/lib/format.ts', type: 'file', size: 1360 },
  ],
  '/workspace/docs': [
    { name: 'architecture.md', path: '/workspace/docs/architecture.md', type: 'file', size: 7420 },
    { name: 'deployment.md', path: '/workspace/docs/deployment.md', type: 'file', size: 6140 },
    { name: 'api-reference.md', path: '/workspace/docs/api-reference.md', type: 'file', size: 8820 },
  ],
  '/workspace/scripts': [
    { name: 'bootstrap.sh', path: '/workspace/scripts/bootstrap.sh', type: 'file', size: 1240 },
    { name: 'healthcheck.sh', path: '/workspace/scripts/healthcheck.sh', type: 'file', size: 980 },
    { name: 'seed-demo-data.ts', path: '/workspace/scripts/seed-demo-data.ts', type: 'file', size: 2660 },
  ],
  '/workspace/config': [
    { name: 'agent.yaml', path: '/workspace/config/agent.yaml', type: 'file', size: 2140 },
    { name: 'runtime.json', path: '/workspace/config/runtime.json', type: 'file', size: 1780 },
    { name: 'providers.env', path: '/workspace/config/providers.env', type: 'file', size: 640 },
  ],
}

const mockExplorerExpanded: ExplorerFlagMap = {
  '/workspace': true,
  '/workspace/src': true,
  '/workspace/src/app': true,
  '/workspace/src/app/pages': true,
  '/workspace/src/components': true,
  '/workspace/docs': true,
}

const mockFileContent: Record<string, string> = {
  '/workspace/README.md': '# Hermes Agent\n\n这是 Agent 控制台的示例工作区，用于展示完整目录结构和文件预览。',
  '/workspace/package.json': '{\n  "name": "hermes-agent-demo",\n  "scripts": {\n    "dev": "vite",\n    "build": "tsc && vite build"\n  }\n}\n',
  '/workspace/src/main.tsx': "import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App'\n\nReactDOM.createRoot(document.getElementById('root')!).render(<App />)\n",
  '/workspace/src/app/pages/AgentConsolePage.tsx': "export function AgentConsolePage() {\n  return <main>Agent 控制台</main>\n}\n",
  '/workspace/docs/architecture.md': '# Architecture\n\n- 左侧资源管理器负责文件层级\n- 右侧工作区承载文件、终端和 Web 服务\n',
}

const sortEntries = (items: AgentFileItem[]) =>
  [...items].sort((left, right) => {
    if (left.type === 'dir' && right.type !== 'dir') return -1
    if (left.type !== 'dir' && right.type === 'dir') return 1
    return left.name.localeCompare(right.name, 'zh-CN', { numeric: true, sensitivity: 'base' })
  })

const readServiceList = (services: AgentConsoleServiceItem[], item: AgentListItem | null) => {
  const fromConsole = services
    .filter((service) => service.enabled && String(service.url || '').trim())
    .map((service) => ({
      key: service.key,
      label: service.label,
      url: service.url,
    }))

  if (fromConsole.length) return fromConsole

  return (item?.access || [])
    .filter((access) => access.enabled && String(access.url || '').trim())
    .map((access) => ({
      key: access.key,
      label: access.label,
      url: String(access.url || '').trim(),
    }))
}

const iconForTab = (tab: ConsoleTab) => {
  if (tab.type === 'home') return Home
  if (tab.type === 'terminal') return Terminal
  if (tab.type === 'web') return Globe
  return FileText
}

const nestedPadding = (depth: number): CSSProperties => ({
  paddingLeft: `${depth * 14 + 8}px`,
})

const parentPath = (path: string) => {
  const normalized = normalizeExplorerPath(path)
  if (normalized === fileSystemRootPath) return fileSystemRootPath
  const next = normalized.split('/').slice(0, -1).join('/')
  return next || fileSystemRootPath
}

const buildPathSegments = (path: string) => {
  const normalized = normalizeExplorerPath(path || fileSystemRootPath)
  const parts = normalized.split('/').filter(Boolean).slice(0, 2)
  const segments = [{ label: '/', path: fileSystemRootPath }]
  let current = ''

  for (const part of parts) {
    current = `${current}/${part}`
    segments.push({ label: part, path: current })
  }

  return segments
}

const pathDepth = (path: string) => normalizeExplorerPath(path).split('/').filter(Boolean).length

const searchMockEntries = (rootPath: string, query: string) => {
  const normalizedRoot = normalizeExplorerPath(rootPath)
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return []

  const results: AgentFileItem[] = []
  const visited = new Set<string>()
  const visit = (path: string) => {
    const normalizedPath = normalizeExplorerPath(path)
    if (visited.has(normalizedPath)) return
    visited.add(normalizedPath)

    for (const entry of mockExplorerChildren[normalizedPath] || []) {
      if (entry.name.toLowerCase().includes(normalizedQuery)) {
        results.push(entry)
      }
      if (entry.type === 'dir') {
        visit(entry.path)
      }
    }
  }

  visit(normalizedRoot)
  return sortEntries(results)
}

const isMockClusterContext = (context: ClusterContext | null) =>
  !context || context.server.includes('mock-cluster') || context.token === 'mock-token'

const isTransientFileConnectionError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || '')
  return message.includes('文件连接尚未建立') || message.includes('文件连接尚未就绪')
}

const setDocumentFavicon = (href: string) => {
  if (typeof document === 'undefined') return () => {}

  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'icon'
    link.type = 'image/svg+xml'
    document.head.appendChild(link)
  }

  const previousHref = link.getAttribute('href') || ''
  const previousType = link.getAttribute('type') || ''
  link.type = 'image/svg+xml'
  link.href = href

  return () => {
    if (previousType) {
      link.type = previousType
    }
    if (previousHref) {
      link.href = previousHref
    }
  }
}

function TerminalTabPane({
  clusterContext,
  isVisible,
  item,
  mockMode,
  onStatusChange,
  tabId,
}: {
  clusterContext: ClusterContext | null
  isVisible: boolean
  item: AgentListItem | null
  mockMode: boolean
  onStatusChange: (tabId: string, status: TerminalSessionState['status']) => void
  tabId: string
}) {
  const {
    markTerminalConnected,
    markTerminalError,
    openTerminal,
    resizeTerminal,
    sendTerminalInput,
    subscribeTerminalOutput,
    terminalSession,
  } = useAgentTerminal({
    clusterContext,
  })

  useEffect(() => {
    if (mockMode) return
    if (!item) return
    if (terminalSession?.resource.name === item.name) return
    void openTerminal(item)
  }, [item, mockMode, openTerminal, terminalSession?.resource.name])

  useEffect(() => {
    if (!mockMode) return
    onStatusChange(tabId, 'connected')
  }, [mockMode, onStatusChange, tabId])

  useEffect(() => {
    if (mockMode) return
    if (!terminalSession?.status) return
    onStatusChange(tabId, terminalSession.status)
  }, [mockMode, onStatusChange, tabId, terminalSession?.status])

  if (mockMode) {
    return (
      <div className={isVisible ? 'h-full min-h-0 bg-[#05070a]' : 'hidden'}>
        <div className="h-full min-h-[360px] overflow-auto bg-[#05070a] p-4 font-mono text-[13px]/6 text-zinc-200">
          <div className="text-emerald-300">agent@{item?.name || 'hermes-agent-demo'}:/workspace$</div>
          <div className="text-zinc-400">ls -la</div>
          <div>drwxr-xr-x  src</div>
          <div>drwxr-xr-x  docs</div>
          <div>drwxr-xr-x  scripts</div>
          <div>-rw-r--r--  README.md</div>
          <div className="mt-4 text-zinc-400">npm run dev</div>
          <div className="text-cyan-300">Agent console mock terminal is ready.</div>
          <div className="mt-4 text-emerald-300">agent@{item?.name || 'hermes-agent-demo'}:/workspace$</div>
        </div>
      </div>
    )
  }

  return (
    <div className={isVisible ? 'h-full min-h-0' : 'hidden'}>
      <AgentTerminalWorkspace
        isVisible={isVisible}
        onAttachOutput={subscribeTerminalOutput}
        onError={markTerminalError}
        onInput={sendTerminalInput}
        onReady={markTerminalConnected}
        onResize={resizeTerminal}
        session={terminalSession}
      />
    </div>
  )
}

function WebTabPane({ tab }: { tab: WebTab }) {
  return (
    <iframe
      className="h-full w-full border-0 bg-white"
      key={`${tab.id}-${tab.refreshKey}`}
      src={tab.url}
      title={tab.title}
    />
  )
}

function FileTabPane({
  onChange,
  tab,
}: {
  onChange: (tabId: string, content: string) => void
  tab: FileTab
}) {
  if (tab.loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-zinc-500">
        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
        正在读取文件
      </div>
    )
  }

  if (tab.error) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div className="rounded-[12px] border border-rose-100 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {tab.error}
        </div>
      </div>
    )
  }

  if (!isTextPreviewableFile(tab.title)) {
    return (
      <div className="flex h-full items-center justify-center bg-[#05070a] px-8 text-center text-sm text-zinc-400">
        当前文件类型暂不支持预览。
      </div>
    )
  }

  return (
    <AgentFileCodeEditor
      className="rounded-none border-0"
      onChange={(value) => onChange(tab.id, value)}
      path={tab.path}
      theme="dark"
      value={tab.content || ''}
    />
  )
}

export function AgentConsoleWindowPage() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [clusterContext, setClusterContext] = useState<ClusterContext | null>(null)
  const [activeAgentName, setActiveAgentName] = useState(() => String(searchParams.get('agentName') || '').trim())
  const [item, setItem] = useState<AgentListItem | null>(null)
  const [services, setServices] = useState<AgentConsoleServiceItem[]>([])
  const [workspaceRoot, setWorkspaceRoot] = useState(mockWorkspaceRoot)
  const [mockConsoleMode, setMockConsoleMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceSearchItems, setResourceSearchItems] = useState<AgentFileItem[]>([])
  const [resourceSearchLoading, setResourceSearchLoading] = useState(false)
  const [resourceSearchError, setResourceSearchError] = useState('')
  const [tabs, setTabs] = useState<ConsoleTab[]>(() => createInitialConsoleTabs())
  const [activeTabId, setActiveTabId] = useState(initialConsoleTabId)
  const [terminalStates, setTerminalStates] = useState<TerminalTabStateMap>({})
  const [explorerRootPath, setExplorerRootPath] = useState(mockWorkspaceRoot)
  const [explorerChildren, setExplorerChildren] = useState<ExplorerChildrenMap>(mockExplorerChildren)
  const [explorerExpanded, setExplorerExpanded] = useState<ExplorerFlagMap>(mockExplorerExpanded)
  const [explorerLoading, setExplorerLoading] = useState<ExplorerFlagMap>({})
  const [explorerErrors, setExplorerErrors] = useState<ExplorerErrorMap>({})
  const [consoleScale, setConsoleScale] = useState<ConsoleScaleState>(() => resolveConsoleScaleState())

  const tabSeedRef = useRef(0)
  const didAutoOpenTerminalRef = useRef(false)
  const manuallyCollapsedPathsRef = useRef(new Set<string>())

  const {
    closeFiles,
    filesSession,
    openFiles,
    readDirectory,
    readFile,
    searchFiles,
    saveFile,
  } = useAgentFiles({
    clusterContext,
  })

  const displayName = useMemo(
    () => item?.aliasName || item?.name || activeAgentName || 'Agent 控制台',
    [activeAgentName, item?.aliasName, item?.name],
  )

  const serviceTabs = useMemo(() => readServiceList(services, item), [item, services])
  const shouldAutoOpenTerminal = location.pathname.endsWith('/desktop/terminal')

  const pageTabs = useMemo(() => tabs.filter((tab) => tab.id !== initialConsoleTabId), [tabs])
  const visibleTabs = pageTabs.length ? pageTabs : tabs

  useEffect(() => {
    const syncScale = () => {
      setConsoleScale(resolveConsoleScaleState())
    }

    syncScale()
    window.addEventListener('resize', syncScale)
    window.addEventListener('orientationchange', syncScale)

    return () => {
      window.removeEventListener('resize', syncScale)
      window.removeEventListener('orientationchange', syncScale)
    }
  }, [])
  const activeTab = useMemo(() => {
    if (pageTabs.length && activeTabId === initialConsoleTabId) return pageTabs[0]
    return tabs.find((tab) => tab.id === activeTabId) || pageTabs[0] || tabs[0]
  }, [activeTabId, pageTabs, tabs])
  const activeFilePath = activeTab?.type === 'file' ? normalizeExplorerPath(activeTab.path) : ''

  useEffect(() => {
    document.title = `${displayName} · ${APP_NAME}`
  }, [displayName])

  useEffect(() => setDocumentFavicon(APP_TERMINAL_ICON_URL), [])

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      try {
        const session = await getSealosSession().catch(() => null)
        const nextContext = createClusterContext(session)
        if (!active) return
        setClusterContext(nextContext || buildMockClusterContext())
      } catch {
        if (!active) return
        setClusterContext(buildMockClusterContext())
      }
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const applyMessage = (raw: unknown) => {
      const nextAgentName = parseAgentTerminalDesktopMessage(raw)
      if (!nextAgentName) return
      setActiveAgentName(nextAgentName)
      setMessage('')
    }

    const onWindowMessage = (event: MessageEvent) => {
      if (!event.source) return
      if (!isTrustedDesktopMessageOrigin(event.origin, window.location.origin)) return
      applyMessage(event.data)
    }

    window.addEventListener('message', onWindowMessage)

    let cleanupAppListener: (() => void) | undefined
    try {
      const result = addSealosAppEventListener('openDesktopApp', (data: unknown) => {
        applyMessage(data)
      })
      if (typeof result === 'function') cleanupAppListener = result as () => void
    } catch {
      cleanupAppListener = undefined
    }

    return () => {
      window.removeEventListener('message', onWindowMessage)
      cleanupAppListener?.()
    }
  }, [])

  useEffect(() => {
    let active = true

    const applyMock = (agentName: string, text: string) => {
      const mock = buildMockConsoleBootstrap(agentName)
      const normalizedMockRoot = normalizeExplorerPath(mock.workspaceRoot || mockWorkspaceRoot)
      const resolvedMockRoot = mockExplorerChildren[normalizedMockRoot] ? normalizedMockRoot : mockWorkspaceRoot
      setClusterContext((current) => current || buildMockClusterContext())
      setItem(mock.item)
      setServices(mock.services)
      setWorkspaceRoot(resolvedMockRoot)
      setExplorerRootPath(resolvedMockRoot)
      setMockConsoleMode(true)
      setMessage(text)
    }

    const loadConsole = async () => {
      if (!clusterContext) {
        setLoading(true)
        return
      }

      const targetAgentName = activeAgentName || 'hermes-agent-demo'
      setLoading(true)

      if (isMockClusterContext(clusterContext)) {
        applyMock(targetAgentName, '')
        setLoading(false)
        return
      }

      try {
        const [clusterInfo, templatePayload, consolePayload] = await Promise.all([
          getClusterInfo(clusterContext),
          listAgentTemplates(),
          getAgentConsole(targetAgentName, clusterContext),
        ])
        if (!active) return

        const templates = hydrateTemplateCatalog(templatePayload.items)
        const nextItem =
          mapBackendAgentsToListItems([consolePayload.agent], templates, clusterInfo)[0] || null

        if (!nextItem) {
          applyMock(targetAgentName, `未找到名为 ${targetAgentName} 的 Agent 实例，已展示示例控制台。`)
          return
        }

        const nextRoot = consolePayload.workspaceRoot || nextItem.workingDir || mockWorkspaceRoot
        setItem(nextItem)
        setServices(consolePayload.services || [])
        setWorkspaceRoot(nextRoot)
        setExplorerRootPath(normalizeExplorerPath(nextRoot))
        setMockConsoleMode(false)
        setMessage('')
      } catch (error) {
        if (!active) return
        applyMock(targetAgentName, error instanceof Error ? error.message : '读取 Agent 控制台失败，已展示示例控制台。')
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadConsole()

    return () => {
      active = false
    }
  }, [activeAgentName, clusterContext])

  useEffect(() => {
    if (!item || mockConsoleMode) {
      closeFiles()
      return
    }
    openFiles(item)
    return () => {
      closeFiles()
    }
  }, [closeFiles, item, mockConsoleMode, openFiles])

  useEffect(() => {
    setTabs(createInitialConsoleTabs())
    setActiveTabId(initialConsoleTabId)
    setTerminalStates({})
    didAutoOpenTerminalRef.current = false
    manuallyCollapsedPathsRef.current = new Set()
  }, [item?.name])

  useEffect(() => {
    if (!mockConsoleMode) return
    const normalizedRoot = normalizeExplorerPath(workspaceRoot || mockWorkspaceRoot)
    const resolvedRoot = mockExplorerChildren[normalizedRoot] ? normalizedRoot : mockWorkspaceRoot
    setExplorerChildren(mockExplorerChildren)
    setExplorerExpanded(mockExplorerExpanded)
    setExplorerRootPath(resolvedRoot)
    setExplorerErrors({})
    setExplorerLoading({})
  }, [mockConsoleMode, workspaceRoot])

  const ensureDirectoryLoaded = useCallback(
    async (path: string) => {
      const normalizedPath = normalizeExplorerPath(path)

      if (mockConsoleMode) {
        setExplorerChildren((current) => ({
          ...current,
          [normalizedPath]: sortEntries(mockExplorerChildren[normalizedPath] || []),
        }))
        return
      }

      setExplorerLoading((current) => ({ ...current, [normalizedPath]: true }))
      setExplorerErrors((current) => ({ ...current, [normalizedPath]: '' }))
      try {
        const result = await readDirectory(normalizedPath)
        setExplorerChildren((current) => ({
          ...current,
          [normalizeExplorerPath(result.path || normalizedPath)]: sortEntries(result.items || []),
        }))
      } catch (error) {
        if (isTransientFileConnectionError(error)) {
          setExplorerErrors((current) => ({ ...current, [normalizedPath]: '' }))
          return
        }
        setExplorerErrors((current) => ({
          ...current,
          [normalizedPath]: error instanceof Error ? error.message : '目录读取失败',
        }))
      } finally {
        setExplorerLoading((current) => ({ ...current, [normalizedPath]: false }))
      }
    },
    [mockConsoleMode, readDirectory],
  )

  useEffect(() => {
    const root = normalizeExplorerPath(workspaceRoot || mockWorkspaceRoot)
    setExplorerRootPath(root)
    const chain = buildExplorerPathChain(root)
    setExplorerExpanded((current) => applyAutoExpandChain(current, chain, manuallyCollapsedPathsRef.current))
    void ensureDirectoryLoaded(root)
  }, [ensureDirectoryLoaded, workspaceRoot])

  useEffect(() => {
    if (!filesSession?.items?.length) return
    setExplorerChildren((current) => ({
      ...current,
      [normalizeExplorerPath(filesSession.currentPath || explorerRootPath)]: sortEntries(filesSession.items),
    }))
  }, [explorerRootPath, filesSession?.currentPath, filesSession?.items])

  useEffect(() => {
    const query = resourceSearch.trim()
    if (!query) {
      setResourceSearchItems([])
      setResourceSearchLoading(false)
      setResourceSearchError('')
      return
    }

    let active = true
    setResourceSearchLoading(true)
    setResourceSearchError('')

    const timer = window.setTimeout(() => {
      const runSearch = async () => {
        try {
          const items = mockConsoleMode
            ? searchMockEntries(explorerRootPath, query)
            : (await searchFiles(explorerRootPath, query)).items
          if (!active) return
          setResourceSearchItems(items)
          setResourceSearchError('')
        } catch (error) {
          if (!active) return
          if (isTransientFileConnectionError(error)) {
            setResourceSearchError('')
            return
          }
          setResourceSearchItems([])
          setResourceSearchError(error instanceof Error ? error.message : '搜索文件失败')
        } finally {
          if (active) setResourceSearchLoading(false)
        }
      }

      void runSearch()
    }, 250)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [explorerRootPath, filesSession?.status, mockConsoleMode, resourceSearch, searchFiles])

  const updateTerminalState = useCallback((tabId: string, status: TerminalSessionState['status']) => {
    setTerminalStates((current) => {
      if (current[tabId] === status) return current
      return { ...current, [tabId]: status }
    })
  }, [])

  const navigateExplorerToPath = useCallback(
    (path: string) => {
      const normalizedPath = normalizeExplorerPath(path)
      setExplorerRootPath(normalizedPath)
      setExplorerExpanded((current) =>
        applyAutoExpandChain(current, buildExplorerPathChain(normalizedPath), manuallyCollapsedPathsRef.current),
      )
      void ensureDirectoryLoaded(normalizedPath)
    },
    [ensureDirectoryLoaded],
  )

  const toggleDirectory = useCallback(
    (entry: AgentFileItem) => {
      const normalizedPath = normalizeExplorerPath(entry.path)
      setExplorerExpanded((current) => {
        const nextExpanded = !current[normalizedPath]
        const next = { ...current, [normalizedPath]: nextExpanded }
        if (nextExpanded) {
          manuallyCollapsedPathsRef.current.delete(normalizedPath)
          void ensureDirectoryLoaded(normalizedPath)
        } else {
          manuallyCollapsedPathsRef.current.add(normalizedPath)
        }
        return next
      })
    },
    [ensureDirectoryLoaded],
  )

  const updateFileTabContent = useCallback((tabId: string, content: string) => {
    setTabs((current) =>
      current.map((tab) =>
        tab.id === tabId && tab.type === 'file'
          ? {
              ...tab,
              content,
              dirty: content !== tab.originalContent,
            }
          : tab,
      ),
    )
  }, [])

  const saveFileTab = useCallback(
    async (tabId: string) => {
      const target = tabs.find((tab): tab is FileTab => tab.id === tabId && tab.type === 'file')
      if (!target || target.loading || target.saving || !target.dirty) return true
      if (!isTextPreviewableFile(target.title)) return true

      setTabs((current) =>
        current.map((tab) =>
          tab.id === tabId && tab.type === 'file'
            ? {
                ...tab,
                saving: true,
                error: '',
              }
            : tab,
        ),
      )

      try {
        if (mockConsoleMode) {
          await new Promise((resolve) => window.setTimeout(resolve, 120))
        } else {
          await saveFile(target.path, target.content)
        }
        setTabs((current) =>
          current.map((tab) =>
            tab.id === tabId && tab.type === 'file'
              ? {
                  ...tab,
                  originalContent: tab.content,
                  dirty: false,
                  saving: false,
                  error: '',
                }
              : tab,
          ),
        )
        return true
      } catch (error) {
        const message = error instanceof Error ? error.message : '保存文件失败'
        setTabs((current) =>
          current.map((tab) =>
            tab.id === tabId && tab.type === 'file'
              ? {
                  ...tab,
                  saving: false,
                }
              : tab,
          ),
        )
        setMessage(message)
        return false
      }
    },
    [mockConsoleMode, saveFile, tabs],
  )

  const loadFileTabContent = useCallback(
    async (tabId: string, entry: AgentFileItem) => {
      setTabs((current) =>
        current.map((tab) =>
          tab.id === tabId && tab.type === 'file'
            ? { ...tab, loading: true, error: '', loaded: false }
            : tab,
        ),
      )

      try {
        const result = mockConsoleMode
          ? {
              content:
                mockFileContent[entry.path] ||
                `// ${entry.name}\n\n这是 ${entry.path} 的示例内容，用于预览控制台文件 Tab 的打开效果。\n`,
              fromCache: false,
              stale: false,
            }
          : await readFile(entry.path)

        setTabs((current) =>
          current.map((tab) =>
            tab.id === tabId && tab.type === 'file'
              ? {
                  ...tab,
                  loading: false,
                  loaded: true,
                  error: '',
                  content: result.content,
                  originalContent: result.content,
                  dirty: false,
                  saving: false,
                  fromCache: result.fromCache,
                  stale: result.stale,
                }
              : tab,
          ),
        )
      } catch (error) {
        setTabs((current) =>
          current.map((tab) =>
            tab.id === tabId && tab.type === 'file'
              ? {
                  ...tab,
                  loading: false,
                  loaded: false,
                  error: error instanceof Error ? error.message : '文件读取失败',
                  saving: false,
                }
              : tab,
          ),
        )
      }
    },
    [mockConsoleMode, readFile],
  )

  const openFileTab = useCallback(
    (entry: AgentFileItem) => {
      if (entry.type !== 'file') return

      const existing = tabs.find((tab) => tab.type === 'file' && tab.path === entry.path)
      if (existing) {
        setActiveTabId(existing.id)
        return
      }

      tabSeedRef.current += 1
      const nextTab: FileTab = {
        id: `file-${Date.now()}-${tabSeedRef.current}`,
        type: 'file',
        title: entry.name,
        path: entry.path,
        entry,
        loading: true,
        loaded: false,
        error: '',
        content: '',
        originalContent: '',
        dirty: false,
        saving: false,
        fromCache: false,
        stale: false,
      }

      setTabs((current) => [...current, nextTab])
      setActiveTabId(nextTab.id)
      void loadFileTabContent(nextTab.id, entry)
    },
    [loadFileTabContent, tabs],
  )

  const openNewTerminalTab = useCallback(() => {
    tabSeedRef.current += 1
    const nextTab: TerminalTab = {
      id: `terminal-${Date.now()}-${tabSeedRef.current}`,
      type: 'terminal',
      title: `终端 ${pageTabs.filter((tab) => tab.type === 'terminal').length + 1}`,
    }
    setTabs((current) => [...current, nextTab])
    setActiveTabId(nextTab.id)
  }, [pageTabs])

  useEffect(() => {
    if (!shouldAutoOpenTerminal || !item || didAutoOpenTerminalRef.current) return
    didAutoOpenTerminalRef.current = true
    openNewTerminalTab()
  }, [item, openNewTerminalTab, shouldAutoOpenTerminal])

  const openWebTab = useCallback((service: { key: string; label: string; url: string }) => {
    setTabs((current) => {
      const existing = current.find((tab) => tab.type === 'web' && tab.serviceKey === service.key)
      if (existing) {
        setActiveTabId(existing.id)
        return current
      }
      tabSeedRef.current += 1
      const nextTab: WebTab = {
        id: `web-${Date.now()}-${tabSeedRef.current}`,
        type: 'web',
        title: service.label,
        url: service.url,
        serviceKey: service.key,
        refreshKey: 0,
      }
      setActiveTabId(nextTab.id)
      return [...current, nextTab]
    })
  }, [])

  const closeTab = useCallback(
    async (tabId: string) => {
      if (tabId === initialConsoleTabId) return
      const target = tabs.find((tab): tab is FileTab => tab.id === tabId && tab.type === 'file')
      if (target?.dirty) {
        const shouldSave = window.confirm(`${target.title} 有未保存的修改，是否保存后关闭？`)
        if (shouldSave) {
          const saved = await saveFileTab(tabId)
          if (!saved) return
        } else {
          const shouldDiscard = window.confirm(`不保存并关闭 ${target.title}？`)
          if (!shouldDiscard) return
        }
      }
      setTabs((current) => {
        const next = current.filter((tab) => tab.id !== tabId)
        if (activeTabId === tabId) {
          const fallback = next.find((tab) => tab.id !== initialConsoleTabId) || next[0]
          setActiveTabId(fallback?.id || initialConsoleTabId)
        }
        return next.length ? next : createInitialConsoleTabs()
      })
      setTerminalStates((current) => {
        if (!(tabId in current)) return current
        const next = { ...current }
        delete next[tabId]
        return next
      })
    },
    [activeTabId, saveFileTab, tabs],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return
      if (activeTab?.type !== 'file') return
      event.preventDefault()
      void saveFileTab(activeTab.id)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTab, saveFileTab])

  const renderExplorerNode = useCallback(
    (entry: AgentFileItem, depth: number) => {
      const normalizedPath = normalizeExplorerPath(entry.path)
      const expanded = Boolean(explorerExpanded[normalizedPath])
      const children = explorerChildren[normalizedPath] || []
      const loadingDirectory = Boolean(explorerLoading[normalizedPath])
      const error = explorerErrors[normalizedPath]
      const isDirectory = entry.type === 'dir'
      const navigableDirectory = isDirectory && pathDepth(normalizedPath) <= 2
      const selected = !isDirectory && activeFilePath === normalizedPath
      const matchesSearch =
        !resourceSearch.trim() || entry.name.toLowerCase().includes(resourceSearch.trim().toLowerCase())
      const shouldRender = matchesSearch || isDirectory

      if (!shouldRender) return null

      return (
        <div key={entry.path}>
          <button
            className={[
              'flex h-8 w-full items-center gap-1.5 rounded-[6px] pr-2 text-left text-[13px] transition',
              selected
                ? 'bg-zinc-600 font-medium text-white hover:bg-zinc-600'
                : 'text-zinc-700 hover:bg-zinc-100',
            ].join(' ')}
            onClick={() => {
              if (isDirectory) {
                if (navigableDirectory) {
                  navigateExplorerToPath(entry.path)
                } else {
                  toggleDirectory(entry)
                }
              } else {
                openFileTab(entry)
              }
            }}
            style={nestedPadding(depth)}
            type="button"
          >
            {isDirectory && !navigableDirectory ? (
              expanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              )
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            {isDirectory ? (
              expanded && !navigableDirectory ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              )
            ) : (
              <FileText className={['h-3.5 w-3.5 shrink-0', selected ? 'text-white/80' : 'text-zinc-500'].join(' ')} />
            )}
            <span className="min-w-0 flex-1 truncate">
              <span className="truncate">{entry.name}</span>
              {resourceSearch.trim() ? (
                <span className="ml-2 truncate text-[11px] text-zinc-400">{parentPath(entry.path)}</span>
              ) : null}
            </span>
            {loadingDirectory ? <LoaderCircle className="ml-auto h-3 w-3 animate-spin text-zinc-400" /> : null}
          </button>
          {error ? <div className="px-3 py-1 text-[12px] text-rose-600">{error}</div> : null}
          {isDirectory && !navigableDirectory && expanded ? (
            <div>{children.map((child) => renderExplorerNode(child, depth + 1))}</div>
          ) : null}
        </div>
      )
    },
    [
      explorerChildren,
      explorerErrors,
      explorerExpanded,
      explorerLoading,
      activeFilePath,
      navigateExplorerToPath,
      openFileTab,
      resourceSearch,
      toggleDirectory,
    ],
  )

  const searchActive = Boolean(resourceSearch.trim())
  const rootEntries = searchActive
    ? resourceSearchItems
    : explorerChildren[explorerRootPath] ||
      (mockConsoleMode ? mockExplorerChildren[mockWorkspaceRoot] : explorerChildren[parentPath(explorerRootPath)]) ||
      []
  const rootPathLoaded = Boolean(explorerChildren[explorerRootPath])
  const filesConnecting =
    filesSession?.status === 'initializing' ||
    filesSession?.status === 'connecting' ||
    Boolean(filesSession?.browsing)
  const rootLoading =
    resourceSearchLoading ||
    Boolean(explorerLoading[explorerRootPath]) ||
    (!mockConsoleMode && !rootPathLoaded && (!explorerErrors[explorerRootPath] || filesConnecting))
  const rootError = searchActive ? resourceSearchError : explorerErrors[explorerRootPath]
  const pathSegments = buildPathSegments(explorerRootPath)
  const canGoParent = explorerRootPath !== fileSystemRootPath
  const contextTitle =
    activeTab?.type === 'terminal'
      ? activeTab.title
      : activeTab?.type === 'file'
        ? activeTab.path
        : activeTab?.type === 'web'
          ? activeTab.title
          : ''
  const contextSub =
    activeTab?.type === 'terminal'
      ? terminalStates[activeTab.id] || '准备中'
      : activeTab?.type === 'file'
        ? activeTab.loading
          ? '读取中'
          : activeTab.stale
            ? '来自缓存，正在刷新'
            : '文件预览'
        : activeTab?.type === 'web'
          ? activeTab.url
          : ''

  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-white text-[var(--color-text)]">
      <div
        className={
          consoleScale.enabled
            ? 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-white p-3'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden bg-white px-4 py-5 sm:px-6 lg:px-12 lg:py-6'
        }
      >
        <div
          className={consoleScale.enabled ? 'relative' : 'contents'}
          style={
            consoleScale.enabled
              ? {
                width: CONSOLE_SCALE_CANVAS_WIDTH * consoleScale.scale,
                height: consoleScale.canvasHeight * consoleScale.scale,
              }
              : undefined
          }
        >
        <div
          className={
            consoleScale.enabled
              ? 'absolute left-0 top-0 flex min-w-0 flex-col'
              : 'flex min-h-0 flex-1 flex-col'
          }
          style={
            consoleScale.enabled
              ? {
                width: CONSOLE_SCALE_CANVAS_WIDTH,
                height: consoleScale.canvasHeight,
                transform: `scale(${consoleScale.scale})`,
                transformOrigin: 'top left',
              }
              : undefined
          }
        >
        {message ? (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-[8px] border border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-800">
            <span className="min-w-0 flex-1">{message}</span>
            <button
              aria-label="关闭提示"
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-amber-700 transition hover:bg-amber-100 hover:text-amber-900"
              onClick={() => setMessage('')}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] gap-5">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
            <div className="border-b border-zinc-100 px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-zinc-950">资源管理器</div>
                  <div className="mt-2 flex max-w-[220px] items-center gap-1 overflow-hidden text-[12px] text-zinc-500">
                    <button
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={!canGoParent}
                      onClick={() => navigateExplorerToPath(parentPath(explorerRootPath))}
                      title="返回上一级"
                      type="button"
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex min-w-0 items-center overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {pathSegments.map((segment, index) => {
                        const active = segment.path === explorerRootPath
                        return (
                          <span className="inline-flex items-center" key={segment.path}>
                            {index > 1 ? <span className="px-1 text-zinc-300">/</span> : null}
                            <button
                              className={[
                                'max-w-[96px] truncate rounded-[5px] px-1.5 py-0.5 text-left transition hover:bg-zinc-100 hover:text-zinc-900',
                                active ? 'font-medium text-zinc-800' : 'text-zinc-500',
                              ].join(' ')}
                              onClick={() => navigateExplorerToPath(segment.path)}
                              title={segment.path}
                              type="button"
                            >
                              {segment.label}
                            </button>
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] border border-zinc-950 bg-zinc-950 text-white transition hover:bg-black"
                    onClick={openNewTerminalTab}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <label className="mt-4 flex h-9 items-center gap-2 rounded-[8px] border border-zinc-200 bg-zinc-50 px-3 text-[13px] text-zinc-500">
                <Search className="h-4 w-4" />
                <input
                  className="min-w-0 flex-1 bg-transparent text-zinc-800 outline-none placeholder:text-zinc-400"
                  onChange={(event) => setResourceSearch(event.target.value)}
                  placeholder="搜索文件"
                  value={resourceSearch}
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
              <div className="mb-2 px-2 text-[12px] font-medium text-zinc-500">
                {searchActive ? `搜索结果：${resourceSearch.trim()}` : '文件层级'}
              </div>
              {loading || rootLoading ? (
                <div className="flex items-center gap-2 px-2 py-3 text-[13px] text-zinc-500">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {searchActive ? '搜索文件中' : '文件列表加载中'}
                </div>
              ) : rootError ? (
                <div className="rounded-[8px] border border-rose-100 bg-rose-50 px-3 py-3 text-[13px] text-rose-700">
                  {rootError}
                </div>
              ) : rootEntries.length ? (
                <div className="space-y-0.5">{rootEntries.map((entry) => renderExplorerNode(entry, 0))}</div>
              ) : (
                <div className="rounded-[8px] border border-dashed border-zinc-200 px-3 py-6 text-center text-[13px] text-zinc-500">
                  {searchActive ? '未找到匹配文件' : '暂无文件层级'}
                </div>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[12px] border border-zinc-200 bg-white">
            <div className="flex h-11 shrink-0 border-b border-zinc-100 bg-white">
              <div className="flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {visibleTabs.map((tab) => {
                  const Icon = iconForTab(tab)
                  const active = tab.id === activeTab?.id
                  return (
                    <button
                      className={[
                        'group flex h-11 min-w-[156px] max-w-[240px] items-center gap-2 border-r border-zinc-100 px-4 text-[13px] transition',
                        active ? 'bg-zinc-50 text-zinc-950' : 'bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800',
                      ].join(' ')}
                      key={tab.id}
                      onClick={() => setActiveTabId(tab.id)}
                      type="button"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left">{tab.title}</span>
                      {tab.type === 'file' && tab.dirty ? (
                        <span
                          aria-label="有未保存修改"
                          className="h-2 w-2 shrink-0 rounded-full bg-sky-500"
                          title="有未保存修改"
                        />
                      ) : null}
                      {tab.type === 'file' && tab.saving ? (
                        <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-zinc-400" />
                      ) : null}
                      {tab.id !== initialConsoleTabId ? (
                        <span
                          className="ml-auto inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-400 opacity-0 transition hover:bg-zinc-200 hover:text-zinc-700 group-hover:opacity-100"
                          onClick={(event) => {
                            event.stopPropagation()
                            void closeTab(tab.id)
                          }}
                        >
                          ×
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
              <button
                className="inline-flex h-11 w-12 shrink-0 items-center justify-center border-l border-zinc-100 text-zinc-600 transition hover:bg-zinc-50"
                onClick={openNewTerminalTab}
                type="button"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {activeTab?.type !== 'home' && activeTab?.type !== 'terminal' && activeTab?.type !== 'file' ? (
              <div className="flex min-h-[58px] shrink-0 items-center justify-between gap-4 border-b border-zinc-100 px-5">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-medium text-zinc-950">{contextTitle}</div>
                  <div className="mt-1 truncate text-[12px] text-zinc-500">{contextSub}</div>
                </div>
                <div className="flex items-center gap-2">
                  {serviceTabs.map((service) => (
                    <button
                      className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-zinc-200 bg-white px-3 text-[12px] font-medium text-zinc-700 transition hover:bg-zinc-50"
                      key={service.key}
                      onClick={() => openWebTab(service)}
                      type="button"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      {service.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden">
              {activeTab?.type === 'home' ? (
                <div className="flex h-full min-h-0 items-stretch overflow-hidden p-6">
                  <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[16px] border border-dashed border-zinc-300 bg-[#fafafa] px-6 py-12 text-center">
                    <div className="relative z-10 flex max-w-[430px] flex-col items-center gap-3">
                      <h2 className="text-[24px]/8 font-medium tracking-normal text-black">暂无打开的页面</h2>
                      <p className="text-[16px]/6 font-normal text-[#4d4d4d]">
                        您可以从左侧文件列表选取文件，或启动一个终端。
                      </p>
                      <button
                        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#171717] bg-[#171717] px-4 text-[14px] font-medium text-[#fafafa] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:border-black hover:bg-black"
                        onClick={openNewTerminalTab}
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        添加终端
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {tabs
                .filter((tab): tab is TerminalTab => tab.type === 'terminal')
                .map((tab) => (
                  <TerminalTabPane
                    clusterContext={clusterContext}
                    isVisible={activeTab?.id === tab.id}
                    item={item}
                    key={tab.id}
                    mockMode={mockConsoleMode}
                    onStatusChange={updateTerminalState}
                    tabId={tab.id}
                  />
                ))}

              {activeTab?.type === 'web' ? <WebTabPane tab={activeTab} /> : null}
              {activeTab?.type === 'file' ? (
                <FileTabPane onChange={updateFileTabContent} tab={activeTab} />
              ) : null}
            </div>
          </section>
        </div>
        </div>
        </div>
      </div>
      <footer className="flex h-6 shrink-0 items-center justify-between gap-3 bg-zinc-600 px-3 text-[12px]/6 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-medium">Agent</span>
          <span className="truncate">{displayName}</span>
          <span className="text-white/55">/</span>
          <span className="truncate font-mono text-[11px] text-white/95">
            {item?.name || activeAgentName || '等待 Agent'}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-white/90">
          {item?.namespace ? <span className="hidden sm:inline">{item.namespace}</span> : null}
          <span>{item?.statusText || status}</span>
        </div>
      </footer>
    </main>
  )
}
