/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { parse as parseYaml } from 'yaml'
import { dedupeAuthCandidates, getNow, maskTokenForLog, toKubeconfigScalar } from './shared'

const isRecord = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

const collectNestedRecords = (value, maxDepth = 3) => {
  const records = []
  const queue = [{ value, depth: 0 }]
  const seen = new Set()

  while (queue.length) {
    const current = queue.shift()
    if (!current) continue

    const { value: currentValue, depth } = current
    if (!currentValue || depth > maxDepth || seen.has(currentValue)) {
      continue
    }

    if (Array.isArray(currentValue)) {
      seen.add(currentValue)
      currentValue.forEach((item) => {
        if ((isRecord(item) || Array.isArray(item)) && depth < maxDepth) {
          queue.push({ value: item, depth: depth + 1 })
        }
      })
      continue
    }

    if (!isRecord(currentValue)) {
      continue
    }

    seen.add(currentValue)
    records.push(currentValue)

    if (depth >= maxDepth) {
      continue
    }

    Object.values(currentValue).forEach((item) => {
      if (isRecord(item) || Array.isArray(item)) {
        queue.push({ value: item, depth: depth + 1 })
      }
    })
  }

  return records
}

const findScalarByKeys = (records = [], keys = []) => {
  for (const record of records) {
    for (const key of keys) {
      const value = toKubeconfigScalar(record?.[key])
      if (value) {
        return value
      }
    }
  }
  return ''
}

const decodeBase64Utf8 = (value = '') => {
  if (!value) return ''

  try {
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      return decodeURIComponent(
        Array.from(window.atob(value))
          .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
          .join(''),
      )
    }

    if (typeof Buffer !== 'undefined') {
      return Buffer.from(value, 'base64').toString('utf8')
    }
  } catch {
    return ''
  }

  return ''
}

const extractExecEnvTokenCandidates = (envList = []) =>
  dedupeAuthCandidates(
    (Array.isArray(envList) ? envList : [])
      .filter((entry) => /token/i.test(entry?.name || ''))
      .map((entry) => ({
        source: `kubeconfig exec env ${entry?.name || 'token'}`,
        token: entry?.value,
      })),
  )

const extractKubeconfigAuthCandidates = (userConfig = {}) => {
  const authProviderConfig = userConfig?.['auth-provider']?.config || userConfig?.authProvider?.config || {}

  return dedupeAuthCandidates([
    { source: 'kubeconfig token', token: userConfig?.token },
    { source: 'kubeconfig id-token', token: userConfig?.['id-token'] },
    { source: 'kubeconfig access-token', token: userConfig?.['access-token'] },
    {
      source: 'kubeconfig auth-provider id-token',
      token: authProviderConfig?.['id-token'] || authProviderConfig?.idToken,
    },
    {
      source: 'kubeconfig auth-provider access-token',
      token: authProviderConfig?.['access-token'] || authProviderConfig?.accessToken,
    },
    ...extractExecEnvTokenCandidates(userConfig?.exec?.env),
  ])
}

const parseKubeconfigStruct = (kubeconfig = '') => {
  if (!kubeconfig) return {}

  try {
    const parsed = parseYaml(kubeconfig) || {}
    const contexts = Array.isArray(parsed.contexts) ? parsed.contexts : []
    const users = Array.isArray(parsed.users) ? parsed.users : []
    const clusters = Array.isArray(parsed.clusters) ? parsed.clusters : []

    const currentContextName = parsed['current-context']
    const selectedContext = contexts.find((item) => item?.name === currentContextName) || contexts[0]

    const namespace = toKubeconfigScalar(selectedContext?.context?.namespace)
    const userName = selectedContext?.context?.user
    const clusterName = selectedContext?.context?.cluster

    const selectedUser = users.find((item) => item?.name === userName) || users[0]
    const selectedCluster = clusters.find((item) => item?.name === clusterName) || clusters[0]
    const authCandidates = extractKubeconfigAuthCandidates(selectedUser?.user || {})

    return {
      namespace,
      token: authCandidates[0]?.token || '',
      authCandidates,
      server: toKubeconfigScalar(selectedCluster?.cluster?.server),
    }
  } catch (error) {
    console.warn('[k8s-api] parse kubeconfig with yaml failed, fallback to line parser', {
      message: error?.message,
    })
    return {}
  }
}

