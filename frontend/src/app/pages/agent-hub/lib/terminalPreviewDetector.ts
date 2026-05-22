const localPreviewPattern =
  /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1|0\.0\.0\.0):([0-9]{1,5})(?:\/[^\s]*)?(?=[\s"'`)\]}>,;:]|$)/gi

export type TerminalPreviewLink = {
  text: string
  port: number
  startColumn: number
  endColumn: number
}

export const isValidTerminalPreviewPort = (port: number) =>
  Number.isInteger(port) && port >= 1 && port <= 65535

export const extractTerminalPreviewPorts = (chunks: string[] | string): number[] => {
  const values = Array.isArray(chunks) ? chunks : [chunks]
  const ports: number[] = []
  const seen = new Set<number>()

  values.forEach((chunk) => {
    const text = String(chunk || '')
    localPreviewPattern.lastIndex = 0
    let match: RegExpExecArray | null = null
    while ((match = localPreviewPattern.exec(text)) !== null) {
      const port = Number.parseInt(match[1] || '', 10)
      if (!isValidTerminalPreviewPort(port) || seen.has(port)) continue
      seen.add(port)
      ports.push(port)
    }
  })

  return ports
}

export const extractTerminalPreviewLinks = (line: string): TerminalPreviewLink[] => {
  const text = String(line || '')
  const links: TerminalPreviewLink[] = []
  localPreviewPattern.lastIndex = 0

  let match: RegExpExecArray | null = null
  while ((match = localPreviewPattern.exec(text)) !== null) {
    const port = Number.parseInt(match[1] || '', 10)
    if (!isValidTerminalPreviewPort(port)) continue
    const rawText = match[0] || ''
    links.push({
      text: rawText,
      port,
      startColumn: match.index,
      endColumn: match.index + rawText.length,
    })
  }

  return links
}
