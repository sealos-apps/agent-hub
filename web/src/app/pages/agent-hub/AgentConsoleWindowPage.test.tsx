import { describe, expect, it } from 'vitest'
import {
  applyAutoExpandChain,
  buildExplorerPathChain,
  isTrustedDesktopMessageOrigin,
} from './lib/consoleExplorerHelpers'
import { createInitialConsoleTabs, initialConsoleTabId } from './lib/consoleTabs'

describe('AgentConsoleWindowPage helpers', () => {
  it('builds path chain from working directory', () => {
    expect(buildExplorerPathChain('/opt/data/workspace')).toEqual([
      '/',
      '/opt',
      '/opt/data',
      '/opt/data/workspace',
    ])
    expect(buildExplorerPathChain('/')).toEqual(['/'])
  })

  it('respects manual collapsed paths when auto expanding', () => {
    const current = {
      '/': true,
      '/opt': false,
    }
    const chain = ['/', '/opt', '/opt/data', '/opt/data/workspace']
    const collapsed = new Set<string>(['/opt'])

    const next = applyAutoExpandChain(current, chain, collapsed)

    expect(next['/']).toBe(true)
    expect(next['/opt']).toBe(false)
    expect(next['/opt/data']).toBe(true)
    expect(next['/opt/data/workspace']).toBe(true)
  })

  it('accepts same-origin and localhost desktop message origin', () => {
    expect(isTrustedDesktopMessageOrigin('https://usw-1.sealos.io', 'https://usw-1.sealos.io')).toBe(true)
    expect(isTrustedDesktopMessageOrigin('http://localhost:3000', 'https://usw-1.sealos.io')).toBe(true)
    expect(isTrustedDesktopMessageOrigin('https://example.com', 'https://usw-1.sealos.io')).toBe(false)
  })

  it('creates a fresh home-only tab list for agent switches', () => {
    const first = createInitialConsoleTabs()
    const second = createInitialConsoleTabs()

    first.push({ id: 'file-1', type: 'home', title: 'mutated' })

    expect(second).toEqual([
      { id: initialConsoleTabId, type: 'home', title: '控制台首页' },
    ])
  })
})
