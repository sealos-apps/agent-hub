import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentConsoleWindowPage } from './AgentConsoleWindowPage'
import {
  applyAutoExpandChain,
  buildExplorerPathChain,
  isTrustedDesktopMessageOrigin,
} from './lib/consoleExplorerHelpers'
import { createInitialConsoleTabs, initialConsoleTabId } from './lib/consoleTabs'

vi.mock('../../../api', () => ({
  createClusterContext: vi.fn(() => null),
  getAgentConsole: vi.fn(),
  getClusterInfo: vi.fn(),
  listAgentTemplates: vi.fn(),
}))

vi.mock('../../../sealosSdk', () => ({
  addSealosAppEventListener: vi.fn(() => () => {}),
  getSealosSession: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('../../../components/business/terminal/AgentTerminalWorkspace', () => ({
  AgentTerminalWorkspace: () => <div>mock terminal workspace</div>,
}))

describe('AgentConsoleWindowPage helpers', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 768 })
    window.history.replaceState({}, '', '/desktop/console?agentName=go6becn4')
  })

  it('builds path chain from working directory', () => {
    expect(buildExplorerPathChain('/opt/data/workspace')).toEqual([
      '/',
      '/opt',
      '/opt/data',
      '/opt/data/workspace',
    ])
    expect(buildExplorerPathChain('/')).toEqual(['/'])
  })

  it('respects manual collapsed paths when auto expanding', () => {
    const current = {
      '/': true,
      '/opt': false,
    }
    const chain = ['/', '/opt', '/opt/data', '/opt/data/workspace']
    const collapsed = new Set<string>(['/opt'])

    const next = applyAutoExpandChain(current, chain, collapsed)

    expect(next['/']).toBe(true)
    expect(next['/opt']).toBe(false)
    expect(next['/opt/data']).toBe(true)
    expect(next['/opt/data/workspace']).toBe(true)
  })

  it('accepts same-origin and localhost desktop message origin', () => {
    expect(isTrustedDesktopMessageOrigin('https://usw-1.sealos.io', 'https://usw-1.sealos.io')).toBe(true)
    expect(isTrustedDesktopMessageOrigin('http://localhost:3000', 'https://usw-1.sealos.io')).toBe(true)
    expect(isTrustedDesktopMessageOrigin('https://example.com', 'https://usw-1.sealos.io')).toBe(false)
  })

  it('creates a fresh home-only tab list for agent switches', () => {
    const first = createInitialConsoleTabs()
    const second = createInitialConsoleTabs()

    first.push({ id: 'file-1', type: 'home', title: 'mutated' })

    expect(second).toEqual([
      { id: initialConsoleTabId, type: 'home', title: 'Console Home' },
    ])
  })

  it('shows only the explorer first on mobile and switches to workspace after adding a terminal', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 393 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 852 })

    render(
      <BrowserRouter>
        <AgentConsoleWindowPage />
      </BrowserRouter>,
    )

    const explorerPane = await screen.findByTestId('console-explorer-pane')
    const workspacePane = await screen.findByTestId('console-workspace-pane')

    await waitFor(() => expect(explorerPane).toHaveClass('flex'))
    expect(workspacePane).toHaveClass('hidden')
    await waitFor(() => expect(document.title).toContain('go6becn4'))
    expect(screen.getByText('未获取到真实集群上下文，无法加载 Agent 控制台。')).toBeInTheDocument()

    fireEvent.click(within(explorerPane).getByRole('button', { name: '添加终端' }))

    await waitFor(() => {
      expect(explorerPane).toHaveClass('hidden')
      expect(workspacePane).toHaveClass('flex')
    })
    expect(screen.getByText('mock terminal workspace')).toBeInTheDocument()
    expect(screen.queryByText('Agent console mock terminal is ready.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '返回资源管理器' }))

    await waitFor(() => {
      expect(explorerPane).toHaveClass('flex')
      expect(workspacePane).toHaveClass('hidden')
    })

    fireEvent.click(within(explorerPane).getByRole('button', { name: '返回编辑区域' }))

    await waitFor(() => {
      expect(explorerPane).toHaveClass('hidden')
      expect(workspacePane).toHaveClass('flex')
    })
  })

  it('expands the scaled desktop canvas to the available viewport height', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 960 })

    render(
      <BrowserRouter>
        <AgentConsoleWindowPage />
      </BrowserRouter>,
    )

    const scaleFrame = await screen.findByTestId('console-scale-frame')

    expect(parseFloat(scaleFrame.style.height)).toBeGreaterThanOrEqual(900)
  })
})
