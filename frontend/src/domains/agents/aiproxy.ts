import type { AgentTemplateDefinition, TemplateModelOption } from './types'

export interface AIProxyProviderProfile {
  id: string
  name: string
  apiMode: 'chat_completions' | 'codex_responses' | 'anthropic_messages'
  label: string
}

export const AIPROXY_PROVIDER_PROFILES: Record<string, AIProxyProviderProfile> = {
  'custom:aiproxy-chat': {
    id: 'custom:aiproxy-chat',
    name: 'aiproxy-chat',
    apiMode: 'chat_completions',
    label: 'AI-Proxy · Chat Completions',
  },
  'custom:aiproxy-responses': {
    id: 'custom:aiproxy-responses',
    name: 'aiproxy-responses',
    apiMode: 'codex_responses',
    label: 'AI-Proxy · Responses API',
  },
  'custom:aiproxy-anthropic': {
    id: 'custom:aiproxy-anthropic',
    name: 'aiproxy-anthropic',
    apiMode: 'anthropic_messages',
    label: 'AI-Proxy · Anthropic Messages',
  },
}

export const isManagedAIProxyProvider = (provider = ''): boolean =>
  String(provider || '').trim().toLowerCase() in AIPROXY_PROVIDER_PROFILES

export const resolveAIProxyProviderProfile = (provider = ''): AIProxyProviderProfile | null =>
  AIPROXY_PROVIDER_PROFILES[String(provider || '').trim().toLowerCase()] || null

export const resolveModelOptionProviderProfile = (option?: TemplateModelOption | null) =>
  resolveAIProxyProviderProfile(option?.provider || '')

export const formatModelProviderLabel = (provider = '') =>
  resolveAIProxyProviderProfile(provider)?.label || provider || '--'

export const findTemplateModelOption = (
  template: Pick<AgentTemplateDefinition, 'modelOptions'> | null | undefined,
  model = '',
) => template?.modelOptions.find((option) => option.value === model) || null
