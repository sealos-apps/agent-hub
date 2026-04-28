type WSBinaryData = Record<string, unknown>

export type WSBinaryMessage = {
  type: string
  requestId?: string
  data?: WSBinaryData
}

const wsBinaryVersion = 2
const wsBinaryHeaderSize = 20

const wsTypeCodeByName: Record<string, number> = {
  ping: 1,
  pong: 2,
  auth: 3,
  'auth.required': 4,
  'system.ready': 5,
  error: 6,
  'terminal.open': 10,
  'terminal.opened': 11,
  'terminal.input': 12,
  'terminal.output': 13,
  'terminal.resize': 14,
  'terminal.close': 15,
  'terminal.closed': 16,
  'log.subscribe': 20,
  'log.unsubscribe': 21,
  'log.chunk': 22,
  'log.closed': 23,
  'file.list': 30,
  'file.read': 31,
  'file.download': 32,
  'file.write': 33,
  'file.delete': 34,
  'file.mkdir': 35,
  'file.upload.begin': 36,
  'file.upload.chunk': 37,
  'file.upload.end': 38,
  'file.result': 39,
}

const wsTypeNameByCode: Record<number, string> = Object.fromEntries(
  Object.entries(wsTypeCodeByName).map(([name, code]) => [code, name]),
)

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

const inferPayloadKey = (type: string, data: WSBinaryData) => {
  if (type === 'terminal.input') return 'input'
  if (type === 'terminal.output') return 'output'
  if (type === 'log.chunk') return 'chunk'
  if (type === 'file.upload.chunk') return 'chunk'
  if (type === 'file.write') return 'content'
  if (type === 'auth') return 'authorization'
  if (type === 'file.result') {
    const op = String(data.op || '')
    if (op === 'read' || op === 'download') return 'content'
  }
  return ''
}

export const encodeWSBinaryMessage = (message: WSBinaryMessage): ArrayBuffer => {
  const typeCode = wsTypeCodeByName[String(message.type || '').trim()]
  if (!typeCode) {
    throw new Error(`unsupported websocket message type: ${message.type}`)
  }

  const data: WSBinaryData = { ...(message.data || {}) }
  const requestID = String(message.requestId || '')
  const sessionID = typeof data.id === 'string' ? String(data.id) : ''

  let payload = ''
  const payloadKey = inferPayloadKey(message.type, data)
  if (payloadKey) {
    const candidate = data[payloadKey]
    if (typeof candidate === 'string') {
      payload = candidate
      delete data[payloadKey]
    }
  }
  if (payload) {
    data._payloadKey = payloadKey
  }

  const requestIDBytes = textEncoder.encode(requestID)
  const sessionIDBytes = textEncoder.encode(sessionID)
  const metaJSON = Object.keys(data).length ? JSON.stringify(data) : ''
  const metaBytes = metaJSON ? textEncoder.encode(metaJSON) : new Uint8Array()
  const payloadBytes = payload ? textEncoder.encode(payload) : new Uint8Array()

  const total =
    wsBinaryHeaderSize +
    requestIDBytes.length +
    sessionIDBytes.length +
    metaBytes.length +
    payloadBytes.length
  const buffer = new ArrayBuffer(total)
  const view = new DataView(buffer)
  const output = new Uint8Array(buffer)

  view.setUint8(0, wsBinaryVersion)
  view.setUint8(1, typeCode)
  view.setUint16(2, payloadBytes.length ? 1 : 0, true)
  view.setUint32(4, requestIDBytes.length, true)
  view.setUint32(8, sessionIDBytes.length, true)
  view.setUint32(12, metaBytes.length, true)
  view.setUint32(16, payloadBytes.length, true)

  let offset = wsBinaryHeaderSize
  output.set(requestIDBytes, offset)
  offset += requestIDBytes.length
  output.set(sessionIDBytes, offset)
  offset += sessionIDBytes.length
  output.set(metaBytes, offset)
  offset += metaBytes.length
  output.set(payloadBytes, offset)

  return buffer
}

export const decodeWSBinaryMessage = (raw: ArrayBuffer | Uint8Array): WSBinaryMessage => {
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
  if (bytes.length < wsBinaryHeaderSize) {
    throw new Error('binary frame too short')
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const version = view.getUint8(0)
  if (version !== wsBinaryVersion) {
    throw new Error(`unsupported binary frame version: ${version}`)
  }

  const typeCode = view.getUint8(1)
  const type = wsTypeNameByCode[typeCode]
  if (!type) {
    throw new Error(`unsupported binary frame type code: ${typeCode}`)
  }

  const requestIDLen = view.getUint32(4, true)
  const sessionIDLen = view.getUint32(8, true)
  const metaLen = view.getUint32(12, true)
  const payloadLen = view.getUint32(16, true)
  const total = wsBinaryHeaderSize + requestIDLen + sessionIDLen + metaLen + payloadLen
  if (total !== bytes.length) {
    throw new Error('invalid binary frame length')
  }

  let offset = wsBinaryHeaderSize
  const requestID = textDecoder.decode(bytes.subarray(offset, offset + requestIDLen))
  offset += requestIDLen
  const sessionID = textDecoder.decode(bytes.subarray(offset, offset + sessionIDLen))
  offset += sessionIDLen
  const metaRaw = bytes.subarray(offset, offset + metaLen)
  offset += metaLen
  const payloadRaw = bytes.subarray(offset, offset + payloadLen)

  const data: WSBinaryData = metaRaw.length
    ? (JSON.parse(textDecoder.decode(metaRaw)) as WSBinaryData)
    : {}

  if (sessionID && typeof data.id === 'undefined') {
    data.id = sessionID
  }

  if (payloadRaw.length) {
    let payloadKey = typeof data._payloadKey === 'string' ? String(data._payloadKey) : ''
    delete data._payloadKey
    if (!payloadKey) {
      payloadKey = inferPayloadKey(type, data)
    }
    if (payloadKey) {
      data[payloadKey] = textDecoder.decode(payloadRaw)
    }
  } else {
    delete data._payloadKey
  }

  return {
    type,
    requestId: requestID,
    data,
  }
}
