# Frontend Integration Guide

这份文档给前端联调用，覆盖本地启动、鉴权头生成、基础 REST API 使用方式和错误响应约定。

如果只需要最短执行清单，先看：

- [frontend-checklist.md](/Users/sealos/Agent-Hub/backend/api/frontend-checklist.md)
- [frontend-live-examples.md](/Users/sealos/Agent-Hub/backend/api/frontend-live-examples.md)

## 1. 本地启动

在 `backend/` 目录执行：

```bash
cp .env.example .env
go run cmd/app/main.go
```

或者继续使用显式环境变量：

```bash
REGION=us INGRESS_SUFFIX=agent.usw-1.sealos.app AGENT_IMAGE=nousresearch/hermes-agent:latest go run cmd/app/main.go
```

启动成功后默认监听：

```text
http://127.0.0.1:8999
```

健康检查：

```bash
curl http://127.0.0.1:8999/healthz
curl http://127.0.0.1:8999/readyz
```

说明：
- `healthz` 仅表示进程存活
- `readyz` 当前只检查静态运行配置是否完整，不验证请求级 Kubernetes 可用性

## 2. Authorization 头

除健康检查接口外，所有 HTTP 业务接口都要求：

```text
Authorization: <url-encoded kubeconfig>
```

后端不会读取服务端本地 kubeconfig。
后端会直接使用请求头里的 kubeconfig 连接 Kubernetes，并从 kubeconfig 当前 context 里解析 namespace。

本地联调时可直接从 `~/.kube/config` 生成：

```bash
KCFG_ENCODED=$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import quote
print(quote(Path.home().joinpath('.kube/config').read_text()))
PY
)
```

前端实际请求时：

```http
Authorization: ${encodedKubeconfig}
```

## 3. HTTP 接口范围

当前已可联调的基础 REST API：

- `GET /healthz`
- `GET /readyz`
- `GET /api/v1/agents`
- `POST /api/v1/agents`
- `GET /api/v1/agents/:agentName`
- `PATCH /api/v1/agents/:agentName`
- `DELETE /api/v1/agents/:agentName`
- `POST /api/v1/agents/:agentName/run`
- `POST /api/v1/agents/:agentName/pause`
- `POST /api/v1/agents/:agentName/key/rotate`

当前明确不要接入的 HTTP 端点：

- `GET /api/v1/agents/:agentName/key`
  当前固定返回 `501`
  不允许前端读取明文 key

WebSocket 当前也可联调：

- `GET /api/v1/agents/:agentName/ws`
- 支持 terminal、logs、file operations
- 推荐浏览器流程：
  1. 先连接 WS
  2. 第一条消息发送 `auth`
- 兼容方式：
  - `/api/v1/agents/:agentName/ws?authorization=<url-encoded-kubeconfig>`

## 4. 统一响应格式

### `GET /readyz` 当前返回形状

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {
    "status": "ready",
    "checks": {
      "port": "ok",
      "ingressSuffix": "ok",
      "apiServerImage": "ok",
      "kubernetes": "request_scoped"
    }
  }
}
```

### 成功响应

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {}
}
```

### 失败响应

```json
{
  "code": 42200,
  "message": "agent-model-baseurl is invalid",
  "requestId": "xxx",
  "error": {
    "type": "validation_failed",
    "details": {
      "field": "agent-model-baseurl",
      "reason": "invalid_url",
      "value": "not-a-url"
    }
  },
  "data": null
}
```

### 前端处理建议

- 只要 `code !== 0`，就按失败处理
- HTTP status 用来区分大类错误
- `error.type` 用于机器判断
- `error.details` 当前主要出现在鉴权错误和字段校验错误里
- `requestId` 要保留，便于后端排查
- 非法 `X-Request-Id` 会被后端丢弃并重新生成

## 5. 常见状态码和错误码

### HTTP status

- `200`：成功
- `201`：创建成功
- `400`：JSON 结构错误
- `401`：缺失或非法 Authorization
- `404`：资源不存在
- `409`：资源冲突
- `422`：字段校验失败
- `500`：Kubernetes 操作失败

### 业务错误码

