import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ClusterContext } from '../../../../domains/agents/types'
import { createAgentItemFixture } from '../../../../test/agentFixtures'
import { useAgentTerminal } from './useAgentTerminal'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []
  static nextInitialReadyState = MockWebSocket.OPEN

  binaryType: BinaryType = 'blob'
  readyState = MockWebSocket.OPEN
  sent: unknown[] = []
  url: string
  private listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(url: string) {
    this.url = url
    this.readyState = MockWebSocket.nextInitialReadyState
    MockWebSocket.nextInitialReadyState = MockWebSocket.OPEN
    MockWebSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const listeners = this.listeners.get(type) || new Set<(event: unknown) => void>()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener)
  }

  send(data: unknown) {
    this.sent.push(data)
  }

  close(code = 1000, reason = '') {
    this.readyState = MockWebSocket.CLOSED
    this.emit('close', { code, reason })
  }

  emit(type: string, event: unknown) {
    this.listeners.get(type)?.forEach((listener) => {
      listener(event)
    })
  }
}

const clusterContext: ClusterContext = {
  activeAuthSource: 'kubeconfig',
  activeAuthToken: 'token',
  agentLabel: 'agent',
  authCandidates: [{ source: 'kubeconfig', token: 'token' }],
  kubeconfig: 'apiVersion: v1\nkind: Config\ncurrent-context: test\n',
  namespace: 'ns-test',
  operator: 'operator',
  server: 'https://kubernetes.example.com',
  sessionToken: 'session-token',
  token: 'token',
}

describe('useAgentTerminal dedicated websocket', () => {
  it('opens the dedicated terminal websocket with kubeconfig authorization in the query', async () => {
    const originalWebSocket = globalThis.WebSocket
    MockWebSocket.instances = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    try {
      const { result, unmount } = renderHook(() => useAgentTerminal({ clusterContext }))

      await act(async () => {
        await result.current.openTerminal(createAgentItemFixture({ name: 'demo-agent' }))
      })

      await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
      const socket = MockWebSocket.instances[0]

      expect(socket.url).toContain('/api/v1/agents/demo-agent/terminal/ws')
      expect(socket.url).toContain('authorization=')

      unmount()
    } finally {
      globalThis.WebSocket = originalWebSocket
    }
  })

  it('streams stdout from JSON messages and sends input as JSON', async () => {
    const originalWebSocket = globalThis.WebSocket
    MockWebSocket.instances = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    try {
      const { result, unmount } = renderHook(() => useAgentTerminal({ clusterContext }))
      const output: string[] = []
      result.current.subscribeTerminalOutput((chunk) => output.push(chunk))

      await act(async () => {
        await result.current.openTerminal(createAgentItemFixture({ name: 'demo-agent' }))
      })

      await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))
      const socket = MockWebSocket.instances[0]

      act(() => {
        socket.emit('message', {
          data: JSON.stringify({
            type: 'connected',
            namespace: 'ns-test',
            podName: 'demo-agent-pod',
            container: 'demo-agent',
          }),
        })
      })

      await waitFor(() => expect(result.current.terminalSession?.status).toBe('connected'))

      act(() => {
        socket.emit('message', { data: JSON.stringify({ type: 'stdout', data: 'hello' }) })
      })

      expect(output).toContain('hello')

      act(() => {
        result.current.sendTerminalInput('ls\n')
      })

      expect(socket.sent).toContain(JSON.stringify({ type: 'stdin', data: 'ls\n' }))

      unmount()
    } finally {
      globalThis.WebSocket = originalWebSocket
    }
  })

  it('does not reopen the same terminal while the websocket handshake is still connecting', async () => {
    const originalWebSocket = globalThis.WebSocket
    MockWebSocket.instances = []
    MockWebSocket.nextInitialReadyState = MockWebSocket.CONNECTING
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    try {
      const { result, unmount } = renderHook(() => useAgentTerminal({ clusterContext }))
      const agent = createAgentItemFixture({ name: 'demo-agent' })

      await act(async () => {
        await result.current.openTerminal(agent)
      })

      await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

      await act(async () => {
        await result.current.openTerminal(agent)
      })

      expect(MockWebSocket.instances).toHaveLength(1)

      unmount()
    } finally {
      globalThis.WebSocket = originalWebSocket
    }
  })
})
