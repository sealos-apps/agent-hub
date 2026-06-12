import { deriveAIProxyManagerBaseURL, deriveAIProxyModelBaseURL, __agentHubAIProxyTest } from './aiproxy'

describe('AIProxy URL derivation', () => {
  it('derives AIProxy URLs from allowed Sealos cluster hosts', () => {
    expect(deriveAIProxyManagerBaseURL('https://usw-1.sealos.io:6443')).toBe(
      'https://aiproxy-web.usw-1.sealos.io',
    )
    expect(deriveAIProxyModelBaseURL('https://hzh.sealos.run:6443')).toBe(
      'https://aiproxy.hzh.sealos.run/v1',
    )
  })

  it('rejects Sealos suffix lookalike cluster hosts', () => {
    expect(__agentHubAIProxyTest.isAllowedSealosServiceHost('evilsealos.io')).toBe(false)
    expect(__agentHubAIProxyTest.isAllowedSealosServiceHost('usw-1.sealos.io.evil.com')).toBe(false)
    expect(__agentHubAIProxyTest.isAllowedSealosServiceHost('evil.sealos.run')).toBe(false)
    expect(deriveAIProxyManagerBaseURL('https://evilsealos.io:6443')).toBe('')
    expect(deriveAIProxyModelBaseURL('https://hzh.sealos.run.evil.com:6443')).toBe('')
  })

  it('allows known Sealos region service hosts', () => {
    expect(__agentHubAIProxyTest.isAllowedSealosServiceHost('usw-1.sealos.io')).toBe(true)
    expect(__agentHubAIProxyTest.isAllowedSealosServiceHost('bja.sealos.run')).toBe(true)
    expect(__agentHubAIProxyTest.isAllowedSealosServiceHost('hzh.sealos.run')).toBe(true)
  })
})
