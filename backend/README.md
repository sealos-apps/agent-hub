# Agent Hub Backend

用于管理 Sealos 上 hermes-agent Devbox 实例的 Go 后端。

它的职责是：
- 根据请求里的 kubeconfig 连接 Kubernetes
- 在指定 namespace 下创建 / 查询 / 更新 / 删除 agent 对应资源
- 管理 agent API key
- 提供一个 WebSocket 入口，支持终端、日志和文件操作

当前一个逻辑 agent 会映射到三类 Kubernetes 资源：
- Devbox
- Service
- Ingress

## Tech stack

- gin：HTTP 路由与中间件
- gorilla/websocket：WebSocket 会话
- client-go：Kubernetes typed client
- dynamic client：操作 Devbox CRD

## Project structure

- `api`: API 描述文件（OpenAPI / WebSocket 协议草案）
- `cmd/app`: 程序入口
- `configs`: 配置目录（预留）
- `internal/config`: 环境配置
- `internal/router`: gin 路由注册
- `internal/handler`: HTTP / WebSocket 处理器
- `internal/middleware`: gin 中间件
- `internal/dto`: 请求与消息 DTO
- `internal/agent`: agent 领域模型、状态、校验
- `internal/kube`: client-go 客户端、Devbox 仓储、K8s 资源构造
- `internal/random`: 随机串工具
- `pkg`: 通用 response / error 封装
- `scripts`: 脚本目录（预留）
- `test`: 额外测试目录（预留）

整体保持 `cmd + internal + pkg` 的标准 Go 项目风格，避免过深目录。

## HTTP business API contract

除健康探针外，所有 HTTP 业务接口都要求：

- `Authorization`: url-encoded kubeconfig

服务端会：
1. 从 `Authorization` 头取出 URL encoding 后的 kubeconfig
2. 做 URL decode
3. 用 client-go 构造本次请求使用的 Kubernetes 客户端
4. 从 kubeconfig 的 `current-context` 中解析 namespace
5. 严格使用这个 namespace 查询和操作资源

也就是说：
- 后端不会读取本地 kubeconfig
- 后端不依赖单独的 namespace 请求头
- namespace 完全由 `Authorization` 里的 kubeconfig 决定
- 缺失或非法 `Authorization` 会返回 HTTP `401`

## Health probe contract

以下接口不需要 Authorization：

- `GET /healthz`
- `GET /readyz`
- `GET /api/v1/system/config`

它们只用于存活和就绪探针，不参与业务鉴权。
- `healthz` 仅表示进程存活
- `readyz` 当前只检查静态运行配置是否完整，不验证请求级 Kubernetes 可用性

## WebSocket contract

WebSocket 使用独立消息协议，不复用 HTTP JSON envelope。

- `GET /api/v1/agents/:agentName/ws`
- 当前已支持终端、日志、文件操作
- 推荐浏览器先连接，再发送 `auth` 首消息完成鉴权
- 兼容 query：`?authorization=<url-encoded-kubeconfig>`

## Install dependencies

```bash
go mod tidy
```

## Run

最简单启动方式：

```bash
go run ./cmd/app
```

## Hot reload

本地开发推荐使用 `air` 做服务端热重载。

先安装：

```bash
go install github.com/air-verse/air@latest
```

然后在 `backend` 目录启动：

```bash
air
```

仓库已经内置了 `backend/.air.toml`，默认行为是：

- 监听 `backend` 下的 `.go / .yaml / .yml / .toml` 文件
- 自动执行 `go build -o ./tmp/app ./cmd/app`
- 构建成功后自动重启服务
- 构建产物输出到 `backend/tmp/app`

如果你的 `air` 不在 PATH，可直接这样启动：

```bash
$(go env GOPATH)/bin/air
```

用户本地常用启动方式：

```bash
cp .env.example .env
go run cmd/app/main.go
```

后端在开发环境默认读取当前工作目录下的 `.env`（默认约定是 `backend/.env`）；生产环境默认不读取。

可通过 `LOAD_DOTENV` 显式覆盖默认行为：
- `LOAD_DOTENV=1`：强制读取 `.env`
- `LOAD_DOTENV=0`：强制不读取 `.env`

如果你不想落文件，也可以继续直接内联环境变量启动：

```bash
REGION=us INGRESS_SUFFIX=agent.usw-1.sealos.app AGENT_IMAGE=nousresearch/hermes-agent:latest go run cmd/app/main.go
```

前端联调入口文档见：

- `api/frontend-checklist.md`
- `api/frontend-integration.md`
- `api/frontend-live-examples.md`

