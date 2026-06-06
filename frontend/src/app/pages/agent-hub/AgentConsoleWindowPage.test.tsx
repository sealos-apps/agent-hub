import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentConsoleWindowPage } from './AgentConsoleWindowPage'
import {
  createAgentPreview,
  createClusterContext,
  deleteAgentPreview,
  getAgentConsole,
  getClusterInfo,
  listAgentTemplates,
} from '../../../api'
import type { AgentFileItem, ClusterContext } from '../../../domains/agents/types'
import { I18nProvider } from '../../../i18n'
import {
  applyAutoExpandChain,
  buildExplorerPathChain,
  isTrustedDesktopMessageOrigin,
} from './lib/consoleExplorerHelpers'
import { createInitialConsoleTabs, initialConsoleTabId } from './lib/consoleTabs'

vi.mock('../../../api', () => ({
  buildAgentTerminalWebSocketUrl: vi.fn(() => 'ws://localhost:8888/api/v1/agents/ympp868f/terminal/ws'),
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
    <div data-testid="agent-terminal-surface">
      <span>mock terminal workspace</span>
      <button type="button" onClick={() => onOpenPreviewPort?.(3000)}>
        open preview 3000
      </button>
    </div>
  ),
}))

vi.mock('../../../components/business/files/AgentFileCodeEditor', () => ({
  AgentFileCodeEditor: ({
    onChange,
    path,
    value,
  }: {
    onChange?: (value: string) => void
    path?: string
    value: string
  }) => (
    <textarea
      aria-label="mock file editor"
      data-path={path}
      onChange={(event) => onChange?.(event.target.value)}
      value={value}
    />
  ),
}))

const mockCloseFiles = vi.fn()
const mockOpenFiles = vi.fn()
const mockReadDirectory = vi.fn(async (): Promise<{ path: string; items: AgentFileItem[] }> => ({
  path: '/workspace',
  items: [],
}))
const mockReadFile = vi.fn()
const mockSearchFiles = vi.fn(async () => ({ items: [] }))
const mockSaveFile = vi.fn()
const mockUploadFiles = vi.fn()
const mockCreateDirectory = vi.fn()
const mockCreateEmptyFile = vi.fn()
const mockDeleteEntry = vi.fn()
const mockDownloadEntry = vi.fn()
const mockRefreshDirectory = vi.fn()
const mockRenameEntry = vi.fn()

