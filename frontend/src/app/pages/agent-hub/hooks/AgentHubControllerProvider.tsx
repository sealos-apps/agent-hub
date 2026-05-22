import type { ReactNode } from 'react'
import { AgentHubControllerContext } from './AgentHubControllerContext'
import { useAgentHubController } from './useAgentHubController'

export function AgentHubControllerProvider({ children }: { children: ReactNode }) {
  const controller = useAgentHubController()

  return (
    <AgentHubControllerContext.Provider value={controller}>
      {children}
    </AgentHubControllerContext.Provider>
  )
}
