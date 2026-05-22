describe('vite local session config', () => {
  const originalEnv = { ...process.env }
  const localKubeconfig = [
    'apiVersion: v1',
    'clusters:',
    '  - name: sealos',
    '    cluster:',
    '      server: https://usw-1.sealos.io:6443',
    'contexts:',
    '  - name: user@sealos',
    '    context:',
    '      cluster: sealos',
    '      namespace: ns-test',
    '      user: user',
    'current-context: user@sealos',
    'users:',
    '  - name: user',
    '    user:',
    '      token: test',
  ].join('\\n')

  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it('does not enable local session for unusable inline kubeconfig env values', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    process.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION = 'false'
    process.env.AGENTHUB_LOCAL_KUBECONFIG = '   '
    process.env.AGENTHUB_LOCAL_KUBECONFIG_B64 = 'not base64!!!!'

    await import('./vite.config')

    expect(process.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION).toBe('false')
  })

  it('enables local session for a usable inline kubeconfig env value', async () => {
    process.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION = 'false'
    process.env.AGENTHUB_LOCAL_KUBECONFIG = localKubeconfig
    process.env.AGENTHUB_LOCAL_KUBECONFIG_B64 = '   '

    await import('./vite.config')

    expect(process.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION).toBe('true')
  })

  it('enables local session for a usable base64 kubeconfig env value', async () => {
    process.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION = 'false'
    process.env.AGENTHUB_LOCAL_KUBECONFIG = '   '
    process.env.AGENTHUB_LOCAL_KUBECONFIG_B64 = Buffer.from(localKubeconfig, 'utf8').toString(
      'base64',
    )

    await import('./vite.config')

    expect(process.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION).toBe('true')
  })
})
