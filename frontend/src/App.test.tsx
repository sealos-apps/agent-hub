import { render, screen, waitFor } from '@testing-library/react'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const sealosEventListeners = new Map<string, (data: unknown) => void>()

vi.mock('./sealosSdk', () => ({
  addSealosAppEventListener: vi.fn((eventName: string, handler: (data: unknown) => void) => {
    sealosEventListeners.set(eventName, handler)
    return () => sealosEventListeners.delete(eventName)
  }),
  getSealosLanguage: vi.fn(() => Promise.resolve('zh-CN')),
}))

vi.mock('./app/pages/agent-hub/AgentsListPage', () => ({
  AgentsListPage: () => <div>agents list page</div>,
}))

vi.mock('./app/pages/agent-hub/AgentTemplateSelectPage', () => ({
  AgentTemplateSelectPage: () => <div>template select page</div>,
}))

vi.mock('./app/pages/agent-hub/AgentCreatePage', () => ({
  AgentCreatePage: () => <div>agent create page</div>,
}))

vi.mock('./app/pages/agent-hub/AgentConsoleWindowPage', () => ({
  AgentConsoleWindowPage: () => <div>console window page</div>,
}))

describe('App routes', () => {
  beforeEach(() => {
    sealosEventListeners.clear()
  })

  it('uses /console as the Agent console route', () => {
    window.history.replaceState({}, '', '/console?agentName=ympp868f')

    render(<App />)

    expect(screen.getByText('console window page')).toBeInTheDocument()
  })

  it('does not keep the old /desktop console route', async () => {
    window.history.replaceState({}, '', '/desktop/console?agentName=ympp868f')

    render(<App />)

    expect(await screen.findByText('agents list page')).toBeInTheDocument()
    expect(screen.queryByText('console window page')).not.toBeInTheDocument()
  })

  it('does not keep the old /terminal console route', async () => {
    window.history.replaceState({}, '', '/terminal?agentName=ympp868f')

    render(<App />)

    expect(await screen.findByText('agents list page')).toBeInTheDocument()
    expect(screen.queryByText('console window page')).not.toBeInTheDocument()
  })

  it('opens the console route from Sealos desktop launch events', async () => {
    window.history.replaceState({}, '', '/agents')

    render(<App />)

    expect(screen.getByText('agents list page')).toBeInTheDocument()
    await waitFor(() => {
      expect(sealosEventListeners.has('openDesktopApp')).toBe(true)
    })

    act(() => {
      sealosEventListeners.get('openDesktopApp')?.({
        pathname: '/console',
        query: { agentName: 'ympp868f' },
      })
    })

    expect(await screen.findByText('console window page')).toBeInTheDocument()
  })
})
