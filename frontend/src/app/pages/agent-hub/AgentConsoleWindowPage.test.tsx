import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentConsoleWindowPage } from './AgentConsoleWindowPage'
import {
  createAgentPreview,
  createClusterContext,
  getAgentConsole,
  getClusterInfo,
  listAgentTemplates,
} from '../../../api'
import type { ClusterContext } from '../../../domains/agents/types'
import { I18nProvider } from '../../../i18n'
import {
  applyAutoExpandChain,
  buildExplorerPathChain,
  isTrustedDesktopMessageOrigin,
} from './lib/consoleExplorerHelpers'
import { createInitialConsoleTabs, initialConsoleTabId } from './lib/consoleTabs'

vi.mock('../../../api', () => ({
  buildAgentWebSocketUrl: vi.fn(() => 'ws://localhost:8888/api/v1/agents/ympp868f/ws'),
  createClusterContext: vi.fn(() => null),
  createAgentPreview: vi.fn(),
  deleteAgentPreview: vi.fn(),
  getAgentConsole: vi.fn(),
  getClusterInfo: vi.fn(),
  heartbeatAgentPreview: vi.fn(),
  listAgentTemplates: vi.fn(),
}))

vi.mock('../../../sealosSdk', () => ({
  addSealosAppEventListener: vi.fn(() => () => {}),
  getSealosLanguage: vi.fn(() => Promise.resolve('zh-CN')),
  getSealosSession: vi.fn(() => Promise.resolve(null)),
}))

vi.mock('../../../components/business/terminal/AgentTerminalWorkspace', () => ({
  AgentTerminalWorkspace: ({ onOpenPreviewPort }: { onOpenPreviewPort?: (port: number) => void }) => (
    <div>
      <span>mock terminal workspace</span>
      <button type="button" onClick={() => onOpenPreviewPort?.(3000)}>
        open preview 3000
      </button>
    </div>
  ),
}))

const mockCloseFiles = vi.fn()
const mockOpenFiles = vi.fn()
const mockReadDirectory = vi.fn(async () => ({ path: '/workspace', items: [] }))
const mockReadFile = vi.fn()
const mockSearchFiles = vi.fn(async () => ({ items: [] }))
const mockSaveFile = vi.fn()

vi.mock('./hooks/useAgentFiles', () => ({
  useAgentFiles: () => ({
    closeFiles: mockCloseFiles,
    filesSession: null,
    openFiles: mockOpenFiles,
    readDirectory: mockReadDirectory,
    readFile: mockReadFile,
    searchFiles: mockSearchFiles,
    saveFile: mockSaveFile,
  }),
}))

const clusterContext: ClusterContext = {
  activeAuthSource: 'kubeconfig',
  activeAuthToken: 'apiVersion: v1',
  agentLabel: 'agent-hub',
  authCandidates: [{ source: 'kubeconfig', token: 'apiVersion: v1' }],
  kubeconfig: 'apiVersion: v1',
  namespace: 'ns-test',
  operator: 'night',
  server: 'https://k8s.example.com',
  sessionToken: '',
  token: '',
}

const template = {
  id: 'hermes-agent',
  name: 'Hermes Agent',
  shortName: 'Hermes',
  description: '',
  image: 'hermes:latest',
  port: 8642,
  defaultArgs: [],
  workingDir: '/workspace',
  user: 'root',
  backendSupported: true,
  presentation: {
    logoKey: 'hermes-agent',
    brandColor: '#111827',
    docsLabel: 'Docs',
  },
  workspaces: [],
  access: [],
  actions: [],
  settings: { runtime: [], agent: [] },
  modelOptions: [],
}

