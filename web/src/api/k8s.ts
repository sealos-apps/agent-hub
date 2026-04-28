/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { buildChatApiUrl } from './chat'
import { buildProxyUrl, formatDisplayTime, requestJsonWithAuthRetry, requestMaybeConflictWithAuthRetry } from './shared'

const buildAgentLabels = (clusterContext, extraLabels = {}) => ({
  ...extraLabels,
  'agent.sealos.io/name': clusterContext.agentLabel,
})

const buildAppLabels = (clusterContext, appName, extraLabels = {}) => ({
  ...extraLabels,
  app: appName,
  'agent.sealos.io/name': clusterContext.agentLabel,
})

const withLabelSelector = (clusterContext, extraLabels = {}) => {
  const labels = buildAgentLabels(clusterContext, extraLabels)
  return Object.entries(labels)
    .map(([key, value]) => `${key}=${value}`)
    .join(',')
}

const mapDevboxItem = (item, operator) => {
  const metadata = item?.metadata || {}
  const spec = item?.spec || {}
  const config = spec?.config || {}
  const appPort = config?.appPorts?.[0] || spec?.network?.extraPorts?.[0] || {}

  return {
    id: metadata.uid || metadata.name,
    name: metadata.name || '--',
    owner: operator || '--',
    port: appPort.port || appPort.targetPort || appPort.containerPort || '--',
    status: spec?.state || item?.status?.phase || '--',
    updatedAt: formatDisplayTime(metadata.creationTimestamp || metadata.managedFields?.[0]?.time),
    desc: `DevBox / ${metadata.namespace || '--'}`,
    apiKey: config?.env?.find((env) => env.name === 'API_SERVER_KEY')?.value || '',
    apiUrl: '',
    yaml: item,
  }
}

const mapServiceItem = (item, operator) => {
  const metadata = item?.metadata || {}
  const spec = item?.spec || {}
  const port = spec?.ports?.[0] || {}

  return {
    id: metadata.uid || metadata.name,
    name: metadata.name || '--',
    owner: operator || '--',
    port: port.port || port.targetPort || '--',
    status: spec?.type || '--',
    updatedAt: formatDisplayTime(metadata.creationTimestamp || metadata.managedFields?.[0]?.time),
    desc: `Service / ${metadata.namespace || '--'}`,
    apiKey: '',
    apiUrl: '',
    yaml: item,
  }
}

const mapIngressItem = (item, operator) => {
  const metadata = item?.metadata || {}
  const rule = item?.spec?.rules?.[0] || {}
  const backendPort = rule?.http?.paths?.[0]?.backend?.service?.port?.number || '--'

  return {
    id: metadata.uid || metadata.name,
    name: metadata.name || '--',
    owner: operator || '--',
    port: backendPort,
    status: item?.status?.loadBalancer?.ingress?.length ? 'Active' : 'Pending',
    updatedAt: formatDisplayTime(metadata.creationTimestamp || metadata.managedFields?.[0]?.time),
    desc: rule.host || `Ingress / ${metadata.namespace || '--'}`,
    apiKey: '',
    apiUrl: buildChatApiUrl(rule.host),
    yaml: item,
  }
}

const resourceConfig = {
  devbox: {
    listPath: (namespace) => `/apis/devbox.sealos.io/v1alpha2/namespaces/${namespace}/devboxes`,
    detailPath: (namespace, name) => `/apis/devbox.sealos.io/v1alpha2/namespaces/${namespace}/devboxes/${name}`,
    mapper: mapDevboxItem,
  },
  service: {
    listPath: (namespace) => `/api/v1/namespaces/${namespace}/services`,
    detailPath: (namespace, name) => `/api/v1/namespaces/${namespace}/services/${name}`,
    mapper: mapServiceItem,
  },
  ingress: {
    listPath: (namespace) => `/apis/networking.k8s.io/v1/namespaces/${namespace}/ingresses`,
    detailPath: (namespace, name) => `/apis/networking.k8s.io/v1/namespaces/${namespace}/ingresses/${name}`,
    mapper: mapIngressItem,
  },
}

