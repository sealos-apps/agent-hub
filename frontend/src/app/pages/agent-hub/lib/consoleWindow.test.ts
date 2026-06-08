import { describe, expect, it, vi } from 'vitest'
import type { AgentListItem } from '../../../../domains/agents/types'
import { openSealosDesktopApp } from '../../../../sealosSdk'
import {
  AGENTHUB_CONSOLE_APP_KEY,
  AGENTHUB_CONSOLE_ROUTE,
  openAgentConsoleDesktopWindow,
} from './consoleWindow'

vi.mock('../../../../sealosSdk', () => ({
  openSealosDesktopApp: vi.fn(),
}))

const agent = {
  aliasName: 'Hermes Agent',
  name: 'gnd70bta',
} as AgentListItem

describe('consoleWindow desktop app launch', () => {
  it('uses the Sealos desktop app key by default', () => {
    expect(AGENTHUB_CONSOLE_APP_KEY).toBe('user-agenthub-console')
  })

  it('opens the console route in the console desktop app', async () => {
    await openAgentConsoleDesktopWindow(agent)

    expect(openSealosDesktopApp).toHaveBeenCalledWith({
      appKey: 'user-agenthub-console',
      pathname: AGENTHUB_CONSOLE_ROUTE,
      query: {
        agentName: 'gnd70bta',
      },
      messageData: {
        type: 'AgentHubConsoleWindow',
        agentName: 'gnd70bta',
        aliasName: 'Hermes Agent',
      },
      appSize: 'normal',
    })
  })
})
