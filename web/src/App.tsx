import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AgentCreatePage } from './app/pages/agent-hub/AgentCreatePage'
import { AgentConsoleWindowPage } from './app/pages/agent-hub/AgentConsoleWindowPage'
import { AgentDetailPage } from './app/pages/agent-hub/AgentDetailPage'
import { AgentsListPage } from './app/pages/agent-hub/AgentsListPage'
import { AgentHubControllerProvider } from './app/pages/agent-hub/hooks/AgentHubControllerProvider'
import { AgentTemplateSelectPage } from './app/pages/agent-hub/AgentTemplateSelectPage'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AgentHubControllerProvider>
        <Routes>
          <Route element={<Navigate replace to="/agents" />} path="/" />
          <Route element={<AgentsListPage />} path="/agents" />
          <Route element={<AgentTemplateSelectPage />} path="/agents/templates" />
          <Route element={<AgentCreatePage />} path="/agents/create" />
          <Route element={<AgentDetailPage />} path="/agents/:agentName" />
          <Route element={<AgentConsoleWindowPage />} path="/desktop/console" />
          <Route element={<AgentConsoleWindowPage />} path="/desktop/terminal" />
          <Route element={<Navigate replace to="/agents" />} path="*" />
        </Routes>
      </AgentHubControllerProvider>
    </BrowserRouter>
  )
}
