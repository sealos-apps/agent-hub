const pickString = (value: string | undefined, fallback: string) => {
  const next = String(value || '').trim()
  return next || fallback
}

export const APP_NAME = pickString(import.meta.env.VITE_AGENTHUB_BRAND_NAME, 'Agent Hub')
export const APP_LOGO_URL = pickString(import.meta.env.VITE_AGENTHUB_LOGO_URL, '/brand/agent-hub.svg')
export const APP_BROWSER_TITLE = pickString(
  import.meta.env.VITE_AGENTHUB_BROWSER_TITLE,
  'Agent Hub Web',
)
export const APP_TERMINAL_TITLE = `${APP_NAME} Terminal`
