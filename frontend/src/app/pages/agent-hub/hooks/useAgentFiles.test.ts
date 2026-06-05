import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { createAgentItemFixture } from '../../../../test/agentFixtures'
import type { ClusterContext } from '../../../../domains/agents/types'
import { decodeWSBinaryMessage, encodeWSBinaryMessage } from '../lib/wsBinaryProtocol'
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

  it('rejects traversal upload relative paths', () => {
    expect(__agentFilesTestables.sanitizeUploadRelativePath('assets/image.png', 'image.png')).toBe('assets/image.png')
    expect(__agentFilesTestables.sanitizeUploadRelativePath('../secret.txt', 'secret.txt')).toBe('')
    expect(__agentFilesTestables.sanitizeUploadRelativePath('/tmp/secret.txt', 'secret.txt')).toBe('')
  })

  it('preserves valid upload names with leading or trailing spaces', () => {
    expect(__agentFilesTestables.sanitizeUploadRelativePath('assets/  image.png ', 'image.png')).toBe('assets/  image.png ')
    expect(__agentFilesTestables.sanitizeUploadRelativePath(' folder /note.txt', 'note.txt')).toBe(' folder /note.txt')
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

  it('records empty directory listings as loaded paths', async () => {
    const originalWebSocket = globalThis.WebSocket
    MockWebSocket.instances = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    try {
      const agent = createAgentItemFixture()
      const { result, unmount } = renderHook(() => useAgentFiles({ clusterContext }))

      act(() => {
        result.current.openFiles(agent)
      })
      await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

      const socket = MockWebSocket.instances[0]
      act(() => {
        emitSystemReady(socket, agent.name)
      })

      await waitFor(() => {
        expect(
          socket.sent.some((payload) => {
            if (!(payload instanceof ArrayBuffer)) return false
            return decodeWSBinaryMessage(payload).type === 'file.list'
          }),
        ).toBe(true)
      })

      const listRequest = socket.sent
        .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
        .map((payload) => decodeWSBinaryMessage(payload))
        .find((message) => message.type === 'file.list')

      expect(listRequest?.requestId).toBeTruthy()

      act(() => {
        socket.emit('message', {
          data: encodeWSBinaryMessage({
            type: 'file.result',
            requestId: listRequest?.requestId || '',
            data: {
              path: agent.workingDir,
              items: [],
            },
          }),
        })
      })

      await waitFor(() => {
        expect(result.current.filesSession?.loadedPath).toBe(agent.workingDir)
        expect(result.current.filesSession?.items).toEqual([])
      })

      unmount()
    } finally {
      globalThis.WebSocket = originalWebSocket
    }
  })

  it('returns to connected state when rename succeeds but refresh fails', async () => {
    const originalWebSocket = globalThis.WebSocket
    MockWebSocket.instances = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    try {
      const agent = createAgentItemFixture()
      const { result, unmount } = renderHook(() => useAgentFiles({ clusterContext }))

      act(() => {
        result.current.openFiles(agent)
      })
      await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

      const socket = MockWebSocket.instances[0]
      act(() => {
        emitSystemReady(socket, agent.name)
      })

      await waitFor(() => {
        expect(result.current.filesSession?.status).toBe('working')
      })

      const initialListRequest = socket.sent
        .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
        .map((payload) => decodeWSBinaryMessage(payload))
        .find((message) => message.type === 'file.list')

      act(() => {
        socket.emit('message', {
          data: encodeWSBinaryMessage({
            type: 'file.result',
            requestId: initialListRequest?.requestId || '',
            data: {
              path: agent.workingDir,
              items: [{ name: 'old.txt', path: `${agent.workingDir}/old.txt`, type: 'file', size: 1 }],
            },
          }),
        })
      })

      await waitFor(() => {
        expect(result.current.filesSession?.status).toBe('connected')
      })

      let renamed = false
      await act(async () => {
        const renamePromise = result.current.renameEntry(`${agent.workingDir}/old.txt`, `${agent.workingDir}/new.txt`)
        await waitFor(() => {
          expect(
            socket.sent
              .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
              .map((payload) => decodeWSBinaryMessage(payload))
              .some((message) => message.type === 'file.rename'),
          ).toBe(true)
        })
        const renameRequest = socket.sent
          .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
          .map((payload) => decodeWSBinaryMessage(payload))
          .find((message) => message.type === 'file.rename')

        socket.emit('message', {
          data: encodeWSBinaryMessage({
            type: 'file.result',
            requestId: renameRequest?.requestId || '',
            data: {
              op: 'rename',
              renamed: true,
            },
          }),
        })

        renamed = await renamePromise
      })

      expect(renamed).toBe(true)
      const refreshRequest = socket.sent
        .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
        .map((payload) => decodeWSBinaryMessage(payload))
        .filter((message) => message.type === 'file.list')
        .at(-1)

      act(() => {
        socket.emit('message', {
          data: encodeWSBinaryMessage({
            type: 'error',
            requestId: refreshRequest?.requestId || '',
            data: {
              message: 'refresh failed',
            },
          }),
        })
      })

      await waitFor(() => {
        expect(result.current.filesSession?.status).toBe('connected')
      })
      expect(result.current.filesSession?.error).toBe('')

      unmount()
    } finally {
      globalThis.WebSocket = originalWebSocket
    }
  })

  it('keeps visible directory navigation active during silent rename refresh', async () => {
    const originalWebSocket = globalThis.WebSocket
    MockWebSocket.instances = []
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket

    try {
      const agent = createAgentItemFixture()
      const { result, unmount } = renderHook(() => useAgentFiles({ clusterContext }))

      act(() => {
        result.current.openFiles(agent)
      })
      await waitFor(() => expect(MockWebSocket.instances).toHaveLength(1))

      const socket = MockWebSocket.instances[0]
      act(() => {
        emitSystemReady(socket, agent.name)
      })

      const initialListRequest = socket.sent
        .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
        .map((payload) => decodeWSBinaryMessage(payload))
        .find((message) => message.type === 'file.list')

      act(() => {
        socket.emit('message', {
          data: encodeWSBinaryMessage({
            type: 'file.result',
            requestId: initialListRequest?.requestId || '',
            data: {
              path: agent.workingDir,
              items: [{ name: 'old.txt', path: `${agent.workingDir}/old.txt`, type: 'file', size: 1 }],
            },
          }),
        })
      })

      await waitFor(() => {
        expect(result.current.filesSession?.currentPath).toBe(agent.workingDir)
      })

      let renamed = false
      await act(async () => {
        const renamePromise = result.current.renameEntry(`${agent.workingDir}/old.txt`, `${agent.workingDir}/new.txt`)
        await waitFor(() => {
          expect(
            socket.sent
              .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
              .map((payload) => decodeWSBinaryMessage(payload))
              .some((message) => message.type === 'file.rename'),
          ).toBe(true)
        })
        const renameRequest = socket.sent
          .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
          .map((payload) => decodeWSBinaryMessage(payload))
          .find((message) => message.type === 'file.rename')

        socket.emit('message', {
          data: encodeWSBinaryMessage({
            type: 'file.result',
            requestId: renameRequest?.requestId || '',
            data: {
              op: 'rename',
              renamed: true,
            },
          }),
        })

        renamed = await renamePromise
      })
      expect(renamed).toBe(true)
      const silentRefreshRequest = socket.sent
        .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
        .map((payload) => decodeWSBinaryMessage(payload))
        .filter((message) => message.type === 'file.list')
        .at(-1)

      act(() => {
        void result.current.jumpToPath('/workspace/docs')
      })

      await waitFor(() => {
        expect(
          socket.sent
            .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
            .map((payload) => decodeWSBinaryMessage(payload))
              .some((message) => message.type === 'file.list' && String(message.data?.path || '') === '/workspace/docs'),
        ).toBe(true)
      })

      const visibleListRequest = socket.sent
        .filter((payload): payload is ArrayBuffer => payload instanceof ArrayBuffer)
        .map((payload) => decodeWSBinaryMessage(payload))
        .find((message) => message.type === 'file.list' && String(message.data?.path || '') === '/workspace/docs')

      act(() => {
        socket.emit('message', {
          data: encodeWSBinaryMessage({
            type: 'file.result',
            requestId: visibleListRequest?.requestId || '',
            data: {
              path: '/workspace/docs',
              items: [],
            },
          }),
        })
      })

      await waitFor(() => {
        expect(result.current.filesSession?.currentPath).toBe('/workspace/docs')
        expect(result.current.filesSession?.browsing).toBe(false)
      })

      act(() => {
        socket.emit('message', {
          data: encodeWSBinaryMessage({
            type: 'file.result',
            requestId: silentRefreshRequest?.requestId || '',
            data: {
              path: agent.workingDir,
              items: [{ name: 'new.txt', path: `${agent.workingDir}/new.txt`, type: 'file', size: 1 }],
            },
          }),
        })
      })

      expect(result.current.filesSession?.currentPath).toBe('/workspace/docs')

      unmount()
    } finally {
      globalThis.WebSocket = originalWebSocket
    }
  })
})