默认配置来自环境变量：
- `PORT`：默认 `8999`
- `INGRESS_SUFFIX`：默认 `agent.usw-1.sealos.app`
- `AGENT_IMAGE`：默认 `nousresearch/hermes-agent:latest`
- `AGENT_MANIFEST_TEMPLATE_DIR`：模板目录根路径（容器建议值 `/app/template`，本地默认自动探测仓库内 `template/`）
- `AIPROXY_BASE_URL`：AIProxy token 管理地址，默认 `https://aiproxy-web.hzh.sealos.run`
- `K8S_PROXY_ALLOWED_HOSTS`：K8s API 反向代理允许的目标主机白名单（逗号分隔，支持精确主机或 `.suffix` 后缀规则），默认 `.sealos.io,.sealos.run`
- `REGION`：模型预设区域，支持 `us` / `cn`，必须显式配置
- `LOAD_DOTENV`：是否读取 `.env`（`1` 强制开启，`0` 强制关闭；未设置时开发默认开启、生产默认关闭）

说明：
- 本地开发统一使用 `backend/.env`
- `.env` 只用于本地开发；Sealos 线上部署仍然使用 Deployment `env`
- `AIPROXY_BASE_URL` 只用于后端访问 AIProxy token 管理接口
- Hermes 部署时写入 `agent-model-baseurl` 的模型地址，不走这个配置
- 当前前后端会根据集群地址自动推导模型地址，例如 `https://usw-1.sealos.io:6443` 会推导为 `https://aiproxy.usw-1.sealos.io/v1`
- 推荐值：海外工作区统一使用 `REGION=us`

健康检查：

```bash
curl http://127.0.0.1:8999/healthz
curl http://127.0.0.1:8999/readyz
```

## Current endpoint status

已实现的 REST API：
- `GET /healthz`
- `GET /readyz`
- `GET /api/v1/system/config`
- `GET /api/v1/agents`
- `POST /api/v1/agents`
- `GET /api/v1/agents/:agentName`
- `PATCH /api/v1/agents/:agentName`
- `DELETE /api/v1/agents/:agentName`
- `POST /api/v1/agents/:agentName/run`
- `POST /api/v1/agents/:agentName/pause`
- `GET /api/v1/agents/:agentName/key`（当前返回 `501`）
- `POST /api/v1/agents/:agentName/key/rotate`（不回显明文 key）
- `GET /api/v1/agents/:agentName/ws`

当前实现特点：
- create / list / get / patch / run / pause / delete / key 已接入真实 client-go / dynamic client
- namespace 严格来自 Authorization 中 kubeconfig 的 `current-context`
- 删除按 `agent.sealos.io/name` 级联删除 devbox / service / ingress
- `apiBaseURL` 由 ingress host 派生，固定格式为 `https://{host}/v1`
- WebSocket 已支持终端、日志、文件操作

## API overview

### Base URL

本地开发默认：

```text
http://127.0.0.1:8999
```

### 统一响应格式

所有接口返回：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {}
}
```

字段说明：
- `code`：业务码，`0` 表示成功
- `message`：文本消息
- `requestId`：请求 ID
- `data`：具体业务数据，失败时通常为 `null`

失败响应会额外包含：

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

说明：
- `error.type` 是稳定的机器可读错误类别
- `error.details` 是可选字段
- 当前 `details` 主要出现在鉴权错误和字段校验错误里
- 非法 `X-Request-Id` 会被服务端忽略并重生

### 常见错误码

- `40000`：invalid json payload
- `40002`：invalid agent name
- `40010`：missing Authorization header
- `40011`：invalid Authorization header
- `40400`：not found
- `40900`：conflict
- `42200`：validation failed
- `50010`：kubernetes operation error

## Data model

### AgentItem

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
  "createdAt": "2026-04-13T15:10:56Z"
}
```

字段说明：
- `agentName`：实例名，也是主键
- `aliasName`：展示名，可为空
- `namespace`：当前 kubeconfig 对应 namespace
- `status`：实例状态，例如 `Running`、`Paused`、`Creating`、`Failed`
- `cpu` / `memory` / `storage`：资源配置
- `modelProvider` / `modelBaseURL` / `model`：模型配置
- `hasModelAPIKey`：是否配置了模型 API key
- `ingressDomain`：实例 ingress 域名
- `apiBaseURL`：由 ingress host 派生，格式固定为 `https://{host}/v1`
- `createdAt`：创建时间戳

## API details

### 1. Health

#### `GET /healthz`

说明：
- 存活检查
- 不需要 Authorization

