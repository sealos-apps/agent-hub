/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { parse as parseYaml } from 'yaml'

const viteEnv = loadEnv(
  process.env.NODE_ENV === 'production' ? 'production' : 'development',
  process.cwd(),
  '',
)
const readEnv = (key: string, fallback = '') => process.env[key] || viteEnv[key] || fallback

const toScalar = (value: unknown) => {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^['"]|['"]$/g, '')
}

const parseCSV = (value = '') =>
  value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

const normalizeLocalKubeconfigEnv = (value = '') => {
  const kubeconfig = toScalar(value)
  if (!kubeconfig) return ''
  return kubeconfig.includes('\\n') ? kubeconfig.replace(/\\n/g, '\n').trim() : kubeconfig
}

const normalizeUsableLocalKubeconfig = (value = '') => {
  const kubeconfig = normalizeLocalKubeconfigEnv(value)
  if (!kubeconfig) return ''

  try {
    const parsed = parseYaml(kubeconfig)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return ''
    const record = parsed as Record<string, unknown>
    if (!Array.isArray(record.clusters) || !Array.isArray(record.contexts)) return ''
    return kubeconfig
  } catch {
    return ''
  }
}

const decodeLocalKubeconfigB64 = (value = '') => {
  const encoded = toScalar(value).replace(/\s/g, '')
  if (!encoded) return ''

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    console.warn('[vite:local-session] invalid AGENTHUB_LOCAL_KUBECONFIG_B64')
    return ''
  }

  try {
    return normalizeUsableLocalKubeconfig(Buffer.from(encoded, 'base64').toString('utf8'))
  } catch (error) {
    console.warn('[vite:local-session] failed to decode AGENTHUB_LOCAL_KUBECONFIG_B64', error)
    return ''
  }
}

if (!readEnv('VITE_AGENTHUB_BROWSER_TITLE')) {
  process.env.VITE_AGENTHUB_BROWSER_TITLE = 'Agent Hub Web'
}

if (!readEnv('VITE_AGENTHUB_FAVICON_URL')) {
  process.env.VITE_AGENTHUB_FAVICON_URL = '/brand/agent-hub.svg'
}

const DEFAULT_K8S_SERVER = readEnv('VITE_DEFAULT_K8S_SERVER')
const resolveBackendProxyTarget = (value = '') => {
  const raw = value.trim() || 'http://127.0.0.1:8888'
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('VITE_AGENTHUB_BACKEND_TARGET must be an absolute localhost HTTP URL')
  }

  const hostname = parsed.hostname.toLowerCase()
  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  if (parsed.protocol !== 'http:' || !isLocalhost) {
    throw new Error('VITE_AGENTHUB_BACKEND_TARGET must point to localhost over HTTP')
  }

  return parsed.toString().replace(/\/$/, '')
}
const BACKEND_PROXY_TARGET = resolveBackendProxyTarget(readEnv('VITE_AGENTHUB_BACKEND_TARGET'))
const DEFAULT_K8S_PROXY_ALLOWED_HOSTS =
  'usw.sealos.io,usw-1.sealos.io,hzh.sealos.run,bja.sealos.run,gzg.sealos.run'
const K8S_PROXY_ALLOWED_HOSTS = parseCSV(readEnv('K8S_PROXY_ALLOWED_HOSTS', DEFAULT_K8S_PROXY_ALLOWED_HOSTS))
const AGENT_HUB_BROWSER_TITLE = readEnv('VITE_AGENTHUB_BROWSER_TITLE', 'Agent Hub Web')
const AGENT_HUB_FAVICON_URL = readEnv('VITE_AGENTHUB_FAVICON_URL', '/brand/agent-hub.svg')
const LOCAL_KUBECONFIG_ENV = readEnv('AGENTHUB_LOCAL_KUBECONFIG')
const LOCAL_KUBECONFIG_B64_ENV = readEnv('AGENTHUB_LOCAL_KUBECONFIG_B64')
const LOCAL_KUBECONFIG_INLINE =
  normalizeUsableLocalKubeconfig(LOCAL_KUBECONFIG_ENV) ||
  decodeLocalKubeconfigB64(LOCAL_KUBECONFIG_B64_ENV)
const ENABLE_LOCAL_SESSION =
  String(readEnv('VITE_AGENTHUB_ENABLE_LOCAL_SESSION')).toLowerCase() === 'true' ||
  Boolean(LOCAL_KUBECONFIG_INLINE)
if (ENABLE_LOCAL_SESSION) {
  process.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION = 'true'
}
const LOCAL_KUBECONFIG_PATH =
  readEnv('VITE_AGENTHUB_LOCAL_KUBECONFIG_PATH') ||
  path.resolve(process.cwd(), '../.local/kubeconfig.yaml')

