import { RESOURCE_PRESETS, resolveResourcePreset } from '../../../../domains/agents/templates'
import type { AgentBlueprint } from '../../../../domains/agents/types'

export const updateBlueprintField = (
  current: AgentBlueprint,
  field: keyof AgentBlueprint,
  value: string,
): AgentBlueprint => {
  const next = { ...current, [field]: value }

  if (field === 'cpu' || field === 'memory') {
    const resolvedPreset = resolveResourcePreset(
      field === 'cpu' ? value : next.cpu,
      field === 'memory' ? value : next.memory,
    )
    next.profile = current.profile === 'custom' ? 'custom' : resolvedPreset
  }

  return next
}

export const applyBlueprintPreset = (
  current: AgentBlueprint,
  presetId: AgentBlueprint['profile'],
): AgentBlueprint => {
  const preset = RESOURCE_PRESETS.find((item) => item.id === presetId)
  if (!preset) return current

  if (presetId === 'custom') {
    return {
      ...current,
      profile: 'custom',
    }
  }

  return {
    ...current,
    profile: preset.id,
    cpu: preset.cpu,
    memory: preset.memory,
  }
}
