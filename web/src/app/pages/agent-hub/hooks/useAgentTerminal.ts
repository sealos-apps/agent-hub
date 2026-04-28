import { useCallback, useEffect, useRef, useState } from 'react'
import { buildAgentWebSocketUrl } from '../../../../api'
import type {
  AgentListItem,
  ClusterContext,
  TerminalSessionState,
} from '../../../../domains/agents/types'
import { decodeWSBinaryMessage, encodeWSBinaryMessage } from '../lib/wsBinaryProtocol'

type TerminalOutputListener = (chunk: string) => void

const fallbackTerminalCwd = '/opt/hermes'
const maxBufferedOutputChunks = 200
const reconnectDelaySchedule = [600, 1200, 2400, 5000]
const maxReconnectAttempts = 6
const droppedOutputNotice = '\r\n\x1b[33m[服务端高压保护：已跳过部分历史输出以保持交互]\x1b[0m\r\n'

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
  cwd: payload?.cwd || resource.template.defaultWorkingDirectory || fallbackTerminalCwd,
})

type ReconnectPlan = {
  resource: AgentListItem | null
  wsUrl: string
  encodedKubeconfig: string
  terminalId: string
  cwd: string
}

interface UseAgentTerminalOptions {
  clusterContext: ClusterContext | null
  onErrorMessage?: (message: string) => void
}

