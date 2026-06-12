import { fireEvent, render, screen, within } from '@testing-library/react'
import { AgentActionsCell } from './AgentActionsCell'
import { createAgentItemFixture, createTemplateFixture } from '../../../../test/agentFixtures'

describe('AgentActionsCell', () => {
  const noop = () => {}

  it('shows Hermes action set without unrelated web ui entry', async () => {
    const item = createAgentItemFixture({
      template: createTemplateFixture(),
      access: [
        { key: 'api', label: 'API', enabled: true, url: 'https://demo.example.com/v1' },
        { key: 'terminal', label: '终端', enabled: true },
        { key: 'files', label: '文件', enabled: true, rootPath: '/opt/hermes' },
      ],
      actions: [
        { key: 'open-chat', label: '对话', enabled: true },
        { key: 'open-terminal', label: '终端', enabled: true },
        { key: 'open-files', label: '文件', enabled: true },
        { key: 'open-settings', label: '配置', enabled: true },
        { key: 'delete', label: '删除', enabled: true },
      ],
    })

    render(
      <AgentActionsCell
        item={item}
        onChat={noop}
        onDelete={noop}
        onEdit={noop}
        onFiles={noop}
        onTerminal={noop}
        onToggleState={noop}
        onWebUI={noop}
      />,
    )

    expect(screen.getByRole('button', { name: '配置' })).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByTitle('更多操作'))
    const menu = await screen.findByRole('menu')

    expect(within(menu).queryByRole('menuitem', { name: '配置' })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: '删除' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: '对话' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: '终端' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: '文件' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: 'Web UI' })).not.toBeInTheDocument()
  })

  it('shows OpenClaw action set with web ui but without chat', async () => {
    const item = createAgentItemFixture({
      templateId: 'openclaw',
      template: createTemplateFixture({ id: 'openclaw', name: 'OpenClaw', workingDir: '/app', user: 'openclaw' }),
      access: [
        { key: 'web-ui', label: 'Web UI', enabled: true, url: 'https://openclaw.example.com/' },
        { key: 'terminal', label: '终端', enabled: true },
        { key: 'files', label: '文件', enabled: true, rootPath: '/app' },
      ],
      actions: [
        { key: 'open-terminal', label: '终端', enabled: true },
        { key: 'open-files', label: '文件', enabled: true },
        { key: 'open-settings', label: '配置', enabled: true },
        { key: 'delete', label: '删除', enabled: true },
      ],
    })

    render(
      <AgentActionsCell
        item={item}
        onChat={noop}
        onDelete={noop}
        onEdit={noop}
        onFiles={noop}
        onTerminal={noop}
        onToggleState={noop}
        onWebUI={noop}
      />,
    )

    expect(screen.getByRole('button', { name: '配置' })).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByTitle('更多操作'))
    const menu = await screen.findByRole('menu')

    expect(within(menu).getByRole('menuitem', { name: 'Web UI' })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: '配置' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: '对话' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: '终端' })).not.toBeInTheDocument()
    expect(within(menu).queryByRole('menuitem', { name: '文件' })).not.toBeInTheDocument()
  })

  it('disables console and web ui actions when runtime entries are unavailable', async () => {
    const onTerminal = vi.fn()
    const onWebUI = vi.fn()
    const item = createAgentItemFixture({
      templateId: 'openclaw',
      template: createTemplateFixture({ id: 'openclaw', name: 'OpenClaw', workingDir: '/app', user: 'openclaw' }),
      access: [
        { key: 'web-ui', label: 'Web UI', enabled: false, reason: 'agent_paused', url: 'https://openclaw.example.com/' },
        { key: 'terminal', label: '终端', enabled: false, reason: 'agent_paused' },
      ],
      actions: [
        { key: 'open-terminal', label: '终端', enabled: false, reason: 'agent_paused' },
        { key: 'open-settings', label: '配置', enabled: true },
      ],
    })
    item.status = 'stopped'
    item.rawStatus = 'Paused'
    item.ready = false
    item.terminalAvailable = false
    item.terminalDisabledReason = 'agent_paused'
    item.webUIAvailable = false
    if (item.webUIAccess) {
      item.webUIAccess.enabled = false
      item.webUIAccess.reason = 'agent_paused'
    }

    render(
      <AgentActionsCell
        item={item}
        onChat={noop}
        onDelete={noop}
        onEdit={noop}
        onFiles={noop}
        onTerminal={onTerminal}
        onToggleState={noop}
        onWebUI={onWebUI}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '控制台' }))
    expect(onTerminal).not.toHaveBeenCalled()

    fireEvent.pointerDown(screen.getByTitle('更多操作'))
    const menu = await screen.findByRole('menu')
    const webUIItem = within(menu).getByRole('menuitem', { name: 'Web UI' })

    expect(webUIItem).toHaveAttribute('data-disabled')
    fireEvent.click(webUIItem)
    expect(onWebUI).not.toHaveBeenCalled()
  })
})
