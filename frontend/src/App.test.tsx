import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

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
})
