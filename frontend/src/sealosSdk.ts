import { createSealosApp, sealosApp } from '@labring/sealos-desktop-sdk/app'

const isBrowser = typeof window !== 'undefined'
const ENABLE_LOCAL_SESSION_FALLBACK =
  import.meta.env.DEV &&
  String(import.meta.env.VITE_AGENTHUB_ENABLE_LOCAL_SESSION || '').toLowerCase() === 'true'

let sdkInitialized = false
let localSessionStorageCleared = false

type SealosSdkMethod = (...args: unknown[]) => unknown

type SealosSdkClient = {
  getSession?: SealosSdkMethod
  getLanguage?: SealosSdkMethod
  getWorkspaceQuota?: SealosSdkMethod
  getHostConfig?: SealosSdkMethod
  addAppEventListen?: SealosSdkMethod
  runEvents?: SealosSdkMethod
}

export interface OpenSealosDesktopAppOptions {
  appKey: string
  pathname: string
  query?: Record<string, string>
  messageData?: Record<string, unknown>
  appSize?: 'minimize' | 'normal' | 'maximize'
}

type SealosEventResult = {
  success?: boolean
  message?: string
  apiName?: string
  [key: string]: unknown
}

const ensureSdkReady = (): SealosSdkClient | null => {
  if (!sdkInitialized) {
    sdkInitialized = true
    try {
      createSealosApp?.()
    } catch (error) {
      console.warn('[sealosSdk] createSealosApp failed:', error)
    }
  }

  if (sealosApp && typeof sealosApp === 'object') {
    return sealosApp as SealosSdkClient
  }

  return null
}

const getLocalSealosSession = async () => {
  if (!isBrowser || !ENABLE_LOCAL_SESSION_FALLBACK) return null

  try {
    const response = await fetch('/__agenthub/local-session')
    if (!response.ok) {
      return null
    }
    const localSession = await response.json()
    if (!localSessionStorageCleared) {
      localSessionStorageCleared = true
      try {
        window.sessionStorage.removeItem('hermes-kubeconfig')
        window.sessionStorage.removeItem('hermes-operator')
      } catch (error) {
        console.warn('[sealosSdk] failed to clear cached local session:', error)
      }
    }
    return localSession
  } catch (error) {
    console.warn('[sealosSdk] local session fallback failed:', error)
    return null
  }
}

const isEmbeddedInIframe = () => {
  if (!isBrowser) return false

  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

const shouldUseLocalSessionFirst = () => ENABLE_LOCAL_SESSION_FALLBACK && !isEmbeddedInIframe()

const getLocalSessionFallback = async () => {
  if (!shouldUseLocalSessionFirst()) return null
  return getLocalSealosSession()
}

const requireSdkMethod = (methodName: keyof SealosSdkClient): SealosSdkMethod => {
  const client = ensureSdkReady()
  if (client && typeof client[methodName] === 'function') {
    return client[methodName]!.bind(client)
  }
  throw new Error(`[sealosSdk] SDK method not available: ${methodName}`)
}

export const initSealosDesktopSdk = () => {
  if (!isBrowser) return () => {}

  ensureSdkReady()

  return () => {}
}

export const getSealosSession = async () => {
  if (shouldUseLocalSessionFirst()) {
    const localSession = await getLocalSealosSession()
    if (localSession) {
      return localSession
    }
  }

  try {
    return await requireSdkMethod('getSession')()
  } catch (error) {
    console.warn('[sealosSdk] getSession failed, fallback to local session:', error)
    const localSession = await getLocalSessionFallback()
    if (localSession) {
      return localSession
    }
    throw error
  }
}
export const getSealosLanguage = async () => requireSdkMethod('getLanguage')()
export const getSealosQuota = async () => requireSdkMethod('getWorkspaceQuota')()
export const getSealosHostConfig = async () => requireSdkMethod('getHostConfig')()

const extractSealosEventError = (eventName: string, result: unknown) => {
  if (!result || typeof result !== 'object') {
    return null
  }

  const payload = result as SealosEventResult
  if (payload.success !== false) {
    return null
  }

  const message =
    typeof payload.message === 'string' && payload.message.trim().length > 0
      ? payload.message.trim()
      : `${eventName} failed`

  return new Error(message)
}

export const runSealosEvent = async (eventName: string, payload: Record<string, unknown>) => {
  const result = await requireSdkMethod('runEvents')(eventName, payload)
  const error = extractSealosEventError(eventName, result)
  if (error) {
    throw error
  }
  return result
}

export const openSealosDesktopApp = async ({
  appKey,
  pathname,
  query = {},
  messageData = {},
  appSize = 'normal',
}: OpenSealosDesktopAppOptions) =>
  runSealosEvent('openDesktopApp', {
    appKey,
    pathname,
    query,
    messageData,
    appSize,
  })

export const addSealosAppEventListener = (eventName: string, handler: (...args: unknown[]) => void) => {
  const addListener = requireSdkMethod('addAppEventListen')
  return addListener(eventName, handler)
}

export const getSealosSdkDebugInfo = () => {
  const client = ensureSdkReady()
  return {
    sdkAvailable: Boolean(client),
    methods: client
      ? {
        getSession: typeof client.getSession === 'function',
        getLanguage: typeof client.getLanguage === 'function',
        getWorkspaceQuota: typeof client.getWorkspaceQuota === 'function',
        getHostConfig: typeof client.getHostConfig === 'function',
        addAppEventListen: typeof client.addAppEventListen === 'function',
        runEvents: typeof client.runEvents === 'function',
      }
      : null,
    isBrowser,
    location: isBrowser ? window.location.href : '',
  }
}
