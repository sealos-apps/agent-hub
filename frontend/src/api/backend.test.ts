import {
  createAgentPreview,
  deleteAgentPreview,
  heartbeatAgentPreview,
} from './backend'
import type { ClusterContext } from '../domains/agents/types'

const clusterContext: ClusterContext = {
  activeAuthSource: 'kubeconfig',
  activeAuthToken: 'apiVersion: v1',
  agentLabel: 'agent-hub',
  authCandidates: [{ source: 'kubeconfig', token: 'apiVersion: v1' }],
  kubeconfig: 'apiVersion: v1',
  namespace: 'ns-test',
  operator: 'user-test',
  server: 'https://k8s.example.com',
  sessionToken: '',
  token: '',
}

describe('agent preview backend api', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          id: 'p_test',
          port: 3000,
          url: '/__preview/p_test/',
        },
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    ) as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('creates an agent preview with the target port', async () => {
    const response = await createAgentPreview('demo-agent', 3000, clusterContext)

    expect(response).toEqual({
      id: 'p_test',
      port: 3000,
      url: '/__preview/p_test/',
    })
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/agents/demo-agent/previews'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ port: 3000 }),
      }),
    )
  })

  it('uses a Chinese error message for empty preview creation responses', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({
        code: 0,
        message: 'ok',
      }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    ) as typeof fetch

    await expect(createAgentPreview('demo-agent', 3000, clusterContext)).rejects.toThrow('Preview response is empty.')
  })

  it('heartbeats and deletes preview sessions', async () => {
    await heartbeatAgentPreview('demo-agent', 'p_test', clusterContext)
    await deleteAgentPreview('demo-agent', 'p_test', clusterContext)

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/agents/demo-agent/previews/p_test/heartbeat'),
      expect.objectContaining({ method: 'POST' }),
    )
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/agents/demo-agent/previews/p_test'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })
})
