# Frontend Live Examples

这份文档整理了一轮真实联调得到的请求与响应样例，供前端直接对照开发。

说明：

- 这些样例来自本地启动服务后，用本机 `~/.kube/config` 对真实集群发起调用得到
- 响应里的 `requestId`、`agentName`、`ingressDomain` 等值每次都会变化
- 文中的 kubeconfig 用 `<url-encoded-kubeconfig>` 代替

## Base URL

```text
http://127.0.0.1:8999
```

## HTTP examples

### 1. `GET /healthz`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  http://127.0.0.1:8999/healthz
```

响应：

```json
{"code":0,"message":"ok","requestId":"1377bdbb-cb92-456c-957c-e6cee603c620","data":{"status":"ok"}}
```

HTTP：

```text
200
```

### 2. `GET /readyz`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  http://127.0.0.1:8999/readyz
```

响应：

```json
{"code":0,"message":"ok","requestId":"d6225a29-7408-498d-84fb-b110958e2df1","data":{"checks":{"apiServerImage":"ok","ingressSuffix":"ok","kubernetes":"request_scoped","port":"ok"},"status":"ready"}}
```

HTTP：

```text
200
```

### 3. `GET /api/v1/agents`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  -H "Authorization: <url-encoded-kubeconfig>" \
  http://127.0.0.1:8999/api/v1/agents
```

响应示例：

```json
{"code":0,"message":"ok","requestId":"5198c045-e259-4e24-aa03-688c12f3438a","data":{"items":[{"agentName":"fullapi-hhwitmlw","aliasName":"Full API","namespace":"ns-38cq5qwz","status":"Running","cpu":"1","memory":"2Gi","storage":"10Gi","modelProvider":"openai","modelBaseURL":"https://api.openai.com/v1","model":"gpt-4o-mini","hasModelAPIKey":false,"ingressDomain":"rmwjar6a8xua-agent.usw-1.sealos.app","apiBaseURL":"https://rmwjar6a8xua-agent.usw-1.sealos.app/v1","createdAt":"2026-04-14T05:23:55Z"}],"total":1,"meta":{"namespace":"ns-38cq5qwz"}}}
```

HTTP：

```text
200
```

### 4. `POST /api/v1/agents`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' -X POST \
  -H "Authorization: <url-encoded-kubeconfig>" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8999/api/v1/agents \
  -d '{
    "agent-name": "demo-agent",
    "agent-cpu": "1000m",
    "agent-memory": "2Gi",
    "agent-storage": "10Gi",
    "agent-model-provider": "openai",
    "agent-model-baseurl": "https://api.openai.com/v1",
    "agent-model-apikey": "",
    "agent-model": "gpt-4o-mini",
    "agent-alias-name": "Full Capture"
  }'
```

响应：

```json
{"code":0,"message":"ok","requestId":"e998a945-35f9-49e1-9262-1b9ba3f2ab09","data":{"agent":{"agentName":"fullcap-4gcjexv8","aliasName":"Full Capture","namespace":"ns-38cq5qwz","status":"Running","cpu":"1000m","memory":"2Gi","storage":"10Gi","modelProvider":"openai","modelBaseURL":"https://api.openai.com/v1","model":"gpt-4o-mini","hasModelAPIKey":false,"ingressDomain":"jumv49uwuymn-agent.usw-1.sealos.app","apiBaseURL":"https://jumv49uwuymn-agent.usw-1.sealos.app/v1","createdAt":"2026-04-14T05:41:56Z"}}}
```

HTTP：

```text
201
```

### 5. `GET /api/v1/agents/:agentName`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  -H "Authorization: <url-encoded-kubeconfig>" \
  http://127.0.0.1:8999/api/v1/agents/fullcap-4gcjexv8
