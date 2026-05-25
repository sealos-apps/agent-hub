import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { addSealosAppEventListener } from '../../../sealosSdk'
import { AGENTHUB_CONSOLE_ROUTE } from './lib/consoleWindow'
import { parseAgentTerminalDesktopMessage } from './lib/desktopMessages'

export function AgentConsoleLaunchBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    const openConsole = (raw: unknown) => {
      const agentName = parseAgentTerminalDesktopMessage(raw)
      if (!agentName) return
      navigate(`${AGENTHUB_CONSOLE_ROUTE}?agentName=${encodeURIComponent(agentName)}`)
    }

    const onWindowMessage = (event: MessageEvent) => {
      if (!event.source) return
      if (event.origin !== window.location.origin) return
      openConsole(event.data)
    }

    window.addEventListener('message', onWindowMessage)

    let cleanupAppListener: (() => void) | undefined
    try {
      const result = addSealosAppEventListener('openDesktopApp', (data: unknown) => {
        openConsole(data)
      })
      if (typeof result === 'function') cleanupAppListener = result as () => void
    } catch {
      cleanupAppListener = undefined
    }

    return () => {
      window.removeEventListener('message', onWindowMessage)
      cleanupAppListener?.()
    }
  }, [navigate])

  return null
}
