# 任务清单: Agent Hub 通用能力契约 v1 与 DevBox 接入平面对齐

目录: `helloagents/history/2026-04/202604181533_agent_hub_capability_contract_v1/`

---

## 1. 固化 Contract V1 与模板目录 schema

参考文件:
- `backend/internal/dto/agent.go`
- `backend/internal/agenttemplate/template.go`
- `template/hermes-agent/template.yaml`
- `web/src/domains/agents/types.ts`
- `docs/DevBox-UI-Deep-Dive.md`

注意事项:
- Contract V1 只能保留一种表达方式，禁止继续同时维护“旧扁平模型 + 新能力模型”。
- 不允许再新增 `supportsXxx` 这类模板布尔字段。
- 本阶段必须明确删除的旧入口：`inferTemplateIdFromImage`、`supportsAPIAccess`、`resolveTemplateById('hermes-agent')` 缺省兜底。

- [√] 1.1 新增 `backend/internal/dto/agent_contract.go`，定义 `core / access / runtime / settings / actions` 的 Go DTO，验证 why.md#requirement-contract-v1 的 `capability-driven-detail`。
- [√] 1.2 扩展 `backend/internal/agenttemplate/template.go` 的 `Definition` 结构，支持读取模板能力、设置 schema、动作和按区域划分的模型预设，依赖任务 1.1。
- [√] 1.3 扩展 `template/hermes-agent/template.yaml`，把 Hermes 的访问能力、设置字段和模型预设显式写入模板目录，依赖任务 1.2。
- [√] 1.4 新增 `template/openclaw/template.yaml` 元数据目录，即使暂未部署，也要由后端显式暴露为模板目录项，依赖任务 1.2。
- [√] 1.5 新增 `backend/internal/dto/template.go`，定义模板目录 API 的响应结构，依赖任务 1.2。
- [√] 1.6 在 `web/src/domains/agents/types.ts` 中新增前端版 `AgentContract` 和 `AgentTemplateCatalogItem` 类型，并标记旧字段待删除，依赖任务 1.1。

## 2. 新增模板目录 API，收回前端模板权威

参考文件:
- `backend/internal/router/router.go`
- `backend/internal/handler/agent.go`
- `web/src/api/backend.ts`
- `web/src/domains/agents/templates.ts`
- `web/src/domains/agents/models.ts`

注意事项:
- 模板目录必须由后端返回，前端静态模板表不再作为能力来源。
- `REGION` 必须由后端显式返回且为必填，不允许前端静默回落 `us`。

- [√] 2.1 新增 `backend/internal/handler/template.go`，实现 `GET /api/v1/templates`，返回模板目录、能力和按区域裁剪后的模型预设，验证 why.md#requirement-template-catalog 的 `region-model-catalog`。
- [√] 2.2 在 `backend/internal/router/router.go` 注册 `/api/v1/templates` 路由，依赖任务 2.1。
- [√] 2.3 扩展 `backend/internal/handler/system.go` 与相关测试，确保 `region` 缺失时直接报错而不是回落默认值，依赖任务 2.1。
- [√] 2.4 在 `web/src/api/backend.ts` 新增 `listAgentTemplates()`，并让 `getSystemConfig()` 对缺失 region 抛错，依赖任务 2.2。
- [√] 2.5 收缩 `web/src/domains/agents/templates.ts` 的职责，只保留 logo / 色值 / 本地图形资源映射，不再承载模板能力，依赖任务 2.4。
- [√] 2.6 删除 `web/src/domains/agents/models.ts` 里的前端权威模型列表，把模型选项改成消费模板 API，依赖任务 2.4。

## 3. 后端装配实例 Contract V1

参考文件:
- `backend/internal/kube/agent_view.go`
- `backend/internal/handler/agent.go`
- `backend/internal/dto/agent.go`
- `template/hermes-agent/manifests/devbox.yaml.tmpl`

注意事项:
- 列表接口与详情接口都返回同一份 contract。
- 模板 ID 必须来自显式元数据或注解，禁止再通过镜像回推。
- API 能力只由模板声明 + 运行态真实结果决定，禁止再用域名“猜”。

