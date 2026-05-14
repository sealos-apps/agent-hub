import type { AgentTemplateDefinition, TemplateModelOption } from './types'

export interface AIProxyProviderProfile {
  id: string
  name: string
  apiMode: string
  label: string
}

export const AIPROXY_PROVIDER_PROFILES: Record<string, AIProxyProviderProfile> = {
  aiproxy: {
    id: 'aiproxy',
    name: 'aiproxy',
    apiMode: '',
    label: 'AI Proxy',
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
