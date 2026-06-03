import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { AgentConfigForm } from './AgentConfigForm'
import { createTemplateFixture } from '../../../test/agentFixtures'
import {
  formatModelOptionLabel,
  getModelCapabilityBadges,
  normalizeModelTypes,
} from '../../../domains/agents/modelCapabilities'
import { translate } from '../../../i18n'
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
    modelSlots: {},
    hasModelAPIKey: true,
    keySource: 'workspace-aiproxy',
    settingsValues: {},
  }
}

function createManyTextModels(count = 10) {
  return Array.from({ length: count }, (_, index) => ({
    value: `text-model-${index + 1}`,
    label: `Text Model ${index + 1}`,
    helper: 'AI Proxy',
    provider: 'custom:aiproxy-chat',
    apiMode: 'chat_completions',
    category: 'text',
    capabilities: ['reasoning'],
    inputModalities: ['text'],
    outputModalities: ['text'],
  }))
}

function renderManyModelSelect() {
  const textModels = createManyTextModels()
  const template = createTemplateFixture({
    modelTypes: [
      {
        key: 'text',
        label: '普通模型',
        models: textModels,
      },
      {
        key: 'multimodal',
        label: '视觉理解模型',
        models: [
          {
            value: 'vision-model-1',
            label: 'Vision Model 1',
            helper: 'AI Proxy',
            provider: 'custom:aiproxy-responses',
            apiMode: 'codex_responses',
            category: 'multimodal',
            capabilities: ['vision'],
            inputModalities: ['text', 'image'],
            outputModalities: ['text'],
          },
        ],
      },
    ],
    modelOptions: [
      ...textModels,
      {
        value: 'vision-model-1',
        label: 'Vision Model 1',
        helper: 'AI Proxy',
        provider: 'custom:aiproxy-responses',
        apiMode: 'codex_responses',
        category: 'multimodal',
        capabilities: ['vision'],
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
      },
    ],
  })

  return render(
    <AgentConfigForm
      blueprint={{ ...createBlueprint(), model: 'text-model-1' }}
      mode='create'
      onChange={() => {}}
      onChangeSettingField={() => {}}
      onSelectPreset={() => {}}
      template={template}
      workspaceModelBaseURL='https://aiproxy.example.com/v1'
      workspaceModelKeyReady
      workspaceRegion='us'
    />,
  )
}

type TestRect = Pick<
  DOMRect,
  'bottom' | 'height' | 'left' | 'right' | 'top' | 'width' | 'x' | 'y'
>

function mockTriggerRect(rect: Partial<TestRect>) {
  return vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('aria-expanded') !== null || this.querySelector('[aria-expanded]')) {
        return {
          bottom: 480,
          height: 40,
          left: 120,
          right: 520,
          top: 440,
          width: 400,
          x: 120,
          y: 440,
          ...rect,
          toJSON: () => ({}),
        } as DOMRect
      }

      return {
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect
    })
}

