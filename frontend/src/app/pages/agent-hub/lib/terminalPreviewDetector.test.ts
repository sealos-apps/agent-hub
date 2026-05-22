import {
  extractTerminalPreviewLinks,
  extractTerminalPreviewPorts,
} from './terminalPreviewDetector'

describe('extractTerminalPreviewPorts', () => {
  it('extracts localhost, 127.0.0.1, and 0.0.0.0 ports', () => {
    const ports = extractTerminalPreviewPorts([
      'Local: http://localhost:3000/',
      'Network: http://0.0.0.0:5173',
      'Alt: http://127.0.0.1:8080',
    ])

    expect(ports).toEqual([3000, 5173, 8080])
  })

  it('extracts host:port without protocol', () => {
    expect(extractTerminalPreviewPorts(['ready on localhost:4321'])).toEqual([4321])
  })

  it('deduplicates ports and ignores invalid values', () => {
    const ports = extractTerminalPreviewPorts([
      'localhost:3000 localhost:3000 127.0.0.1:0 0.0.0.0:65536 http://localhost:abc',
    ])

    expect(ports).toEqual([3000])
  })

  it('returns clickable link ranges for terminal lines', () => {
    const links = extractTerminalPreviewLinks('Local: http://localhost:3000/ ready')

    expect(links).toEqual([
      {
        text: 'http://localhost:3000/',
        port: 3000,
        startColumn: 7,
        endColumn: 29,
      },
    ])
  })
})
