import {
  ChevronDown,
  ChevronLeft,
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
import { useSearchParams } from 'react-router-dom'
import {
  createAgentPreview,
  createClusterContext,
  deleteAgentPreview,
  getAgentConsole,
  getClusterInfo,
  heartbeatAgentPreview,
  listAgentTemplates,
} from '../../../api'
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
import { useI18n } from '../../../i18n'
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

type HomeTab = { id: string; type: 'home'; title: string }
type TerminalTab = { id: string; type: 'terminal'; title: string }
type PreviewMetadata = { agentName: string; id: string; port: number }
type WebTab = {
  id: string
  type: 'web'
  title: string
  url: string
  serviceKey: string
  refreshKey: number
  preview?: PreviewMetadata
}
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
type MobileConsolePane = 'explorer' | 'workspace'

const fileSystemRootPath = explorerFileSystemRootPath
const defaultWorkspaceRoot = '/workspace'
const MOBILE_CONSOLE_BREAKPOINT = 768
const CONSOLE_SCALE_BREAKPOINT = 1180
const CONSOLE_SCALE_CANVAS_WIDTH = 1120
const CONSOLE_SCALE_MIN_CANVAS_HEIGHT = 560
const CONSOLE_SCALE_CANVAS_HEIGHT = 720
const CONSOLE_SCALE_PADDING = 24
const CONSOLE_STATUS_BAR_HEIGHT = 24

type ConsoleScaleState = {
  enabled: boolean
  scale: number
  canvasHeight: number
}

const resolveConsoleScaleState = (): ConsoleScaleState => {
  if (typeof window === 'undefined') {
    return { enabled: false, scale: 1, canvasHeight: CONSOLE_SCALE_CANVAS_HEIGHT }
  }

  if (window.innerWidth < MOBILE_CONSOLE_BREAKPOINT) {
    return { enabled: false, scale: 1, canvasHeight: CONSOLE_SCALE_CANVAS_HEIGHT }
  }

  const availableWidth = Math.max(320, window.innerWidth - CONSOLE_SCALE_PADDING)
  const scale = Number(Math.min(1, availableWidth / CONSOLE_SCALE_CANVAS_WIDTH).toFixed(4))
  const enabled = window.innerWidth < CONSOLE_SCALE_BREAKPOINT || scale < 0.995
  const availableHeight = Math.max(
    CONSOLE_SCALE_MIN_CANVAS_HEIGHT,
    window.innerHeight - CONSOLE_STATUS_BAR_HEIGHT - (enabled ? CONSOLE_SCALE_PADDING : 0),
  )
  const canvasHeight = enabled
    ? Math.max(CONSOLE_SCALE_MIN_CANVAS_HEIGHT, Math.ceil(availableHeight / scale))
    : CONSOLE_SCALE_CANVAS_HEIGHT

  return {
    enabled,
    scale,
    canvasHeight,
  }
}

const resolveMobileConsoleState = () =>
  typeof window !== 'undefined' && window.innerWidth < MOBILE_CONSOLE_BREAKPOINT

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
  onOpenPreviewPort,
  onStatusChange,
  tabId,
}: {
  clusterContext: ClusterContext | null
  isVisible: boolean
  item: AgentListItem | null
  onOpenPreviewPort: (port: number) => void
  onStatusChange: (tabId: string, status: TerminalSessionState['status']) => void
  tabId: string
}) {
  const { t } = useI18n()
  const terminalMessages = useMemo(
    () => ({
      connectionFailed: t('terminal.connectionFailed'),
      connectionRestored: t('terminal.connectionRestored'),
      droppedOutputNotice: t('terminal.droppedOutputNotice'),
      reconnectFailed: t('terminal.reconnectFailed'),
      workspaceNotReady: t('terminal.workspaceNotReady'),
      connectionLostReconnecting: (code: number | undefined, seconds: number) =>
        t('terminal.connectionLostReconnecting', {
          code: code ? t('terminal.connectionCode', { code }) : '',
          seconds,
        }),
    }),
    [t],
  )
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
    messages: terminalMessages,
  })

  useEffect(() => {
    if (!item) return
    if (terminalSession?.resource.name === item.name) return
    void openTerminal(item)
  }, [item, openTerminal, terminalSession?.resource.name])

  useEffect(() => {
    if (!terminalSession?.status) return
    onStatusChange(tabId, terminalSession.status)
  }, [onStatusChange, tabId, terminalSession?.status])

  const attachTerminalOutput = useCallback((listener: (chunk: string) => void) => {
    return subscribeTerminalOutput((chunk) => {
      listener(chunk)
    })
  }, [subscribeTerminalOutput])

  return (
    <div
      className={[
        'absolute inset-0 h-full min-h-0 bg-[#05070a] transition-opacity duration-75',
        isVisible ? 'z-10 opacity-100 pointer-events-auto' : 'z-0 opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <AgentTerminalWorkspace
        isVisible={isVisible}
        onAttachOutput={attachTerminalOutput}
        onError={markTerminalError}
        onInput={sendTerminalInput}
        onOpenPreviewPort={onOpenPreviewPort}
        onReady={markTerminalConnected}
        onResize={resizeTerminal}
        session={terminalSession}
      />
    </div>
  )
}

function WebTabPane({ isVisible, tab }: { isVisible: boolean; tab: WebTab }) {
  return (
    <div
      className={[
        'absolute inset-0 h-full min-h-0 bg-white transition-opacity duration-75',
        isVisible ? 'z-10 opacity-100 pointer-events-auto' : 'z-0 opacity-0 pointer-events-none',
      ].join(' ')}
    >
      <iframe
        className="h-full w-full border-0 bg-white"
        key={`${tab.id}-${tab.refreshKey}`}
        src={tab.url}
        title={tab.title}
      />
    </div>
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
  const { t } = useI18n()
  const agentConsoleTitle = t('console.agentConsole')
  const consoleHomeTitle = t('console.home')
  const consoleTerminalTabLabel = t('console.terminalTab')
  const consoleLoadFailed = t('console.loadFailed')
  const consoleClusterContextMissing = t('console.clusterContextMissing')
  const consoleAgentNameMissing = t('console.agentNameMissing')
  const consoleSearchFilesFailed = t('console.searchFilesFailed')
  const [searchParams] = useSearchParams()
  const [clusterContext, setClusterContext] = useState<ClusterContext | null>(null)
  const [activeAgentName, setActiveAgentName] = useState(() => String(searchParams.get('agentName') || '').trim())
  const [item, setItem] = useState<AgentListItem | null>(null)
  const [services, setServices] = useState<AgentConsoleServiceItem[]>([])
  const [workspaceRoot, setWorkspaceRoot] = useState(defaultWorkspaceRoot)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [resourceSearch, setResourceSearch] = useState('')
  const [resourceSearchItems, setResourceSearchItems] = useState<AgentFileItem[]>([])
  const [resourceSearchLoading, setResourceSearchLoading] = useState(false)
  const [resourceSearchError, setResourceSearchError] = useState('')
  const [tabs, setTabs] = useState<ConsoleTab[]>(() => createInitialConsoleTabs(consoleHomeTitle))
  const [activeTabId, setActiveTabId] = useState(initialConsoleTabId)
  const [terminalStates, setTerminalStates] = useState<TerminalTabStateMap>({})
  const [explorerRootPath, setExplorerRootPath] = useState(defaultWorkspaceRoot)
  const [explorerChildren, setExplorerChildren] = useState<ExplorerChildrenMap>({})
  const [explorerExpanded, setExplorerExpanded] = useState<ExplorerFlagMap>({ [fileSystemRootPath]: true })
  const [explorerLoading, setExplorerLoading] = useState<ExplorerFlagMap>({})
  const [explorerErrors, setExplorerErrors] = useState<ExplorerErrorMap>({})
  const [consoleScale, setConsoleScale] = useState<ConsoleScaleState>(() => resolveConsoleScaleState())
  const [isMobileConsole, setIsMobileConsole] = useState(() => resolveMobileConsoleState())
  const [mobilePane, setMobilePane] = useState<MobileConsolePane>('explorer')

  const tabSeedRef = useRef(0)
  const manuallyCollapsedPathsRef = useRef(new Set<string>())
  const mobileTabsScrollerRef = useRef<HTMLDivElement | null>(null)
  const clusterContextRef = useRef<ClusterContext | null>(null)
  const activePreviewTargetRef = useRef<{ agentName: string; clusterContext: ClusterContext | null }>({
    agentName: '',
    clusterContext: null,
  })
  const previewTabsRef = useRef<WebTab[]>([])
  const previewServiceKeysRef = useRef(new Set<string>())
  const openingPreviewPortsRef = useRef(new Set<string>())

  const releasePreviewTabs = useCallback((previewTabs = previewTabsRef.current) => {
    const currentClusterContext = clusterContextRef.current
    previewTabs.forEach((tab) => {
      if (!tab.preview) return
      previewServiceKeysRef.current.delete(tab.serviceKey)
      if (!currentClusterContext) return
      void deleteAgentPreview(tab.preview.agentName, tab.preview.id, currentClusterContext)
    })
    if (previewTabs.length) {
      previewTabsRef.current = []
    }
  }, [])

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
    () => item?.aliasName || item?.name || activeAgentName || agentConsoleTitle,
    [activeAgentName, agentConsoleTitle, item?.aliasName, item?.name],
  )

  const serviceTabs = useMemo(() => readServiceList(services, item), [item, services])

  const pageTabs = useMemo(() => tabs.filter((tab) => tab.id !== initialConsoleTabId), [tabs])
  const visibleTabs = pageTabs.length ? pageTabs : tabs

  useEffect(() => {
    clusterContextRef.current = clusterContext
    activePreviewTargetRef.current = {
      agentName: item?.name || '',
      clusterContext,
    }
  }, [clusterContext, item?.name])

  useEffect(() => {
    const previewTabs = tabs.filter((tab): tab is WebTab => tab.type === 'web' && Boolean(tab.preview))
    previewTabsRef.current = previewTabs
    previewServiceKeysRef.current = new Set(previewTabs.map((tab) => tab.serviceKey))
  }, [tabs])

  useEffect(() => {
    setTabs((current) => {
      let terminalIndex = 0
      let changed = false
      const next = current.map((tab) => {
        if (tab.id === initialConsoleTabId && tab.type === 'home') {
          const title = consoleHomeTitle
          if (tab.title === title) return tab
          changed = true
          return { ...tab, title }
        }
        if (tab.type === 'terminal') {
          terminalIndex += 1
          const title = `${consoleTerminalTabLabel} ${terminalIndex}`
          if (tab.title === title) return tab
          changed = true
          return { ...tab, title }
        }
        return tab
      })
      return changed ? next : current
    })
  }, [consoleHomeTitle, consoleTerminalTabLabel])

  useEffect(() => {
    const syncScale = () => {
      const nextMobile = resolveMobileConsoleState()
      setIsMobileConsole(nextMobile)
      setConsoleScale(resolveConsoleScaleState())
      if (nextMobile && activeTabId === initialConsoleTabId) {
        setMobilePane('explorer')
      }
    }

    syncScale()
    window.addEventListener('resize', syncScale)
    window.addEventListener('orientationchange', syncScale)

    return () => {
      window.removeEventListener('resize', syncScale)
      window.removeEventListener('orientationchange', syncScale)
    }
  }, [activeTabId])
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
        setClusterContext(nextContext)
        if (!nextContext) {
          setMessage(consoleClusterContextMissing)
          setLoading(false)
        }
      } catch {
        if (!active) return
        setClusterContext(null)
        setMessage(consoleClusterContextMissing)
        setLoading(false)
      }
    }

    void bootstrap()

    return () => {
      active = false
    }
  }, [consoleClusterContextMissing])

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

    const loadConsole = async () => {
      if (!clusterContext) {
        setItem(null)
        setServices([])
        setLoading(false)
        return
      }

      const targetAgentName = activeAgentName
      if (!targetAgentName) {
        setItem(null)
        setServices([])
        setMessage(consoleAgentNameMissing)
        setLoading(false)
        return
      }

      setLoading(true)

      if (isMockClusterContext(clusterContext)) {
        setItem(null)
        setServices([])
        setMessage(consoleClusterContextMissing)
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
          setItem(null)
          setServices([])
          setMessage(t('terminal.agentNotFound', { name: targetAgentName }))
          return
        }

        const nextRoot = consolePayload.workspaceRoot || nextItem.workingDir || defaultWorkspaceRoot
        setItem(nextItem)
        setServices(consolePayload.services || [])
        setWorkspaceRoot(nextRoot)
        setExplorerRootPath(normalizeExplorerPath(nextRoot))
        setMessage('')
      } catch (error) {
        if (!active) return
        setItem(null)
        setServices([])
        setMessage(error instanceof Error ? error.message : consoleLoadFailed)
      } finally {
        if (active) setLoading(false)
      }
    }

    void loadConsole()

    return () => {
      active = false
    }
  }, [activeAgentName, clusterContext, consoleAgentNameMissing, consoleClusterContextMissing, consoleLoadFailed, t])

  useEffect(() => {
    if (!item) {
      closeFiles()
      return
    }
    openFiles(item)
    return () => {
      closeFiles()
    }
  }, [closeFiles, item, openFiles])

  useEffect(() => {
    releasePreviewTabs()
    setTabs(createInitialConsoleTabs(consoleHomeTitle))
    setActiveTabId(initialConsoleTabId)
    setMobilePane('explorer')
    setTerminalStates({})
    manuallyCollapsedPathsRef.current = new Set()
  }, [consoleHomeTitle, item?.name, releasePreviewTabs])

  const ensureDirectoryLoaded = useCallback(
    async (path: string) => {
      const normalizedPath = normalizeExplorerPath(path)

      if (!item || !clusterContext) return

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
    [clusterContext, item, readDirectory],
  )

  useEffect(() => {
    const root = normalizeExplorerPath(workspaceRoot || defaultWorkspaceRoot)
    setExplorerRootPath(root)
    const chain = buildExplorerPathChain(root)
    setExplorerExpanded((current) => applyAutoExpandChain(current, chain, manuallyCollapsedPathsRef.current))
    void ensureDirectoryLoaded(root)
  }, [ensureDirectoryLoaded, workspaceRoot])

  useEffect(() => {
    if (!filesSession?.loadedPath) return
    setExplorerChildren((current) => ({
      ...current,
      [normalizeExplorerPath(filesSession.loadedPath)]: sortEntries(filesSession.items),
    }))
  }, [filesSession?.items, filesSession?.loadedPath])

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
          const items = (await searchFiles(explorerRootPath, query)).items
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
          setResourceSearchError(error instanceof Error ? error.message : consoleSearchFilesFailed)
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
  }, [consoleSearchFilesFailed, explorerRootPath, filesSession?.status, resourceSearch, searchFiles])

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
        await saveFile(target.path, target.content)
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
    [saveFile, tabs],
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
        const result = await readFile(entry.path)

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
    [readFile],
  )

  const openFileTab = useCallback(
    (entry: AgentFileItem) => {
      if (entry.type !== 'file') return

      const existing = tabs.find((tab) => tab.type === 'file' && tab.path === entry.path)
      if (existing) {
        setActiveTabId(existing.id)
        if (isMobileConsole) setMobilePane('workspace')
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
      if (isMobileConsole) setMobilePane('workspace')
      void loadFileTabContent(nextTab.id, entry)
    },
    [isMobileConsole, loadFileTabContent, tabs],
  )

  const openNewTerminalTab = useCallback(() => {
    tabSeedRef.current += 1
    const nextTab: TerminalTab = {
      id: `terminal-${Date.now()}-${tabSeedRef.current}`,
      type: 'terminal',
      title: `${consoleTerminalTabLabel} ${pageTabs.filter((tab) => tab.type === 'terminal').length + 1}`,
    }
    setTabs((current) => [...current, nextTab])
    setActiveTabId(nextTab.id)
    if (isMobileConsole) setMobilePane('workspace')
  }, [consoleTerminalTabLabel, isMobileConsole, pageTabs])

  const openWebTab = useCallback((service: { key: string; label: string; url: string; preview?: PreviewMetadata }) => {
    setTabs((current) => {
      const existing = current.find((tab) => tab.type === 'web' && tab.serviceKey === service.key)
      if (existing) {
        setActiveTabId(existing.id)
        if (isMobileConsole) setMobilePane('workspace')
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
        preview: service.preview,
      }
      setActiveTabId(nextTab.id)
      if (isMobileConsole) setMobilePane('workspace')
      return [...current, nextTab]
    })
  }, [isMobileConsole])

  const openPreviewPort = useCallback(async (port: number) => {
    if (!clusterContext || !item) return
    const agentName = item.name
    const previewKey = `preview:${agentName}:${port}`
    const existing = previewTabsRef.current.find(
      (tab) => tab.preview?.agentName === agentName && tab.preview.port === port,
    )
    if (existing) {
      setActiveTabId(existing.id)
      if (isMobileConsole) setMobilePane('workspace')
      return
    }
    if (previewServiceKeysRef.current.has(previewKey)) return
    if (openingPreviewPortsRef.current.has(previewKey)) return
    openingPreviewPortsRef.current.add(previewKey)
    try {
      const preview = await createAgentPreview(agentName, port, clusterContext)
      const activePreviewTarget = activePreviewTargetRef.current
      if (activePreviewTarget.agentName !== agentName || activePreviewTarget.clusterContext !== clusterContext) {
        void deleteAgentPreview(agentName, preview.id, clusterContext)
        return
      }
      previewServiceKeysRef.current.add(previewKey)
      openWebTab({
        key: previewKey,
        label: t('console.openPreviewTab', { port }),
        url: preview.url,
        preview: {
          agentName,
          id: preview.id,
          port: preview.port,
        },
      })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('console.openPreviewFailed'))
    } finally {
      openingPreviewPortsRef.current.delete(previewKey)
    }
  }, [clusterContext, isMobileConsole, item, openWebTab, t])

  useEffect(() => {
    if (!clusterContext) return
    const previewTabs = tabs.filter((tab): tab is WebTab => tab.type === 'web' && Boolean(tab.preview))
    if (!previewTabs.length) return

    const heartbeat = () => {
      previewTabs.forEach((tab) => {
        if (!tab.preview) return
        void heartbeatAgentPreview(tab.preview.agentName, tab.preview.id, clusterContext)
      })
    }
    heartbeat()
    const timer = window.setInterval(heartbeat, 25_000)
    return () => window.clearInterval(timer)
  }, [clusterContext, tabs])

  useEffect(() => {
    return () => {
      releasePreviewTabs()
    }
  }, [releasePreviewTabs])

  const closeTab = useCallback(
    async (tabId: string) => {
      if (tabId === initialConsoleTabId) return
      const target = tabs.find((tab): tab is FileTab => tab.id === tabId && tab.type === 'file')
      const previewTarget = tabs.find((tab): tab is WebTab => tab.id === tabId && tab.type === 'web' && Boolean(tab.preview))
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
          if (isMobileConsole && (!fallback || fallback.id === initialConsoleTabId)) {
            setMobilePane('explorer')
          }
        }
        return next.length ? next : createInitialConsoleTabs(consoleHomeTitle)
      })
      if (previewTarget?.preview && clusterContext) {
        previewServiceKeysRef.current.delete(previewTarget.serviceKey)
        void deleteAgentPreview(previewTarget.preview.agentName, previewTarget.preview.id, clusterContext)
      }
      setTerminalStates((current) => {
        if (!(tabId in current)) return current
        const next = { ...current }
        delete next[tabId]
        return next
      })
    },
    [activeTabId, clusterContext, consoleHomeTitle, isMobileConsole, saveFileTab, tabs],
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

  useEffect(() => {
    if (!isMobileConsole || mobilePane !== 'workspace') return
    window.requestAnimationFrame(() => {
      const scroller = mobileTabsScrollerRef.current
      const activeButton = scroller?.querySelector<HTMLButtonElement>('[data-active-tab="true"]')
      activeButton?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    })
  }, [activeTabId, isMobileConsole, mobilePane, visibleTabs.length])

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
    : explorerChildren[explorerRootPath] || explorerChildren[parentPath(explorerRootPath)] || []
  const rootPathLoaded = Boolean(explorerChildren[explorerRootPath])
  const filesConnecting =
    filesSession?.status === 'initializing' ||
    filesSession?.status === 'connecting' ||
    Boolean(filesSession?.browsing)
  const rootLoading =
    resourceSearchLoading ||
    Boolean(explorerLoading[explorerRootPath]) ||
    Boolean(item && !rootPathLoaded && (!explorerErrors[explorerRootPath] || filesConnecting))
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
      ? terminalStates[activeTab.id] || t('console.ready')
      : activeTab?.type === 'file'
        ? activeTab.loading
          ? t('console.reading')
          : activeTab.stale
            ? t('console.cacheRefreshing')
            : t('console.filePreview')
        : activeTab?.type === 'web'
          ? activeTab.url
          : ''
  const showMobileExplorer = isMobileConsole && mobilePane === 'explorer'
  const showMobileWorkspace = isMobileConsole && mobilePane === 'workspace'
  const canReturnMobileWorkspace = isMobileConsole && activeTab?.id !== initialConsoleTabId
  const activeWorkspaceDark = activeTab?.type === 'terminal' || activeTab?.type === 'file'
  const activeWebPreview = activeTab?.type === 'web' && Boolean(activeTab.preview)

  return (
    <main className="flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden bg-white text-[var(--color-text)]">
      <div
        className={
          isMobileConsole
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden bg-white'
            : consoleScale.enabled
            ? 'min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-white p-3'
            : 'flex min-h-0 flex-1 flex-col overflow-hidden bg-white px-4 py-5 sm:px-6 lg:px-12 lg:py-6'
        }
      >
        <div
          data-testid={consoleScale.enabled ? 'console-scale-frame' : undefined}
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
            isMobileConsole
              ? 'flex min-h-0 flex-1 flex-col'
              : consoleScale.enabled
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
              aria-label={t('console.closeNotice')}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-amber-700 transition hover:bg-amber-100 hover:text-amber-900"
              onClick={() => setMessage('')}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <div
          className={
            isMobileConsole
              ? 'flex min-h-0 flex-1 overflow-hidden'
              : 'grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] gap-5'
          }
        >
          <aside
            className={[
              'min-h-0 flex-col overflow-hidden bg-white',
              isMobileConsole
                ? showMobileExplorer
                  ? 'flex w-full rounded-none border-0'
                  : 'hidden'
                : 'flex rounded-[12px] border border-zinc-200',
            ].join(' ')}
            data-testid="console-explorer-pane"
          >
            <div className="border-b border-zinc-100 px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[15px] font-medium text-zinc-950">{t('console.resourceExplorer')}</div>
                  <div className="mt-2 flex max-w-[220px] items-center gap-1 overflow-hidden text-[12px] text-zinc-500">
                    <button
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-35"
                      disabled={!canGoParent}
                      onClick={() => navigateExplorerToPath(parentPath(explorerRootPath))}
                      title={t('console.backParent')}
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
                  {canReturnMobileWorkspace ? (
                    <button
                      aria-label={t('console.backWorkspace')}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-[7px] border border-zinc-200 bg-white text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98]"
                      onClick={() => setMobilePane('workspace')}
                      title={t('console.backWorkspace')}
                      type="button"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    aria-label={t('console.addTerminal')}
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
                  placeholder={t('console.searchFiles')}
                  value={resourceSearch}
                />
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-3 py-3">
              <div className="mb-2 px-2 text-[12px] font-medium text-zinc-500">
                {searchActive ? t('console.searchResults', { keyword: resourceSearch.trim() }) : t('console.fileTree')}
              </div>
              {loading || rootLoading ? (
                <div className="flex items-center gap-2 px-2 py-3 text-[13px] text-zinc-500">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  {searchActive ? t('console.searchingFiles') : t('console.loadingFiles')}
                </div>
              ) : rootError ? (
                <div className="rounded-[8px] border border-rose-100 bg-rose-50 px-3 py-3 text-[13px] text-rose-700">
                  {rootError}
                </div>
              ) : rootEntries.length ? (
                <div className="space-y-0.5">{rootEntries.map((entry) => renderExplorerNode(entry, 0))}</div>
              ) : (
                <div className="rounded-[8px] border border-dashed border-zinc-200 px-3 py-6 text-center text-[13px] text-zinc-500">
                  {searchActive ? t('console.noMatchingFiles') : t('console.noFileTree')}
                </div>
              )}
            </div>
          </aside>

          <section
            className={[
              'min-h-0 flex-col overflow-hidden',
              activeWorkspaceDark ? 'bg-[#05070a]' : 'bg-white',
              isMobileConsole
                ? showMobileWorkspace
                  ? 'flex w-full rounded-none border-0'
                  : 'hidden'
                : activeWorkspaceDark
                  ? 'flex rounded-t-[12px] border border-zinc-200'
                  : 'flex rounded-[12px] border border-zinc-200',
            ].join(' ')}
            data-testid="console-workspace-pane"
          >
            <div className="flex h-11 shrink-0 border-b border-zinc-100 bg-white">
              {isMobileConsole ? (
                <button
                  aria-label={t('console.backExplorer')}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center border-r border-zinc-100 text-zinc-700 transition active:scale-[0.98]"
                  onClick={() => setMobilePane('explorer')}
                  title={t('console.backExplorer')}
                  type="button"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              ) : null}
              <div
                className={[
                  'flex min-w-0 flex-1 overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                  isMobileConsole ? 'touch-pan-x snap-x snap-mandatory' : '',
                ].join(' ')}
                ref={mobileTabsScrollerRef}
              >
                {visibleTabs.map((tab) => {
                  const Icon = iconForTab(tab)
                  const active = tab.id === activeTab?.id
                  return (
                    <button
                      className={[
                        'group flex h-11 items-center gap-2 border-r border-zinc-100 px-4 text-[13px] transition',
                        isMobileConsole
                          ? 'min-w-[148px] max-w-[176px] shrink-0 snap-start'
                          : 'min-w-[156px] max-w-[240px]',
                        active ? 'bg-zinc-50 text-zinc-950' : 'bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800',
                      ].join(' ')}
                      data-active-tab={active ? 'true' : undefined}
                      key={tab.id}
                      onClick={() => {
                        setActiveTabId(tab.id)
                        if (isMobileConsole && tab.id !== initialConsoleTabId) {
                          setMobilePane('workspace')
                        }
                      }}
                      type="button"
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate text-left">{tab.title}</span>
                      {tab.type === 'file' && tab.dirty ? (
                        <span
                          aria-label={t('console.unsavedChanges')}
                          className="h-2 w-2 shrink-0 rounded-full bg-sky-500"
                          title={t('console.unsavedChanges')}
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
                aria-label={t('console.addTerminal')}
                className="inline-flex h-11 w-12 shrink-0 items-center justify-center border-l border-zinc-100 text-zinc-600 transition hover:bg-zinc-50 active:scale-[0.98]"
                onClick={openNewTerminalTab}
                type="button"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>

            {activeTab?.type !== 'home' && activeTab?.type !== 'terminal' && activeTab?.type !== 'file' && !activeWebPreview ? (
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

            <div
              className={[
                'relative min-h-0 flex-1 overflow-hidden',
                activeWorkspaceDark ? 'bg-[#05070a]' : '',
              ].join(' ')}
            >
              {activeTab?.type === 'home' ? (
                <div className="absolute inset-0 flex h-full min-h-0 items-stretch overflow-hidden p-6">
                  <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-[16px] border border-dashed border-zinc-300 bg-[#fafafa] px-6 py-12 text-center">
                    <div className="relative z-10 flex max-w-[430px] flex-col items-center gap-3">
                      <h2 className="text-[24px]/8 font-medium tracking-normal text-black">{t('console.noOpenPage')}</h2>
                      <p className="text-[16px]/6 font-normal text-[#4d4d4d]">
                        {t('console.noOpenPageDesc')}
                      </p>
                      <button
                        className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border border-[#171717] bg-[#171717] px-4 text-[14px] font-medium text-[#fafafa] shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition hover:border-black hover:bg-black"
                        onClick={openNewTerminalTab}
                        type="button"
                      >
                        <Plus className="h-4 w-4" />
                        {t('console.addTerminal')}
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
                    onOpenPreviewPort={openPreviewPort}
                    onStatusChange={updateTerminalState}
                    tabId={tab.id}
                  />
                ))}

              {tabs
                .filter((tab): tab is WebTab => tab.type === 'web')
                .map((tab) => (
                  <WebTabPane
                    isVisible={activeTab?.id === tab.id}
                    key={tab.id}
                    tab={tab}
                  />
                ))}

              {activeTab?.type === 'file' ? (
                <div className="absolute inset-0">
                  <FileTabPane onChange={updateFileTabContent} tab={activeTab} />
                </div>
              ) : null}
            </div>
          </section>
        </div>
        </div>
        </div>
      </div>
      <footer className="flex h-6 shrink-0 items-center justify-between gap-3 bg-zinc-600 px-3 text-[12px]/6 text-white">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate font-medium">{item ? item.template.name : 'Agent'}</span>
          <span className="shrink-0 text-white/55">/</span>
          <span className="truncate">{displayName}</span>
          <span className="shrink-0 text-white/55">/</span>
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
