/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { parse as parseYaml } from 'yaml'

if (!process.env.VITE_AGENTHUB_BROWSER_TITLE) {
  process.env.VITE_AGENTHUB_BROWSER_TITLE = 'Agent Hub Web'
}

if (!process.env.VITE_AGENTHUB_FAVICON_URL) {
  process.env.VITE_AGENTHUB_FAVICON_URL = '/brand/agent-hub.svg'
}

const DEFAULT_K8S_SERVER = process.env.VITE_DEFAULT_K8S_SERVER || ''
const FALLBACK_PROXY_TARGET = DEFAULT_K8S_SERVER || 'https://127.0.0.1:6443'
const BACKEND_PROXY_TARGET = process.env.VITE_AGENTHUB_BACKEND_TARGET || 'http://127.0.0.1:8999'
const AGENT_HUB_BROWSER_TITLE = process.env.VITE_AGENTHUB_BROWSER_TITLE || 'Agent Hub Web'
const AGENT_HUB_FAVICON_URL = process.env.VITE_AGENTHUB_FAVICON_URL || '/brand/agent-hub.svg'
const INSECURE_HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false })
const ENABLE_LOCAL_SESSION =
  String(process.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION || '').toLowerCase() === 'true'
const LOCAL_KUBECONFIG_PATH =
  process.env.VITE_AGENTHUB_LOCAL_KUBECONFIG_PATH ||
  path.resolve(process.cwd(), '../.local/kubeconfig.yaml')

const toScalar = (value: unknown) => {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^['"]|['"]$/g, '')
}

const decodeHeaderValue = (value: unknown) => {
  const scalar = Array.isArray(value) ? value[0] : value
  if (typeof scalar !== 'string') return ''

  try {
    return decodeURIComponent(scalar)
  } catch {
    return scalar.trim()
  }
}

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
  const authProviderConfig = userConfig?.['auth-provider']?.config || userConfig?.authProvider?.config || {}
  const execEnv = Array.isArray(userConfig?.exec?.env) ? userConfig.exec.env : []

  return dedupeTokens([
    userConfig?.token,
    userConfig?.['id-token'],
    userConfig?.['access-token'],
    authProviderConfig?.['id-token'],
    authProviderConfig?.['access-token'],
    ...execEnv
      .filter((entry: { name?: string }) => /token/i.test(entry?.name || ''))
      .map((entry: { value?: string }) => entry?.value),
  ])
}

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

    return {
      kubeconfig,
      server: toScalar(selectedCluster?.cluster?.server),
      token: getUserTokenCandidates(selectedUser?.user || {})[0] || '',
    }
  } catch {
    return { kubeconfig: '', server: '', token: '' }
  }
}