const dedupeTokens = (tokens: unknown[] = []) => {
  const seen = new Set<string>()

  return tokens.filter((token) => {
    const normalized = toScalar(token)
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

const getUserTokenCandidates = (userConfig: Record<string, any> = {}) => {
  return dedupeTokens([
    userConfig?.token,
    userConfig?.['id-token'],
    userConfig?.['access-token'],
  ])
}

const isUnsafeProxyUserConfig = (userConfig: Record<string, any> = {}) =>
  Boolean(
    userConfig?.exec ||
      userConfig?.['auth-provider'] ||
      userConfig?.authProvider ||
      userConfig?.tokenFile ||
      userConfig?.clientCertificate ||
      userConfig?.['client-certificate'] ||
      userConfig?.clientCertificateData ||
      userConfig?.['client-certificate-data'] ||
      userConfig?.clientKey ||
      userConfig?.['client-key'] ||
      userConfig?.clientKeyData ||
      userConfig?.['client-key-data'] ||
      userConfig?.username ||
      userConfig?.password,
  )

const isUnsafeProxyClusterConfig = (clusterConfig: Record<string, any> = {}) =>
  Boolean(
    clusterConfig?.['insecure-skip-tls-verify'] ||
      clusterConfig?.insecureSkipTlsVerify ||
      clusterConfig?.['certificate-authority'] ||
      clusterConfig?.certificateAuthority ||
      clusterConfig?.['proxy-url'] ||
      clusterConfig?.proxyUrl ||
      clusterConfig?.['tls-server-name'] ||
      clusterConfig?.tlsServerName,
  )

const parseProxyKubeconfig = (authorizationHeader = '') => {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') {
    return { kubeconfig: '', server: '', token: '' }
  }

  try {
    const kubeconfig = decodeURIComponent(authorizationHeader)
    const parsed = parseYaml(kubeconfig) || {}
    const contexts = Array.isArray(parsed.contexts) ? parsed.contexts : []
    const users = Array.isArray(parsed.users) ? parsed.users : []
    const clusters = Array.isArray(parsed.clusters) ? parsed.clusters : []
    const currentContextName = parsed['current-context']
    const selectedContext =
      contexts.find((item: any) => item?.name === currentContextName) || contexts[0]
    const selectedUser =
      users.find((item: any) => item?.name === selectedContext?.context?.user) || users[0]
    const selectedCluster =
      clusters.find((item: any) => item?.name === selectedContext?.context?.cluster) || clusters[0]
    const userConfig = selectedUser?.user || {}
    const clusterConfig = selectedCluster?.cluster || {}

    if (isUnsafeProxyUserConfig(userConfig) || isUnsafeProxyClusterConfig(clusterConfig)) {
      return { kubeconfig: '', server: '', token: '' }
    }

    return {
      kubeconfig,
      server: toScalar(clusterConfig?.server),
      token: getUserTokenCandidates(userConfig)[0] || '',
    }
  } catch {
    return { kubeconfig: '', server: '', token: '' }
  }
}

const loadLocalSealosSession = () => {
  try {
    const kubeconfig =
      LOCAL_KUBECONFIG_INLINE ||
      (fs.existsSync(LOCAL_KUBECONFIG_PATH)
        ? fs.readFileSync(LOCAL_KUBECONFIG_PATH, 'utf8').trim()
        : '')
    if (!kubeconfig) {
      return null
    }

    const parsed = parseYaml(kubeconfig) || {}
    const contexts = Array.isArray(parsed.contexts) ? parsed.contexts : []
    const clusters = Array.isArray(parsed.clusters) ? parsed.clusters : []
    const currentContextName = parsed['current-context']
    const selectedContext =
      contexts.find((item: any) => item?.name === currentContextName) || contexts[0]
    const selectedCluster =
      clusters.find((item: any) => item?.name === selectedContext?.context?.cluster) || clusters[0]
    const namespace = toScalar(selectedContext?.context?.namespace)
    const server = toScalar(selectedCluster?.cluster?.server)

    return {
      kubeconfig,
      kc: kubeconfig,
      kubeConfig: kubeconfig,
      namespace,
      nsid: namespace,
      server,
      user: {
        name: toScalar(selectedContext?.context?.user),
      },
    }
  } catch (error) {
    console.warn('[vite:local-session] failed to load local kubeconfig', error)
    return null
  }
}

const getRequestUrl = (req: { url?: string }) => new URL(req?.url || '/', 'http://localhost')

const resolveProxyBearerToken = (req: { headers?: Record<string, any>; url?: string }) => {
  const parsedKubeconfig = parseProxyKubeconfig(req?.headers?.authorization)
  return parsedKubeconfig.token
}

const resolveProxyTarget = (req: { headers?: Record<string, any>; url?: string }) => {
  const parsedKubeconfig = parseProxyKubeconfig(req?.headers?.authorization)
  return parsedKubeconfig.server || DEFAULT_K8S_SERVER
}

const K8S_STATUS_HEADERS = {
  'Content-Type': 'application/json',
}

const createStatusBody = (status: number, message: string, reason = '') => ({
  kind: 'Status',
  apiVersion: 'v1',
  metadata: {},
  status: status >= 400 ? 'Failure' : 'Success',
  message,
  reason: reason || message,
  code: status,
})

const writeJson = (
  res: {
    writeHead: (status: number, headers: Record<string, string>) => void
    end: (body: string) => void
  },
  status: number,
  payload: unknown,
) => {
  res.writeHead(status, K8S_STATUS_HEADERS)
  res.end(JSON.stringify(payload))
}

const readRequestBody = async (req: AsyncIterable<Buffer | string>) => {
  const chunks: Buffer[] = []

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0)
}

const isHandledK8sRestPath = (pathname = '') =>
  /^\/k8s-api\/(api\/v1|apis\/devbox\.sealos\.io\/v1alpha(?:1|2)|apis\/networking\.k8s\.io\/v1)/.test(
    pathname,
  )

const isAllowedK8sProxyTarget = (target: URL, allowHosts = K8S_PROXY_ALLOWED_HOSTS) => {
  if (target.protocol !== 'https:') {
    return false
  }

  const host = target.hostname.toLowerCase().trim()
  if (!host) {
    return false
  }

  return allowHosts.some((item) => {
    const pattern = item.toLowerCase().trim()
    if (!pattern) {
      return false
    }
    if (pattern.startsWith('.')) {
      return host === pattern.slice(1) || host.endsWith(pattern)
    }
    return host === pattern
  })
}

const isLoopbackAddress = (value: unknown) => {
  const normalized = toScalar(value).toLowerCase().replace(/^\[|\]$/g, '')
  if (!normalized) return false
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1'
}

const isLoopbackHost = (value: unknown) => {
  const raw = toScalar(Array.isArray(value) ? value[0] : value)
  if (!raw) return false

  try {
    return isLoopbackAddress(new URL(`http://${raw}`).hostname)
  } catch {
    return isLoopbackAddress(raw)
  }
}

const isLoopbackRequest = (req: { headers?: Record<string, any>; socket?: { remoteAddress?: string } }) => {
  const remoteAddress = req?.socket?.remoteAddress || ''
  const host = req?.headers?.host
  const forwardedRaw = req?.headers?.['x-forwarded-for']
  const forwarded = Array.isArray(forwardedRaw)
    ? forwardedRaw[0]
    : String(forwardedRaw || '').split(',')[0] || ''

  if (!isLoopbackHost(host)) {
    return false
  }

  if (forwarded && !isLoopbackAddress(forwarded)) {
    return false
  }

  return isLoopbackAddress(remoteAddress)
}

const createViteK8sRestMiddlewarePlugin = () => ({
  name: 'agenthub-k8s-rest-middleware',
  configureServer(server: { middlewares: { use: (handler: any) => void } }) {
    console.info('[vite:k8s-rest] middleware active for /k8s-api')

    server.middlewares.use(async (req: any, res: any, next: () => void) => {
      const method = (req.method || 'GET').toUpperCase()
      const requestUrl = getRequestUrl(req)

      if (!isHandledK8sRestPath(requestUrl.pathname)) {
        next()
        return
      }

      const targetBase = resolveProxyTarget(req)
      const bearerToken = resolveProxyBearerToken(req)

      if (!targetBase || !bearerToken) {
        writeJson(res, 401, createStatusBody(401, '缺少 Kubernetes 认证信息', 'Unauthorized'))
        return
      }

      try {
        const targetUrl = new URL(requestUrl.pathname.replace(/^\/k8s-api/, ''), targetBase)
        targetUrl.search = requestUrl.search
        if (!isAllowedK8sProxyTarget(targetUrl)) {
          writeJson(res, 403, createStatusBody(403, 'Kubernetes proxy target is not allowed', 'Forbidden'))
          return
        }

        const bodyBuffer = await readRequestBody(req)
        const headers: Record<string, string> = {}

        for (const [key, value] of Object.entries(req.headers || {})) {
          if (!value) continue

          const normalizedKey = key.toLowerCase()
          if (
            normalizedKey === 'host' ||
            normalizedKey === 'origin' ||
            normalizedKey === 'referer' ||
            normalizedKey === 'cookie' ||
            normalizedKey === 'authorization' ||
            normalizedKey === 'authorization-bearer' ||
            normalizedKey.startsWith('impersonate-') ||
            normalizedKey === 'x-k8s-server' ||
            normalizedKey === 'content-length' ||
            normalizedKey === 'connection'
          ) {
            continue
          }

          headers[key] = Array.isArray(value) ? value.join(', ') : String(value)
        }

        headers.authorization = `Bearer ${bearerToken}`
        headers.host = targetUrl.host

        if (bodyBuffer.length > 0) {
          headers['content-length'] = String(bodyBuffer.length)
        }

        const upstreamRequest = https.request(
          targetUrl,
          {
            method,
            headers,
          },
          (upstreamResponse) => {
            const statusCode = upstreamResponse.statusCode || 502
            const errorChunks: Buffer[] = []
            let errorBytes = 0

            if (statusCode >= 400) {
              upstreamResponse.on('data', (chunk) => {
                const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
                if (errorBytes >= 4096) return

                const remaining = 4096 - errorBytes
                const slice = nextChunk.subarray(0, remaining)
                errorChunks.push(slice)
                errorBytes += slice.length
              })

              upstreamResponse.on('end', () => {
                const bodyPreview = Buffer.concat(errorChunks).toString('utf8').trim()
                console.error(
                  '[vite:k8s-rest]',
                  `${method} ${targetUrl.toString()} -> ${statusCode}${bodyPreview ? ` ${bodyPreview}` : ''}`,
                )
              })
            }

            const responseHeaders = Object.fromEntries(
              Object.entries(upstreamResponse.headers || {}).filter(([, value]) => typeof value === 'string'),
            ) as Record<string, string>

            res.writeHead(statusCode, responseHeaders)
            upstreamResponse.pipe(res)
          },
        )

        upstreamRequest.on('error', (error) => {
          console.error('[vite:k8s-rest]', error.message)
          writeJson(res, 502, createStatusBody(502, error.message || 'Bad Gateway', 'BadGateway'))
        })

        if (bodyBuffer.length > 0) {
          upstreamRequest.write(bodyBuffer)
        }

        upstreamRequest.end()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Bad Gateway'
        console.error('[vite:k8s-rest]', message)
        writeJson(res, 502, createStatusBody(502, message, 'BadGateway'))
      }
    })
  },
})

const createAgentHubBrandHtmlPlugin = () => ({
  name: 'agenthub-brand-html',
  transformIndexHtml(html: string) {
    return html
      .replace('<title>Agent Hub Web</title>', `<title>${AGENT_HUB_BROWSER_TITLE}</title>`)
      .replace(
        '<link rel="icon" type="image/svg+xml" href="/brand/agent-hub.svg" />',
        `<link rel="icon" type="image/svg+xml" href="${AGENT_HUB_FAVICON_URL}" />`,
      )
  },
})

const createLocalSealosSessionPlugin = () => ({
  name: 'agenthub-local-sealos-session',
  configureServer(server: { middlewares: { use: (handler: any) => void } }) {
    server.middlewares.use((req: any, res: any, next: () => void) => {
      const requestUrl = getRequestUrl(req)
      if (requestUrl.pathname !== '/__agenthub/local-session') {
        next()
        return
      }

      if (!ENABLE_LOCAL_SESSION) {
        writeJson(res, 404, createStatusBody(404, 'local session disabled', 'NotFound'))
        return
      }

      if (!isLoopbackRequest(req)) {
        writeJson(res, 403, createStatusBody(403, 'forbidden', 'Forbidden'))
        return
      }

      const session = loadLocalSealosSession()
      if (!session) {
        writeJson(res, 404, createStatusBody(404, 'local kubeconfig not found', 'NotFound'))
        return
      }

      writeJson(res, 200, session)
    })
  },
})

export const __agentHubViteConfigTest = {
  isLoopbackRequest,
  isAllowedK8sProxyTarget,
  parseProxyKubeconfig,
  resolveBackendProxyTarget,
  resolveProxyBearerToken,
  resolveProxyTarget,
}

export default defineConfig({
  plugins: [
    createAgentHubBrandHtmlPlugin(),
    react(),
    tailwindcss(),
    createViteK8sRestMiddlewarePlugin(),
    createLocalSealosSessionPlugin(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/backend-api': {
        target: BACKEND_PROXY_TARGET,
        changeOrigin: true,
        secure: true,
        ws: true,
        rewriteWsOrigin: true,
        rewrite: (path: string) => path.replace(/^\/backend-api/, ''),
      },
      '/__preview': {
        target: BACKEND_PROXY_TARGET,
        changeOrigin: true,
        secure: true,
        ws: true,
        rewriteWsOrigin: true,
      },
    },
  },
})
