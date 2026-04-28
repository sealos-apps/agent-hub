import { LoaderCircle, Terminal as TerminalIcon } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { createClusterContext, getAgent, listAgentTemplates } from '../../../api'
import { APP_NAME, APP_TERMINAL_TITLE } from '../../../branding'
import { AgentTerminalWorkspace } from '../../../components/business/terminal/AgentTerminalWorkspace'
import { mapBackendAgentsToListItems } from '../../../domains/agents/mappers'
import { hydrateTemplateCatalog } from '../../../domains/agents/templates'
import type { AgentListItem, ClusterContext } from '../../../domains/agents/types'
import { addSealosAppEventListener, getSealosSession } from '../../../sealosSdk'
import { useAgentTerminal } from './hooks/useAgentTerminal'
import { parseAgentTerminalDesktopMessage } from './lib/desktopMessages'

export function AgentTerminalWindowPage() {
  const [searchParams] = useSearchParams()
  const [clusterContext, setClusterContext] = useState<ClusterContext | null>(null)
  const [activeAgentName, setActiveAgentName] = useState(() => String(searchParams.get('agentName') || '').trim())
  const [activeItem, setActiveItem] = useState<AgentListItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const displayName = useMemo(
    () => activeItem?.aliasName || activeItem?.name || activeAgentName || APP_TERMINAL_TITLE,
    [activeAgentName, activeItem?.aliasName, activeItem?.name],
  )

  useEffect(() => {
    document.title = `${displayName} · ${APP_NAME}`
  }, [displayName])

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
    onErrorMessage: setMessage,
  })

  useEffect(() => {
    let active = true

    const bootstrap = async () => {
      try {
        const session = await getSealosSession().catch(() => null)
        const nextContext = createClusterContext(session)
        if (!active) return
        setClusterContext(nextContext)
      } catch (error) {
        if (!active) return
        setMessage(error instanceof Error ? error.message : '工作区信息加载失败')
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
      applyMessage(event.data)
    }

    window.addEventListener('message', onWindowMessage)

    let cleanupAppListener: (() => void) | undefined
    try {
      const result = addSealosAppEventListener('openDesktopApp', (data: unknown) => {
        applyMessage(data)
      })
      if (typeof result === 'function') {
        cleanupAppListener = result as () => void
      }
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

    const loadAgent = async () => {
      if (!clusterContext || !activeAgentName) {
        setLoading(Boolean(!clusterContext))
        setActiveItem(null)
        return
      }

      setLoading(true)

      try {
        const templatePayload = await listAgentTemplates()
        const response = await getAgent(activeAgentName, clusterContext)
        const rawAgent = response?.agent || null
        const templates = hydrateTemplateCatalog(templatePayload.items)
        const nextItem =
          mapBackendAgentsToListItems(
            rawAgent ? [rawAgent] : [],
            templates,
            {
              cluster: clusterContext.server,
              namespace: clusterContext.namespace,
              kc: clusterContext.kubeconfig,
              server: clusterContext.server,
              operator: clusterContext.operator,
              updatedAt: '',
            },
          )[0] || null
        if (!active) return

        if (!nextItem) {
          setActiveItem(null)
          setMessage(`未找到名为 ${activeAgentName} 的 Agent 实例。`)
          return
        }

        setActiveItem(nextItem)
        setMessage('')
      } catch (error) {
        if (!active) return
        setActiveItem(null)
        setMessage(error instanceof Error ? error.message : '读取 Agent 信息失败')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadAgent()

    return () => {
      active = false
    }
  }, [activeAgentName, clusterContext])

  useEffect(() => {
    if (!activeItem) return
    if (terminalSession?.resource.name === activeItem.name) return
    openTerminal(activeItem)
  }, [activeItem, openTerminal, terminalSession?.resource.name])

  return (
    <main className="flex h-screen min-h-screen flex-col bg-[var(--color-bg)]">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] bg-white px-5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.08)]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[var(--color-text)]">
            <TerminalIcon size={18} />
            <span className="truncate text-sm font-semibold">{displayName}</span>
          </div>
          <div className="mt-1 truncate text-xs text-[var(--color-muted)]">{activeItem?.name || activeAgentName || '等待终端目标'}</div>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
            <LoaderCircle className="animate-spin" size={14} />
            加载中
          </div>
        ) : null}
      </header>

      {message && !terminalSession ? (
        <div className="border-b border-rose-200 bg-rose-50 px-5 py-2 text-sm text-rose-700">{message}</div>
      ) : null}

      <div className="min-h-0 flex-1 p-3">
        <AgentTerminalWorkspace
          onAttachOutput={subscribeTerminalOutput}
          onError={markTerminalError}
          onInput={sendTerminalInput}
          onReady={markTerminalConnected}
          onResize={resizeTerminal}
          session={terminalSession}
        />
      </div>
    </main>
  )
}
