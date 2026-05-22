import { performance } from 'node:perf_hooks'
import {
  applyTerminalOutputBackpressure,
  terminalOutputQueueCharLimit,
} from '../src/components/business/terminal/terminalOutputScheduler'
import {
  applyAutoExpandChain,
  buildExplorerPathChain,
} from '../src/app/pages/agent-hub/lib/consoleExplorerHelpers'
import { __agentFilesTestables } from '../src/app/pages/agent-hub/hooks/useAgentFiles'

type Metric = {
  scenario: string
  sampleCount: number
  averageUs: number
  p95Us: number
}

const toUs = (valueMs: number) => Math.round(valueMs * 1000 * 1000) / 1000

const percentile = (values: number[], ratio: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
  return sorted[index] || 0
}

const benchmarkExplorerAutoExpand = (): Metric => {
  const chain = buildExplorerPathChain('/opt/workspaces/ns-demo/project-alpha/src/components/console/deep/node')
  const samples: number[] = []

  for (let i = 0; i < 3000; i += 1) {
    const base: Record<string, boolean> = {}
    const collapsed = i % 3 === 0 ? new Set<string>(['/opt/workspaces']) : new Set<string>()
    const start = performance.now()
    applyAutoExpandChain(base, chain, collapsed)
    samples.push(performance.now() - start)
  }

  const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length
  return {
    scenario: '资源树自动展开链路',
    sampleCount: samples.length,
    averageUs: toUs(averageMs),
    p95Us: toUs(percentile(samples, 0.95)),
  }
}

const benchmarkFilesReadyGate = async (): Promise<Metric> => {
  const samples: number[] = []

  for (let i = 0; i < 400; i += 1) {
    const gate = __agentFilesTestables.createReadyGate()
    const delay = 4 + (i % 5)
    const start = performance.now()
    setTimeout(() => gate.resolve(), delay)
    await gate.promise
    samples.push(performance.now() - start)
  }

  const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length
  return {
    scenario: '文件 ready gate 唤醒',
    sampleCount: samples.length,
    averageUs: toUs(averageMs),
    p95Us: toUs(percentile(samples, 0.95)),
  }
}

const benchmarkTerminalBackpressure = (): Metric => {
  const chunk = 'x'.repeat(4096)
  const samples: number[] = []
  const iterations = 3000

  const state = {
    queue: [] as string[],
    head: 0,
    queuedChars: 0,
    droppedNoticeQueued: false,
  }

  for (let i = 0; i < iterations; i += 1) {
    const start = performance.now()
    applyTerminalOutputBackpressure(state, chunk)
    samples.push(performance.now() - start)
  }

  if (state.queuedChars > terminalOutputQueueCharLimit) {
    throw new Error(
      `terminal queue char limit exceeded: ${state.queuedChars} > ${terminalOutputQueueCharLimit}`,
    )
  }

  const averageMs = samples.reduce((sum, value) => sum + value, 0) / samples.length
  return {
    scenario: '终端背压写入',
    sampleCount: samples.length,
    averageUs: toUs(averageMs),
    p95Us: toUs(percentile(samples, 0.95)),
  }
}

const run = async () => {
  const metrics: Metric[] = [
    benchmarkExplorerAutoExpand(),
    await benchmarkFilesReadyGate(),
    benchmarkTerminalBackpressure(),
  ]

  const payload = {
    generatedAt: new Date().toISOString(),
    metrics,
    reconnectPolicy: {
      maxReconnectAttempts: __agentFilesTestables.maxReconnectAttempts,
      reconnectDelayScheduleMs: __agentFilesTestables.reconnectDelaySchedule,
    },
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(1)
})
