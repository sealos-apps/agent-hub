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

  it('accepts local session requests only from loopback hosts', async () => {
    const { __agentHubViteConfigTest } = await import('./vite.config')

    expect(
      __agentHubViteConfigTest.isLoopbackRequest({
        headers: { host: '127.0.0.1:3000' },
        socket: { remoteAddress: '127.0.0.1' },
      }),
    ).toBe(true)
    expect(
      __agentHubViteConfigTest.isLoopbackRequest({
        headers: { host: 'localhost:3000' },
        socket: { remoteAddress: '::1' },
      }),
    ).toBe(true)
    expect(
      __agentHubViteConfigTest.isLoopbackRequest({
        headers: { host: 'evil.example.com:3000' },
        socket: { remoteAddress: '127.0.0.1' },
      }),
    ).toBe(false)
    expect(
      __agentHubViteConfigTest.isLoopbackRequest({
        headers: { host: '127.0.0.1:3000', 'x-forwarded-for': '203.0.113.10' },
        socket: { remoteAddress: '127.0.0.1' },
      }),
    ).toBe(false)
  })
})

describe('vite Kubernetes proxy config', () => {
  type ViteProxyConfigForTest = {
    secure?: boolean
  }
  type ViteConfigForTest = {
    server: {
      allowedHosts?: unknown
      proxy: Record<string, ViteProxyConfigForTest | undefined>
    }
  }

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
    '      token: kubeconfig-token',
  ].join('\n')
  const encodedKubeconfig = encodeURIComponent(localKubeconfig)

  afterEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  it('limits the backend proxy target to localhost HTTP URLs', async () => {
    const { __agentHubViteConfigTest } = await import('./vite.config')

    expect(__agentHubViteConfigTest.resolveBackendProxyTarget('')).toBe('http://127.0.0.1:8888')
    expect(__agentHubViteConfigTest.resolveBackendProxyTarget('http://localhost:9000')).toBe(
      'http://localhost:9000',
    )
    expect(() =>
      __agentHubViteConfigTest.resolveBackendProxyTarget('https://api.example.com'),
    ).toThrow('VITE_AGENTHUB_BACKEND_TARGET must point to localhost over HTTP')
    expect(() =>
      __agentHubViteConfigTest.resolveBackendProxyTarget('http://169.254.169.254'),
    ).toThrow('VITE_AGENTHUB_BACKEND_TARGET must point to localhost over HTTP')
  })

  it('resolves the proxy target only from kubeconfig or configured default server', async () => {
    process.env.VITE_DEFAULT_K8S_SERVER = 'https://default.sealos.io:6443'
    const { __agentHubViteConfigTest } = await import('./vite.config')

    expect(
      __agentHubViteConfigTest.resolveProxyTarget({
        headers: {
          authorization: encodedKubeconfig,
          'x-k8s-server': 'https://evil.example.com',
        },
        url: '/k8s-api/api/v1/pods?k8sServer=https%3A%2F%2Fevil.example.com',
      }),
    ).toBe('https://usw-1.sealos.io:6443')

    expect(
      __agentHubViteConfigTest.resolveProxyTarget({
        headers: { 'x-k8s-server': 'https://evil.example.com' },
        url: '/k8s-api/api/v1/pods?k8sServer=https%3A%2F%2Fevil.example.com',
      }),
    ).toBe('https://default.sealos.io:6443')
  })

  it('does not resolve an implicit Kubernetes proxy target', async () => {
    delete process.env.VITE_DEFAULT_K8S_SERVER
    const { __agentHubViteConfigTest } = await import('./vite.config')

    expect(
      __agentHubViteConfigTest.resolveProxyTarget({
        headers: { 'x-k8s-server': 'https://evil.example.com' },
        url: '/k8s-api/api/v1/pods?k8sServer=https%3A%2F%2Fevil.example.com',
      }),
    ).toBe('')
  })

  it('resolves the proxy bearer token only from kubeconfig', async () => {
    const { __agentHubViteConfigTest } = await import('./vite.config')

    expect(
      __agentHubViteConfigTest.resolveProxyBearerToken({
        headers: {
          authorization: encodedKubeconfig,
          'authorization-bearer': 'evil-header-token',
        },
        url: '/k8s-api/api/v1/pods?k8sToken=evil-query-token',
      }),
    ).toBe('kubeconfig-token')

    expect(
      __agentHubViteConfigTest.resolveProxyBearerToken({
        headers: { 'authorization-bearer': 'evil-header-token' },
        url: '/k8s-api/api/v1/pods?k8sToken=evil-query-token',
      }),
    ).toBe('')
  })

  it('rejects kubeconfig exec and auth-provider token sources for the local proxy', async () => {
    const { __agentHubViteConfigTest } = await import('./vite.config')
    const execKubeconfig = localKubeconfig.replace(
      '      token: kubeconfig-token',
      [
        '      exec:',
        '        command: sh',
        '        args:',
        '          - -c',
        '          - echo pwned',
        '        env:',
        '          - name: EVIL_TOKEN',
        '            value: stolen-token',
      ].join('\n'),
    )
    const authProviderKubeconfig = localKubeconfig.replace(
      '      token: kubeconfig-token',
      [
        '      auth-provider:',
        '        name: oidc',
        '        config:',
        '          id-token: stolen-token',
      ].join('\n'),
    )

    expect(
      __agentHubViteConfigTest.resolveProxyBearerToken({
        headers: { authorization: encodeURIComponent(execKubeconfig) },
      }),
    ).toBe('')
    expect(
      __agentHubViteConfigTest.resolveProxyBearerToken({
        headers: { authorization: encodeURIComponent(authProviderKubeconfig) },
      }),
    ).toBe('')
  })

  it('rejects kubeconfig certificate and tls-server-name overrides for the local proxy', async () => {
    const { __agentHubViteConfigTest } = await import('./vite.config')
    const certKubeconfig = localKubeconfig.replace(
      '      token: kubeconfig-token',
      [
        '      token: kubeconfig-token',
        '      client-certificate-data: ZHVtbXk=',
        '      client-key-data: ZHVtbXk=',
      ].join('\n'),
    )
    const tlsServerNameKubeconfig = localKubeconfig.replace(
      '      server: https://usw-1.sealos.io:6443',
      [
        '      server: https://usw-1.sealos.io:6443',
        '      tls-server-name: evil.example.com',
      ].join('\n'),
    )

    expect(
      __agentHubViteConfigTest.resolveProxyBearerToken({
        headers: { authorization: encodeURIComponent(certKubeconfig) },
      }),
    ).toBe('')
    expect(
      __agentHubViteConfigTest.resolveProxyBearerToken({
        headers: { authorization: encodeURIComponent(tlsServerNameKubeconfig) },
      }),
    ).toBe('')
  })

  it('does not expose a generic Vite Kubernetes proxy', async () => {
    const configModule = await import('./vite.config')
    const config = configModule.default as ViteConfigForTest

    expect(config.server.allowedHosts).toBeUndefined()
    expect(config.server.proxy['/k8s-api']).toBeUndefined()
  })

  it('keeps TLS verification enabled for Vite backend proxies', async () => {
    const configModule = await import('./vite.config')
    const config = configModule.default as ViteConfigForTest
    const proxy = config.server.proxy

    expect(proxy['/backend-api']?.secure).toBe(true)
    expect(proxy['/__preview']?.secure).toBe(true)
  })

  it('allows only HTTPS Kubernetes proxy targets on configured host suffixes', async () => {
    const { __agentHubViteConfigTest } = await import('./vite.config')

    expect(
      __agentHubViteConfigTest.isAllowedK8sProxyTarget(
        new URL('https://usw-1.sealos.io:6443/api/v1/pods'),
      ),
    ).toBe(true)
    expect(
      __agentHubViteConfigTest.isAllowedK8sProxyTarget(
        new URL('http://usw-1.sealos.io:6443/api/v1/pods'),
      ),
    ).toBe(false)
    expect(
      __agentHubViteConfigTest.isAllowedK8sProxyTarget(
        new URL('https://evilsealos.io:6443/api/v1/pods'),
      ),
    ).toBe(false)
    expect(
      __agentHubViteConfigTest.isAllowedK8sProxyTarget(
        new URL('https://evil.sealos.run:6443/api/v1/pods'),
      ),
    ).toBe(false)
  })
})
