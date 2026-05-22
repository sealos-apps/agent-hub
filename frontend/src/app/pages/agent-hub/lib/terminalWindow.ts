import type { AgentListItem } from '../../../../domains/agents/types'
import { AGENTHUB_CONSOLE_APP_KEY, openAgentConsoleDesktopWindow } from './consoleWindow'

// Backward-compatible aliases for existing callers.
export const AGENTHUB_TERMINAL_APP_KEY = AGENTHUB_CONSOLE_APP_KEY
export const AGENTHUB_TERMINAL_ROUTE = '/desktop/terminal'
export const AGENTHUB_TERMINAL_MESSAGE_TYPE = 'AgentHubTerminalWindow'

export const openAgentTerminalDesktopWindow = async (item: AgentListItem) =>
  openAgentConsoleDesktopWindow(item)

export const openCurrentAgentHubTerminalWindow = async (item: AgentListItem) =>
  openAgentConsoleDesktopWindow(item)