响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {
    "status": "ok"
  }
}
```

### 2. Ready

#### `GET /readyz`

说明：
- 就绪检查
- 不需要 Authorization

响应示例：

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

### 3. List agents

#### `GET /api/v1/agents`

请求头：
- `Authorization: <url-encoded kubeconfig>`

响应示例：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {
    "items": [
      {
        "agentName": "demo-agent",
        "aliasName": "演示实例",
        "namespace": "ns-38cq5qwz",
        "status": "Running",
        "cpu": "1",
        "memory": "2Gi",
        "storage": "10Gi",
        "modelProvider": "openai",
        "modelBaseURL": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "hasModelAPIKey": false,
        "ingressDomain": "abc-agent.usw-1.sealos.app",
        "apiBaseURL": "https://abc-agent.usw-1.sealos.app/v1",
        "createdAt": "2026-04-13T15:10:56Z"
      }
    ],
    "total": 1,
    "meta": {
      "namespace": "ns-38cq5qwz"
    }
  }
}
```

说明：
- 只返回当前 namespace 下、受本系统 label 管理的资源
- `items` 按创建时间倒序

### 4. Create agent

#### `POST /api/v1/agents`

请求头：
- `Authorization: <url-encoded kubeconfig>`
- `Content-Type: application/json`

请求体：

```json
{
  "agent-name": "demo-agent",
  "agent-cpu": "1000m",
  "agent-memory": "2Gi",
  "agent-storage": "10Gi",
  "agent-model-provider": "openai",
  "agent-model-baseurl": "https://api.openai.com/v1",
  "agent-model-apikey": "",
  "agent-model": "gpt-4o-mini",
  "agent-alias-name": "演示实例"
}
```

字段说明：

必填：
- `agent-name`
- `agent-cpu`
- `agent-memory`
- `agent-storage`
- `agent-model-provider`
- `agent-model-baseurl`
- `agent-model`

可选：
- `agent-model-apikey`
- `agent-alias-name`

校验规则：
- `agent-name` 必须符合 Kubernetes name 规则
- `agent-cpu` / `agent-memory` / `agent-storage` 必须能被 K8s quantity 解析
- `agent-model-baseurl` 必须是合法 URL，且 scheme 只能是 `http` 或 `https`

当前行为：
- 该接口当前禁用
- 返回 HTTP `501`

响应示例：
- HTTP `201`

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {
    "agent": {
      "agentName": "demo-agent",
      "aliasName": "演示实例",
      "namespace": "ns-38cq5qwz",
      "status": "Running",
      "cpu": "1000m",
      "memory": "2Gi",
      "storage": "10Gi",
      "modelProvider": "openai",
      "modelBaseURL": "https://api.openai.com/v1",
      "model": "gpt-4o-mini",
      "hasModelAPIKey": false,
      "ingressDomain": "abc-agent.usw-1.sealos.app",
      "apiBaseURL": "https://abc-agent.usw-1.sealos.app/v1",
      "createdAt": "2026-04-13T15:10:56Z"
    }
  }
}
```

说明：
- 创建时会同时创建 `Devbox`、`Service`、`Ingress`
- 不会返回明文 `apiServerKey`

### 5. Get agent detail

#### `GET /api/v1/agents/:agentName`

请求头：
- `Authorization: <url-encoded kubeconfig>`

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {
    "agent": {
      "agentName": "demo-agent",
      "aliasName": "演示实例",
      "namespace": "ns-38cq5qwz",
      "status": "Running",
      "cpu": "1",
      "memory": "2Gi",
      "storage": "10Gi",
      "modelProvider": "openai",
      "modelBaseURL": "https://api.openai.com/v1",
      "model": "gpt-4o-mini",
      "hasModelAPIKey": false,
      "ingressDomain": "abc-agent.usw-1.sealos.app",
      "apiBaseURL": "https://abc-agent.usw-1.sealos.app/v1",
      "createdAt": "2026-04-13T15:10:56Z"
    }
  }
}
```

失败示例：

```json
{
  "code": 40400,
  "message": "agent not found",
  "requestId": "xxx",
  "error": {
    "type": "not_found"
  },
  "data": null
}
```

### 6. Update agent

#### `PATCH /api/v1/agents/:agentName`

请求头：
- `Authorization: <url-encoded kubeconfig>`
- `Content-Type: application/json`

请求体支持部分更新，字段全部可选：

```json
{
  "agent-cpu": "2000m",
  "agent-memory": "4Gi",
  "agent-storage": "20Gi",
  "agent-model-provider": "openai",
  "agent-model-baseurl": "https://api.openai.com/v1",
  "agent-model-apikey": "sk-xxx",
  "agent-model": "gpt-4.1",
  "agent-alias-name": "新名称"
}
```

