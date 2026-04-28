# Frontend Integration Checklist

给前端联调时直接照这个清单走。

## 1. 启动服务

在 `backend/` 目录执行：

```bash
cp .env.example .env
go run cmd/app/main.go
```

或者继续使用显式环境变量：

```bash
REGION=us INGRESS_SUFFIX=agent.usw-1.sealos.app AGENT_IMAGE=nousresearch/hermes-agent:latest go run cmd/app/main.go
```

服务地址：

```text
http://127.0.0.1:8999
```

## 2. 准备 Authorization

除 `healthz` / `readyz` 外，所有业务接口都必须带：

```text
Authorization: <url-encoded kubeconfig>
```

本地生成方式：

```bash
KCFG_ENCODED=$(python3 - <<'PY'
from pathlib import Path
from urllib.parse import quote
print(quote(Path.home().joinpath('.kube/config').read_text()))
PY
)
```

## 3. 先测探针

- `GET /healthz`
- `GET /readyz`

说明：
- `healthz` 只看进程是否活着
- `readyz` 只看静态配置是否完整
- `readyz` 不代表目标 Kubernetes 一定可操作

## 4. 当前可联调的 REST API

- `GET /api/v1/system/config`
- `GET /api/v1/templates`
- `GET /api/v1/agents`
- `POST /api/v1/agents`
- `GET /api/v1/agents/:agentName`
- `GET /api/v1/agents/:agentName/access/ssh`
- `PATCH /api/v1/agents/:agentName/runtime`
- `PATCH /api/v1/agents/:agentName/settings`
- `DELETE /api/v1/agents/:agentName`
- `POST /api/v1/agents/:agentName/run`
- `POST /api/v1/agents/:agentName/pause`
- `POST /api/v1/agents/:agentName/key/rotate`

## 5. 当前不要接的接口

- `GET /api/v1/agents/:agentName/key`
  当前固定返回 `501`

## 6. 当前可联调的 WebSocket

- `GET /api/v1/agents/:agentName/ws`
- 支持 terminal、logs、file operations

浏览器联调方式：

- 推荐：
  1. 先连接 WS
  2. 第一条消息发送 `auth`
- 兼容：
  - `/api/v1/agents/:agentName/ws?authorization=<url-encoded-kubeconfig>`

## 7. 返回格式

成功：

```json
{
  "code": 0,
  "message": "ok",
  "requestId": "xxx",
  "data": {}
}
```

失败：

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

前端处理规则：

- `code === 0` 才算成功
- 保留 `requestId`
- 优先读 `error.type`
- `error.details` 只在部分错误场景出现

## 8. Contract 字段里重点关注

- `templates`
  - 模板能力、动作、设置 schema、模型预设全部来自 `/api/v1/templates`
  - 前端不再自己维护模板能力和模型列表
- `region`
  - 由 `/api/v1/system/config` 与 `/api/v1/templates` 显式返回
  - 缺失或非法时前端应直接失败，不允许静默回落
- `agent.contract.core`
  - `templateId / status / ready / bootstrapPhase / bootstrapMessage`
- `agent.contract.access`
  - `api / terminal / files / ssh / ide / web-ui`
- `agent.contract.runtime`
  - `cpu / memory / storage / workingDir / modelProvider / modelBaseURL / model`
- `agent.contract.actions`
  - 列表快捷动作、详情页工作区都必须基于该字段判断

## 9. 建议联调顺序

1. `healthz`
2. `readyz`
3. `GET /api/v1/system/config`
4. `GET /api/v1/templates`
5. `GET /api/v1/agents`
6. `POST /api/v1/agents`
7. `GET /api/v1/agents/:agentName`
8. `PATCH /api/v1/agents/:agentName/runtime`
9. `PATCH /api/v1/agents/:agentName/settings`
10. `GET /api/v1/agents/:agentName/access/ssh`
11. `POST /api/v1/agents/:agentName/pause`
12. `POST /api/v1/agents/:agentName/run`
13. `POST /api/v1/agents/:agentName/key/rotate`
14. `DELETE /api/v1/agents/:agentName`
15. `WS terminal.open`
16. `WS file.write/read/download`
17. `WS file.upload.begin/chunk/end`
18. `WS log.subscribe/unsubscribe`

## 10. 真实联调结论

这套顺序已经用本地 `~/.kube/config` 在真实集群上跑通过。

详细版文档见：

- [frontend-integration.md](/Users/sealos/Agent-Hub/backend/api/frontend-integration.md)
- [frontend-live-examples.md](/Users/sealos/Agent-Hub/backend/api/frontend-live-examples.md)

## 11. Agent Hub 页面场景验证

以下场景用于覆盖 `helloagents` 计划中的主流程验收：

- 列表页加载：进入 `/agents` 后，Header、搜索框、列表或空态正确显示
- 模板目录加载：进入 `/agents/templates` 后模板来自 `/api/v1/templates`，模型预设不再是前端静态表
- 创建页提交：从 `/agents/templates` 选择模板后进入 `/agents/create`，填写别名并按模板 schema 选择模型后提交
- 详情页进入：从列表页或创建完成后进入 `/agents/:agentName`
- 能力入口按 contract 显示：Hermes 与 OpenClaw 看到的动作集合允许不同，但都必须由 `actions/access` 决定
- 对话 / 终端 / 文件可用：只有在 contract 显式允许时才展示对应入口
- 创建中状态自动转为运行中：实例创建完成前显示 `creating` 或 `running but not ready`，随后自动轮询为可用状态

## 12. Agent Hub 回归验证

以下场景用于覆盖结构收口后的回归检查：

- 强制刷新后状态恢复：刷新 `/agents` 或 `/agents/:agentName` 后，controller 能重新加载快照
- 从列表进入详情：列表页点击实例名或详情按钮时，详情页优先使用导航快照，避免空白闪烁
- 从创建完成跳转详情：创建成功后直接跳转详情页，且共用最新 controller 状态
- 删除 / 暂停 / 启动操作反馈：列表与详情页中的动作均应更新提示信息，并在刷新后反映最新状态
- 详情页访问平面：`API / SSH / IDE / Web UI / 集群内服务地址` 只展示真实支持的入口

## 13. 本轮收口文档

- `helloagents/wiki/modules/agent-hub-frontend.md`
- `helloagents/wiki/modules/agent-hub-security-checklist.md`

## 14. 发布顺序

- 只允许一条发布路径：后端先发、前端后发、模板目录与知识库最后同步
- 不保留旧 `PATCH /api/v1/agents/:agentName` DTO 过渡窗口
