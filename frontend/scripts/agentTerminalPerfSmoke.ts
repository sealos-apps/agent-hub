const target = process.env.AGENT_TERMINAL_PERF_URL || ''

if (!target) {
  console.error('AGENT_TERMINAL_PERF_URL is required')
  process.exit(2)
}

const payload = {
  target,
  mode: 'manual-browser-required',
  reason: 'Playwright is not installed in this workspace; use Browser/DevTools to collect live xterm metrics.',
  collect: {
    firstOutputMs: 'performance mark from navigation start until first .xterm-rows text mutation',
    charsIn5s: 'text length growth inside .xterm-rows over five seconds',
    longTasks: 'PerformanceObserver longtask entries during the five second window',
  },
}

console.log(JSON.stringify(payload, null, 2))
