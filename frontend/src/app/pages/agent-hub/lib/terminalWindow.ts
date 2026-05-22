import type { AgentListItem } from '../../../../domains/agents/types'
import { AGENTHUB_CONSOLE_APP_KEY, openAgentConsoleDesktopWindow } from './consoleWindow'

export const AGENTHUB_TERMINAL_APP_KEY = AGENTHUB_CONSOLE_APP_KEY

export const openAgentTerminalDesktopWindow = async (item: AgentListItem) =>
  openAgentConsoleDesktopWindow(item)

export const openCurrentAgentHubTerminalWindow = async (item: AgentListItem) =>
  openAgentConsoleDesktopWindow(item)
