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

  if (ENABLE_LOCAL_CONSOLE_FALLBACK) {
    openLocalConsoleWindow(agentName)
    return
  }

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
}