export const findExecPodForApp = async (appName, clusterContext) => {
  if (!appName) {
    throw new Error('缺少应用名，无法查找 Pod')
  }

  const searchParams = new URLSearchParams({
    labelSelector: withLabelSelector(clusterContext, { app: appName }),
  })

  const data = await requestJsonWithAuthRetry(
    buildProxyUrl(`/api/v1/namespaces/${clusterContext.namespace}/pods`, searchParams),
    clusterContext,
    {
      method: 'GET',
    },
  )

  const pods = data?.items || []
  if (!pods.length) {
    throw new Error(`未找到应用 ${appName} 对应的 Pod`)
  }

  const sortedPods = [...pods].sort((a, b) => {
    const phaseOrder = { Running: 0, Pending: 1 }
    const phaseA = phaseOrder[a?.status?.phase] ?? 99
    const phaseB = phaseOrder[b?.status?.phase] ?? 99
    if (phaseA !== phaseB) return phaseA - phaseB

    const timeA = new Date(a?.metadata?.creationTimestamp || 0).getTime()
    const timeB = new Date(b?.metadata?.creationTimestamp || 0).getTime()
    return timeB - timeA
  })

  const selected = sortedPods[0]
  const podName = selected?.metadata?.name
  const containerName = selected?.spec?.containers?.[0]?.name || ''

  if (!podName) {
    throw new Error(`应用 ${appName} 的 Pod 名称为空`)
  }

  return {
    podName,
    containerName,
    namespace: clusterContext.namespace,
    status: selected?.status?.phase || '--',
  }
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])

const resolveBrowserOrigin = (clusterServer = '') => {
  if (typeof window === 'undefined') {
    return 'http://localhost'
  }

  const currentUrl = new URL(window.location.href)
  const currentHost = currentUrl.hostname
  const isLocalHost = LOCAL_HOSTS.has(currentHost)

  if (!isLocalHost) {
    return currentUrl.origin
  }

  const candidates = []

  if (document.referrer) {
    candidates.push(document.referrer)
  }

  const ancestorOrigin = window.location.ancestorOrigins?.[0]
  if (ancestorOrigin) {
    candidates.push(ancestorOrigin)
  }

  if (clusterServer) {
    try {
      const clusterUrl = new URL(clusterServer)
      candidates.push(`https://${clusterUrl.hostname}`)
    } catch {
      // ignore
    }
  }

  for (const value of candidates) {
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' && !LOCAL_HOSTS.has(url.hostname)) {
        return url.origin
      }
    } catch {
      // ignore invalid candidate
    }
  }

  return currentUrl.origin
}

export const buildPodExecWsCandidates = ({
  namespace,
  podName,
  containerName,
  token,
  clusterServer = '',
  commands = ['sh', '-lc', 'hermes'],
  localProxyOnly = false,
}) => {
  const params = new URLSearchParams()

  commands.forEach((command) => params.append('command', command))

  if (containerName) {
    params.set('container', containerName)
  }

  params.set('stdin', '1')
  params.set('stdout', '1')
  params.set('stderr', '1')
  params.set('tty', '1')
  void token
  void clusterServer

  const query = params.toString()
  const list = []

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const browserOrigin = localProxyOnly && currentOrigin ? currentOrigin : resolveBrowserOrigin(clusterServer)
  const browserBase = new URL(browserOrigin)
  browserBase.protocol = browserBase.protocol === 'https:' ? 'wss:' : 'ws:'

  list.push(
    `${browserBase.toString().replace(/\/$/, '')}/k8s-api/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}/exec?${query}`,
  )

  if (localProxyOnly) {
    return [...new Set(list)]
  }

  list.push(
    `${browserBase.toString().replace(/\/$/, '')}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}/exec?${query}`,
  )

  if (clusterServer) {
    try {
      const clusterUrl = new URL(clusterServer)
      clusterUrl.protocol = clusterUrl.protocol === 'https:' ? 'wss:' : 'ws:'
      list.push(
        `${clusterUrl.toString().replace(/\/$/, '')}/api/v1/namespaces/${encodeURIComponent(namespace)}/pods/${encodeURIComponent(podName)}/exec?${query}`,
      )
    } catch {
      // ignore invalid cluster server
    }
  }

  return [...new Set(list)]
}