vi.mock('./hooks/useAgentFiles', () => ({
  useAgentFiles: () => ({
    closeFiles: mockCloseFiles,
    createDirectory: mockCreateDirectory,
    createEmptyFile: mockCreateEmptyFile,
    deleteEntry: mockDeleteEntry,
    downloadEntry: mockDownloadEntry,
    filesSession: null,
    openFiles: mockOpenFiles,
    readDirectory: mockReadDirectory,
    readFile: mockReadFile,
    refreshDirectory: mockRefreshDirectory,
    renameEntry: mockRenameEntry,
    searchFiles: mockSearchFiles,
    saveFile: mockSaveFile,
    uploadFiles: mockUploadFiles,
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
    vi.mocked(deleteAgentPreview).mockReset()
    vi.mocked(getAgentConsole).mockReset()
    vi.mocked(getClusterInfo).mockReset()
    vi.mocked(listAgentTemplates).mockReset()
    mockCloseFiles.mockClear()
    mockOpenFiles.mockClear()
    mockReadDirectory.mockClear()
    mockReadFile.mockClear()
    mockSearchFiles.mockClear()
    mockSaveFile.mockClear()
    mockUploadFiles.mockReset()
    mockUploadFiles.mockResolvedValue(true)
    mockCreateDirectory.mockClear()
    mockCreateEmptyFile.mockClear()
    mockDeleteEntry.mockReset()
    mockDeleteEntry.mockResolvedValue(true)
    mockDownloadEntry.mockClear()
    mockRefreshDirectory.mockClear()
    mockRenameEntry.mockReset()
    mockRenameEntry.mockResolvedValue(true)
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

  it('keeps terminal content outside the scaled console frame', async () => {
    vi.mocked(createClusterContext).mockReturnValue(clusterContext)
    vi.mocked(listAgentTemplates).mockResolvedValue({ items: [template], region: 'us' })
    vi.mocked(getClusterInfo).mockResolvedValue({
      cluster: clusterContext.server,
      namespace: clusterContext.namespace,
      kc: clusterContext.kubeconfig,
      server: clusterContext.server,
      operator: clusterContext.operator,
      updatedAt: '',
    })
    vi.mocked(getAgentConsole).mockResolvedValue({
      agent: agentContract,
      services: [],
      workspaceRoot: '/workspace',
      webSocketPath: '/api/v1/agents/ympp868f/ws',
    })
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 720 })

    renderConsoleWindowPage()

    await waitFor(() => expect(screen.getAllByRole('button', { name: /add terminal|添加终端/i }).length).toBeGreaterThan(0))

    fireEvent.click(screen.getAllByRole('button', { name: /add terminal|添加终端/i })[0])

    await waitFor(() => expect(screen.getByTestId('agent-terminal-surface')).toBeInTheDocument())

    const scaleFrame = screen.queryByTestId('console-scale-frame')
    if (scaleFrame) {
      expect(scaleFrame).not.toContainElement(screen.getByTestId('agent-terminal-surface'))
    }
  })

  it('shows only the explorer first on mobile and keeps upload in the explorer toolbar', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 393 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 852 })

    renderConsoleWindowPage()

    const explorerPane = await screen.findByTestId('console-explorer-pane')
    const workspacePane = await screen.findByTestId('console-workspace-pane')

    await waitFor(() => expect(explorerPane).toHaveClass('flex'))
    expect(workspacePane).toHaveClass('hidden')
    await waitFor(() => expect(document.title).toContain('go6becn4'))
    expect(screen.getByText('未获取到真实集群上下文，无法加载 Agent 控制台。')).toBeInTheDocument()

    expect(within(explorerPane).getByRole('button', { name: '上传文件' })).toBeInTheDocument()
    expect(within(explorerPane).getByRole('button', { name: '添加终端' })).toBeInTheDocument()

    fireEvent.click(within(explorerPane).getByRole('button', { name: '上传文件' }))

    expect(screen.getByRole('heading', { name: '上传文件' })).toBeInTheDocument()
    expect(screen.getByText('拖拽文件或文件夹到这里')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '选择文件' })).toBeInTheDocument()
  })

  it('opens the workspace from the mobile explorer toolbar', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 393 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 852 })
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

    renderConsoleWindowPage()

    const explorerPane = await screen.findByTestId('console-explorer-pane')
    const workspacePane = await screen.findByTestId('console-workspace-pane')
    await waitFor(() => expect(explorerPane).toHaveClass('flex'))
    await screen.findAllByText('Hermes Agent')
    expect(workspacePane).toHaveClass('hidden')

    fireEvent.click(within(explorerPane).getByRole('button', { name: '添加终端' }))

    await screen.findByText('mock terminal workspace')
    expect(explorerPane).toHaveClass('hidden')
    expect(workspacePane).toHaveClass('flex')
  })

  it('keeps the upload dialog open and marks files done after upload', async () => {
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

    renderConsoleWindowPage()

    const explorerPane = await screen.findByTestId('console-explorer-pane')
    fireEvent.click(within(explorerPane).getByRole('button', { name: '上传文件' }))

    const file = new File(['hello'], 'note.txt', { type: 'text/plain' })
    const input = screen.getByRole('button', { name: '选择文件' }).parentElement?.querySelector('input[type="file"]')
    expect(input).toBeInstanceOf(HTMLInputElement)

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } })
    expect(screen.getByText('note.txt')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '上传 1 项' }))

    await waitFor(() => expect(mockUploadFiles).toHaveBeenCalledWith(
      [expect.objectContaining({ file, relativePath: 'note.txt' })],
      '/workspace',
      { refresh: false },
    ))
    expect(screen.getByRole('heading', { name: '上传文件' })).toBeInTheDocument()
    await screen.findByText('已完成')
  })

  it('does not remove queued upload rows while upload is active', async () => {
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
    let resolveUpload: (uploaded: boolean) => void = () => {}
    mockUploadFiles.mockImplementation(() => new Promise<boolean>((resolve) => {
      resolveUpload = resolve
    }))

    renderConsoleWindowPage()

    const explorerPane = await screen.findByTestId('console-explorer-pane')
    fireEvent.click(within(explorerPane).getByRole('button', { name: '上传文件' }))

    const firstFile = new File(['first'], 'first.txt', { type: 'text/plain' })
    const secondFile = new File(['second'], 'second.txt', { type: 'text/plain' })
    const input = screen.getByRole('button', { name: '选择文件' }).parentElement?.querySelector('input[type="file"]')
    expect(input).toBeInstanceOf(HTMLInputElement)

    fireEvent.change(input as HTMLInputElement, { target: { files: [firstFile, secondFile] } })
    fireEvent.click(screen.getByRole('button', { name: '上传 2 项' }))

    await waitFor(() => expect(mockUploadFiles).toHaveBeenCalledWith(
      [expect.objectContaining({ file: firstFile, relativePath: 'first.txt' })],
      '/workspace',
      { refresh: false },
    ))
    expect(screen.queryByRole('button', { name: '删除' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()

    await act(async () => {
      resolveUpload(true)
    })
  })

  it('keeps successful upload rows done when a later row fails', async () => {
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
    mockUploadFiles
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    renderConsoleWindowPage()

    const explorerPane = await screen.findByTestId('console-explorer-pane')
    fireEvent.click(within(explorerPane).getByRole('button', { name: '上传文件' }))

    const firstFile = new File(['first'], 'first.txt', { type: 'text/plain' })
    const secondFile = new File(['second'], 'second.txt', { type: 'text/plain' })
    const input = screen.getByRole('button', { name: '选择文件' }).parentElement?.querySelector('input[type="file"]')
    expect(input).toBeInstanceOf(HTMLInputElement)

    fireEvent.change(input as HTMLInputElement, { target: { files: [firstFile, secondFile] } })
    fireEvent.click(screen.getByRole('button', { name: '上传 2 项' }))

    await waitFor(() => expect(mockUploadFiles).toHaveBeenCalledTimes(2))
    expect(mockUploadFiles).toHaveBeenNthCalledWith(1, [expect.objectContaining({ file: firstFile, relativePath: 'first.txt' })], '/workspace', { refresh: false })
    expect(mockUploadFiles).toHaveBeenNthCalledWith(2, [expect.objectContaining({ file: secondFile, relativePath: 'second.txt' })], '/workspace', { refresh: false })
    expect(mockRefreshDirectory).toHaveBeenCalledTimes(1)
    expect(mockRefreshDirectory).toHaveBeenCalledWith('/workspace')
    expect(screen.getByText('first.txt').closest('div')).toHaveTextContent('已完成')
    expect(screen.getByText('second.txt').closest('div')).toHaveTextContent('删除')
  })

  it('refreshes cached child directories after nested uploads', async () => {
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
    mockReadDirectory.mockResolvedValueOnce({
      path: '/workspace',
      items: [{ name: 'assets', path: '/workspace/assets', size: 0, type: 'dir' }],
    }).mockResolvedValueOnce({
      path: '/workspace/assets',
      items: [{ name: 'images', path: '/workspace/assets/images', size: 0, type: 'dir' }],
    }).mockResolvedValueOnce({
      path: '/workspace/assets/images',
      items: [],
    })

    renderConsoleWindowPage()

    const explorerPane = await screen.findByTestId('console-explorer-pane')
    await waitFor(() => expect(mockReadDirectory).toHaveBeenCalledWith('/workspace'))
    fireEvent.click(await screen.findByRole('button', { name: /assets/ }))
    await waitFor(() => expect(mockReadDirectory).toHaveBeenCalledWith('/workspace/assets'))
    fireEvent.click(await screen.findByRole('button', { name: /images/ }))
    await waitFor(() => expect(mockReadDirectory).toHaveBeenCalledWith('/workspace/assets/images'))
    mockReadDirectory.mockClear()

    fireEvent.click(within(explorerPane).getByRole('button', { name: '上传文件' }))

    const file = new File(['hello'], 'new.txt', { type: 'text/plain' })
    Object.defineProperty(file, 'webkitRelativePath', {
      configurable: true,
      value: 'images/new.txt',
    })
    const input = screen.getByRole('button', { name: '选择文件' }).parentElement?.querySelector('input[type="file"]')
    expect(input).toBeInstanceOf(HTMLInputElement)

    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: '上传 1 项' }))

    await waitFor(() => expect(mockUploadFiles).toHaveBeenCalledWith(
      [expect.objectContaining({ file, relativePath: 'images/new.txt' })],
      '/workspace/assets',
      { refresh: false },
    ))
    await waitFor(() => expect(mockReadDirectory).toHaveBeenCalledWith('/workspace/assets/images'))
    expect(mockRefreshDirectory).toHaveBeenCalledWith('/workspace/assets')
  })

  it('shows file context menu actions and runs download and rename', async () => {
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
    const fileItems: AgentFileItem[] = [
      { name: 'note.txt', path: '/workspace/note.txt', size: 5, type: 'file' },
    ]
    mockReadDirectory.mockResolvedValueOnce({
      path: '/workspace',
      items: fileItems,
    })
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('../renamed.txt')

    renderConsoleWindowPage()

    const fileButton = await screen.findByRole('button', { name: /note.txt/ })
    fireEvent.contextMenu(fileButton, { clientX: 120, clientY: 180 })

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '打开' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.contextMenu(fileButton, { clientX: 120, clientY: 180 })
    fireEvent.click(screen.getByRole('menuitem', { name: '下载' }))
    expect(mockDownloadEntry).toHaveBeenCalledWith('/workspace/note.txt')

    fireEvent.contextMenu(fileButton, { clientX: 120, clientY: 180 })
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(promptSpy).toHaveBeenCalledWith('输入新名称', 'note.txt')
    expect(mockRenameEntry).toHaveBeenCalledWith('/workspace/note.txt', '/workspace/renamed.txt')

    mockRenameEntry.mockClear()
    promptSpy.mockReturnValue('..')
    fireEvent.contextMenu(fileButton, { clientX: 120, clientY: 180 })
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(mockRenameEntry).not.toHaveBeenCalled()

    promptSpy.mockRestore()
  })

  it('sanitizes create prompts to entry names before calling file APIs', async () => {
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
    const promptSpy = vi.spyOn(window, 'prompt')
    promptSpy.mockReturnValueOnce('../escape.txt').mockReturnValueOnce('../escape-dir')

    renderConsoleWindowPage()

    const explorerPane = await screen.findByTestId('console-explorer-pane')
    const treeLabel = within(explorerPane).getByText('文件层级')
    fireEvent.contextMenu(treeLabel, { clientX: 120, clientY: 180 })
    fireEvent.click(screen.getByRole('menuitem', { name: '新建文件' }))
    expect(mockCreateEmptyFile).toHaveBeenCalledWith('escape.txt', '/workspace')

    fireEvent.contextMenu(treeLabel, { clientX: 120, clientY: 180 })
    fireEvent.click(screen.getByRole('menuitem', { name: '新建文件夹' }))
    expect(mockCreateDirectory).toHaveBeenCalledWith('escape-dir', '/workspace')

    promptSpy.mockRestore()
  })

  it('updates an open file tab path after explorer rename', async () => {
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
    mockReadDirectory.mockResolvedValueOnce({
      path: '/workspace',
      items: [{ name: 'note.txt', path: '/workspace/note.txt', size: 5, type: 'file' }],
    })
    mockReadFile.mockResolvedValue({ content: 'hello', fromCache: false, stale: false })
    mockRenameEntry.mockResolvedValue(true)
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('renamed.txt')

    renderConsoleWindowPage()

    const fileButton = await screen.findByRole('button', { name: /note.txt/ })
    fireEvent.click(fileButton)
    const editor = await screen.findByLabelText('mock file editor')
    fireEvent.change(editor, { target: { value: 'dirty content' } })

    fireEvent.contextMenu(fileButton, { clientX: 120, clientY: 180 })
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))

    await waitFor(() => expect(mockRenameEntry).toHaveBeenCalledWith('/workspace/note.txt', '/workspace/renamed.txt'))
    const explorerPane = screen.getByTestId('console-explorer-pane')
    expect(within(explorerPane).getByRole('button', { name: /renamed.txt/ })).toBeInTheDocument()
    expect(within(explorerPane).queryByRole('button', { name: /note.txt/ })).not.toBeInTheDocument()
    expect(screen.getByLabelText('mock file editor')).toHaveAttribute('data-path', '/workspace/renamed.txt')

    fireEvent.keyDown(document, { key: 's', metaKey: true })
    await waitFor(() => expect(mockSaveFile).toHaveBeenCalledWith('/workspace/renamed.txt', 'dirty content'))

    promptSpy.mockRestore()
  })

  it('saves dirty file tabs after explorer rename changes the extension', async () => {
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
    mockReadDirectory.mockResolvedValueOnce({
      path: '/workspace',
      items: [{ name: 'note.txt', path: '/workspace/note.txt', size: 5, type: 'file' }],
    })
    mockReadFile.mockResolvedValue({ content: 'hello', fromCache: false, stale: false })
    mockRenameEntry.mockResolvedValue(true)
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('renamed.bin')

    renderConsoleWindowPage()

    const fileButton = await screen.findByRole('button', { name: /note.txt/ })
    fireEvent.click(fileButton)
    const editor = await screen.findByLabelText('mock file editor')
    fireEvent.change(editor, { target: { value: 'dirty content' } })

    fireEvent.contextMenu(fileButton, { clientX: 120, clientY: 180 })
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    await waitFor(() => expect(mockRenameEntry).toHaveBeenCalledWith('/workspace/note.txt', '/workspace/renamed.bin'))

    expect(screen.getByLabelText('mock file editor')).toBeInTheDocument()
    expect(screen.getByLabelText('mock file editor')).toHaveAttribute('data-path', '/workspace/renamed.bin')
    fireEvent.keyDown(document, { key: 's', metaKey: true })
    await waitFor(() => expect(mockSaveFile).toHaveBeenCalledWith('/workspace/renamed.bin', 'dirty content'))

    promptSpy.mockRestore()
  })

  it('keeps unsupported file tabs read-only after file content loads', async () => {
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
    mockReadDirectory.mockResolvedValueOnce({
      path: '/workspace',
      items: [{ name: 'image.png', path: '/workspace/image.png', size: 5, type: 'file' }],
    })
    mockReadFile.mockResolvedValue({ content: 'not text', fromCache: false, stale: false })

    renderConsoleWindowPage()

    fireEvent.click(await screen.findByRole('button', { name: /image.png/ }))

    await waitFor(() => expect(mockReadFile).toHaveBeenCalledWith('/workspace/image.png'))
    await waitFor(() => expect(screen.getByText('当前对象暂不支持预览。')).toBeInTheDocument())
    expect(screen.queryByLabelText('mock file editor')).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 's', metaKey: true })
    expect(mockSaveFile).not.toHaveBeenCalled()
  })

  it('closes open file tabs after explorer delete', async () => {
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
    mockReadDirectory.mockResolvedValueOnce({
      path: '/workspace',
      items: [{ name: 'note.txt', path: '/workspace/note.txt', size: 5, type: 'file' }],
    })
    mockReadFile.mockResolvedValue({ content: 'hello', fromCache: false, stale: false })
    mockDeleteEntry.mockResolvedValue(true)
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderConsoleWindowPage()

    const fileButton = await screen.findByRole('button', { name: /note.txt/ })
    fireEvent.click(fileButton)
    const editor = await screen.findByLabelText('mock file editor')
    fireEvent.change(editor, { target: { value: 'dirty content' } })

    fireEvent.contextMenu(fileButton, { clientX: 120, clientY: 180 })
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))

    await waitFor(() => expect(mockDeleteEntry).toHaveBeenCalledWith('/workspace/note.txt'))
    expect(mockRefreshDirectory).toHaveBeenCalledWith('/workspace')
    expect(screen.queryByLabelText('mock file editor')).not.toBeInTheDocument()

    confirmSpy.mockRestore()
  })

  it('keeps dirty file tabs and skips explorer delete when discard is rejected', async () => {
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
    mockReadDirectory.mockResolvedValueOnce({
      path: '/workspace',
      items: [{ name: 'note.txt', path: '/workspace/note.txt', size: 5, type: 'file' }],
    })
    mockReadFile.mockResolvedValue({ content: 'hello', fromCache: false, stale: false })
    const confirmSpy = vi.spyOn(window, 'confirm')
    confirmSpy.mockReturnValueOnce(true).mockReturnValueOnce(false).mockReturnValueOnce(false)

    renderConsoleWindowPage()

    const fileButton = await screen.findByRole('button', { name: /note.txt/ })
    fireEvent.click(fileButton)
    const editor = await screen.findByLabelText('mock file editor')
    fireEvent.change(editor, { target: { value: 'dirty content' } })

    fireEvent.contextMenu(fileButton, { clientX: 120, clientY: 180 })
    fireEvent.click(screen.getByRole('menuitem', { name: '删除' }))

    expect(confirmSpy).toHaveBeenCalledTimes(3)
    expect(mockDeleteEntry).not.toHaveBeenCalled()
    expect(screen.getByLabelText('mock file editor')).toBeInTheDocument()

    confirmSpy.mockRestore()
  })

  it('shows folder and blank-space context menu actions', async () => {
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
    const folderItems: AgentFileItem[] = [
      { name: 'assets', path: '/workspace/assets', size: 0, type: 'dir' },
    ]
    mockReadDirectory.mockResolvedValueOnce({
      path: '/workspace',
      items: folderItems,
    })
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('new.txt')

    renderConsoleWindowPage()

    const folderButton = await screen.findByRole('button', { name: /assets/ })
    fireEvent.contextMenu(folderButton, { clientX: 100, clientY: 120 })
    expect(screen.getByRole('menuitem', { name: '上传到此处' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '上传到此处' }))
    expect(screen.getByText('将文件上传到 /workspace/assets')).toBeInTheDocument()

    fireEvent.contextMenu(folderButton, { clientX: 100, clientY: 120 })
    fireEvent.click(screen.getByRole('menuitem', { name: '新建文件' }))
    expect(mockCreateEmptyFile).toHaveBeenCalledWith('new.txt', '/workspace/assets')

    const explorerPane = screen.getByTestId('console-explorer-pane')
    const treeLabel = within(explorerPane).getByText('文件层级')
    fireEvent.contextMenu(treeLabel, { clientX: 180, clientY: 240 })
    fireEvent.click(screen.getByRole('menuitem', { name: '刷新' }))
    expect(mockRefreshDirectory).toHaveBeenCalledWith('/workspace')

    promptSpy.mockRestore()
  })

  it('expands the scaled desktop canvas to the available viewport height', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 960 })

    renderConsoleWindowPage()

    const scaleFrame = await screen.findByTestId('console-scale-frame')

    expect(parseFloat(scaleFrame.style.height)).toBeGreaterThanOrEqual(900)
  })

  it('places explorer context menu inside the scaled desktop canvas', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1024 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 960 })
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
    mockReadDirectory.mockResolvedValueOnce({
      path: '/workspace',
      items: [{ name: 'note.txt', path: '/workspace/note.txt', size: 5, type: 'file' }],
    })

    renderConsoleWindowPage()

    const scaleFrame = await screen.findByTestId('console-scale-frame')
    const canvas = scaleFrame.firstElementChild as HTMLElement
    canvas.getBoundingClientRect = vi.fn(() => ({
      bottom: 720,
      height: 714,
      left: 12,
      right: 1012,
      top: 6,
      width: 1000,
      x: 12,
      y: 6,
      toJSON: () => ({}),
    }))
    const fileButton = await screen.findByRole('button', { name: /note.txt/ })
    fireEvent.contextMenu(fileButton, { clientX: 190, clientY: 96 })

    const menu = screen.getByRole('menu')
    expect(menu).toHaveStyle({ left: '211.3504311793034px', top: '106.79516183223205px' })
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

  it('keeps inactive web tab iframes out of keyboard and screen reader navigation', async () => {
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
    const addTerminalButtons = screen.getAllByRole('button', { name: '添加终端' })
    fireEvent.click(addTerminalButtons[addTerminalButtons.length - 1])
    await screen.findByText('mock terminal workspace')

    fireEvent.click(screen.getByRole('button', { name: 'open preview 3000' }))
    const previewFrame = await screen.findByTitle('预览 3000')
    fireEvent.click(screen.getByRole('button', { name: /终端 1/ }))

    await waitFor(() => expect(previewFrame.closest('div')).toHaveAttribute('aria-hidden', 'true'))
    expect(previewFrame).toHaveAttribute('tabindex', '-1')
  })

  it('keeps inactive terminal panes out of assistive navigation', async () => {
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

    renderConsoleWindowPage()

    await screen.findAllByText('Hermes Agent')
    const addTerminalButtons = screen.getAllByRole('button', { name: '添加终端' })
    fireEvent.click(addTerminalButtons[addTerminalButtons.length - 1])
    const terminalPane = (await screen.findByText('mock terminal workspace')).closest('div')?.parentElement
    expect(terminalPane).not.toHaveAttribute('aria-hidden')

    fireEvent.click(screen.getAllByRole('button', { name: '添加终端' }).at(-1)!)
    await screen.findByRole('button', { name: /终端 2/ })

    await waitFor(() => expect(terminalPane).toHaveAttribute('aria-hidden', 'true'))
    expect(terminalPane).toHaveAttribute('inert')
  })

  it('does not create duplicate backend previews while the preview tab ref is stale', async () => {
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
    let resolvePreview: (value: { id: string; port: number; url: string }) => void = () => {}
    vi.mocked(createAgentPreview).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve
        }),
    )

    renderConsoleWindowPage()

    await screen.findAllByText('Hermes Agent')
    const addTerminalButtons = screen.getAllByRole('button', { name: '添加终端' })
    fireEvent.click(addTerminalButtons[addTerminalButtons.length - 1])
    await screen.findByText('mock terminal workspace')

    const openPreviewButton = screen.getByRole('button', { name: 'open preview 3000' })
    fireEvent.click(openPreviewButton)
    await waitFor(() => expect(createAgentPreview).toHaveBeenCalledTimes(1))

    resolvePreview({
      id: 'p_3000',
      port: 3000,
      url: '/__preview/p_3000/',
    })
    await Promise.resolve()
    fireEvent.click(openPreviewButton)

    await act(async () => {})
    await waitFor(() => expect(createAgentPreview).toHaveBeenCalledTimes(1))
  })

  it('releases open preview sessions before resetting tabs for another agent', async () => {
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
    vi.mocked(getAgentConsole).mockImplementation(async (agentName) => ({
      agent: {
        ...agentContract,
        core: {
          ...agentContract.core,
          name: agentName,
          aliasName: agentName === 'next-agent' ? 'Next Agent' : 'Hermes Agent',
        },
      },
      workspaceRoot: '/workspace',
      webSocketPath: `/api/v1/agents/${agentName}/ws`,
      services: [],
    }))
    vi.mocked(createAgentPreview).mockResolvedValue({
      id: 'p_3000',
      port: 3000,
      url: '/__preview/p_3000/',
    })

    renderConsoleWindowPage()

    await screen.findAllByText('Hermes Agent')
    const addTerminalButtons = screen.getAllByRole('button', { name: '添加终端' })
    fireEvent.click(addTerminalButtons[addTerminalButtons.length - 1])
    await screen.findByText('mock terminal workspace')

    fireEvent.click(screen.getByRole('button', { name: 'open preview 3000' }))
    await waitFor(() => expect(createAgentPreview).toHaveBeenCalledTimes(1))
    await screen.findByText('预览 3000')

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'AgentHubConsoleWindow', agentName: 'next-agent' },
          origin: window.location.origin,
          source: window,
        }),
      )
    })

    await waitFor(() => {
      expect(deleteAgentPreview).toHaveBeenCalledWith('ympp868f', 'p_3000', clusterContext)
    })
    await screen.findAllByText('Next Agent')
  })

  it('releases an in-flight preview session when the agent changes before creation resolves', async () => {
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
    vi.mocked(getAgentConsole).mockImplementation(async (agentName) => ({
      agent: {
        ...agentContract,
        core: {
          ...agentContract.core,
          name: agentName,
          aliasName: agentName === 'next-agent' ? 'Next Agent' : 'Hermes Agent',
        },
      },
      workspaceRoot: '/workspace',
      webSocketPath: `/api/v1/agents/${agentName}/ws`,
      services: [],
    }))
    let resolvePreview: (value: { id: string; port: number; url: string }) => void = () => {}
    vi.mocked(createAgentPreview).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePreview = resolve
        }),
    )

    renderConsoleWindowPage()

    await screen.findAllByText('Hermes Agent')
    const addTerminalButtons = screen.getAllByRole('button', { name: '添加终端' })
    fireEvent.click(addTerminalButtons[addTerminalButtons.length - 1])
    await screen.findByText('mock terminal workspace')

    fireEvent.click(screen.getByRole('button', { name: 'open preview 3000' }))
    await waitFor(() => expect(createAgentPreview).toHaveBeenCalledTimes(1))

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { type: 'AgentHubConsoleWindow', agentName: 'next-agent' },
          origin: window.location.origin,
          source: window,
        }),
      )
    })
    await screen.findAllByText('Next Agent')

    resolvePreview({
      id: 'p_late',
      port: 3000,
      url: '/__preview/p_late/',
    })

    await waitFor(() => {
      expect(deleteAgentPreview).toHaveBeenCalledWith('ympp868f', 'p_late', clusterContext)
    })
    expect(screen.queryByText('预览 3000')).not.toBeInTheDocument()
  })

})