```

响应：

```json
{"code":0,"message":"ok","requestId":"4c871866-2e1e-4b84-911d-7cf5fafbe6a5","data":{"agent":{"agentName":"fullcap-4gcjexv8","aliasName":"Full Capture","namespace":"ns-38cq5qwz","status":"Running","cpu":"1","memory":"2Gi","storage":"10Gi","modelProvider":"openai","modelBaseURL":"https://api.openai.com/v1","model":"gpt-4o-mini","hasModelAPIKey":false,"ingressDomain":"jumv49uwuymn-agent.usw-1.sealos.app","apiBaseURL":"https://jumv49uwuymn-agent.usw-1.sealos.app/v1","createdAt":"2026-04-14T05:41:56Z"}}}
```

HTTP：

```text
200
```

### 6. `PATCH /api/v1/agents/:agentName`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' -X PATCH \
  -H "Authorization: <url-encoded-kubeconfig>" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8999/api/v1/agents/fullcap-4gcjexv8 \
  -d '{
    "agent-memory": "4Gi",
    "agent-model": "gpt-4.1",
    "agent-alias-name": "Full Capture Updated"
  }'
```

响应：

```json
{"code":0,"message":"ok","requestId":"18666325-2f5b-443b-9cc2-e864204c62f2","data":{"agent":{"agentName":"patchfix-ca4kv5bs","aliasName":"Patch Fix Updated","namespace":"ns-38cq5qwz","status":"Running","cpu":"1","memory":"4Gi","storage":"10Gi","modelProvider":"openai","modelBaseURL":"https://api.openai.com/v1","model":"gpt-4.1","hasModelAPIKey":false,"ingressDomain":"rptxz4ubqq08-agent.usw-1.sealos.app","apiBaseURL":"https://rptxz4ubqq08-agent.usw-1.sealos.app/v1","createdAt":"2026-04-14T05:51:05Z"}}}
```

HTTP：

```text
200
```

### 7. `GET /api/v1/agents/:agentName/key`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' \
  -H "Authorization: <url-encoded-kubeconfig>" \
  http://127.0.0.1:8999/api/v1/agents/fullcap-4gcjexv8/key
```

响应：

```json
{"code":50100,"message":"agent key readback is disabled","requestId":"0c9624b7-e9dc-41e7-8d8c-e8f27e772969","error":{"type":"not_implemented","details":{"endpoint":"agent_key_read","reason":"sensitive_key_readback_disabled"}},"data":null}
```

HTTP：

```text
501
```

### 8. `POST /api/v1/agents/:agentName/key/rotate`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' -X POST \
  -H "Authorization: <url-encoded-kubeconfig>" \
  http://127.0.0.1:8999/api/v1/agents/fullcap-4gcjexv8/key/rotate
```

响应：

```json
{"code":0,"message":"ok","requestId":"a316b179-808b-419d-8a9e-23cb874c65c8","data":{"agentName":"fullcap-4gcjexv8","rotated":true}}
```

HTTP：

```text
200
```

### 9. `POST /api/v1/agents/:agentName/pause`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' -X POST \
  -H "Authorization: <url-encoded-kubeconfig>" \
  http://127.0.0.1:8999/api/v1/agents/fullcap-4gcjexv8/pause
```

响应：

```json
{"code":0,"message":"ok","requestId":"0a1a8ac8-32a3-471b-bafc-5bd8904ec56d","data":{"agent":{"agentName":"fullcap-4gcjexv8","aliasName":"Full Capture","namespace":"ns-38cq5qwz","status":"Paused","cpu":"1","memory":"2Gi","storage":"10Gi","modelProvider":"openai","modelBaseURL":"https://api.openai.com/v1","model":"gpt-4o-mini","hasModelAPIKey":false,"ingressDomain":"jumv49uwuymn-agent.usw-1.sealos.app","apiBaseURL":"https://jumv49uwuymn-agent.usw-1.sealos.app/v1","createdAt":"2026-04-14T05:41:56Z"}}}
```

HTTP：

```text
200
```

### 10. `POST /api/v1/agents/:agentName/run`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' -X POST \
  -H "Authorization: <url-encoded-kubeconfig>" \
  http://127.0.0.1:8999/api/v1/agents/fullcap-4gcjexv8/run
```

响应：

