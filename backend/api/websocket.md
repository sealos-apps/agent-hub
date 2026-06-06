# WebSocket Protocol

Endpoint:

- `ws://{host}/api/v1/agents/{agent-name}/ws`
- `ws://{host}/api/v1/agents/{agent-name}/terminal/ws`

Authentication:

- Preferred:
  - connect first
  - send `auth` as the first business message
- Compatibility options:
  - `Authorization` request header
  - `?authorization=<url-encoded-kubeconfig>`

The dedicated terminal endpoint only accepts first-message authentication. It does not accept kubeconfig credentials in the URL.

`auth` message:

```json
{
  "type": "auth",
  "requestId": "auth-1",
  "data": {
    "authorization": "<url-encoded-kubeconfig>"
  }
}
```

If the connection is not authenticated yet, the server sends:

```json
{
  "type": "auth.required",
  "requestId": "xxx",
  "data": {
    "message": "send auth message with encoded kubeconfig"
  }
}
```

## Envelope

Client -> server:

```json
{
  "type": "terminal.input",
  "requestId": "req_123",
  "data": {}
}
```

Server -> client:

```json
{
  "type": "terminal.output",
  "requestId": "req_123",
  "data": {}
}
```

Error:

```json
{
  "type": "error",
  "requestId": "req_123",
  "data": {
    "code": "invalid_path",
    "message": "path escapes the workspace root"
  }
}
```

## Supported capabilities

### Common

- `auth`
- `auth.required`
- `ping`
- `pong`
- `system.ready`
- `error`

### Dedicated Terminal

Use the dedicated terminal endpoint for interactive terminal rendering:

```text
GET /api/v1/agents/:agentName/terminal/ws
```

Client -> server:

```json
{"type":"auth","authorization":"<encoded-kubeconfig>","cwd":"/opt/hermes"}
```

```json
{"type":"stdin","data":"ls\n"}
```

```json
{"type":"resize","cols":120,"rows":32}
```

```json
{"type":"ping"}
```

Server -> client:

```json
{"type":"connected","data":"Terminal connected successfully","namespace":"ns-demo","podName":"agent-pod","container":"agent"}
```

```json
{"type":"stdout","data":"..."}
```

```json
{"type":"stderr","data":"..."}
```

```json
{"type":"error","code":"terminal_exec_failed","data":"..."}
```

```json
{"type":"pong"}
```

This endpoint is the terminal path used by the frontend. It does not fall back to the general `/ws` terminal protocol.

### General WS Terminal Legacy Messages

- `terminal.open`
- `terminal.opened`
- `terminal.input`
- `terminal.resize`
- `terminal.output`
- `terminal.close`
- `terminal.closed`

The general `/ws` endpoint keeps these messages for non-terminal compatibility and existing internal tests. New terminal UI traffic uses the dedicated endpoint above.
Supports multiple terminal sessions per WS connection.
`data.id` is required for every terminal message.

Example:

```json
{
  "type": "terminal.open",
  "requestId": "term-open-1",
  "data": {
    "id": "term-1",
    "cwd": "."
  }
}
```

### Logs

- `log.subscribe`
- `log.chunk`
- `log.unsubscribe`
- `log.closed`

Supports multiple log subscriptions per WS connection.
`data.id` is required for every log message.

Example:

```json
{
  "type": "log.subscribe",
  "requestId": "log-sub-1",
  "data": {
    "id": "log-1",
    "tailLines": 50
  }
}
```

### Files

- `file.list`
- `file.read`
- `file.download`
- `file.write`
- `file.delete`
- `file.mkdir`
- `file.upload.begin`
- `file.upload.chunk`
- `file.upload.end`
- `file.result`

Examples:

```json
{
  "type": "file.list",
  "requestId": "file-list",
  "data": {
    "path": "."
  }
}
```

```json
{
  "type": "file.download",
  "requestId": "file-download",
  "data": {
    "path": "notes/today.txt"
  }
}
```

```json
{
  "type": "file.upload.begin",
  "requestId": "upload-begin",
  "data": {
    "id": "upload-1",
    "path": "notes/today.txt"
  }
}
```

```json
{
  "type": "file.upload.chunk",
  "requestId": "upload-chunk",
  "data": {
    "id": "upload-1",
    "chunk": "aGVsbG8gdXBsb2FkCg=="
  }
}
```

```json
{
  "type": "file.upload.end",
  "requestId": "upload-end",
  "data": {
    "id": "upload-1"
  }
}
```

Notes:

- File root is fixed to `/opt/hermes`
- Absolute paths are rejected
- `..` escapes are rejected
- `file.read` is inline text read
- `file.download` returns base64 content
- `file.write` is text overwrite/edit
- `file.upload.*` supports chunked upload
- `data.id` is required for every upload message
- `file.list` returns structured items with:
  - `name`
  - `type`
  - `size`
