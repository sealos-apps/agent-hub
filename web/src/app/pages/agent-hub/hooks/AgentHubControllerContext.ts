import { createContext, useContext } from 'react'
import type { useAgentHubController } from './useAgentHubController'

type AgentHubControllerValue = ReturnType<typeof useAgentHubController>

export const AgentHubControllerContext = createContext<AgentHubControllerValue | null>(null)

export function useAgentHub() {
  const controller = useContext(AgentHubControllerContext)

  if (!controller) {
    throw new Error('useAgentHub must be used within AgentHubControllerProvider')
  }

  return controller
}
