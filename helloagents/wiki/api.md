# API 手册

## 概述

Agent Hub 前端通过 `backend/` 暴露的统一 API 与 Sealos 集群交互。当前接口已经收口为 `Template Catalog + Agent Contract V1`：

- 模板能力、设置 schema、区域模型预设全部来自 `GET /api/v1/templates`
- 列表与详情统一返回 `core / access / runtime / settings / actions`
- 设置更新拆分为 `runtime` 与 `settings` 两条显式链路
- SSH 私钥与 token 只允许按需通过独立接口获取，不进入常驻列表态

## 认证方式
- 健康探针外的业务接口要求 `Authorization: <url-encoded kubeconfig>`
- WebSocket 推荐先建立连接，再发送 `auth` 首消息
- `GET /api/v1/agents/:agentName/key` 当前故意返回 `501`，不允许前端读回敏感 key

## 接口列表

### 系统与模板

#### `GET /api/v1/system/config`
- 说明：返回当前运行区配置
- 关键响应字段：`region`、`aiProxyModelBaseURL`
- 约束：`region` 缺失或非法时直接报错，不允许前端静默回落

#### `GET /api/v1/templates`
- 说明：返回模板目录
- 关键响应字段：`items[]`、`region`
- 模板项内容：`access`、`actions`、`settings`、`modelOptions`、`presentation`

### Agent 管理

#### `GET /api/v1/agents`
- 说明：获取 Agent 列表
- 关键响应字段：`items[]`
- 每个实例都返回统一 `AgentContract`

#### `GET /api/v1/agents/:agentName`
- 说明：获取单个 Agent 详情
- 关键响应字段：`agent.core`、`agent.access`、`agent.runtime`、`agent.settings`、`agent.actions`

#### `POST /api/v1/agents`
- 说明：创建 Agent
- 关键请求字段：`template-id`、`agent-name`、`agent-cpu`、`agent-memory`、`agent-storage`、`agent-model-provider`、`agent-model-baseurl`、`agent-model`

#### `GET /api/v1/agents/:agentName/access/ssh`
- 说明：按需返回 SSH 接入信息
- 关键响应字段：`host`、`port`、`userName`、`workingDir`、`base64PrivateKey`、`base64PublicKey`、`token`、`configHost`
- 约束：只有模板显式声明 `ssh` 时才允许访问

#### `PATCH /api/v1/agents/:agentName/runtime`
- 说明：更新运行时配置
- 允许字段：`agent-cpu`、`agent-memory`、`agent-storage`、`runtime-class-name`
- 响应：最新 `AgentContract`

#### `PATCH /api/v1/agents/:agentName/settings`
- 说明：更新模板私有设置
- 首批 Hermes 支持字段：`agent-alias-name`、`settings.provider`、`settings.model`、`settings.baseURL`
- 约束：字段必须来自模板 schema，模型必须属于当前 `region` 的模板目录快照
- 响应：最新 `AgentContract`

#### `POST /api/v1/agents/:agentName/run`
- 说明：启动暂停中的 Agent

#### `POST /api/v1/agents/:agentName/pause`
- 说明：暂停运行中的 Agent

#### `DELETE /api/v1/agents/:agentName`
- 说明：删除 Agent 关联资源

### AIProxy

#### `POST /api/v1/aiproxy/token/ensure`
- 说明：确保工作区内存在 `Agent-Hub` 专用 AIProxy Token
- 备注：前端只展示 key 是否就绪，不将其写入列表视图模型

### WebSocket

#### `GET /api/v1/agents/:agentName/ws`
- 说明：终端、日志、文件操作入口
- 鉴权：首条消息发送 `auth`
- 协议：`Stream V2 Binary`（20-byte header + requestId/sessionId/meta/payload）
- 帧版本：`version = 2`，非法版本与非法长度会被后端拒绝并返回 `error`
- 关键消息：
  - `terminal.output` / `log.chunk`：高压场景下允许最旧数据淘汰；若发生淘汰，下一条同流消息会携带 `data.dropped=true`、`data.droppedCount=<n>`
  - `file.result`：`list/read/download/write/delete/mkdir/upload.*` 统一返回
  - `error`：统一错误语义（如 `auth_required`、`invalid_message_frame`、`file_*_failed`）
- 优先级策略：控制消息优先于流式输出消息，确保连接控制与交互输入不被高频输出饿死

## 发布约束

- 不保留旧 `PATCH /api/v1/agents/:agentName` 过渡窗口
- 上线顺序固定为：后端先发、前端后发、模板目录与知识库最后同步
