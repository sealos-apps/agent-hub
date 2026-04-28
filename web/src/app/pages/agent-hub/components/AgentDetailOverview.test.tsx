import { render, screen } from '@testing-library/react'
import { AgentDetailOverview } from './AgentDetailOverview'
import { createAgentItemFixture, createTemplateFixture } from '../../../../test/agentFixtures'

describe('AgentDetailOverview', () => {
  it('shows Hermes access planes and hides entries the template does not declare', () => {
    const item = createAgentItemFixture({
      template: createTemplateFixture({ name: 'Hermes Agent', docsLabel: '对话 + 终端' }),
      access: [
        { key: 'api', label: 'API', enabled: true, url: 'https://demo.example.com/v1', auth: 'apiKey' },
        { key: 'ssh', label: 'SSH', enabled: true, host: 'ssh.example.com', port: 2222, userName: 'hermes', workingDir: '/opt/hermes' },
        { key: 'ide', label: 'IDE', enabled: true, host: 'ssh.example.com', port: 2222, userName: 'hermes', modes: ['cursor', 'vscode'] },
      ],
      actions: [
        { key: 'open-chat', label: '对话', enabled: true },
        { key: 'open-terminal', label: '终端', enabled: true },
        { key: 'open-files', label: '文件', enabled: true },
        { key: 'open-settings', label: '设置', enabled: true },
      ],
    })

    render(<AgentDetailOverview clusterContext={null} item={item} />)

    expect(screen.getByText('API')).toBeInTheDocument()
    expect(screen.getByText('SSH')).toBeInTheDocument()
    expect(screen.getByText('IDE')).toBeInTheDocument()
    expect(screen.queryByText('Web UI')).not.toBeInTheDocument()
  })

  it('keeps OpenClaw detail entrance set limited to the declared web ui plane', () => {
    const item = createAgentItemFixture({
      templateId: 'openclaw',
      template: createTemplateFixture({
        id: 'openclaw',
        name: 'OpenClaw',
        docsLabel: 'Web UI + 终端',
        workingDir: '/app',
        user: 'openclaw',
      }),
      access: [
        { key: 'web-ui', label: 'Web UI', enabled: true, url: 'https://openclaw.example.com/' },
      ],
      actions: [
        { key: 'open-terminal', label: '终端', enabled: true },
        { key: 'open-files', label: '文件', enabled: true },
        { key: 'open-settings', label: '设置', enabled: true },
      ],
    })

    render(<AgentDetailOverview clusterContext={null} item={item} />)

    expect(screen.getByText('Web UI')).toBeInTheDocument()
    expect(screen.queryByText('API')).not.toBeInTheDocument()
    expect(screen.queryByText('SSH')).not.toBeInTheDocument()
    expect(screen.queryByText('IDE')).not.toBeInTheDocument()
  })
})
