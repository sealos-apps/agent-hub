# 数据模型

## AgentContract

后端列表与详情的统一能力契约：

| 平面 | 关键字段 | 说明 |
|------|----------|------|
| `core` | `name`、`aliasName`、`templateId`、`namespace`、`status`、`ready`、`bootstrapPhase` | 实例身份与生命周期状态 |
| `access` | `api`、`terminal`、`files`、`ssh`、`ide`、`web-ui` | 模板显式声明且运行态真实可用的接入平面 |
| `runtime` | `cpu`、`memory`、`storage`、`runtimeClassName`、`workingDir`、`modelProvider`、`modelBaseURL`、`model` | 容器规格与当前模型接入摘要 |
| `settings` | `runtime[]`、`agent[]` | 模板 schema 驱动的设置字段定义 |
| `actions` | `run`、`pause`、`delete`、`open-terminal`、`open-files`、`open-settings`、`open-chat` | 列表动作和详情工作区入口的唯一来源 |

说明：
- 旧扁平 DTO 已退役，前端不再通过镜像、域名或模型名推断能力
- `access.api.url` 是 API 第三方接入能力的唯一地址来源
- SSH 私钥、JWT token 不进入 `AgentContract`，只通过 `/access/ssh` 按需返回

## AgentTemplateCatalogItem

模板目录由后端统一返回，每个模板项包含：

| 字段 | 说明 |
|------|------|
| `presentation` | logo、品牌色、文档标签 |
| `access` | 模板支持的访问平面定义 |
| `actions` | 模板允许的动作入口 |
| `settings` | 运行时设置与模板私有设置 schema |
| `modelOptions` | 当前 `region` 下可用的模型选项，每项自带 `provider + apiMode` |

说明：
- `cn/us` 模型差异完全由目录快照决定
- 前端静态模板表只保留 logo / 颜色等展示资源映射，不再承载能力真相

## AgentListItem

前端列表页和详情页共享的派生视图模型，来源是：

```text
AgentContract + AgentTemplateCatalogItem + ClusterContext
```

常用字段：

| 字段 | 说明 |
|------|------|
| `template` / `templateId` | 当前模板定义与模板标识 |
| `accessByKey` / `actionsByKey` | 访问平面与动作入口的快速索引 |
| `apiBaseURL` | 从 `access.api.url` 派生的 API 地址 |
| `sshAccess` / `ideAccess` / `webUIAccess` | 详情页 overview 的主要接入入口 |
| `chatAvailable` / `terminalAvailable` / `settingsAvailable` | 由 contract 计算出来的工作区可见性 |
| `bootstrapPhase` / `bootstrapMessage` | 创建中和重启中的反馈信息 |

说明：
- `AgentListItem` 不驻留 API key、SSH 私钥或工作区 AI-Proxy key
- 列表和详情共享同一份视图模型，但其真相仍然来自 `AgentContract`

## AgentBlueprint

前端表单使用的临时配置对象，当前分三种使用方式：

- 创建页 `blueprint`
- 设置页 `runtimeBlueprint`
- 设置页 `settingsBlueprint`

说明：
- 创建页只用于构造 `POST /api/v1/agents`
- 设置页显式拆成 `PATCH /runtime` 与 `PATCH /settings`
- Provider 不再根据模型名推断，只允许由模板目录中的模型选项显式写入

## ClusterContext

| 字段 | 说明 |
|------|------|
| `server` | Sealos / Kubernetes API 地址 |
| `namespace` | 当前工作区命名空间 |
| `kubeconfig` | 当前请求使用的 kubeconfig |
| `authCandidates` | 可选鉴权来源列表 |

## 会话状态
- `ChatSessionState`：对话消息、草稿、连接状态
- `TerminalSessionState`：终端连接、`terminalId`、cwd、Pod/Container 信息
- `FilesSessionState`：当前目录、选中文件、脏状态、上传/下载会话