export function useAgentTerminal({ clusterContext, onErrorMessage }: UseAgentTerminalOptions) {
  const [terminalSession, setTerminalSession] = useState<TerminalSessionState | null>(null)

  const socketRef = useRef<WebSocket | null>(null)
  const terminalSessionRef = useRef<TerminalSessionState | null>(null)
  const requestVersionRef = useRef(0)
  const requestSeqRef = useRef(0)
  const authSentRef = useRef(false)
  const terminalOpenSentRef = useRef(false)
  const closingSocketsRef = useRef(new WeakSet<WebSocket>())
  const outputListenersRef = useRef(new Set<TerminalOutputListener>())
  const outputBacklogRef = useRef<string[]>([])
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimerRef = useRef<number | null>(null)
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const connectSocketRef = useRef<(version: number, plan: ReconnectPlan, mode: 'fresh' | 'reconnect') => void>(() => {})
  const reconnectPlanRef = useRef<ReconnectPlan>({
    resource: null,
    wsUrl: '',
    encodedKubeconfig: '',
    terminalId: '',
    cwd: fallbackTerminalCwd,
  })
  const clusterKubeconfig = clusterContext?.kubeconfig || ''

  const syncSession = useCallback((updater: (current: TerminalSessionState | null) => TerminalSessionState | null) => {
    setTerminalSession((current) => {
      const next = updater(current)
      terminalSessionRef.current = next
      return next
    })
  }, [])

  const nextRequestId = useCallback((prefix = 'terminal') => {
    requestSeqRef.current += 1
    return `${prefix}-${Date.now()}-${requestSeqRef.current}`
  }, [])

  const sendTerminalResize = useCallback((
    socket: WebSocket,
    terminalId: string,
    cols: number,
    rows: number,
  ) => {
    if (socket.readyState !== WebSocket.OPEN || !terminalId) {
      return false
    }
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols <= 0 || rows <= 0) {
      return false
    }

    socket.send(
      encodeWSBinaryMessage({
        type: 'terminal.resize',
        requestId: nextRequestId('terminal.resize'),
        data: {
          id: terminalId,
          cols: Math.floor(cols),
          rows: Math.floor(rows),
        },
      }),
    )
    return true
  }, [nextRequestId])

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

  const closeSocket = useCallback(() => {
    const socket = socketRef.current
    socketRef.current = null
    authSentRef.current = false
    terminalOpenSentRef.current = false

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
    socket.binaryType = 'arraybuffer'
    socketRef.current = socket
    authSentRef.current = false
    terminalOpenSentRef.current = false

    const sendAuth = () => {
      if (version !== requestVersionRef.current) return
      if (socket.readyState !== WebSocket.OPEN || authSentRef.current) return

      authSentRef.current = true
      socket.send(
        encodeWSBinaryMessage({
          type: 'auth',
          requestId: nextRequestId('terminal.auth'),
          data: {
            authorization: plan.encodedKubeconfig,
          },
        }),
      )
    }

    const sendTerminalOpen = () => {
      if (version !== requestVersionRef.current) return
      if (socket.readyState !== WebSocket.OPEN || terminalOpenSentRef.current) return

      terminalOpenSentRef.current = true
      socket.send(
        encodeWSBinaryMessage({
          type: 'terminal.open',
          requestId: nextRequestId('terminal.open'),
          data: {
            id: plan.terminalId,
            cwd: plan.cwd,
          },
        }),
      )
    }

    socket.addEventListener('message', (event) => {
      if (version !== requestVersionRef.current) return

      if (!(event.data instanceof ArrayBuffer)) return

      let messagePayload: ReturnType<typeof decodeWSBinaryMessage> | null = null
      try {
        messagePayload = decodeWSBinaryMessage(event.data)
      } catch {
        return
      }

      const data = messagePayload?.data || {}
      const messageType = String(messagePayload?.type || '')
      const messageTerminalID = String(data.id || '')

      switch (messageType) {
        case 'auth.required':
          sendAuth()
          return
        case 'system.ready':
          syncSession((current) =>
            current
              ? {
                  ...current,
                  status: mode === 'reconnect' ? 'reconnecting' : 'connecting',
                  error: '',
                  podName: String(data.podName || current.podName || ''),
                  containerName: String(data.container || current.containerName || ''),
                  namespace: String(data.namespace || current.namespace || plan.resource?.namespace || ''),
                }
              : current,
          )
          sendTerminalOpen()
          return
        case 'terminal.opened':
          if (messageTerminalID !== plan.terminalId) return
          reconnectAttemptsRef.current = 0
          clearReconnectTimer()
          syncSession((current) =>
            current
              ? {
                  ...current,
                  status: 'connected',
                  error: '',
                  cwd: String(data.cwd || current.cwd || plan.cwd),
                  terminalId: messageTerminalID || current.terminalId,
                }
              : current,
          )
          if (pendingResizeRef.current) {
            const { cols, rows } = pendingResizeRef.current
            if (sendTerminalResize(socket, messageTerminalID, cols, rows)) {
              pendingResizeRef.current = null
            }
          }
          if (mode === 'reconnect') {
            emitOutput('\r\n\x1b[90mConnection restored.\x1b[0m\r\n')
          }
          return
        case 'terminal.output':
          if (messageTerminalID !== plan.terminalId) return
          if (data.dropped) {
            emitOutput(droppedOutputNotice)
          }
          emitOutput(String(data.output || ''))
          return
        case 'terminal.closed':
          if (messageTerminalID !== plan.terminalId) return
          syncSession((current) =>
            current
              ? {
                  ...current,
                  status: current.error ? 'error' : 'disconnected',
                }
              : current,
          )
          return
        case 'error': {
          const code = String(data.code || '')
          if (code === 'already_authenticated') {
            return
          }

          const message = String(data.message || '终端连接失败')
          syncSession((current) =>
            current
              ? {
                  ...current,
                  status: 'error',
                  error: message,
                }
              : current,
          )

          if (messageTerminalID === plan.terminalId || !messageTerminalID) {
            emitOutput(`\r\n\x1b[31m${message}\x1b[0m\r\n`)
          }
          onErrorMessage?.(message)
          return
        }
        default:
          return
      }
    })

    socket.addEventListener('error', () => {
      if (version !== requestVersionRef.current) return

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
        socketRef.current = null
        authSentRef.current = false
        terminalOpenSentRef.current = false
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
        const message = '终端连接多次重试失败，请手动重新连接。'
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
        `\r\n\x1b[90mConnection lost${event.code ? ` (code=${event.code})` : ''}, reconnecting in ${Math.max(1, Math.round(delay / 1000))}s...\x1b[0m\r\n`,
      )

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null
        connectSocketRef.current(version, reconnectPlanRef.current, 'reconnect')
      }, delay)
    })
  }, [clearReconnectTimer, closeSocket, emitOutput, nextRequestId, onErrorMessage, sendTerminalResize, syncSession])

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
        socket.readyState === WebSocket.OPEN
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
        const message = '当前工作区还没准备好，暂时无法连接终端。'
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
        wsUrl: buildAgentWebSocketUrl(resource.name),
        encodedKubeconfig: encodeURIComponent(clusterKubeconfig),
        terminalId: nextRequestId('terminal.session'),
        cwd: resource.template.defaultWorkingDirectory || fallbackTerminalCwd,
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
    [clearReconnectTimer, closeSocket, clusterKubeconfig, connectSocket, nextRequestId, onErrorMessage, syncSession],
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

      socket.send(
        encodeWSBinaryMessage({
          type: 'terminal.input',
          requestId: nextRequestId('terminal.input'),
          data: {
            id: current.terminalId,
            input: normalizedInput,
          },
        }),
      )
    },
    [nextRequestId],
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

      if (sendTerminalResize(socket, current.terminalId, normalizedCols, normalizedRows)) {
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
    const normalizedMessage = String(message || '').trim() || '终端连接失败'
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
  }, [clearReconnectTimer, onErrorMessage, syncSession])

  const closeTerminal = useCallback(() => {
    requestVersionRef.current += 1
    clearReconnectTimer()
    reconnectAttemptsRef.current = 0
    pendingResizeRef.current = null

    const socket = socketRef.current
    const current = terminalSessionRef.current
    if (socket && socket.readyState === WebSocket.OPEN && current?.terminalId) {
      socket.send(
        encodeWSBinaryMessage({
          type: 'terminal.close',
          requestId: nextRequestId('terminal.close'),
          data: {
            id: current.terminalId,
          },
        }),
      )
    }

    reconnectPlanRef.current = {
      resource: null,
      wsUrl: '',
      encodedKubeconfig: '',
      terminalId: '',
      cwd: fallbackTerminalCwd,
    }
    outputBacklogRef.current = []
    closeSocket()
    syncSession(() => null)
  }, [clearReconnectTimer, closeSocket, nextRequestId, syncSession])

  useEffect(
    () => () => {
      clearReconnectTimer()
      closeSocket()
    },
    [clearReconnectTimer, closeSocket],
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
