import type { AgentListItem } from '../../../../domains/agents/types'
import { openSealosDesktopApp } from '../../../../sealosSdk'

export const AGENTHUB_CONSOLE_APP_KEY =
  import.meta.env.VITE_AGENTHUB_CONSOLE_APP_KEY ||
  import.meta.env.VITE_AGENTHUB_TERMINAL_APP_KEY ||
  'user-agenthub-terminal'
export const AGENTHUB_CONSOLE_ROUTE = '/desktop/console'
export const AGENTHUB_CONSOLE_MESSAGE_TYPE = 'AgentHubConsoleWindow'
const ENABLE_LOCAL_CONSOLE_FALLBACK =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION || '').toLowerCase() === 'true'

const isLoopbackHost = () => {
  if (typeof window === 'undefined') return false
  const host = window.location.hostname.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

const shouldOpenLocalConsoleWindow = () =>
  import.meta.env.DEV && (ENABLE_LOCAL_CONSOLE_FALLBACK || isLoopbackHost())

const openLocalConsoleWindow = (agentName: string) => {
  if (typeof window === 'undefined') return

  const target = new URL(AGENTHUB_CONSOLE_ROUTE, window.location.origin)
  target.searchParams.set('agentName', agentName)
  const opened = window.open(target.toString(), '_blank')
  if (opened) {
    opened.opener = null
    opened.focus()
    return
  }
  window.location.assign(target.toString())
}

export const openAgentConsoleDesktopWindow = async (item: AgentListItem) => {
  const agentName = String(item.name || '').trim()
  if (!agentName) {
    throw new Error('缺少 Agent 实例名称，无法打开控制台窗口。')
  }

  if (shouldOpenLocalConsoleWindow()) {
    openLocalConsoleWindow(agentName)
    return
  }

  try {
    await openSealosDesktopApp({
      appKey: AGENTHUB_CONSOLE_APP_KEY,
      pathname: AGENTHUB_CONSOLE_ROUTE,
      query: {
        agentName,
      },
      messageData: {
        type: AGENTHUB_CONSOLE_MESSAGE_TYPE,
        agentName,
        aliasName: item.aliasName || item.name,
      },
      appSize: 'normal',
    })
  } catch (error) {
    if (import.meta.env.DEV) {
      console.warn('[agent-hub] failed to open desktop console app, fallback to local window:', error)
      openLocalConsoleWindow(agentName)
      return
    }
    throw error
  }
}