- [√] 3.1 在 `backend/internal/kube/agent_view.go` 补全 Contract 装配所需的基础字段，明确读取 `workingDir / networkType / templateId / annotations`，验证 why.md#requirement-contract-v1 的 `capability-driven-detail`。
- [√] 3.2 在 `backend/internal/handler/agent.go` 内抽出 `buildAgentContract()`，把模板能力与运行态合并成统一 contract，依赖任务 3.1。
- [√] 3.3 改造 `ListAgents`，返回统一 contract 列表而不是旧 `AgentItem` 扁平结构，依赖任务 3.2。
- [√] 3.4 改造 `GetAgent`，与列表接口共用同一 contract assembler，依赖任务 3.2。
- [√] 3.5 删除或收缩 `dto.AgentItem` 的旧扁平字段，避免双轨输出，依赖任务 3.3。
- [√] 3.6 为 Hermes 的 API 能力、SSHGate 网络类型和工作目录补测试，保证 contract 输出可预测，依赖任务 3.4。

## 4. 新增 SSH 访问接口，建立 IDE 基础能力

参考文件:
- `reference/sealos/frontend/providers/devbox/app/api/getSSHConnectionInfo/route.ts`
- `reference/sealos/frontend/providers/devbox/components/IDEButton.tsx`
- `reference/sealos/frontend/providers/devbox/components/drawers/SshConnectDrawer.tsx`
- `backend/internal/router/router.go`
- `template/hermes-agent/manifests/devbox.yaml.tmpl`

注意事项:
- SSH 信息必须按需请求，不能塞回列表 contract。
- 私钥只允许通过独立接口返回。
- 只在模板显式声明支持 `ssh` 时暴露接口入口。

- [√] 4.1 新增 `backend/internal/handler/agent_access_ssh.go`，读取 devbox secret、生成 SSH 返回结构，验证 why.md#requirement-access-plane 的 `hermes-access`。
- [√] 4.2 在 `backend/internal/router/router.go` 注册 `GET /api/v1/agents/:agentName/access/ssh`，依赖任务 4.1。
- [√] 4.3 给 SSH handler 增加单测，覆盖 secret 缺失、模板不支持 ssh、正常返回三种情况，依赖任务 4.1。
- [√] 4.4 审核 `template/hermes-agent/manifests/devbox.yaml.tmpl` 与 `template/hermes-agent/template.yaml`，确认 `SSHGate / user / workingDir` 信息和模板目录一致，依赖任务 4.1。

## 5. 前端 controller 改为消费模板目录 + Contract V1

参考文件:
- `web/src/app/pages/agent-hub/hooks/useAgentHubController.ts`
- `web/src/api/backend.ts`
- `web/src/domains/agents/mappers.ts`
- `web/src/domains/agents/aiproxy.ts`

注意事项:
- controller 初始化时必须先拿到 `templates + region + agents`。
- 不允许再对 provider、template、api 能力做本地兜底推断。
- 如果模板目录或 region 不可用，创建页与设置页应直接失败。

- [√] 5.1 重写 `useAgentHubController.ts` 的初始化流程，同时请求模板目录、system config、agents，并把三者缓存成同一快照，验证 why.md#requirement-template-catalog 的 `region-model-catalog`。
- [√] 5.2 删除 `mapBackendAgentsToListItems()` 中的 `hermes-agent` 默认回落和 `apiBaseURL` 推导逻辑，改成纯 contract 映射，依赖任务 5.1。
- [√] 5.3 删除 `createBlueprintFromAgentItem()` 里从 `apiBaseURL` 反推域名的逻辑，改成直接消费 runtime / settings 字段，依赖任务 5.2。
- [√] 5.4 收缩 `web/src/domains/agents/aiproxy.ts`，把 provider 选择从“根据 model 推断”改成“直接读取模型选项自带 provider/apiMode”，依赖任务 5.1。
- [√] 5.5 删除 `applyManagedAIProxyBlueprint()` 及其调用点，创建和设置页只提交显式 provider，不再自动改写，依赖任务 5.4。

## 6. 创建页改成模板 schema 驱动

参考文件:
- `web/src/app/pages/agent-hub/AgentTemplateSelectPage.tsx`
- `web/src/app/pages/agent-hub/AgentCreatePage.tsx`
- `web/src/components/business/agents/AgentConfigForm.tsx`
- `web/src/components/business/agents/AgentConfigModal.tsx`