describe('AgentConfigForm', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

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

    fireEvent.click(screen.getByRole('button', { name: /GPT-5.4 Mini/ }))
    expect(screen.getAllByText('普通模型').length).toBeGreaterThan(0)
    expect(screen.getAllByText('GPT-5.4 Mini').length).toBeGreaterThan(0)
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

    fireEvent.click(screen.getByRole('button', { name: /GPT-5.4 Vision/ }))
    expect(screen.getAllByText('多模态模型').length).toBeGreaterThan(0)
    expect(screen.getByText('生图模型')).toBeInTheDocument()
    expect(screen.getAllByText('GPT-5.4 Vision').length).toBeGreaterThan(0)
    expect(screen.queryByText('GPT Image 2')).not.toBeInTheDocument()
    expect(screen.getAllByText('输入:图像').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /生图模型/ }))
    expect(screen.getAllByText('GPT Image 2').length).toBeGreaterThan(0)
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
    fireEvent.click(screen.getByRole('button', { name: /GPT Image 2/ }))
    expect(screen.getByText('输出:图像')).toBeInTheDocument()
  })

  it('keeps custom model type labels while localizing default labels', () => {
    const template = createTemplateFixture({
      modelTypes: [
        {
          key: 'text',
          label: '普通模型',
          models: [
            {
              value: 'gpt-5.4-mini',
              label: 'GPT-5.4 Mini',
              helper: 'OpenAI',
              provider: 'custom:aiproxy-chat',
              apiMode: 'chat_completions',
              category: 'text',
            },
          ],
        },
        {
          key: 'image',
          label: '视觉创作模型',
          models: [
            {
              value: 'gpt-image-2',
              label: 'GPT Image 2',
              helper: 'OpenAI',
              provider: 'custom:aiproxy-chat',
              apiMode: 'image_generation',
              category: 'image',
            },
          ],
        },
      ],
      modelOptions: [
        {
          value: 'gpt-5.4-mini',
          label: 'GPT-5.4 Mini',
          helper: 'OpenAI',
          provider: 'custom:aiproxy-chat',
          apiMode: 'chat_completions',
          category: 'text',
        },
        {
          value: 'gpt-image-2',
          label: 'GPT Image 2',
          helper: 'OpenAI',
          provider: 'custom:aiproxy-chat',
          apiMode: 'image_generation',
          category: 'image',
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
        workspaceRegion='us'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /GPT-5.4 Mini/ }))
    expect(screen.getAllByText('普通模型').length).toBeGreaterThan(0)
    expect(screen.getByText('视觉创作模型')).toBeInTheDocument()
  })

  it('localizes default model type labels in en-US without replacing custom labels', () => {
    const modelTypes = normalizeModelTypes(
      [
        {
          key: 'text',
          label: '普通模型',
          models: [
            {
              value: 'gpt-5.4-mini',
              label: 'GPT-5.4 Mini',
              helper: 'OpenAI',
              provider: 'custom:aiproxy-chat',
              apiMode: 'chat_completions',
              category: 'text',
            },
          ],
        },
        {
          key: 'image',
          label: '视觉创作模型',
          models: [
            {
              value: 'gpt-image-2',
              label: 'GPT Image 2',
              helper: 'OpenAI',
              provider: 'custom:aiproxy-chat',
              apiMode: 'image_generation',
              category: 'image',
            },
          ],
        },
      ],
      [],
      (key, values) => translate('en-US', key, values),
    )

    expect(modelTypes[0]?.label).toBe('Text Model')
    expect(modelTypes[1]?.label).toBe('视觉创作模型')
  })

  it('uses English default model type labels when no translator is provided', () => {
    const modelTypes = normalizeModelTypes(
      [
        {
          key: 'text',
          label: '普通模型',
          models: [
            {
              value: 'gpt-5.4-mini',
              label: 'GPT-5.4 Mini',
              helper: 'OpenAI',
              provider: 'custom:aiproxy-chat',
              apiMode: 'chat_completions',
              category: 'text',
            },
          ],
        },
      ],
      [],
    )

    expect(modelTypes[0]?.label).toBe('Text Model')
  })

  it('keeps English model capability badges when no translator is provided', () => {
    expect(
      formatModelOptionLabel({
        value: 'gpt-5.4-mini',
        label: 'GPT-5.4 Mini',
        helper: 'OpenAI',
        provider: 'custom:aiproxy-chat',
        apiMode: 'chat_completions',
        capabilities: ['reasoning', 'code'],
        inputModalities: ['text'],
        outputModalities: ['text'],
      }),
    ).toBe('GPT-5.4 Mini · Reasoning / Code')
    expect(
      getModelCapabilityBadges({
        value: 'gpt-5.4-vision',
        label: 'GPT-5.4 Vision',
        helper: 'OpenAI',
        provider: 'custom:aiproxy-chat',
        apiMode: 'chat_completions',
        capabilities: ['vision'],
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
      }),
    ).toEqual(['Vision', 'Input:Text', 'Input:Image', 'Output:Text'])
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

    fireEvent.click(screen.getByRole('button', { name: /请选择模型/ }))
    expect(screen.getByText('GLM-4.6')).toBeInTheDocument()
    expect(screen.queryByText('GPT-5.4 Mini')).not.toBeInTheDocument()
  })

  it('renders model slots and updates only the selected slot', () => {
    const template = createTemplateFixture({
      modelIntegration: {
        type: 'ai-agent-switch',
        client: 'hermes-agent',
        provider: {
          id: 'aiproxy',
          name: { zh: 'AI Proxy' },
          baseURL: { source: 'system.aiProxyModelBaseURL' },
          apiKeyEnv: 'ANTHROPIC_API_KEY',
        },
        slots: [
          {
            key: 'main',
            label: { zh: '主模型', en: 'Main model' },
            required: true,
            mutable: true,
            defaultModels: { us: 'gpt-5.4-mini' },
            modelTypes: ['text'],
          },
          {
            key: 'vision',
            label: { zh: '视觉模型', en: 'Vision model' },
            required: false,
            mutable: true,
            modelTypes: ['multimodal'],
          },
        ],
      },
      modelTypes: [
        {
          key: 'text',
          label: '普通模型',
          models: [
            {
              value: 'gpt-5.4-mini',
              label: 'GPT-5.4 Mini',
              helper: 'OpenAI',
              provider: 'custom:aiproxy-responses',
              apiMode: 'codex_responses',
              category: 'text',
            },
          ],
        },
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
              capabilities: ['vision'],
              inputModalities: ['text', 'image'],
              outputModalities: ['text'],
            },
          ],
        },
      ],
      modelOptions: [
        {
          value: 'gpt-5.4-mini',
          label: 'GPT-5.4 Mini',
          helper: 'OpenAI',
          provider: 'custom:aiproxy-responses',
          apiMode: 'codex_responses',
          category: 'text',
        },
        {
          value: 'gpt-5.4-vision',
          label: 'GPT-5.4 Vision',
          helper: 'OpenAI',
          provider: 'custom:aiproxy-responses',
          apiMode: 'codex_responses',
          category: 'multimodal',
        },
      ],
    })
    const changeCalls: Array<[keyof AgentBlueprint, AgentBlueprint[keyof AgentBlueprint]]> = []

    render(
      <AgentConfigForm
        blueprint={{
          ...createBlueprint(),
          modelSlots: { main: 'gpt-5.4-mini' },
        }}
        mode='create'
        onChange={(field, value) => changeCalls.push([field, value])}
        onChangeSettingField={() => {}}
        onSelectPreset={() => {}}
        template={template}
        workspaceModelBaseURL='https://aiproxy.example.com/v1'
        workspaceModelKeyReady
        workspaceRegion='us'
      />,
    )

    expect(screen.getByText('主模型')).toBeInTheDocument()
    expect(screen.getByText('视觉模型')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /请选择模型/ }))
    expect(screen.getByText('GPT-5.4 Vision')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /GPT-5.4 Vision/ }))

    expect(changeCalls).toContainEqual([
      'modelSlots',
      { main: 'gpt-5.4-mini', vision: 'gpt-5.4-vision' },
    ])
  })

  it('does not render model type navigation when there is only one model type', () => {
    const template = createTemplateFixture({
      modelTypes: [
        {
          key: 'multimodal',
          label: '视觉理解模型',
          models: [
            {
              value: 'vision-model-1',
              label: 'Vision Model 1',
              helper: 'AI Proxy',
              provider: 'custom:aiproxy-responses',
              apiMode: 'codex_responses',
              category: 'multimodal',
              capabilities: ['vision'],
              inputModalities: ['text', 'image'],
              outputModalities: ['text'],
            },
          ],
        },
      ],
      modelOptions: [
        {
          value: 'vision-model-1',
          label: 'Vision Model 1',
          helper: 'AI Proxy',
          provider: 'custom:aiproxy-responses',
          apiMode: 'codex_responses',
          category: 'multimodal',
          capabilities: ['vision'],
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
        },
      ],
    })

    render(
      <AgentConfigForm
        blueprint={{ ...createBlueprint(), model: 'vision-model-1' }}
        mode='create'
        onChange={() => {}}
        onChangeSettingField={() => {}}
        onSelectPreset={() => {}}
        template={template}
        workspaceModelBaseURL='https://aiproxy.example.com/v1'
        workspaceModelKeyReady
        workspaceRegion='us'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Vision Model 1/ }))

    expect(screen.getAllByText('视觉理解模型')).toHaveLength(1)
    expect(screen.getByTestId('model-capability-menu')).toHaveClass('overflow-hidden')
  })

  it('keeps the model menu bounded to the viewport and scroll-contained', () => {
    vi.stubGlobal('innerHeight', 540)
    mockTriggerRect({ bottom: 100, top: 60 })

    renderManyModelSelect()

    fireEvent.click(screen.getByRole('button', { name: /Text Model 1/ }))

    const menu = screen.getByTestId('model-capability-menu')
    expect(menu).toHaveStyle({
      maxHeight: '408px',
      overscrollBehavior: 'contain',
    })
    expect(menu).toHaveClass('overflow-hidden')
    expect(menu).not.toHaveClass('overflow-y-auto')
    expect(screen.getByTestId('model-capability-model-list')).toHaveClass(
      'overflow-y-auto',
      'overscroll-contain',
    )
  })

  it('opens the model menu upward near the viewport bottom', () => {
    vi.stubGlobal('innerHeight', 540)
    mockTriggerRect({ bottom: 520, top: 480 })

    renderManyModelSelect()

    fireEvent.click(screen.getByRole('button', { name: /Text Model 1/ }))

    expect(screen.getByTestId('model-capability-menu')).toHaveStyle({
      maxHeight: '416px',
      bottom: 'calc(100% + 8px)',
    })
  })

  it('does not recompute menu layout while scrolling inside the model list', () => {
    vi.stubGlobal('innerHeight', 540)
    const getBoundingClientRect = mockTriggerRect({ bottom: 100, top: 60 })

    renderManyModelSelect()

    fireEvent.click(screen.getByRole('button', { name: /Text Model 1/ }))
    const initialCalls = getBoundingClientRect.mock.calls.length

    fireEvent.scroll(screen.getByTestId('model-capability-model-list'))

    expect(getBoundingClientRect).toHaveBeenCalledTimes(initialCalls)
  })

})
