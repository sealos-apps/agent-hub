import { RESOURCE_PRESETS, resolveResourcePreset } from '../../../../domains/agents/templates'
import type { AgentBlueprint } from '../../../../domains/agents/types'

export function updateBlueprintField<K extends keyof AgentBlueprint>(
  current: AgentBlueprint,
  field: K,
  value: AgentBlueprint[K],
): AgentBlueprint {
  const next = { ...current, [field]: value }

  if (field === 'cpu' || field === 'memory') {
    const textValue = String(value || "")
    const resolvedPreset = resolveResourcePreset(
      field === 'cpu' ? textValue : next.cpu,
      field === 'memory' ? textValue : next.memory,
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
