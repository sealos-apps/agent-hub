const localhostMessageOriginPattern = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i

export const explorerFileSystemRootPath = '/'

export const normalizeExplorerPath = (value: string) => {
  const raw = String(value || '').trim()
  if (!raw) return explorerFileSystemRootPath

  const normalized = raw.replace(/\/+/g, '/').replace(/\/+$/, '')
  if (!normalized) return explorerFileSystemRootPath

  if (normalized.startsWith('/')) {
    return normalized
  }

  return `/${normalized}`
}

export const buildExplorerPathChain = (value: string) => {
  const normalized = normalizeExplorerPath(value)
  if (normalized === explorerFileSystemRootPath) {
    return [explorerFileSystemRootPath]
  }

  const segments = normalized.split('/').filter(Boolean)
  const chain: string[] = [explorerFileSystemRootPath]
  let current = ''
  for (const segment of segments) {
    current += `/${segment}`
    chain.push(current)
  }
  return chain
}

export const applyAutoExpandChain = (
  current: Record<string, boolean>,
  chain: string[],
  collapsedPaths: Set<string>,
) => {
  let changed = false
  const next = { ...current }
  for (const path of chain) {
    if (collapsedPaths.has(path)) {
      continue
    }
    if (!next[path]) {
      next[path] = true
      changed = true
    }
  }
  return changed ? next : current
}

export const isTrustedDesktopMessageOrigin = (origin: string, currentOrigin: string) => {
  const normalizedOrigin = String(origin || '').trim()
  if (!normalizedOrigin) return false
  if (normalizedOrigin === currentOrigin) return true
  return localhostMessageOriginPattern.test(normalizedOrigin)
}
