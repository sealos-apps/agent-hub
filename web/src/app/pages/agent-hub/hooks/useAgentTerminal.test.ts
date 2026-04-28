import {
  applyTerminalOutputBackpressure,
  resolveTerminalFlushMode,
  terminalOutputQueueCharLimit,
} from '../../../../components/business/terminal/terminalOutputScheduler'

describe('terminal output scheduling', () => {
  it('switches to burst mode when queued chars are high', () => {
    expect(resolveTerminalFlushMode(1)).toBe('normal')
    expect(resolveTerminalFlushMode(128 * 1024)).toBe('normal')
    expect(resolveTerminalFlushMode(128 * 1024 + 1)).toBe('burst')
  })

  it('enforces queue pressure and emits dropped warning only once', () => {
    const state = {
      queue: [] as string[],
      head: 0,
      queuedChars: 0,
      droppedNoticeQueued: false,
    }

    applyTerminalOutputBackpressure(state, 'a'.repeat(900 * 1024))
    expect(state.droppedNoticeQueued).toBe(false)

    applyTerminalOutputBackpressure(state, 'b'.repeat(900 * 1024))
    expect(state.droppedNoticeQueued).toBe(true)
    const firstNoticeCount = state.queue.filter((chunk) =>
      chunk.includes('已跳过部分历史内容'),
    ).length
    expect(firstNoticeCount).toBe(1)

    applyTerminalOutputBackpressure(state, 'c'.repeat(900 * 1024))
    const secondNoticeCount = state.queue.filter((chunk) =>
      chunk.includes('已跳过部分历史内容'),
    ).length
    expect(secondNoticeCount).toBe(1)
    expect(state.queuedChars).toBeLessThanOrEqual(terminalOutputQueueCharLimit)
  })
})
