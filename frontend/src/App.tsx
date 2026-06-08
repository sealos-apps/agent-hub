import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AgentCreatePage } from './app/pages/agent-hub/AgentCreatePage'
import { AgentConsoleWindowPage } from './app/pages/agent-hub/AgentConsoleWindowPage'
import { AgentConsoleLaunchBridge } from './app/pages/agent-hub/AgentConsoleLaunchBridge'
import { AgentsListPage } from './app/pages/agent-hub/AgentsListPage'
import { AgentHubControllerProvider } from './app/pages/agent-hub/hooks/AgentHubControllerProvider'
import { AgentTemplateSelectPage } from './app/pages/agent-hub/AgentTemplateSelectPage'
import { I18nProvider } from './i18n'

export default function App() {
  return (
    <I18nProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <AgentHubControllerProvider>
          <AgentConsoleLaunchBridge />
          <Routes>
            <Route element={<Navigate replace to="/agents" />} path="/" />
            <Route element={<AgentsListPage />} path="/agents" />
            <Route element={<AgentTemplateSelectPage />} path="/agents/templates" />
            <Route element={<AgentCreatePage />} path="/agents/create" />
            <Route element={<AgentConsoleWindowPage />} path="/console" />
            <Route element={<Navigate replace to="/agents" />} path="*" />
          </Routes>
        </AgentHubControllerProvider>
      </BrowserRouter>
    </I18nProvider>
  )
}