const agentContract = {
  core: {
    name: 'ympp868f',
    aliasName: 'Hermes Agent',
    templateId: 'hermes-agent',
    namespace: 'ns-test',
    status: 'Running',
    statusText: 'Running',
    ready: true,
    createdAt: '2026-05-22T00:00:00Z',
  },
  workspaces: [],
  access: [
    {
      key: 'terminal',
      label: 'Terminal',
      enabled: true,
    },
  ],
  runtime: {
    cpu: '1000m',
    memory: '2048Mi',
    storage: '10Gi',
    workingDir: '/workspace',
    hasModelAPIKey: false,
  },
  settings: { runtime: [], agent: [] },
  actions: [
    {
      key: 'open-terminal',
      label: 'Terminal',
      enabled: true,
    },
  ],
}

class MockWebSocket extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  binaryType = 'arraybuffer'
  readyState = MockWebSocket.OPEN
  url: string

  constructor(url: string) {
    super()
    this.url = url
  }

  send() {}

  close() {
    this.readyState = MockWebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }
}

function renderConsoleWindowPage() {
  return render(
    <I18nProvider>
      <BrowserRouter>
        <AgentConsoleWindowPage />
      </BrowserRouter>
    </I18nProvider>,
  )
}

describe('AgentConsoleWindowPage helpers', () => {
  beforeEach(() => {
    vi.mocked(createClusterContext).mockImplementation(() => {
      throw new Error('missing test cluster context')
    })
    vi.mocked(createAgentPreview).mockReset()
    vi.mocked(getAgentConsole).mockReset()
    vi.mocked(getClusterInfo).mockReset()
    vi.mocked(listAgentTemplates).mockReset()
    mockCloseFiles.mockClear()
    mockOpenFiles.mockClear()
    mockReadDirectory.mockClear()
    mockReadFile.mockClear()
    mockSearchFiles.mockClear()
    mockSaveFile.mockClear()
    Object.defineProperty(window, 'WebSocket', { configurable: true, writable: true, value: MockWebSocket })
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 768 })
    window.history.replaceState({}, '', '/console?agentName=go6becn4')
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

    renderConsoleWindowPage()

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

    renderConsoleWindowPage()

    const scaleFrame = await screen.findByTestId('console-scale-frame')

    expect(parseFloat(scaleFrame.style.height)).toBeGreaterThanOrEqual(900)
  })

  it('reuses an existing preview tab for the same agent port', async () => {
    window.history.replaceState({}, '', '/console?agentName=ympp868f')
    vi.mocked(createClusterContext).mockReturnValue(clusterContext)
    vi.mocked(getClusterInfo).mockResolvedValue({
      cluster: 'sealos',
      namespace: 'ns-test',
      kc: 'apiVersion: v1',
      server: 'https://k8s.example.com',
      operator: 'night',
      updatedAt: '2026-05-22T00:00:00Z',
    })
    vi.mocked(listAgentTemplates).mockResolvedValue({
      items: [template],
      region: 'us',
    })
    vi.mocked(getAgentConsole).mockResolvedValue({
      agent: agentContract,
      workspaceRoot: '/workspace',
      webSocketPath: '/api/v1/agents/ympp868f/ws',
      services: [],
    })
    vi.mocked(createAgentPreview).mockResolvedValue({
      id: 'p_3000',
      port: 3000,
      url: '/__preview/p_3000/',
    })

    renderConsoleWindowPage()

    await screen.findAllByText('Hermes Agent')
    await waitFor(() => expect(mockOpenFiles).toHaveBeenCalled())
    const addTerminalButtons = screen.getAllByRole('button', { name: '添加终端' })
    fireEvent.click(addTerminalButtons[addTerminalButtons.length - 1])
    await screen.findByText('mock terminal workspace')

    const openPreviewButton = screen.getByRole('button', { name: 'open preview 3000' })
    fireEvent.click(openPreviewButton)
    await waitFor(() => expect(createAgentPreview).toHaveBeenCalledTimes(1))
    await screen.findByText('预览 3000')
    fireEvent.click(openPreviewButton)

    await waitFor(() => expect(createAgentPreview).toHaveBeenCalledTimes(1))
  })

})
