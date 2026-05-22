import {
  AGENTHUB_CONSOLE_MESSAGE_TYPE,
  AGENTHUB_CONSOLE_ROUTE,
} from './consoleWindow'
import {
  AGENTHUB_TERMINAL_MESSAGE_TYPE,
  AGENTHUB_TERMINAL_ROUTE,
} from './terminalWindow'

type TerminalWindowMessage = {
  type?: string
  agentName?: string
  pathname?: string
  query?: {
    agentName?: string
  }
  messageData?: {
    type?: string
    agentName?: string
  }
}

const readAgentName = (value: unknown) => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export const parseAgentTerminalDesktopMessage = (raw: unknown) => {
  if (!raw || typeof raw !== 'object') return ''

  const direct = raw as TerminalWindowMessage
  const directAgentName = readAgentName(direct.agentName)
  if (
    (direct.type === AGENTHUB_TERMINAL_MESSAGE_TYPE || direct.type === AGENTHUB_CONSOLE_MESSAGE_TYPE) &&
    directAgentName
  ) {
    return directAgentName
  }

  const routeAgentName = readAgentName(direct.query?.agentName)
  if (
    (direct.pathname === AGENTHUB_TERMINAL_ROUTE || direct.pathname === AGENTHUB_CONSOLE_ROUTE) &&
    routeAgentName
  ) {
    return routeAgentName
  }

  const nestedMessageData = direct.messageData
  const nestedAgentName = readAgentName(nestedMessageData?.agentName)
  if (
    (nestedMessageData?.type === AGENTHUB_TERMINAL_MESSAGE_TYPE ||
      nestedMessageData?.type === AGENTHUB_CONSOLE_MESSAGE_TYPE) &&
    nestedAgentName
  ) {
    return nestedAgentName
  }

  const eventBusPayload = (raw as { data?: { eventData?: TerminalWindowMessage } }).data?.eventData
  const eventBusAgentName = readAgentName(eventBusPayload?.agentName)
  if (
    (eventBusPayload?.type === AGENTHUB_TERMINAL_MESSAGE_TYPE ||
      eventBusPayload?.type === AGENTHUB_CONSOLE_MESSAGE_TYPE) &&
    eventBusAgentName
  ) {
    return eventBusAgentName
  }

  const eventBusRouteAgentName = readAgentName(eventBusPayload?.query?.agentName)
  if (
    (eventBusPayload?.pathname === AGENTHUB_TERMINAL_ROUTE ||
      eventBusPayload?.pathname === AGENTHUB_CONSOLE_ROUTE) &&
    eventBusRouteAgentName
  ) {
    return eventBusRouteAgentName
  }

  return ''
}
