import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createAgentItemFixture } from '../../../../test/agentFixtures'
import type { ClusterContext } from '../../../../domains/agents/types'
import { encodeWSBinaryMessage } from '../lib/wsBinaryProtocol'
import { __agentFilesTestables, useAgentFiles } from './useAgentFiles'

class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  binaryType: BinaryType = 'blob'
  readyState = MockWebSocket.OPEN
  sent: unknown[] = []
  url: string
  private listeners = new Map<string, Set<(event: unknown) => void>>()

  constructor(url: string) {
    this.url = url
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
  server: 'https://kubernetes.example.com',
  namespace: 'ns-test',
  token: 'token',
  sessionToken: 'session-token',
  authCandidates: [],
  activeAuthToken: 'token',
  activeAuthSource: 'fixture',
  operator: 'operator',
  agentLabel: 'agent',
  kubeconfig: 'apiVersion: v1\nkind: Config\ncurrent-context: test\n',
}

const emitSystemReady = (socket: MockWebSocket, agentName = 'agent') => {
  socket.emit('message', {
    data: encodeWSBinaryMessage({
      type: 'system.ready',
      requestId: 'ready',
      data: {
        agentName,
        namespace: 'ns-test',
        podName: `${agentName}-pod`,
        container: 'agent',
      },
    }),
  })
}

describe('useAgentFiles helpers', () => {
  it('creates ready gate that resolves only once', async () => {
    const gate = __agentFilesTestables.createReadyGate()

    gate.resolve()
    gate.reject(new Error('ignored after resolve'))

    await expect(gate.promise).resolves.toBeUndefined()
    expect(gate.settled).toBe(true)
  })

  it('creates ready gate that rejects when unresolved', async () => {
    const gate = __agentFilesTestables.createReadyGate()
    const expected = new Error('connection failed')

    gate.reject(expected)
    gate.resolve()

    await expect(gate.promise).rejects.toThrow('connection failed')
    expect(gate.settled).toBe(true)
  })

  it('exposes reconnect policy for retry backoff', () => {
    expect(__agentFilesTestables.reconnectDelaySchedule.length).toBeGreaterThan(0)
    expect(__agentFilesTestables.maxReconnectAttempts).toBeGreaterThanOrEqual(
      __agentFilesTestables.reconnectDelaySchedule.length,
    )
  })

  it('ignores close events from stale sockets after switching agents', async () => {
    const originalWebSocket = globalThis.WebSocket
    MockWebSocket.instances = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    try {
      const firstAgent = createAgentItemFixture({ name: 'agent-a' })
      const secondAgent = createAgentItemFixture({ name: 'agent-b' })
      const { result, unmount } = renderHook(() => useAgentFiles({ clusterContext }))

      act(() => {
        result.current.openFiles(firstAgent)
      })
      await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

      const firstSocket = MockWebSocket.instances[0]
      act(() => {
        emitSystemReady(firstSocket, firstAgent.name)
      })
      await waitFor(() => expect(result.current.filesSession?.resource.name).toBe('agent-a'))

      act(() => {
        result.current.openFiles(secondAgent)
      })
      await waitFor(() => expect(MockWebSocket.instances).toHaveLength(2))

      const secondSocket = MockWebSocket.instances[1]
      act(() => {
        emitSystemReady(secondSocket, secondAgent.name)
      })
      await waitFor(() => expect(result.current.filesSession?.resource.name).toBe('agent-b'))

      act(() => {
        firstSocket.emit('close', { code: 1006, reason: 'stale-close' })
      })

      expect(result.current.filesSession?.resource.name).toBe('agent-b')
      expect(result.current.filesSession?.status).not.toBe('disconnected')
      expect(result.current.filesSession?.error).not.toContain('1006')

      unmount()
    } finally {
      globalThis.WebSocket = originalWebSocket
    }
  })
})
