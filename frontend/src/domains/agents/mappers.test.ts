import { describe, expect, it } from 'vitest'

import { createTemplateFixture } from '../../test/agentFixtures'
import { mapBackendAgentsToListItems } from './mappers'
import type { AgentContract } from './types'

describe('mapBackendAgentsToListItems', () => {
  it('keeps console unavailable when backend marks paused runtime access disabled', () => {
    const template = createTemplateFixture()
    const contract: AgentContract = {
      core: {
        name: 'demo-agent',
        aliasName: 'demo-agent',
        templateId: template.id,
        namespace: 'ns-test',
        status: 'Paused',
        statusText: 'Paused',
        ready: true,
      },
      workspaces: [],
      access: [
        { key: 'terminal', label: 'Terminal', enabled: false, status: 'paused', reason: 'agent_paused' },
        { key: 'files', label: 'Files', enabled: false, status: 'paused', reason: 'agent_paused' },
      ],
      runtime: {
        cpu: '1',
        memory: '2Gi',
        storage: '10Gi',
        workingDir: '/workspace',
        user: 'hermes',
        hasModelAPIKey: false,
      },
      settings: {
        runtime: [],
        agent: [],
      },
      actions: [
        { key: 'open-terminal', label: 'Terminal', enabled: false, reason: 'agent_paused' },
        { key: 'open-files', label: 'Files', enabled: false, reason: 'agent_paused' },
      ],
    }
    const [item] = mapBackendAgentsToListItems([
      contract,
    ], [template], {
      cluster: 'test',
      namespace: 'ns-test',
      kc: 'test-kc',
      server: 'https://kubernetes.example.com',
      operator: 'Sealos',
      updatedAt: '2026-06-12T00:00:00Z',
    })

    expect(item.status).toBe('stopped')
    expect(item.terminalAvailable).toBe(false)
    expect(item.terminalDisabledReason).toBe('agent_paused')
  })

  it('keeps runtime entries unavailable when a paused contract still carries enabled access flags', () => {
    const template = createTemplateFixture()
    const contract: AgentContract = {
      core: {
        name: 'demo-agent',
        aliasName: 'demo-agent',
        templateId: template.id,
        namespace: 'ns-test',
        status: 'Paused',
        statusText: 'Paused',
        ready: true,
      },
      workspaces: [],
      access: [
        { key: 'terminal', label: 'Terminal', enabled: true, status: 'ready' },
        { key: 'web-ui', label: 'Web UI', enabled: true, status: 'ready', url: 'https://demo.example.com/' },
      ],
      runtime: {
        cpu: '1',
        memory: '2Gi',
        storage: '10Gi',
        workingDir: '/workspace',
        user: 'hermes',
        hasModelAPIKey: false,
      },
      settings: {
        runtime: [],
        agent: [],
      },
      actions: [
        { key: 'open-terminal', label: 'Terminal', enabled: true },
      ],
    }

    const [item] = mapBackendAgentsToListItems([contract], [template], {
      cluster: 'test',
      namespace: 'ns-test',
      kc: 'test-kc',
      server: 'https://kubernetes.example.com',
      operator: 'Sealos',
      updatedAt: '2026-06-12T00:00:00Z',
    })

    expect(item.status).toBe('stopped')
    expect(item.terminalAvailable).toBe(false)
    expect(item.webUIAvailable).toBe(false)
    expect(item.webUIAccess?.enabled).toBe(false)
    expect(item.terminalDisabledReason).toBe('agent_paused')
    expect(item.webUIAccess?.reason).toBe('agent_paused')
  })
})