const parseKubeconfigValues = (kubeconfig = '', key) => {
  if (!kubeconfig || !key) return []

  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const lines = kubeconfig.split('\n')
  const values = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const match = line.match(new RegExp(`^(\\s*)${escapedKey}:\\s*(.*)$`))
    if (!match) continue

    const baseIndent = match[1].length
    const rawValue = (match[2] || '').trim()

    if (rawValue && !['>-', '>', '|-', '|'].includes(rawValue)) {
      values.push(rawValue.replace(/^['"]|['"]$/g, ''))
      continue
    }

    const blockLines = []
    for (let next = index + 1; next < lines.length; next += 1) {
      const nextLine = lines[next]
      if (!nextLine.trim()) continue

      const nextIndent = nextLine.match(/^\s*/)?.[0]?.length || 0
      if (nextIndent <= baseIndent) {
        break
      }

      blockLines.push(nextLine.trim())
    }

    if (blockLines.length) {
      values.push(blockLines.join(''))
      continue
    }
  }

  return values
}

const parseKubeconfigValue = (kubeconfig = '', key) => parseKubeconfigValues(kubeconfig, key)[0] || ''

const normalizeKubeconfig = (raw = '') => {
  const source = toKubeconfigScalar(raw)
  if (!source) return ''

  const trimmed = source.trim()
  if (!trimmed) return ''

  const looksEncoded =
    /%0A|%3A|%2F|%20/i.test(trimmed) &&
    !/\n/.test(trimmed)

  if (!looksEncoded) {
    const maybeBase64 =
      !/\n/.test(trimmed) &&
      /^[A-Za-z0-9+/=\s]+$/.test(trimmed) &&
      trimmed.length % 4 === 0

    if (maybeBase64) {
      const decodedBase64 = decodeBase64Utf8(trimmed).trim()
      if (/^apiVersion:/m.test(decodedBase64) && /^clusters:/m.test(decodedBase64)) {
        return decodedBase64
      }
    }

    return trimmed
  }

  try {
    const decoded = decodeURIComponent(trimmed).trim()
    if (/^apiVersion:/m.test(decoded) && /^clusters:/m.test(decoded)) {
      return decoded
    }
  } catch (error) {
    console.warn('[k8s-api] decode kubeconfig failed', {
      message: error?.message,
    })
  }

  return trimmed
}

const extractSessionSnapshot = (session) => {
  const records = collectNestedRecords(session, 4)

  const kubeconfig = (() => {
    const kubeconfigKeys = ['kubeconfig', 'kc', 'kubeConfig', 'kube_config']
    for (const record of records) {
      for (const key of kubeconfigKeys) {
        const normalized = normalizeKubeconfig(record?.[key])
        if (normalized) {
          return normalized
        }
      }
    }
    return ''
  })()

  return {
    kubeconfig,
    server: findScalarByKeys(records, ['server', 'clusterServer', 'apiServer']),
    namespace: findScalarByKeys(records, ['namespace', 'nsid', 'ns']),
    token: findScalarByKeys(records, ['token', 'accessToken', 'access_token', 'idToken', 'id_token']),
    userId: findScalarByKeys(records, ['id', 'userId', 'uid']),
    userName: findScalarByKeys(records, ['name', 'username', 'userName']),
  }
}

export const createClusterContext = (session) => {
  const storedKubeconfig = typeof window !== 'undefined' ? sessionStorage.getItem('hermes-kubeconfig') || '' : ''
  const storedOperator = typeof window !== 'undefined' ? sessionStorage.getItem('hermes-operator') || '' : ''
  const sessionSnapshot = extractSessionSnapshot(session)
  const kubeconfig = sessionSnapshot.kubeconfig || normalizeKubeconfig(storedKubeconfig)
  const parsedKubeconfig = parseKubeconfigStruct(kubeconfig)
  const server = toKubeconfigScalar(sessionSnapshot.server || parsedKubeconfig.server || parseKubeconfigValue(kubeconfig, 'server'))
  const namespace = toKubeconfigScalar(
    sessionSnapshot.namespace ||
      parsedKubeconfig.namespace ||
      parseKubeconfigValue(kubeconfig, 'namespace'),
  )
  const sessionToken = toKubeconfigScalar(sessionSnapshot.token)
  const authCandidates = dedupeAuthCandidates([
    ...(parsedKubeconfig.authCandidates || []),
    ...parseKubeconfigValues(kubeconfig, 'token').map((token) => ({
      source: 'kubeconfig token (line fallback)',
      token,
    })),
    ...parseKubeconfigValues(kubeconfig, 'id-token').map((token) => ({
      source: 'kubeconfig id-token (line fallback)',
      token,
    })),
    ...parseKubeconfigValues(kubeconfig, 'access-token').map((token) => ({
      source: 'kubeconfig access-token (line fallback)',
      token,
    })),
    { source: 'session token', token: sessionToken },
  ])
  const token = parsedKubeconfig.token || authCandidates[0]?.token || ''
  const operator = sessionSnapshot.userId || sessionSnapshot.userName || storedOperator || 'workspace'
  const agentLabel = operator

  if (!kubeconfig) {
    throw new Error('未从 Sealos SDK 中读取到 kubeconfig，无法调用后端管理 API')
  }

  if (!server) {
    throw new Error('未从 kubeconfig 中解析到 API Server 地址')
  }

  if (!namespace) {
    throw new Error('未从 sdk session 中解析到 namespace')
  }

  if (typeof window !== 'undefined') {
    sessionStorage.setItem('hermes-kubeconfig', kubeconfig)
    sessionStorage.setItem('hermes-operator', operator)
  }

  console.info('[k8s-api] cluster context parsed', {
    namespace,
    server,
    tokenFromKubeconfig: maskTokenForLog(token),
    tokenFromSession: maskTokenForLog(sessionToken),
    authSources: authCandidates.map((candidate) => candidate.source),
  })

  return {
    server,
    namespace,
    token,
    sessionToken,
    authCandidates,
    activeAuthToken: '',
    activeAuthSource: '',
    operator,
    agentLabel,
    kubeconfig,
  }
}

export const getPreferredAuthToken = (clusterContext) =>
  toKubeconfigScalar(
    clusterContext?.activeAuthToken ||
      clusterContext?.authCandidates?.[0]?.token ||
      clusterContext?.token ||
      clusterContext?.sessionToken,
  )

const randomFromCharset = (length, charset) =>
  Array.from({ length }, () => charset[Math.floor(Math.random() * charset.length)]).join('')

const lowerAlnum = 'abcdefghijklmnopqrstuvwxyz0123456789'
const lowerAlpha = 'abcdefghijklmnopqrstuvwxyz'
const createDns1035Label = (length, tailCharset = '') => {
  const safeLength = Math.max(1, Number(length) || 1)
  const head = randomFromCharset(1, lowerAlpha)
  if (safeLength === 1) return head
  return `${head}${randomFromCharset(safeLength - 1, tailCharset || lowerAlnum)}`
}

const createAppName = () => createDns1035Label(8, lowerAlnum)

export const getClusterInfo = async (clusterContext) => ({
  cluster: clusterContext.server,
  namespace: clusterContext.namespace,
  kc: clusterContext.kubeconfig,
  server: clusterContext.server,
  operator: clusterContext.operator,
  updatedAt: getNow(),
})

export const getCreateBlueprint = (clusterContext, hostConfig, ingressList = []) => {
  void hostConfig
  void ingressList
  const appName = createAppName()

  return {
    appName,
    aliasName: appName,
    namespace: clusterContext.namespace,
    apiKey: '',
    apiUrl: '',
    domainPrefix: '',
    fullDomain: '',
    image: 'nousresearch/hermes-agent:latest',
    state: 'Running',
    runtimeClassName: 'devbox-runtime',
    storageLimit: '10Gi',
    port: 8642,
    cpu: '2000m',
    memory: '4096Mi',
    serviceType: 'ClusterIP',
    protocol: 'TCP',
    user: clusterContext.operator || 'admin',
    workingDir: '/opt/hermes',
    args: ['gateway', 'run'],
  }
}
