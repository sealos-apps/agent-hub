export const MARKDOWN_PREVIEW_EXTENSIONS = new Set(['md', 'markdown', 'mdx'])
export const TEXT_PREVIEW_EXTENSIONS = new Set([
  'txt',
  'json',
  'yaml',
  'yml',
  'js',
  'jsx',
  'ts',
  'tsx',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'xml',
  'svg',
  'csv',
  'log',
  'ini',
  'toml',
  'env',
  'py',
  'sh',
  'bash',
  'zsh',
  'sql',
  'java',
  'go',
  'rs',
  'conf',
  'properties',
  'dockerignore',
  'gitignore',
  'lock',
  'text',
])
export const IMAGE_PREVIEW_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'])
export const BROWSER_PREVIEW_EXTENSIONS = new Set(['pdf'])

const namedTextFiles = new Set(['readme', 'license', 'dockerfile', 'makefile'])

export const getFileExtension = (value = '') => {
  const match = String(value || '').toLowerCase().match(/\.([^.]+)$/)
  return match?.[1] || ''
}

export const isMarkdownLikeFile = (value = '') => MARKDOWN_PREVIEW_EXTENSIONS.has(getFileExtension(value))

export const isTextPreviewableFile = (value = '') => {
  const normalizedValue = String(value || '').trim().toLowerCase()
  const extension = getFileExtension(value)
  if (MARKDOWN_PREVIEW_EXTENSIONS.has(extension) || TEXT_PREVIEW_EXTENSIONS.has(extension)) {
    return true
  }
  return namedTextFiles.has(normalizedValue)
}

export const isImagePreviewableFile = (value = '') => IMAGE_PREVIEW_EXTENSIONS.has(getFileExtension(value))

export const isBrowserPreviewableFile = (value = '') =>
  BROWSER_PREVIEW_EXTENSIONS.has(getFileExtension(value))

