import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { buildAgentTerminalWebSocketUrl } from '../../../../api'
import type {
  AgentListItem,
  ClusterContext,
  TerminalSessionState,
} from '../../../../domains/agents/types'

type TerminalOutputListener = (chunk: string) => void

const defaultTerminalCwd = '/opt/hermes'
const maxBufferedOutputChunks = 200
const reconnectDelaySchedule = [600, 1200, 2400, 5000]
const maxReconnectAttempts = 6
const terminalConnectTimeoutMs = 10_000

type TerminalMessages = {
  connectionFailed: string
  connectionRestored: string
  droppedOutputNotice: string
  reconnectFailed: string
  workspaceNotReady: string
  connectionLostReconnecting: (code: number | undefined, seconds: number) => string
}

const defaultTerminalMessages: TerminalMessages = {
  connectionFailed: 'Terminal connection failed',
  connectionRestored: 'Terminal connection restored.',
  droppedOutputNotice: '[Server backpressure protection: some historical output was skipped to keep interaction responsive]',
  reconnectFailed: 'Terminal connection retried several times. Please reconnect manually.',
  workspaceNotReady: 'The current workspace is not ready, so the terminal cannot connect yet.',
  connectionLostReconnecting: (code, seconds) =>
    `Connection lost${code ? ` (code=${code})` : ''}, reconnecting in ${seconds}s...`,
}

const createTerminalSession = (
  resource: AgentListItem,
  payload?: Partial<TerminalSessionState>,
): TerminalSessionState => ({
  resource,
  status: 'initializing',
  error: '',
  podName: payload?.podName || '',
  containerName: payload?.containerName || '',
  namespace: payload?.namespace || '',
  wsUrl: payload?.wsUrl || '',
  terminalId: payload?.terminalId || '',
  cwd: payload?.cwd || resource.template.defaultWorkingDirectory || defaultTerminalCwd,
})

type ReconnectPlan = {
  resource: AgentListItem | null
  wsUrl: string
  encodedKubeconfig: string
  terminalId: string
  cwd: string
}

type TerminalWebSocketMessage = {
  type?: string
  data?: string
  code?: string
  namespace?: string
  podName?: string
  container?: string
}

interface UseAgentTerminalOptions {
  clusterContext: ClusterContext | null
  messages?: Partial<TerminalMessages>
  onErrorMessage?: (message: string) => void
}

