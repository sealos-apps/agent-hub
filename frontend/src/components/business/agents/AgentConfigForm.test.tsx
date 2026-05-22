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
    modelProvider: 'custom:aiproxy-responses',
    modelBaseURL: 'https://aiproxy.example.com/v1',
    model: 'gpt-5.4-mini',
    modelAPIMode: 'codex_responses',
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
          helper: 'OpenAI',
          provider: 'custom:aiproxy-responses',
          apiMode: 'codex_responses',
          category: 'text',
          capabilities: ['reasoning'],
          inputModalities: ['text'],
          outputModalities: ['text'],
        },
        {
          value: 'glm-4.6',
          label: 'GLM-4.6',
          helper: 'GLM',
          provider: 'custom:aiproxy-chat',
          apiMode: 'chat_completions',
          category: 'text',
          inputModalities: ['text'],
          outputModalities: ['text'],
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

    expect(screen.getAllByText('普通模型').length).toBeGreaterThan(0)
    expect(screen.getByText('GPT-5.4 Mini')).toBeInTheDocument()
    expect(screen.getByText('GLM-4.6')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /GLM-4.6/ }))

    expect(settingCalls).toContainEqual(['model', 'glm-4.6'])
    expect(settingCalls).toContainEqual(['provider', 'custom:aiproxy-chat'])
  })

  it('selects model type first, then renders models from that YAML group', () => {
    const template = createTemplateFixture({
      modelTypes: [
        {
          key: 'multimodal',
          label: '多模态模型',
          models: [
            {
              value: 'gpt-5.4-vision',
              label: 'GPT-5.4 Vision',
              helper: 'OpenAI',
              provider: 'custom:aiproxy-responses',
              apiMode: 'codex_responses',
              category: 'multimodal',
              capabilities: ['vision', 'multimodal'],
              inputModalities: ['text', 'image'],
              outputModalities: ['text'],
            },
          ],
        },
        {
          key: 'image',
          label: '生图模型',
          models: [
            {
              value: 'gpt-image-2',
              label: 'GPT Image 2',
              helper: 'OpenAI',
              provider: 'custom:aiproxy-responses',
              apiMode: 'image_generation',
              category: 'image',
              capabilities: ['image_generation'],
              inputModalities: ['text', 'image'],
              outputModalities: ['image'],
            },
          ],
        },
      ],
      modelOptions: [
        {
          value: 'gpt-5.4-vision',
          label: 'GPT-5.4 Vision',
          helper: 'OpenAI',
          provider: 'custom:aiproxy-responses',
          apiMode: 'codex_responses',
          category: 'multimodal',
          capabilities: ['vision', 'multimodal'],
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
        },
        {
          value: 'gpt-image-2',
          label: 'GPT Image 2',
          helper: 'OpenAI',
          provider: 'custom:aiproxy-responses',
          apiMode: 'image_generation',
          category: 'image',
          capabilities: ['image_generation'],
          inputModalities: ['text', 'image'],
          outputModalities: ['image'],
        },
      ],
    })
    const settingCalls: Array<[string, string]> = []

    const view = render(
      <AgentConfigForm
        blueprint={{ ...createBlueprint(), model: 'gpt-5.4-vision' }}
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

    expect(screen.getAllByText('多模态模型').length).toBeGreaterThan(0)
    expect(screen.getByText('生图模型')).toBeInTheDocument()
    expect(screen.getByText('GPT-5.4 Vision')).toBeInTheDocument()
    expect(screen.queryByText('GPT Image 2')).not.toBeInTheDocument()
    expect(screen.getAllByText('输入:图像').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /生图模型/ }))
    expect(settingCalls).toContainEqual(['model', ''])
    expect(settingCalls).toContainEqual(['provider', ''])
    expect(screen.getByText('GPT Image 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /GPT Image 2/ }))
    expect(settingCalls).toContainEqual(['model', 'gpt-image-2'])
    expect(settingCalls).toContainEqual(['provider', 'custom:aiproxy-responses'])
    view.rerender(
      <AgentConfigForm
        blueprint={{ ...createBlueprint(), model: 'gpt-image-2' }}
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
    expect(screen.getByText('GPT Image 2')).toBeInTheDocument()
    expect(screen.getByText('输出:图像')).toBeInTheDocument()
  })

  it('only renders the catalog options passed from the current regional template snapshot', () => {
    const template = createTemplateFixture({
      modelOptions: [
        {
          value: 'glm-4.6',
          label: 'GLM-4.6',
          helper: 'GLM',
          provider: 'custom:aiproxy-chat',
          apiMode: 'chat_completions',
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

    expect(screen.getByText('GLM-4.6')).toBeInTheDocument()
    expect(screen.queryByText('GPT-5.4 Mini')).not.toBeInTheDocument()
  })
})
