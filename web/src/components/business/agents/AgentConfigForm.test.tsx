import { fireEvent, render, screen } from '@testing-library/react'
import { AgentConfigForm } from './AgentConfigForm'
import { createTemplateFixture } from '../../../test/agentFixtures'
import type {
  AgentBlueprint,
  AgentSettingField,
} from '../../../domains/agents/types'

function createBlueprint(): AgentBlueprint {
  return {
    appName: 'demo-agent',
    aliasName: 'Demo Agent',
    namespace: 'ns-test',
    apiKey: '',
    apiUrl: '',
    domainPrefix: '',
    fullDomain: '',
    image: 'fixture:image',
    productType: 'hermes-agent',
    state: 'Running',
    runtimeClassName: 'devbox-runtime',
    storageLimit: '10Gi',
    port: 8642,
    cpu: '2000m',
    memory: '4096Mi',
    profile: 'recommended',
    serviceType: 'ClusterIP',
    protocol: 'TCP',
    user: 'hermes',
    workingDir: '/opt/hermes',
    argsText: 'gateway run',
    modelProvider: 'aiproxy',
    modelBaseURL: 'https://aiproxy.example.com/v1',
    model: 'gpt-5.4-mini',
    hasModelAPIKey: true,
    keySource: 'workspace-aiproxy',
    settingsValues: {},
  }
}

describe('AgentConfigForm', () => {
  it('renders backend-provided model options for the current region and updates provider on selection', () => {
    const template = createTemplateFixture({
      modelOptions: [
        {
          value: 'gpt-5.4-mini',
          label: 'GPT-5.4 Mini',
          helper: 'AI Proxy · openai-responses',
          provider: 'aiproxy',
          apiMode: 'openai-responses',
        },
        {
          value: 'glm-4.6',
          label: 'GLM-4.6',
          helper: 'AI Proxy · openai-chat-completions',
          provider: 'aiproxy',
          apiMode: 'openai-chat-completions',
        },
      ],
    })
    const settingCalls: Array<[string, string]> = []

    render(
      <AgentConfigForm
        blueprint={createBlueprint()}
        mode='create'
        onChange={() => {}}
        onChangeSettingField={(field: AgentSettingField, value: string) =>
          settingCalls.push([field.key, value])
        }
        onSelectPreset={() => {}}
        template={template}
        workspaceModelBaseURL='https://aiproxy.example.com/v1'
        workspaceModelKeyReady
        workspaceRegion='us'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'GPT-5.4 Mini · AI Proxy · openai-responses' }))
    expect(screen.getAllByText('GPT-5.4 Mini · AI Proxy · openai-responses').length).toBeGreaterThan(0)
    expect(screen.getByText('GLM-4.6 · AI Proxy · openai-chat-completions')).toBeInTheDocument()
    fireEvent.click(screen.getByText('GLM-4.6 · AI Proxy · openai-chat-completions'))

    expect(settingCalls).toContainEqual(['model', 'glm-4.6'])
    expect(settingCalls).toContainEqual(['provider', 'aiproxy'])
  })

  it('only renders the catalog options passed from the current regional template snapshot', () => {
    const template = createTemplateFixture({
      modelOptions: [
        {
          value: 'glm-4.6',
          label: 'GLM-4.6',
          helper: 'AI Proxy · openai-chat-completions',
          provider: 'aiproxy',
          apiMode: 'openai-chat-completions',
        },
      ],
    })

    render(
      <AgentConfigForm
        blueprint={createBlueprint()}
        mode='create'
        onChange={() => {}}
        onChangeSettingField={() => {}}
        onSelectPreset={() => {}}
        template={template}
        workspaceModelBaseURL='https://aiproxy.example.com/v1'
        workspaceModelKeyReady
        workspaceRegion='cn'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '请选择模型' }))
    expect(screen.getByText('GLM-4.6 · AI Proxy · openai-chat-completions')).toBeInTheDocument()
    expect(screen.queryByText('GPT-5.4 Mini · AI Proxy · openai-responses')).not.toBeInTheDocument()
  })
})