- `40000`：invalid json payload
- `40002`：invalid agent name
- `40010`：missing Authorization header
- `40011`：invalid Authorization header
- `40400`：not found
- `40900`：conflict
- `42200`：validation failed
- `50010`：kubernetes operation error

## 6. Agent 数据结构

列表和详情里的 `agent` 结构：

```json
{
  "agentName": "demo-agent",
  "aliasName": "演示实例",
  "namespace": "ns-xxxx",
  "status": "Running",
  "cpu": "1000m",
  "memory": "2Gi",
  "storage": "10Gi",
  "modelProvider": "openai",
  "modelBaseURL": "https://api.openai.com/v1",
  "model": "gpt-4o-mini",
  "hasModelAPIKey": false,
  "ingressDomain": "xxx-agent.usw-1.sealos.app",
  "apiBaseURL": "https://xxx-agent.usw-1.sealos.app/v1",
  "createdAt": "2026-04-14T03:05:59Z"
}
```

### 前端特别注意

- `status` 主要稳定状态是 `Running` 和 `Paused`
- 在资源创建、删除或异常场景下，也可能出现 `Creating`、`Starting`、`Stopping`、`Updating`、`Deleting`、`Failed`
- `cpu` 在不同接口里可能出现 `1000m` 或 `1`，这是 Kubernetes quantity 标准化行为，含义等价
- `apiBaseURL` 由 ingress host 自动派生
- `hasModelAPIKey` 只表示是否已配置，不会返回真实 key

## 7. 联调示例

以下示例都默认已经有：

```bash
export KCFG_ENCODED=...
```

### 7.1 列表

```bash
curl -s \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents
```

### 7.2 创建

```bash
curl -s -X POST \
  -H "Authorization: $KCFG_ENCODED" \
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
    "agent-alias-name": "演示实例"
  }'
```

### 7.3 详情

```bash
curl -s \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent
```

### 7.4 更新

```bash
curl -s -X PATCH \
  -H "Authorization: $KCFG_ENCODED" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent \
  -d '{
    "agent-memory": "4Gi",
    "agent-model": "gpt-4.1",
    "agent-alias-name": "新展示名"
  }'
```

### 7.5 暂停

```bash
curl -s -X POST \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent/pause
```

### 7.6 恢复运行

```bash
curl -s -X POST \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent/run
```

### 7.7 轮换 key

```bash
curl -s -X POST \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent/key/rotate
```

返回只表示轮换成功，不会回显真实 key。

### 7.7.1 读取 key

这个端点当前不要接入前端：

```bash
curl -s \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent/key
```

实际会返回：

```json
{
  "code": 50100,
  "message": "agent key readback is disabled",
  "requestId": "xxx",
  "error": {
    "type": "not_implemented",
    "details": {
      "endpoint": "agent_key_read",
      "reason": "sensitive_key_readback_disabled"
    }
  },
  "data": null
}
```

### 7.8 删除

```bash
curl -s -X DELETE \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent
```

## 8. 真实联调结论

这套基础 REST API 已经用本地 `~/.kube/config` 在真实集群上验证通过：

- 健康检查
- readyz 静态配置检查
- 列表
- 创建
- 详情
- PATCH 更新
- GET key 返回 501
- 轮换 key
- pause
- run
- 删除
- 删除后再次查询返回 404
- 非法请求返回 422 且带结构化 `error.details`
- WS `system.ready`
- WS `file.write/read/delete`
- WS `terminal.open/input/close`
- WS `log.subscribe/unsubscribe`

## 9. WebSocket 联调说明

当前支持的 WS 消息能力：

- `terminal.open/input/resize/close`
- `log.subscribe/unsubscribe`
- `file.list/read/download/write/delete/mkdir`
- `file.upload.begin/chunk/end`

详细协议见：

- [websocket.md](/Users/sealos/Agent-Hub/backend/api/websocket.md)

## 10. 当前不做的事

前端当前阶段先不要依赖：

- 明文 key 读取
- 结构化文件列表返回
- 二进制文件上传/下载分片协议
- 多终端 / 多日志订阅并发

这些接口后续会补，但当前联调重点是基础 REST 管理面。