```json
{"code":0,"message":"ok","requestId":"fd81d79d-0ae4-408f-a982-c8e8d9698ebd","data":{"agent":{"agentName":"fullcap-4gcjexv8","aliasName":"Full Capture","namespace":"ns-38cq5qwz","status":"Running","cpu":"1","memory":"2Gi","storage":"10Gi","modelProvider":"openai","modelBaseURL":"https://api.openai.com/v1","model":"gpt-4o-mini","hasModelAPIKey":false,"ingressDomain":"jumv49uwuymn-agent.usw-1.sealos.app","apiBaseURL":"https://jumv49uwuymn-agent.usw-1.sealos.app/v1","createdAt":"2026-04-14T05:41:56Z"}}}
```

HTTP：

```text
200
```

### 11. `DELETE /api/v1/agents/:agentName`

请求：

```bash
curl -sS -w '\nHTTP %{http_code}\n' -X DELETE \
  -H "Authorization: <url-encoded-kubeconfig>" \
  http://127.0.0.1:8999/api/v1/agents/fullcap-4gcjexv8
```

响应：

```json
{"code":0,"message":"ok","requestId":"374f4234-3ed0-4de4-8bed-5f86ad273ae8","data":{"agentName":"fullcap-4gcjexv8","deleted":true}}
```

HTTP：

```text
200
```

## WebSocket examples

说明：

- 建议浏览器先连 WS，再发送 `auth`
- 下面所有消息都是真实联调里拿到的结果

### 1. 初始连接后服务端消息

响应：

```json
{
  "type": "auth.required",
  "requestId": "18d4c144-86df-4bca-978a-031e82012385",
  "data": {
    "message": "send auth message with encoded kubeconfig"
  }
}
```

### 2. `auth`

请求：

```json
{
  "type": "auth",
  "requestId": "auth-1",
  "data": {
    "authorization": "<url-encoded-kubeconfig>"
  }
}
```

响应：

```json
{
  "type": "system.ready",
  "requestId": "auth-1",
  "data": {
    "agentName": "fullcap-4gcjexv8",
    "container": "fullcap-4gcjexv8",
    "message": "websocket connected",
    "namespace": "ns-38cq5qwz",
    "podName": "fullcap-4gcjexv8"
  }
}
```

### 3. `terminal.open`

请求：

```json
{
  "type": "terminal.open",
  "requestId": "term-open",
  "data": {
    "cwd": ".",
    "id": "t1"
  }
}
```

响应：

```json
{
  "type": "terminal.opened",
  "requestId": "term-open",
  "data": {
    "cwd": "/opt/hermes",
    "id": "t1"
  }
}
```

### 4. `terminal.input`

请求：

```json
{
  "type": "terminal.input",
  "requestId": "term-input",
  "data": {
    "id": "t1",
    "input": "echo __TERM_OK__\n"
  }
}
```

响应样例：

```json
{
  "type": "terminal.output",
  "requestId": "term-open",
  "data": {
    "id": "t1",
    "output": "# "
  }
}
```

```json
{
  "type": "terminal.output",
  "requestId": "term-open",
  "data": {
    "id": "t1",
    "output": "echo __TERM_OK__"
  }
}
```

### 5. `terminal.close`

请求：

```json
{
  "type": "terminal.close",
  "requestId": "term-close",
  "data": {
    "id": "t1"
  }
}
```

响应：

```json
{
  "type": "terminal.closed",
  "requestId": "term-close",
  "data": {
    "id": "t1"
  }
}
```

### 6. `log.subscribe`

请求：

```json
{
  "type": "log.subscribe",
  "requestId": "log-sub",
  "data": {
    "id": "l1",
    "tailLines": 5
  }
}
```

响应样例：

```json
{
  "type": "log.chunk",
  "requestId": "log-sub",
  "data": {
    "chunk": "│  Messaging platforms + cron scheduler                    │",
    "id": "l1"
  }
}
```

### 7. `log.unsubscribe`

请求：

```json
{
  "type": "log.unsubscribe",
  "requestId": "log-unsub",
  "data": {
    "id": "l1"
  }
}
```

最终关闭响应：

```json
{
  "type": "log.closed",
  "requestId": "log-unsub",
  "data": {
    "id": "l1"
  }
}
```

### 8. `file.upload.begin`

请求：

