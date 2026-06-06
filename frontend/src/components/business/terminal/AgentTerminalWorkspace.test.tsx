import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentTerminalWorkspace } from './AgentTerminalWorkspace'
import type { TerminalSessionState } from '../../../domains/agents/types'
import { createAgentItemFixture } from '../../../test/agentFixtures'

const xtermMock = vi.hoisted(() => {
  const instances: Array<{
    buffer: { active: { getLine: ReturnType<typeof vi.fn> } }
    clear: ReturnType<typeof vi.fn>
    cols: number
    dispose: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    loadAddon: ReturnType<typeof vi.fn>
    onData: ReturnType<typeof vi.fn>
    onDataHandler?: (data: string) => void
    open: ReturnType<typeof vi.fn>
    registerLinkProvider: ReturnType<typeof vi.fn>
    rows: number
    write: ReturnType<typeof vi.fn>
    writeln: ReturnType<typeof vi.fn>
  }> = []

  class Terminal {
    buffer = { active: { getLine: vi.fn() } }
    clear = vi.fn()
    cols = 80
    dispose = vi.fn()
    focus = vi.fn()
    loadAddon = vi.fn()
    onDataHandler?: (data: string) => void
    onData = vi.fn((handler: (data: string) => void) => {
      this.onDataHandler = handler
      return { dispose: vi.fn() }
    })
    open = vi.fn()
    registerLinkProvider = vi.fn(() => ({ dispose: vi.fn() }))
    rows = 24
    write = vi.fn((_text: string, callback?: () => void) => callback?.())
    writeln = vi.fn()

    constructor() {
      instances.push(this)
    }
  }

  return { instances, Terminal }
})

vi.mock('@xterm/xterm', () => ({
  Terminal: xtermMock.Terminal,
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    dispose = vi.fn()
    fit = vi.fn()
  },
}))

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    dispose = vi.fn()
    onContextLoss = vi.fn(() => ({ dispose: vi.fn() }))
  },
}))

const createConnectedSession = (): TerminalSessionState => ({
  resource: createAgentItemFixture(),
  status: 'connected',
  error: '',
  podName: 'pod-test',
  containerName: 'main',
  namespace: 'ns-test',
  wsUrl: 'ws://example.test',
  terminalId: 'terminal-1',
  cwd: '/opt/hermes',
})

describe('AgentTerminalWorkspace visibility lifecycle', () => {
  beforeEach(() => {
    xtermMock.instances.length = 0
    vi.restoreAllMocks()

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    globalThis.ResizeObserver = class {
      disconnect = vi.fn()
      observe = vi.fn()
      unobserve = vi.fn()
    }
  })

  it('acknowledges a connected hidden terminal without focusing it until visible', async () => {
    const onReady = vi.fn()
    const session = createConnectedSession()

    const { rerender } = render(
      <AgentTerminalWorkspace
        isVisible={false}
        onReady={onReady}
        session={session}
      />,
    )

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1))
    expect(xtermMock.instances[0]?.focus).not.toHaveBeenCalled()

    rerender(
      <AgentTerminalWorkspace
        isVisible
        onReady={onReady}
        session={session}
      />,
    )

    await waitFor(() => expect(xtermMock.instances[0]?.focus).toHaveBeenCalledTimes(1))
    expect(onReady).toHaveBeenCalledTimes(1)
  })

  it('does not forward xterm color report responses as terminal input', async () => {
    const onInput = vi.fn()
    const session = createConnectedSession()

    render(
      <AgentTerminalWorkspace
        onInput={onInput}
        session={session}
      />,
    )

    await waitFor(() => expect(xtermMock.instances[0]?.onDataHandler).toBeTypeOf('function'))

    xtermMock.instances[0]?.onDataHandler?.('\x1b]11;rgb:0505/0707/0a0a\x1b\\')
    xtermMock.instances[0]?.onDataHandler?.('hermes\r')

    expect(onInput).toHaveBeenCalledTimes(1)
    expect(onInput).toHaveBeenCalledWith('hermes\r')
  })

  it('coalesces terminal output chunks in order', async () => {
    const listeners = new Set<(chunk: string) => void>()
    const session = createConnectedSession()

    render(
      <AgentTerminalWorkspace
        onAttachOutput={(listener) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        }}
        session={session}
      />,
    )

    await waitFor(() => expect(xtermMock.instances[0]).toBeTruthy())

    act(() => {
      listeners.forEach((listener) => listener('a'))
      listeners.forEach((listener) => listener('b'))
      listeners.forEach((listener) => listener('c'))
    })
    await waitFor(() => expect(xtermMock.instances[0]?.write).toHaveBeenCalled())

    expect(xtermMock.instances[0]?.write).toHaveBeenCalledWith('abc', expect.any(Function))
  })
})
