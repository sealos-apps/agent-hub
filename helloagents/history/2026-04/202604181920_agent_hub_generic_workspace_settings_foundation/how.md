# 技术设计: Agent Hub 通用工作区与 schema 设置主链路补齐

## 方案摘要

本次不再继续堆页面特判，而是把通用能力补到模板 schema 和 contract 本身：

1. `template.yaml` 新增 `workspaces`
2. `settings.*` 字段新增 `binding`
3. 详情页工作区完全消费 contract
4. 创建/设置更新统一提交 `settings` map

## 关键设计

### 1. 工作区升级为一等契约

- 模板定义层新增：
  - `workspaces[].key`
  - `workspaces[].label`
- 后端 contract 装配层新增：
  - `workspaces[]`
- 前端详情页改成：
  - 侧边栏由 `item.workspaces` 生成
  - 内容区按 `workspace.key` 渲染

当前首批工作区：
- `overview`
- `chat`
- `terminal`
- `files`
- `settings`
- `web-ui`

### 2. 设置字段新增 binding

字段绑定规则固定为四类：

- `runtime`
  - 绑定运行时内建字段，如 `cpu / memory / storage / runtimeClassName`
- `agent`
  - 绑定 Agent 内建字段，如 `modelProvider / model / modelBaseURL`
- `annotation`
  - 绑定到 DevBox 注解，并同步到 Service / Ingress 注解
- `env`
  - 绑定到 DevBox 容器环境变量
- `derived`
  - 只读计算值，不允许提交写入

这意味着模板字段终于有了唯一、显式、可执行的落点。

### 3. 创建与更新链路统一到 settings map

- 创建接口保留运行时直传：
  - `agent-cpu`
  - `agent-memory`
  - `agent-storage`
- Agent 能力配置统一改为：
  - `settings: Record<string, any>`

后端按模板 `settings.agent` 的 binding 进行：
- 校验
- 映射
- 写入
- 是否需要 rebootstrap 判断

### 4. Web UI 工作区内嵌

- 详情页新增 `AgentWebUIWorkspace`
- `web-ui` 不再只做外链按钮
- 列表页点击 `Web UI` 时直接进入详情页 `?tab=web-ui`

### 5. 删掉伪能力

- Hermes 模板移除之前的 IM placeholder 字段
- 当前只保留真正有写入与运行时语义的字段

## 文件参考

- 后端
  - `backend/internal/agenttemplate/template.go`
  - `backend/internal/handler/agent_contract.go`
  - `backend/internal/handler/agent_template_settings.go`
  - `backend/internal/handler/agent.go`
  - `backend/internal/handler/agent_settings_update.go`
- 前端
  - `web/src/domains/agents/types.ts`
  - `web/src/domains/agents/mappers.ts`
  - `web/src/domains/agents/blueprintFields.ts`
  - `web/src/app/pages/agent-hub/hooks/useAgentHubController.ts`
  - `web/src/app/pages/agent-hub/AgentDetailPage.tsx`
  - `web/src/app/pages/agent-hub/components/AgentDetailSidebar.tsx`
  - `web/src/app/pages/agent-hub/components/AgentSettingsWorkspace.tsx`
  - `web/src/components/business/agents/AgentConfigForm.tsx`
  - `web/src/components/business/web-ui/AgentWebUIWorkspace.tsx`

## 风险与注意事项

- `provider` 现在虽然是只读字段，但仍然允许由前端随模型切换一并提交，不能被后端当成 derived 拒绝。
- `derived` 字段必须只读且不可写，不允许再被前端作为普通设置提交。
- `web-ui` 进入 iframe 后，若目标站点设置了严格的 `X-Frame-Options/CSP`，只能回退到新窗口打开；本次仅补齐工作区能力，不做额外兼容层。