注意事项:
- 创建页不再直接读取前端静态模型列表。
- `cn/us` 模型差异必须完全由模板目录决定。
- 每个模型选项必须携带显式 provider，不允许再次根据 model 名称推导。

- [√] 6.1 改造模板选择页，完全消费 `GET /api/v1/templates` 返回的目录，不再依赖前端静态模板定义，验证 why.md#requirement-template-catalog 的 `region-model-catalog`。
- [√] 6.2 重构 `AgentCreatePage.tsx`，让创建蓝图基于模板目录生成，而不是基于本地 `applyTemplateToBlueprint()`，依赖任务 6.1。
- [√] 6.3 改造 `AgentConfigForm.tsx`，把模型选择、provider 展示、Agent 设置项改成 schema 驱动渲染，依赖任务 6.2。
- [√] 6.4 调整 `buildCreatePayload()`，只提交模板目录允许的显式字段，移除任何自动映射 provider 的逻辑，依赖任务 6.3。
- [√] 6.5 为创建页增加 `cn/us` 模型预设和 provider 提交的组件测试，依赖任务 6.4。

## 7. 详情页重构为“固定骨架 + 动态能力入口”

参考文件:
- `web/src/app/pages/agent-hub/AgentDetailPage.tsx`
- `web/src/app/pages/agent-hub/components/AgentDetailOverview.tsx`
- `web/src/app/pages/agent-hub/components/AgentDetailSidebar.tsx`
- `reference/sealos/frontend/providers/devbox/app/[lang]/(platform)/devbox/detail/[name]/components/Basic.tsx`
- `reference/sealos/frontend/providers/devbox/components/IDEButton.tsx`

注意事项:
- 详情页必须延续 DevBox 的 detail 骨架。
- `chat` 不再是固定一级 tab，只能作为模板动作或工作区。
- 访问平面区块必须明确区分 `API / SSH / IDE / Web UI`。

- [√] 7.1 重构 `AgentDetailSidebar.tsx`，从固定 `overview/chat/terminal/files` 改成基于 contract 动态生成 `overview/terminal/files/settings`，验证 why.md#requirement-dynamic-navigation 的 `sidebar-generated-by-contract`。
- [√] 7.2 重构 `AgentDetailPage.tsx`，把 `chat` 从固定 tab 中抽离，改为模板动作入口或 Hermes 专属工作区，依赖任务 7.1。
- [√] 7.3 重写 `AgentDetailOverview.tsx` 的访问平面区块，显式渲染 `api / ssh / ide / web-ui`，并删除“公网地址”语义，依赖任务 7.2。
- [√] 7.4 新增 `SSH` 操作 UI，支持复制 SSH 命令、下载私钥、查看连接信息，依赖任务 4.2 和任务 7.3。
- [√] 7.5 新增 `IDE` 操作 UI，先支持 `Cursor / VSCode / Zed / Gateway` deeplink，依赖任务 4.2 和任务 7.4。
- [√] 7.6 为 Hermes 与 OpenClaw 各做一份详情页能力快照测试，验证“不支持的入口不展示”，依赖任务 7.5。

## 8. 设置页拆分为 runtime 与 agent settings

参考文件:
- `web/src/components/business/agents/AgentConfigForm.tsx`
- `web/src/components/business/agents/AgentConfigModal.tsx`
- `web/src/app/pages/agent-hub/AgentDetailPage.tsx`
- `backend/internal/handler/agent.go`
- `backend/internal/dto/agent.go`

注意事项:
- 运行时设置和 Agent 设置不能再提交到同一个宽泛 payload。
- 设置字段必须严格按模板目录白名单渲染和提交。

