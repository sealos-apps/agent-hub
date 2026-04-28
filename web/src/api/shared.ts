type MaybeError = Error & {
  status?: number
  payload?: unknown
}

type MaybeConflictResult<T> = {
  conflict: boolean
  data: T | null
}

type ClusterContextLike = {
  kubeconfig?: string
}

type RequestOptions = RequestInit & {
  headers?: HeadersInit
}

type AuthTokenEntry = {
  source?: string
  token?: unknown
}

export const formatDisplayTime = (value: string | number | Date | null | undefined) => {
  if (!value) return '--'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export const toKubeconfigScalar = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/^['"]|['"]$/g, '')
}

export const encodeHeaderValue = (value = '') => {
  if (!value) return ''

  try {
    return encodeURIComponent(value)
  } catch {
    return ''
  }
}

export const dedupeAuthCandidates = (
  entries: AuthTokenEntry[] = [],
): Array<{ source: string; token: string }> => {
  const seen = new Set<string>()
  const normalized: Array<{ source: string; token: string }> = []
  entries.forEach((entry) => {
    const token = toKubeconfigScalar(entry?.token)
    if (!token || seen.has(token)) return
    seen.add(token)
    normalized.push({
      source: typeof entry?.source === 'string' && entry.source ? entry.source : 'unknown',
      token,
    })
  })
  return normalized
}

export const getNow = () => {
  const date = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export const requestJson = async (url: string, options: RequestOptions = {}) => {
  const response = await fetch(url, options)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const error: MaybeError = new Error(text || `请求失败: ${response.status}`)
    error.status = response.status
    error.payload = text
    throw error
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

export const createApiError = async (response: Response) => {
  const text = await response.text().catch(() => '')
  let payload: unknown = text
  let message = text || `请求失败: ${response.status}`

  if (text) {
    try {
      const parsed = JSON.parse(text) as unknown
      payload = parsed
      if (typeof parsed === 'object' && parsed !== null && 'message' in parsed) {
        const maybeMessage = (parsed as { message?: unknown }).message
        if (typeof maybeMessage === 'string' && maybeMessage) {
          message = maybeMessage
        }
      }
    } catch {
      payload = text
    }
  }

  const error: MaybeError = new Error(message)
  error.status = response.status
  error.payload = payload
  return error
}

export const requestMaybeConflict = async <T = unknown>(
  url: string,
  options: RequestOptions = {},
): Promise<MaybeConflictResult<T>> => {
  const response = await fetch(url, options)

  if (response.status === 409) {
    return { conflict: true, data: null }
  }

  if (!response.ok) {
    throw await createApiError(response)
  }

  if (response.status === 204) {
    return { conflict: false, data: null }
  }

  return {
    conflict: false,
    data: (await response.json()) as T,
  }
}

export function maskTokenForLog(token = '') {
  if (!token || typeof token !== 'string') {
    return {
      length: 0,
      head: '',
      tail: '',
    }
  }

  return {
    length: token.length,
    head: token.slice(0, 10),
    tail: token.slice(-10),
  }
}

export const isUnauthorizedError = (error: unknown) =>
  typeof error === 'object' && error !== null && 'status' in error && (error as MaybeError).status === 401

const buildHeaders = (clusterContext?: ClusterContextLike | null): Record<string, string> => {
  const encodedKubeconfig = encodeHeaderValue(clusterContext?.kubeconfig || '')
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }

  if (encodedKubeconfig) {
    headers.Authorization = encodedKubeconfig
  }

  return headers
}

export const buildAuthorizedRequestOptions = (
  clusterContext: ClusterContextLike | null | undefined,
  options: RequestOptions = {},
): RequestOptions => ({
  ...options,
  headers: {
    ...buildHeaders(clusterContext),
    ...(options.headers || {}),
  },
})

export const requestRawWithAuthRetry = async (
  url: string,
  clusterContext: ClusterContextLike | null | undefined,
  options: RequestOptions = {},
) => {
  try {
    const response = await fetch(url, buildAuthorizedRequestOptions(clusterContext, options))
    if (!response.ok) {
      throw await createApiError(response)
    }
    return response
  } catch (error) {
    const typedError = error as MaybeError
    if (isUnauthorizedError(error)) {
      typedError.message = '请求失败: kubeconfig 认证无效或当前环境未按 Sealos 应用方式代理 Kubernetes 请求'
    }
    throw typedError
  }
}

export const requestJsonWithAuthRetry = async (
  url: string,
  clusterContext: ClusterContextLike | null | undefined,
  options: RequestOptions = {},
) => {
  try {
    return await requestJson(url, buildAuthorizedRequestOptions(clusterContext, options))
  } catch (error) {
    const typedError = error as MaybeError
    if (isUnauthorizedError(error)) {
      typedError.message = '请求失败: kubeconfig 认证无效或当前环境未按 Sealos 应用方式代理 Kubernetes 请求'
    }
    throw typedError
  }
}

export const requestMaybeConflictWithAuthRetry = async (
  url: string,
  clusterContext: ClusterContextLike | null | undefined,
  options: RequestOptions = {},
) => {
  try {
    return await requestMaybeConflict(url, buildAuthorizedRequestOptions(clusterContext, options))
  } catch (error) {
    const typedError = error as MaybeError
    if (isUnauthorizedError(error)) {
      typedError.message = '请求失败: kubeconfig 认证无效或当前环境未按 Sealos 应用方式代理 Kubernetes 请求'
    }
    throw typedError
  }
}

export const buildProxyUrl = (path: string, searchParams?: URLSearchParams) => {
  const query = searchParams?.toString()
  return `/k8s-api${path}${query ? `?${query}` : ''}`
}

export const fileToBase64 = (file: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result || '')
      const marker = 'base64,'
      const index = result.indexOf(marker)
      resolve(index >= 0 ? result.slice(index + marker.length) : '')
    }
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })

const bytesToBase64 = (bytes = new Uint8Array()) => {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

export const textToBase64 = (value = '') => bytesToBase64(new TextEncoder().encode(String(value || '')))

export const base64ToText = (value = '') => {
  if (!value) return ''
  const binary = atob(value)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export const parseContentDispositionFilename = (value = '') => {
  if (!value) return ''

  const utf8Match = value.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1])
    } catch {
      return utf8Match[1]
    }
  }

  const asciiMatch = value.match(/filename="?([^";]+)"?/i)
  return asciiMatch?.[1] || ''
}
