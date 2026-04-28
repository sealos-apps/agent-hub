import { createClusterContext } from './cluster'

const kubeconfig = `
apiVersion: v1
clusters:
  - cluster:
      server: https://usw-1.sealos.io:6443
    name: sealos
contexts:
  - context:
      cluster: sealos
      namespace: ns-demo
      user: demo-user
    name: sealos-context
current-context: sealos-context
users:
  - name: demo-user
    user:
      token: demo-token
`.trim()

describe('createClusterContext', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  it('reads kubeconfig from the standard sdk session shape', () => {
    const context = createClusterContext({
      kubeconfig,
      user: {
        id: 'user-demo',
        nsid: 'ns-demo',
      },
    })

    expect(context.kubeconfig).toBe(kubeconfig)
    expect(context.namespace).toBe('ns-demo')
    expect(context.server).toBe('https://usw-1.sealos.io:6443')
    expect(context.operator).toBe('user-demo')
  })

  it('reads kubeconfig from nested sdk payload wrappers', () => {
    const context = createClusterContext({
      data: {
        session: {
          kubeconfig,
          user: {
            id: 'nested-user',
            nsid: 'ns-demo',
          },
        },
      },
    })

    expect(context.kubeconfig).toBe(kubeconfig)
    expect(context.namespace).toBe('ns-demo')
    expect(context.operator).toBe('nested-user')
  })

  it('decodes base64 kubeconfig payloads', () => {
    const encoded = btoa(kubeconfig)

    const context = createClusterContext({
      payload: {
        kubeConfig: encoded,
        user: {
          name: 'base64-user',
          nsid: 'ns-demo',
        },
      },
    })

    expect(context.kubeconfig).toBe(kubeconfig)
    expect(context.server).toBe('https://usw-1.sealos.io:6443')
    expect(context.operator).toBe('base64-user')
  })
})