- [√] 8.1 新增 `backend/internal/dto/agent_runtime_update.go` 与 `agent_settings_update.go`，拆分运行时和 Agent 设置 DTO，验证 why.md#requirement-settings-plane 的 `runtime-settings` 与 `agent-settings`。
- [√] 8.2 新增 `backend/internal/handler/agent_runtime_update.go`，只处理 `cpu / memory / storage / runtimeClassName`，依赖任务 8.1。
- [√] 8.3 新增 `backend/internal/handler/agent_settings_update.go`，按模板 schema 校验并更新模板私有配置，依赖任务 8.1。
- [√] 8.4 在 `backend/internal/router/router.go` 注册 `/runtime` 与 `/settings` 两条 PATCH 路由，依赖任务 8.2 和任务 8.3。
- [√] 8.5 新增前端 `Settings` 工作区页面，把表单拆成“运行时设置”和“Agent 设置”两组，依赖任务 8.4。
- [√] 8.6 删除详情页和列表页当前复用的旧配置弹窗入口，统一改为进入 `设置` 工作区，依赖任务 8.5。

## 9. 列表页动作区与 contract 对齐

参考文件:
- `web/src/components/business/agents/AgentInstancesTable.tsx`
- `web/src/components/business/agents/list/AgentActionsCell.tsx`
- `web/src/app/pages/agent-hub/AgentsListPage.tsx`

注意事项:
- 列表页动作只展示 contract 允许的入口。
- 不能再出现“按钮在，但模板其实不支持”的情况。

- [√] 9.1 改造 `AgentInstancesTable.tsx` 和 `AgentActionsCell.tsx`，让动作按钮来自 contract 的 `actions/access`，验证 why.md#requirement-access-plane 的 `hermes-access` 与 `openclaw-access`。
- [√] 9.2 调整 `AgentsListPage.tsx` 的快捷动作分发逻辑，让 `chat / terminal / files / settings / web-ui` 都按 contract 判断是否出现，依赖任务 9.1。
- [√] 9.3 为列表动作区补回归测试，确保 Hermes 和 OpenClaw 的动作集合不同但布局一致，依赖任务 9.2。

## 10. 清理旧推断逻辑与知识库同步

参考文件:
- `web/src/domains/agents/mappers.ts`
- `web/src/domains/agents/templates.ts`
- `web/src/domains/agents/models.ts`
- `web/src/app/pages/agent-hub/hooks/useAgentHubController.ts`
- `helloagents/wiki/arch.md`
- `helloagents/wiki/modules/agent-hub-frontend.md`
- `helloagents/CHANGELOG.md`

注意事项:
- 这一阶段不是“保留兼容层”，而是彻底清掉旧推断入口。
- 知识库中现有“兼容旧实例自动收敛”的描述也必须删除。

- [√] 10.1 全库搜索并删除 `inferTemplateIdFromImage`、`supportsAPIAccess`、`applyManagedAIProxyBlueprint`、`custom/openai-compatible 自动收敛` 等旧逻辑和旧文案，依赖任务 5.5。
- [√] 10.2 更新 `helloagents/wiki/arch.md`，记录 Contract V1、模板目录 API、设置拆分和 SSH 接口，依赖任务 10.1。
- [√] 10.3 更新 `helloagents/wiki/modules/agent-hub-frontend.md`，删掉所有“兼容旧实例自动收敛”描述，改成显式能力契约语义，依赖任务 10.2。
- [√] 10.4 更新 `helloagents/CHANGELOG.md`，记录本次架构切换与旧推断逻辑移除，依赖任务 10.3。

## 11. 验证与上线顺序

参考文件:
- `backend/internal/router/router_test.go`
- `backend/internal/handler/agent_hermes_config_test.go`
- `backend/internal/handler/hermes_provider_profiles_test.go`
- `backend/api/frontend-checklist.md`

注意事项:
- 前后端 contract 需要同版本发布。
- 不允许“新前端 + 旧后端”继续跑一段时间。

- [√] 11.1 后端补齐模板目录、contract assembler、SSH 接口、runtime/settings update 的测试，验证 why.md#requirement-contract-v1 的全部核心场景。
- [√] 11.2 前端执行 `cd web && npm run lint` 和 `cd web && npm run build`，确保 contract 迁移后无遗留类型错误。
- [√] 11.3 后端执行 `cd backend && go test ./internal/handler/... ./internal/router/...`，确保 API 契约和路由通过。
- [√] 11.4 更新 `backend/api/frontend-checklist.md`，把创建页、详情页、设置页、SSH/IDE、模板目录都加入联调清单。
- [√] 11.5 上线顺序固定为“后端先发、前端后发、模板目录和知识库最后同步”，不保留旧 DTO 过渡窗口。
