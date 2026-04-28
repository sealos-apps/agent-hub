# 任务清单: Agent Hub 对齐 DevBox 产品风格重构

目录: `helloagents/plan/202604161356_agent_hub_devbox_ui_alignment/`

备注: 该方案的后续视觉与交互纠偏已由 `202604161930_agent_hub_devbox_modal_ui_correction` 承接，以下状态已按当前代码实现回写。

---

## 1. 路由与页面骨架
- [√] 1.1 在 `web/package.json` 中引入 `react-router-dom`，为 Agent Hub 提供列表页、创建页、详情页的前端路由能力，验证 why.md#需求-agent-列表页与-devbox-首页风格对齐-场景-浏览实例列表
- [√] 1.2 在 `web/src/App.tsx` 中重构应用入口，建立 `/agents`、`/agents/create`、`/agents/:agentName` 三段式结构，验证 why.md#需求-agent-详情工作台-场景-进入实例详情，依赖任务1.1
- [√] 1.3 在 `web/src/app/pages` 下新增页面骨架组件并抽离当前 `AgentHubPage` 的顶层职责，验证 why.md#需求-agent-列表页与-devbox-首页风格对齐-场景-浏览实例列表，依赖任务1.2

## 2. 列表页对齐 DevBox 风格
- [√] 2.1 在 `web/src/components/business/agents/AgentInstancesTable.tsx` 中拆分列表列渲染职责，迁移为独立列组件结构，验证 why.md#需求-agent-列表页与-devbox-首页风格对齐-场景-浏览实例列表
- [√] 2.2 在 `web/src/app/pages/agent-hub/components/AgentHubHeader.tsx` 中按 DevBox Header 结构重做搜索与创建区，验证 why.md#需求-agent-列表页与-devbox-首页风格对齐-场景-浏览实例列表
- [√] 2.3 在 `web/src/app/pages/agent-hub/components/AgentHubOverview.tsx` 及其调用位置中移除与 Agent 核心操作弱相关的卡片展示，验证 why.md#需求-agent-列表页与-devbox-首页风格对齐-场景-浏览实例列表，依赖任务2.2
- [√] 2.4 在 `web/src/domains/agents/mappers.ts` 中收敛列表页展示字段，确保首页不再显示 API 地址，验证 why.md#需求-agent-列表页与-devbox-首页风格对齐-场景-浏览实例列表，依赖任务2.1

## 3. 创建流程页面化
- [√] 3.1 在 `web/src/components/business/agents/AgentTemplatePickerModal.tsx` 的现有逻辑基础上抽出可复用的模板选择步骤，供创建页使用，验证 why.md#需求-创建流程页面化-场景-创建新实例
- [√] 3.2 在 `web/src/components/business/agents/AgentConfigModal.tsx` 的现有逻辑基础上抽出页面表单组件，迁移别名、资源规格、模型选择与 AIProxy 自动注入逻辑，验证 why.md#需求-创建流程页面化-场景-创建新实例，依赖任务3.1
- [√] 3.3 在新建的创建页中打通“模板选择 -> 表单填写 -> 创建提交 -> 跳转详情页”流程，验证 why.md#需求-创建流程页面化-场景-创建新实例，依赖任务3.2

## 4. 详情页工作台
- [√] 4.1 在新建的详情页中实现 DevBox 风格的 `Header + Sidebar + Content` 布局，验证 why.md#需求-agent-详情工作台-场景-进入实例详情
- [√] 4.2 在详情页 `overview` 区域中实现基础信息、资源规格、模型配置、bootstrap 状态与 ingress/API 状态展示，验证 why.md#需求-agent-详情工作台-场景-进入实例详情，依赖任务4.1
- [√] 4.3 将 `web/src/app/pages/agent-hub/hooks/useAgentChat.ts` 接入详情页 `chat` tab，验证 why.md#需求-保留现有能力并迁移到新结构-场景-使用聊天、终端和文件，依赖任务4.1
- [√] 4.4 将 `web/src/app/pages/agent-hub/hooks/useAgentTerminal.ts` 接入详情页 `terminal` tab，验证 why.md#需求-保留现有能力并迁移到新结构-场景-使用聊天、终端和文件，依赖任务4.1
- [√] 4.5 将 `web/src/app/pages/agent-hub/hooks/useAgentFiles.ts` 接入详情页 `files` tab，验证 why.md#需求-保留现有能力并迁移到新结构-场景-使用聊天、终端和文件，依赖任务4.1

## 5. 页面状态与操作逻辑拆分
- [√] 5.1 从 `web/src/app/pages/AgentHubPage.tsx` 中抽离列表加载、静默刷新、状态轮询逻辑，形成页面级 hook，验证 why.md#需求-统一状态与刷新感知-场景-实例从创建中进入可用
- [√] 5.2 从 `web/src/app/pages/AgentHubPage.tsx` 中抽离创建、更新、删除、启停等动作编排，形成独立操作 hook，验证 why.md#需求-统一状态与刷新感知-场景-实例从创建中进入可用，依赖任务5.1
- [√] 5.3 在详情页与列表页之间统一 Agent 视图模型与导航参数，避免状态滞后与重复请求，验证 why.md#需求-agent-详情工作台-场景-进入实例详情，依赖任务5.1

## 6. 视觉风格对齐
- [√] 6.1 在 `web/src/index.css` 中对齐 DevBox 级别的页面背景、间距、圆角、阴影和按钮体系，验证 why.md#需求-agent-列表页与-devbox-首页风格对齐-场景-浏览实例列表
- [√] 6.2 在 `web/src/components/ui/Button.tsx`、`web/src/components/ui/Input.tsx`、`web/src/components/ui/StatusBadge.tsx` 中统一组件风格，使其接近 DevBox 的交互语言，验证 why.md#需求-agent-列表页与-devbox-首页风格对齐-场景-浏览实例列表，依赖任务6.1
- [√] 6.3 在 `web/src/components/business/agents/AgentInstancesTable.tsx` 中将资源规格展示统一为图标化 mini card 风格，验证 why.md#需求-agent-列表页与-devbox-首页风格对齐-场景-浏览实例列表，依赖任务2.1

## 7. 安全检查
- [√] 7.1 执行安全检查（输入验证、敏感信息处理、权限控制、EHRB风险规避）

## 8. 文档更新
- [√] 8.1 在后续开发实施完成后，同步更新 `helloagents/wiki` 或项目内对应前端架构文档，补充 Agent Hub 的页面结构与状态流说明

## 9. 测试
- [√] 9.1 在前端验证清单中覆盖“列表页加载、创建页提交、详情页进入、聊天/终端/文件可用、创建中状态自动转为运行中”的场景测试，验证 why.md#需求-统一状态与刷新感知-场景-实例从创建中进入可用
- [√] 9.2 在前端验证清单中补充“强制刷新后状态恢复、从列表进入详情、从创建完成跳转详情、删除/暂停/启动操作反馈”的回归测试，验证 why.md#需求-agent-详情工作台-场景-进入实例详情，依赖任务9.1

---

## 任务状态符号
- `[ ]` 待执行
- `[√]` 已完成
- `[X]` 执行失败
- `[-]` 已跳过
- `[?]` 待确认
