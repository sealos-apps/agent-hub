export const terminalOutputCharsPerFlush = 24 * 1024
export const terminalOutputBurstCharsPerFlush = 64 * 1024
export const terminalOutputBurstThreshold = 128 * 1024
export const terminalOutputQueueCharLimit = 1024 * 1024
export const terminalOutputDropNotice = '\r\n\x1b[33m[输出过快，已跳过部分历史内容以保持流畅]\x1b[0m\r\n'

type TerminalOutputBackpressureState = {
  queue: string[]
  head: number
  queuedChars: number
  droppedNoticeQueued: boolean
}

export const resolveTerminalFlushMode = (queuedChars: number): 'normal' | 'burst' =>
  queuedChars > terminalOutputBurstThreshold ? 'burst' : 'normal'

const trimQueueToCharLimit = (state: TerminalOutputBackpressureState) => {
  while (state.queuedChars > terminalOutputQueueCharLimit && state.head < state.queue.length) {
    const removed = state.queue[state.head] || ''
    state.queuedChars -= removed.length
    state.head += 1
  }

  if (state.head > 0 && (state.head >= 1024 || state.head * 2 >= state.queue.length)) {
    state.queue = state.queue.slice(state.head)
    state.head = 0
  }
}

export const applyTerminalOutputBackpressure = (
  state: TerminalOutputBackpressureState,
  incomingChunk: string,
): TerminalOutputBackpressureState => {
  if (!incomingChunk) {
    return state
  }

  state.queue.push(incomingChunk)
  state.queuedChars += incomingChunk.length

  if (state.queuedChars <= terminalOutputQueueCharLimit) {
    return state
  }

  trimQueueToCharLimit(state)

  if (!state.droppedNoticeQueued) {
    state.queue.push(terminalOutputDropNotice)
    state.queuedChars += terminalOutputDropNotice.length
    state.droppedNoticeQueued = true
    trimQueueToCharLimit(state)
  }

  return state
}