const loadLocalSealosSession = () => {
  try {
    if (!fs.existsSync(LOCAL_KUBECONFIG_PATH)) {
      return null
    }

    const kubeconfig = fs.readFileSync(LOCAL_KUBECONFIG_PATH, 'utf8').trim()
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

const getRequestQueryParam = (req: { url?: string }, key: string) => {
  if (!key) return ''
  return toScalar(getRequestUrl(req).searchParams.get(key) || '')
}

const resolveProxyBearerToken = (req: { headers?: Record<string, any>; url?: string }) => {
  const parsedKubeconfig = parseProxyKubeconfig(req?.headers?.authorization)
  const headerToken = toScalar(decodeHeaderValue(req?.headers?.['authorization-bearer']))
  return parsedKubeconfig.token || headerToken || getRequestQueryParam(req, 'k8sToken')
}

const resolveProxyTarget = (req: { headers?: Record<string, any>; url?: string }) => {
  const requestUrl = getRequestUrl(req)
  const queryServer = requestUrl.searchParams.get('k8sServer')
  const parsedKubeconfig = parseProxyKubeconfig(req?.headers?.authorization)
  const fallbackServer = toScalar(decodeHeaderValue(req?.headers?.['x-k8s-server']))

  if (queryServer) {
    return queryServer
  }

  if (parsedKubeconfig.server) {
    return parsedKubeconfig.server
  }
  if (fallbackServer) {
    return fallbackServer
  }

  return DEFAULT_K8S_SERVER
}

const applyProxyHeaders = (
  proxyReq: {
    removeHeader: (name: string) => void
    setHeader: (name: string, value: string) => void
  },
  req: { headers?: Record<string, any>; url?: string },
) => {
  proxyReq.removeHeader('origin')
  proxyReq.removeHeader('referer')
  proxyReq.removeHeader('x-k8s-server')
  proxyReq.removeHeader('authorization-bearer')

  const bearerToken = resolveProxyBearerToken(req)
  if (bearerToken) {
    proxyReq.setHeader('authorization', `Bearer ${bearerToken}`)
  } else {
    proxyReq.removeHeader('authorization')
  }

  try {
    const targetUrl = new URL(resolveProxyTarget(req) || FALLBACK_PROXY_TARGET)
    proxyReq.setHeader('host', targetUrl.host)
  } catch {
    proxyReq.removeHeader('host')
  }
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

const isLoopbackAddress = (value: unknown) => {
  const normalized = toScalar(value).toLowerCase()
  if (!normalized) return false
  return normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1'
}

const isLoopbackRequest = (req: { headers?: Record<string, any>; socket?: { remoteAddress?: string } }) => {
  const remoteAddress = req?.socket?.remoteAddress || ''
  const forwardedRaw = req?.headers?.['x-forwarded-for']
  const forwarded = Array.isArray(forwardedRaw)
    ? forwardedRaw[0]
    : String(forwardedRaw || '').split(',')[0] || ''

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

      const targetBase = resolveProxyTarget(req) || FALLBACK_PROXY_TARGET
      const bearerToken = resolveProxyBearerToken(req)

      if (!targetBase || !bearerToken) {
        writeJson(res, 401, createStatusBody(401, '缺少 Kubernetes 认证信息', 'Unauthorized'))
        return
      }

      try {
        const targetUrl = new URL(requestUrl.pathname.replace(/^\/k8s-api/, ''), targetBase)
        targetUrl.search = requestUrl.search

        const bodyBuffer = await readRequestBody(req)
        const headers: Record<string, string> = {}

        for (const [key, value] of Object.entries(req.headers || {})) {
          if (!value) continue

          const normalizedKey = key.toLowerCase()
          if (
            normalizedKey === 'host' ||
            normalizedKey === 'origin' ||
            normalizedKey === 'referer' ||
            normalizedKey === 'authorization' ||
            normalizedKey === 'authorization-bearer' ||
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

        const transport = targetUrl.protocol === 'https:' ? https : http
        const upstreamRequest = transport.request(
          targetUrl,
          {
            method,
            headers,
            agent: targetUrl.protocol === 'https:' ? INSECURE_HTTPS_AGENT : undefined,
            rejectUnauthorized: false,
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

export default defineConfig({
  plugins: [
    createAgentHubBrandHtmlPlugin(),
    react(),
    tailwindcss(),
    createViteK8sRestMiddlewarePlugin(),
    createLocalSealosSessionPlugin(),
  ],
  server: {
    allowedHosts: true,
    host: '0.0.0.0',
    port: 3000,
    strictPort: true,
    proxy: {
      '/backend-api': {
        target: BACKEND_PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        ws: true,
        rewriteWsOrigin: true,
        rewrite: (path: string) => path.replace(/^\/backend-api/, ''),
      },
      '/k8s-api': {
        target: FALLBACK_PROXY_TARGET,
        agent: INSECURE_HTTPS_AGENT,
        changeOrigin: true,
        secure: false,
        ws: true,
        rewrite: (path: string) => path.replace(/^\/k8s-api/, ''),
        router: (req: any) => resolveProxyTarget(req),
        configure: (proxy: any) => {
          proxy.on('proxyReq', (proxyReq: any, req: any) => {
            applyProxyHeaders(proxyReq, req)
          })

          proxy.on('proxyReqWs', (proxyReq: any, req: any) => {
            applyProxyHeaders(proxyReq, req)
          })

          proxy.on('error', (error: Error) => {
            console.error('[vite:k8s-proxy]', error.message)
          })
        },
      } as any,
    },
  },
})