更新逻辑：
- 更新 Devbox 中的资源配置和 env
- 同步更新 Service / Ingress 上的相关 annotation
- 如果 `agent-alias-name` 传空字符串，会删除 alias annotation
- 如果 `agent-model-apikey` 传空字符串，会把对应 env 设置为空值

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {
    "agent": {
      "agentName": "demo-agent"
    }
  }
}
```

### 7. Delete agent

#### `DELETE /api/v1/agents/:agentName`

请求头：
- `Authorization: <url-encoded kubeconfig>`

删除逻辑：
- 按 agent 名称读取同名且唯一的 Devbox / Service / Ingress
- 删除顺序为 Ingress -> Service -> Devbox
- 当前删除模型与详情读取模型保持一致，三类资源都要求名称与 `agentName` 一致

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {
    "agentName": "demo-agent",
    "deleted": true
  }
}
```

### 8. Run agent

#### `POST /api/v1/agents/:agentName/run`

请求头：
- `Authorization: <url-encoded kubeconfig>`

行为：
- 将 Devbox `spec.state` 更新为 `Running`

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {
    "agent": {
      "agentName": "demo-agent",
      "status": "Running"
    }
  }
}
```

### 9. Pause agent

#### `POST /api/v1/agents/:agentName/pause`

请求头：
- `Authorization: <url-encoded kubeconfig>`

行为：
- 将 Devbox `spec.state` 更新为 `Paused`

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {
    "agent": {
      "agentName": "demo-agent",
      "status": "Paused"
    }
  }
}
```

### 10. Get agent API server key

#### `GET /api/v1/agents/:agentName/key`

请求头：
- `Authorization: <url-encoded kubeconfig>`

成功响应：

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

### 11. Rotate agent API server key

#### `POST /api/v1/agents/:agentName/key/rotate`

请求头：
- `Authorization: <url-encoded kubeconfig>`

行为：
- 生成新的随机 key
- 更新 Devbox env 中的 `API_SERVER_KEY`

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {
    "agentName": "demo-agent",
    "rotated": true
  }
}
```

## WebSocket

### `GET /api/v1/agents/:agentName/ws`

当前已支持：
- terminal
- logs
- file operations

鉴权方式：
- 推荐先连接，再发送 `auth` 消息
- 非浏览器客户端可继续使用 `Authorization` 头
- 兼容 query：`?authorization=<url-encoded-kubeconfig>`

详细协议见：
- `api/websocket.md`

## curl examples

### 1. 生成 Authorization 头内容

macOS / Linux：

```bash
KCFG_ENCODED=$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import quote
print(quote(Path.home().joinpath('.kube/config').read_text()))
PY
)
```

### 2. List

```bash
curl -s \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents
```

### 3. Create

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

### 4. Detail

```bash
curl -s \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent
```

### 5. Update

```bash
curl -s -X PATCH \
  -H "Authorization: $KCFG_ENCODED" \
  -H "Content-Type: application/json" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent \
  -d '{
    "agent-cpu": "2000m",
    "agent-memory": "4Gi",
    "agent-model": "gpt-4.1"
  }'
```

### 6. Get key

```bash
curl -s \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent/key
```

说明：
- 当前固定返回 `501`
- 前端不可读取真实 key

### 7. Rotate key

```bash
curl -s -X POST \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent/key/rotate
```

### 8. Stop

```bash
curl -s -X POST \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent/pause
```

### 9. Start

```bash
curl -s -X POST \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent/run
```

### 10. Delete

```bash
curl -s -X DELETE \
  -H "Authorization: $KCFG_ENCODED" \
  http://127.0.0.1:8999/api/v1/agents/demo-agent
```

## Known notes

1. WebSocket 已支持基础交互能力
- 已支持终端、日志、文件操作
- 浏览器端请用 `?authorization=<url-encoded-kubeconfig>`

2. CPU 在 create 响应里可能显示 `1000m`，在 list/detail 里可能显示 `1`
- 这是 Kubernetes quantity 标准化现象
- `1000m` 与 `1` 等价

3. `apiBaseURL` 由后端自动从 ingress host 派生
- 固定格式：`https://{host}/v1`

4. 删除基于同名资源模型
- Devbox / Service / Ingress 都要求与 `agentName` 同名
- 删除和详情读取使用相同的资源关联方式

5. `readyz` 当前只表示静态配置 ready
- 不验证请求级 kubeconfig 的可用性
- 不等价于“目标 Kubernetes 集群可操作”