```json
{
  "type": "file.upload.begin",
  "requestId": "upload-begin",
  "data": {
    "id": "u1",
    "path": "capture.txt"
  }
}
```

响应：

```json
{
  "type": "file.result",
  "requestId": "upload-begin",
  "data": {
    "accepted": true,
    "id": "u1",
    "op": "upload.begin",
    "path": "/opt/hermes/capture.txt"
  }
}
```

### 9. `file.upload.chunk`

请求：

```json
{
  "type": "file.upload.chunk",
  "requestId": "upload-chunk",
  "data": {
    "chunk": "aGVsbG8gY2FwdHVyZQo=",
    "id": "u1"
  }
}
```

响应：

```json
{
  "type": "file.result",
  "requestId": "upload-chunk",
  "data": {
    "id": "u1",
    "op": "upload.chunk",
    "size": 14
  }
}
```

### 10. `file.upload.end`

请求：

```json
{
  "type": "file.upload.end",
  "requestId": "upload-end",
  "data": {
    "id": "u1"
  }
}
```

响应：

```json
{
  "type": "file.result",
  "requestId": "upload-end",
  "data": {
    "id": "u1",
    "op": "upload.end",
    "path": "/opt/hermes/capture.txt",
    "written": true
  }
}
```

### 11. `file.list`

请求：

```json
{
  "type": "file.list",
  "requestId": "file-list",
  "data": {
    "path": "."
  }
}
```

响应样例：

```json
{
  "type": "file.result",
  "requestId": "file-list",
  "data": {
    "items": [
      {
        "name": ".dockerignore",
        "size": 118,
        "type": "file"
      },
      {
        "name": "capture.txt",
        "size": 14,
        "type": "file"
      }
    ],
    "op": "list",
    "path": "/opt/hermes"
  }
}
```

### 12. `file.read`

请求：

```json
{
  "type": "file.read",
  "requestId": "file-read",
  "data": {
    "path": "capture.txt"
  }
}
```

响应：

```json
{
  "type": "file.result",
  "requestId": "file-read",
  "data": {
    "content": "hello capture\n",
    "op": "read",
    "path": "/opt/hermes/capture.txt"
  }
}
```

### 13. `file.download`

请求：

```json
{
  "type": "file.download",
  "requestId": "file-download",
  "data": {
    "path": "capture.txt"
  }
}
```

响应：

```json
{
  "type": "file.result",
  "requestId": "file-download",
  "data": {
    "content": "aGVsbG8gY2FwdHVyZQo=",
    "encoding": "base64",
    "op": "download",
    "path": "/opt/hermes/capture.txt"
  }
}
```

### 14. `file.write`

请求：

```json
{
  "type": "file.write",
  "requestId": "file-write",
  "data": {
    "content": "edited\n",
    "path": "capture.txt"
  }
}
```

响应：

```json
{
  "type": "file.result",
  "requestId": "file-write",
  "data": {
    "op": "write",
    "path": "/opt/hermes/capture.txt",
    "written": true
  }
}
```

### 15. `file.mkdir`

请求：

```json
{
  "type": "file.mkdir",
  "requestId": "file-mkdir",
  "data": {
    "path": "tmpdir"
  }
}
```

响应：

```json
{
  "type": "file.result",
  "requestId": "file-mkdir",
  "data": {
    "created": true,
    "op": "mkdir",
    "path": "/opt/hermes/tmpdir"
  }
}
```

### 16. `file.delete`

请求：

```json
{
  "type": "file.delete",
  "requestId": "file-delete",
  "data": {
    "path": "capture.txt"
  }
}
```

响应：

```json
{
  "type": "file.result",
  "requestId": "file-delete",
  "data": {
    "deleted": true,
    "op": "delete",
    "path": "/opt/hermes/capture.txt"
  }
}
```

## Notes

- `PATCH /api/v1/agents/:agentName` 之前有过“刚创建后立即更新偶发 500”的问题，当前版本已经实测修复
- `GET /api/v1/agents/:agentName/key` 仍然是禁用接口
- WebSocket 当前建议所有并发型消息都显式带 `data.id`
