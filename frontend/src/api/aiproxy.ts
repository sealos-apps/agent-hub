const DEFAULT_AIPROXY_MANAGER_BASE_URL =
  import.meta.env.VITE_AGENTHUB_AIPROXY_MANAGER_BASE_URL || 'https://aiproxy-web.hzh.sealos.run'

const normalizeAIProxyModelBaseURL = (baseURL = '') => {
  if (!baseURL) return ''

  try {
    const target = new URL(baseURL)
    const pathname = target.pathname.replace(/\/+$/, '')
    target.pathname = pathname || '/v1'
    return target.toString().replace(/\/$/, '')
  } catch {
    return baseURL
  }
}

const DEFAULT_AIPROXY_MODEL_BASE_URL = normalizeAIProxyModelBaseURL(
  import.meta.env.VITE_AGENTHUB_AIPROXY_MODEL_BASE_URL || 'https://aiproxy.hzh.sealos.run',
)

const deriveAIProxyURL = (server = '', subdomain = '', fallback = '', pathSuffix = '') => {
  if (!server) return fallback

  try {
    const target = new URL(server)
    const host = target.hostname || ''
    if (!host.includes('sealos.')) {
      return fallback
    }
    return `https://${subdomain}.${host}${pathSuffix}`
  } catch {
    return fallback
  }
}

export const deriveAIProxyManagerBaseURL = (server = '') =>
  deriveAIProxyURL(server, 'aiproxy-web', DEFAULT_AIPROXY_MANAGER_BASE_URL)

export const deriveAIProxyModelBaseURL = (server = '') =>
  deriveAIProxyURL(server, 'aiproxy', DEFAULT_AIPROXY_MODEL_BASE_URL, '/v1')
