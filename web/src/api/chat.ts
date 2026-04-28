/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

const normalizeApiUrl = (value = '') => {
  if (!value) return ''

  try {
    const target = new URL(value)
    target.pathname = target.pathname.replace(/\/$/, '') || '/'
    return target.toString().replace(/\/$/, '')
  } catch {
    return value.replace(/\/$/, '')
  }
}

export const buildChatApiCandidates = (host = '') => {
  if (!host) return []

  const variants = [`https://${host}/v1`]
  return [...new Set(variants.map(normalizeApiUrl).filter(Boolean))]
}

export const buildCherryStudioChatApiUrl = (value = '') => {
  const normalized = normalizeApiUrl(value)
  if (!normalized) return ''

  try {
    const target = new URL(normalized)
    target.pathname = target.pathname.replace(/\/$/, '') || '/'

    if (target.pathname === '/v1') {
      return target.toString().replace(/\/$/, '')
    }

    if (target.pathname.endsWith('/v1/chat/completions')) {
      target.pathname = '/v1'
      return target.toString().replace(/\/$/, '')
    }

    return target.toString().replace(/\/$/, '')
  } catch {
    return normalized
  }
}

export const buildChatApiUrl = (host = '') => buildChatApiCandidates(host)[0] || ''
