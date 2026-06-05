import type { AgentListItem } from '../../../../domains/agents/types'
import { openSealosDesktopApp } from '../../../../sealosSdk'

export const AGENTHUB_CONSOLE_APP_KEY =
  import.meta.env.VITE_AGENTHUB_CONSOLE_APP_KEY ||
  import.meta.env.VITE_AGENTHUB_TERMINAL_APP_KEY ||
  'user-agenthub-terminal'
export const AGENTHUB_CONSOLE_ROUTE = '/console'
export const AGENTHUB_CONSOLE_MESSAGE_TYPE = 'AgentHubConsoleWindow'
const ENABLE_LOCAL_CONSOLE_FALLBACK =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION || '').toLowerCase() === 'true'

const getCenteredWindowFeatures = (width = 1120, height = 760) => {
  if (typeof window === 'undefined') {
    return `popup=yes,width=${width},height=${height},resizable=yes,scrollbars=yes`
  }

  const screenLeft = window.screenX ?? window.screenLeft ?? 0
  const screenTop = window.screenY ?? window.screenTop ?? 0
  const availableWidth = window.outerWidth || window.innerWidth || width
  const availableHeight = window.outerHeight || window.innerHeight || height
  const left = Math.max(0, Math.round(screenLeft + (availableWidth - width) / 2))
  const top = Math.max(0, Math.round(screenTop + (availableHeight - height) / 2))

  return [
    'popup=yes',
    `width=${width}`,
    `height=${height}`,
    `left=${left}`,
    `top=${top}`,
    'resizable=yes',
    'scrollbars=yes',
  ].join(',')
}

const openLocalConsoleWindow = (agentName: string) => {
  if (typeof window === 'undefined') return

  const target = new URL(AGENTHUB_CONSOLE_ROUTE, window.location.origin)
  target.searchParams.set('agentName', agentName)
  const opened = window.open(
    target.toString(),
    `agenthub-console-${agentName}`,
    getCenteredWindowFeatures(),
  )
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
    throw new Error('Missing Agent instance name, so the console window cannot be opened.')
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
    if (ENABLE_LOCAL_CONSOLE_FALLBACK) {
      console.warn('[agent-hub] failed to open desktop console app, fallback to local window:', error)
      openLocalConsoleWindow(agentName)
      return
    }
    throw error
  }
}