export function useAgentTerminal({ clusterContext, messages, onErrorMessage }: UseAgentTerminalOptions) {
  const [terminalSession, setTerminalSession] = useState<TerminalSessionState | null>(null)
  const terminalMessages = useMemo<TerminalMessages>(
    () => ({
      ...defaultTerminalMessages,
      ...messages,
    }),
    [messages],
  )

  const socketRef = useRef<WebSocket | null>(null)
  const terminalSessionRef = useRef<TerminalSessionState | null>(null)
  const requestVersionRef = useRef(0)
  const closingSocketsRef = useRef(new WeakSet<WebSocket>())
  const outputListenersRef = useRef(new Set<TerminalOutputListener>())
  const outputBacklogRef = useRef<string[]>([])
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<number | null>(null)
  const connectTimeoutRef = useRef<number | null>(null)
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const connectSocketRef = useRef<(version: number, plan: ReconnectPlan, mode: 'fresh' | 'reconnect') => void>(() => {})
  const reconnectPlanRef = useRef<ReconnectPlan>({
    resource: null,
    wsUrl: '',
    encodedKubeconfig: '',
    terminalId: '',
    cwd: defaultTerminalCwd,
  })
  const clusterKubeconfig = clusterContext?.kubeconfig || ''

  const syncSession = useCallback((updater: (current: TerminalSessionState | null) => TerminalSessionState | null) => {
    setTerminalSession((current) => {
      const next = updater(current)
      terminalSessionRef.current = next
      return next
    })
  }, [])

  const sendTerminalResize = useCallback((
    socket: WebSocket,
    cols: number,
    rows: number,
  ) => {
    if (socket.readyState !== WebSocket.OPEN) {
      return false
    }
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) {
      return false
    }

    socket.send(JSON.stringify({ type: 'resize', cols: Math.floor(cols), rows: Math.floor(rows) }))
    return true
  }, [])

  const emitOutput = useCallback((chunk: string) => {
    if (!chunk) return

    const listeners = outputListenersRef.current
    if (!listeners.size) {
      outputBacklogRef.current.push(chunk)
      if (outputBacklogRef.current.length > maxBufferedOutputChunks) {
        outputBacklogRef.current.splice(0, outputBacklogRef.current.length - maxBufferedOutputChunks)
      }
      return
    }

    listeners.forEach((listener) => listener(chunk))
  }, [])

  const subscribeTerminalOutput = useCallback((listener: TerminalOutputListener) => {
    outputListenersRef.current.add(listener)

    if (outputBacklogRef.current.length) {
      outputBacklogRef.current.forEach((chunk) => listener(chunk))
      outputBacklogRef.current = []
    }

    return () => {
      outputListenersRef.current.delete(listener)
    }
  }, [])

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current)
      connectTimeoutRef.current = null
    }
  }, [])

  const closeSocket = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null

    if (socket && socket.readyState <= WebSocket.OPEN) {
      closingSocketsRef.current.add(socket)
      socket.close(1000, 'manual-close')
    }
  }, [])

  const connectSocket = useCallback((
    version: number,
    plan: ReconnectPlan,
    mode: 'fresh' | 'reconnect',
  ) => {
    if (!plan.resource || !plan.wsUrl || !plan.encodedKubeconfig || !plan.terminalId) {
      return
    }

    closeSocket()

    const socket = new WebSocket(plan.wsUrl)
    socketRef.current = socket

    clearConnectTimeout()
    connectTimeoutRef.current = window.setTimeout(() => {
      connectTimeoutRef.current = null
      const currentStatus = terminalSessionRef.current?.status
      if (
        version !== requestVersionRef.current ||
        socketRef.current !== socket ||
        socket.readyState > WebSocket.OPEN ||
        (currentStatus !== 'connecting' && currentStatus !== 'reconnecting')
      ) {
        return
      }
      socket.close(4000, 'connect-timeout')
    }, terminalConnectTimeoutMs)

    socket.addEventListener('open', () => {
      if (version !== requestVersionRef.current) return

      socket.send(JSON.stringify({
        type: 'auth',
        authorization: plan.encodedKubeconfig,
        cwd: plan.cwd,
      }))
    })

    socket.addEventListener('message', (event) => {
      if (version !== requestVersionRef.current) return

      if (typeof event.data !== 'string') return

      let messagePayload: TerminalWebSocketMessage | null = null
      try {
        messagePayload = JSON.parse(event.data) as TerminalWebSocketMessage
      } catch {
        return
      }

      const messageType = String(messagePayload?.type || '')

      switch (messageType) {
        case 'connected':
          reconnectAttemptsRef.current = 0
          clearReconnectTimer()
          if (socketRef.current === socket) {
            clearConnectTimeout()
          }
          syncSession((current) =>
            current
              ? {
                  ...current,
                  status: 'connected',
                  error: '',
                  podName: String(messagePayload?.podName || current.podName || ''),
                  containerName: String(messagePayload?.container || current.containerName || ''),
                  namespace: String(messagePayload?.namespace || current.namespace || plan.resource?.namespace || ''),
                }
              : current,
          )
          if (pendingResizeRef.current) {
            const { cols, rows } = pendingResizeRef.current
            if (sendTerminalResize(socket, cols, rows)) {
              pendingResizeRef.current = null
            }
          }
          if (mode === 'reconnect') {
            emitOutput(`\r\n\x1b[90m${terminalMessages.connectionRestored}\x1b[0m\r\n`)
          }
          return
        case 'stdout':
        case 'stderr':
          emitOutput(String(messagePayload?.data || ''))
          return
        case 'error': {
          const message = String(messagePayload?.data || terminalMessages.connectionFailed)
          syncSession((current) =>
            current
              ? {
                  ...current,
                  status: 'error',
                  error: message,
                }
              : current,
          )

          emitOutput(`\r\n\x1b[31m${message}\x1b[0m\r\n`)
          onErrorMessage?.(message)
          return
        }
        default:
          return
      }
    })

    socket.addEventListener('error', () => {
      if (version !== requestVersionRef.current) return

      if (socketRef.current === socket) {
        clearConnectTimeout()
      }
      syncSession((current) =>
        current
          ? {
              ...current,
              status: 'reconnecting',
              error: '',
            }
          : current,
      )
    })

    socket.addEventListener('close', (event) => {
      const closedManually = closingSocketsRef.current.has(socket)
      closingSocketsRef.current.delete(socket)

      if (socketRef.current === socket) {
        clearConnectTimeout()
        socketRef.current = null
      }

      if (version !== requestVersionRef.current || closedManually) {
        return
      }

      const current = terminalSessionRef.current
      const reconnectPlan = reconnectPlanRef.current
      if (!current || !reconnectPlan.resource) {
        return
      }

      const nextAttempt = reconnectAttemptsRef.current + 1
      reconnectAttemptsRef.current = nextAttempt

      if (nextAttempt > maxReconnectAttempts) {
        const message = terminalMessages.reconnectFailed
        clearReconnectTimer()
        syncSession((session) =>
          session
            ? {
                ...session,
                status: 'error',
                error: message,
              }
            : session,
        )
        emitOutput(`\r\n\x1b[31m${message}\x1b[0m\r\n`)
        onErrorMessage?.(message)
        return
      }

      const delay = reconnectDelaySchedule[Math.min(nextAttempt - 1, reconnectDelaySchedule.length - 1)]

      clearReconnectTimer()
      syncSession((session) =>
        session
          ? {
              ...session,
              status: 'reconnecting',
              error: '',
            }
          : session,
      )

      emitOutput(
        `\r\n\x1b[90m${terminalMessages.connectionLostReconnecting(event.code || undefined, Math.max(1, Math.round(delay / 1000)))}\x1b[0m\r\n`,
      )

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        connectSocketRef.current(version, reconnectPlanRef.current, 'reconnect')
      }, delay)
    })
  }, [clearConnectTimeout, clearReconnectTimer, closeSocket, emitOutput, onErrorMessage, sendTerminalResize, syncSession, terminalMessages])

  useEffect(() => {
    connectSocketRef.current = connectSocket
  }, [connectSocket])

  const openTerminal = useCallback(
    async (resource: AgentListItem) => {
      const current = terminalSessionRef.current
      const socket = socketRef.current
      if (
        current &&
        current.resource.name === resource.name &&
        (current.status === 'connected' || current.status === 'connecting' || current.status === 'reconnecting') &&
        socket &&
        (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)
      ) {
        return
      }

      requestVersionRef.current += 1
      const version = requestVersionRef.current

      clearReconnectTimer()
      reconnectAttemptsRef.current = 0
      pendingResizeRef.current = null
      outputBacklogRef.current = []
      closeSocket()

      if (!clusterKubeconfig) {
        const message = terminalMessages.workspaceNotReady
        syncSession(() => ({
          ...createTerminalSession(resource),
          status: 'error',
          error: message,
        }))
        onErrorMessage?.(message)
        return
      }

      const plan: ReconnectPlan = {
        resource,
        wsUrl: buildAgentTerminalWebSocketUrl(resource.name),
        encodedKubeconfig: encodeURIComponent(clusterKubeconfig),
        terminalId: `${resource.name}-terminal`,
        cwd: resource.template.defaultWorkingDirectory || defaultTerminalCwd,
      }
      reconnectPlanRef.current = plan

      syncSession(() => ({
        ...createTerminalSession(resource, {
          wsUrl: plan.wsUrl,
          terminalId: plan.terminalId,
          cwd: plan.cwd,
        }),
        status: 'connecting',
      }))

      connectSocket(version, plan, 'fresh')
    },
    [clearReconnectTimer, closeSocket, clusterKubeconfig, connectSocket, onErrorMessage, syncSession, terminalMessages],
  )

  const sendTerminalInput = useCallback(
    (input: string) => {
      const normalizedInput = String(input || '')
      if (!normalizedInput) return

      const socket = socketRef.current
      const current = terminalSessionRef.current
      if (!socket || socket.readyState !== WebSocket.OPEN || !current?.terminalId || current.status !== 'connected') {
        return
      }

      socket.send(JSON.stringify({ type: 'stdin', data: normalizedInput }))
    },
    [],
  )

  const resizeTerminal = useCallback(
    (cols: number, rows: number) => {
      const normalizedCols = Math.floor(cols)
      const normalizedRows = Math.floor(rows)
      if (!Number.isFinite(normalizedCols) || !Number.isFinite(normalizedRows) || normalizedCols <= 0 || normalizedRows <= 0) {
        return
      }
      pendingResizeRef.current = {
        cols: normalizedCols,
        rows: normalizedRows,
      }

      const socket = socketRef.current
      const current = terminalSessionRef.current
      if (!socket || !current?.terminalId || current.status !== 'connected') {
        return
      }

      if (sendTerminalResize(socket, normalizedCols, normalizedRows)) {
        pendingResizeRef.current = null
      }
    },
    [sendTerminalResize],
  )

  const markTerminalConnected = useCallback(() => {
    syncSession((current) =>
      current
        ? {
            ...current,
            status: 'connected',
            error: '',
          }
        : current,
    )
  }, [syncSession])

  const markTerminalError = useCallback((message: string) => {
    const normalizedMessage = String(message || '').trim() || terminalMessages.connectionFailed
    clearReconnectTimer()
    syncSession((current) =>
      current
        ? {
            ...current,
            status: 'error',
            error: normalizedMessage,
          }
        : current,
    )
    onErrorMessage?.(normalizedMessage)
  }, [clearReconnectTimer, onErrorMessage, syncSession, terminalMessages.connectionFailed])

  const closeTerminal = useCallback(() => {
    requestVersionRef.current += 1
    clearReconnectTimer()
    clearConnectTimeout()
    reconnectAttemptsRef.current = 0
    pendingResizeRef.current = null

    reconnectPlanRef.current = {
      resource: null,
      wsUrl: '',
      encodedKubeconfig: '',
      terminalId: '',
      cwd: defaultTerminalCwd,
    }
    outputBacklogRef.current = []
    closeSocket()
    syncSession(() => null)
  }, [clearConnectTimeout, clearReconnectTimer, closeSocket, syncSession])

  useEffect(
    () => () => {
      clearReconnectTimer()
      clearConnectTimeout()
      closeSocket()
    },
    [clearConnectTimeout, clearReconnectTimer, closeSocket],
  )

  return {
    closeTerminal,
    markTerminalConnected,
    markTerminalError,
    openTerminal,
    resizeTerminal,
    sendTerminalInput,
    subscribeTerminalOutput,
    terminalSession,
  }
}