export const buildPodExecWsUrl = (options) => buildPodExecWsCandidates(options)[0] || ''

export const listResources = async (type, clusterContext) => {
  const config = resourceConfig[type]
  if (!config) throw new Error(`不支持的资源类型: ${type}`)

  const searchParams = new URLSearchParams({
    labelSelector: withLabelSelector(clusterContext),
  })

  const data = await requestJsonWithAuthRetry(
    buildProxyUrl(config.listPath(clusterContext.namespace), searchParams),
    clusterContext,
    {
      method: 'GET',
    },
  )

  return (data?.items || []).map((item) => config.mapper(item, clusterContext.operator))
}

export const createResource = async (type, payload, clusterContext) => {
  const config = resourceConfig[type]
  if (!config) throw new Error(`不支持的资源类型: ${type}`)

  const nextYaml = {
    ...payload.yaml,
    metadata: {
      ...(payload.yaml?.metadata || {}),
      labels: buildAgentLabels(clusterContext, payload.yaml?.metadata?.labels || {}),
    },
  }

  if (type === 'devbox') {
    nextYaml.spec = {
      ...(nextYaml.spec || {}),
      labels: buildAppLabels(clusterContext, nextYaml.metadata?.name, nextYaml.spec?.labels || {}),
      config: {
        ...(nextYaml.spec?.config || {}),
        labels: buildAppLabels(clusterContext, nextYaml.metadata?.name, nextYaml.spec?.config?.labels || {}),
      },
    }
  }

  if (type === 'service') {
    nextYaml.spec = {
      ...(nextYaml.spec || {}),
      selector: buildAppLabels(clusterContext, nextYaml.metadata?.name, nextYaml.spec?.selector || {}),
    }
  }

  const { conflict, data } = await requestMaybeConflictWithAuthRetry(
    buildProxyUrl(config.listPath(clusterContext.namespace)),
    clusterContext,
    {
      method: 'POST',
      body: JSON.stringify(nextYaml),
    },
  )

  if (conflict) {
    const current = await requestJsonWithAuthRetry(
      buildProxyUrl(config.detailPath(clusterContext.namespace, nextYaml.metadata.name)),
      clusterContext,
      {
        method: 'GET',
      },
    )
    return config.mapper(current, clusterContext.operator)
  }

  return config.mapper(data, clusterContext.operator)
}

export const updateResource = async (type, name, payload, clusterContext) => {
  const config = resourceConfig[type]
  if (!config) throw new Error(`不支持的资源类型: ${type}`)

  const nextYaml = {
    ...payload.yaml,
    metadata: {
      ...(payload.yaml?.metadata || {}),
      labels: buildAgentLabels(clusterContext, payload.yaml?.metadata?.labels || {}),
    },
  }

  if (type === 'devbox') {
    nextYaml.spec = {
      ...(nextYaml.spec || {}),
      labels: buildAppLabels(clusterContext, nextYaml.metadata?.name, nextYaml.spec?.labels || {}),
      config: {
        ...(nextYaml.spec?.config || {}),
        labels: buildAppLabels(clusterContext, nextYaml.metadata?.name, nextYaml.spec?.config?.labels || {}),
      },
    }
  }

  if (type === 'service') {
    nextYaml.spec = {
      ...(nextYaml.spec || {}),
      selector: buildAppLabels(clusterContext, nextYaml.metadata?.name, nextYaml.spec?.selector || {}),
    }
  }

  const data = await requestJsonWithAuthRetry(
    buildProxyUrl(config.detailPath(clusterContext.namespace, name)),
    clusterContext,
    {
      method: 'PUT',
      body: JSON.stringify(nextYaml),
    },
  )

  return config.mapper(data, clusterContext.operator)
}

export const deleteResource = async (type, name, clusterContext) => {
  const config = resourceConfig[type]
  if (!config) throw new Error(`不支持的资源类型: ${type}`)

  await requestJsonWithAuthRetry(
    buildProxyUrl(config.detailPath(clusterContext.namespace, name)),
    clusterContext,
    {
      method: 'DELETE',
    },
  )

  return true
}
