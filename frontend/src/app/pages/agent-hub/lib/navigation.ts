import type { AgentListItem } from '../../../../domains/agents/types'

export type AgentDetailRouteSource = 'list' | 'create'

export interface AgentDetailRouteState {
  agent?: AgentListItem | null
  source: AgentDetailRouteSource
}

export const buildAgentDetailRouteState = (
  agent: AgentListItem | null,
  source: AgentDetailRouteSource,
): AgentDetailRouteState => ({
  agent,
  source,
})
