# 任务清单: Agent Hub DevBox 全量 UI 对齐重构

目录: `helloagents/plan/202604180328_agent_hub_devbox_full_ui_realignment/`

---

## 1. DevBox 对齐分析补全
- [√] 1.1 校验 `reference/sealos/frontend/providers/devbox/app/[lang]/(platform)/devbox/detail/[name]/components/*`、`template/components/*` 与 `api/devbox.ts`、`hooks/useControlDevbox.tsx`、`stores/devbox.ts`，补全本次页面和状态建模依据，验证 why.md#需求-前后端状态语义需要统一-场景-实例从创建中变为可用
- [√] 1.2 将本次 DevBox 对齐结论沉淀到方案包与知识库文档，验证 why.md#需求-列表页必须成为-devbox-式控制面-场景-浏览与控制实例

## 2. 共享样式与基础组件收敛
- [√] 2.1 在 `web/src/index.css` 中收敛 DevBox 风格的边框、圆角、阴影、输入框和固定桌面工作台基础样式，验证 why.md#需求-列表页必须成为-devbox-式控制面-场景-浏览与控制实例
- [√] 2.2 在 `web/src/components/ui/Button.tsx`、`web/src/components/ui/Input.tsx`、`web/src/components/ui/SearchField.tsx` 与 Agent Hub 共享组件中对齐 DevBox 控件语法，验证 why.md#需求-创建页必须是固定骨架工作流-场景-使用模板创建实例

## 3. 列表页重构
- [√] 3.1 在 `web/src/app/pages/agent-hub/AgentsListPage.tsx` 与 `web/src/app/pages/agent-hub/components/AgentHubHeader.tsx` 中重构首页 Header、主体骨架和空态组织，验证 why.md#需求-列表页必须成为-devbox-式控制面-场景-浏览与控制实例
- [√] 3.2 在 `web/src/components/business/agents/AgentInstancesTable.tsx`、`web/src/components/business/agents/list/*` 中重构表头、行布局和操作区，验证 why.md#需求-列表页必须成为-devbox-式控制面-场景-浏览与控制实例

## 4. 模板页重构
- [√] 4.1 在 `web/src/app/pages/agent-hub/AgentTemplateSelectPage.tsx` 中按 DevBox 模板中心重排 Header、tabs、搜索和内容容器，验证 why.md#需求-模板页必须具备-devbox-模板中心结构-场景-浏览与筛选模板
- [√] 4.2 在 `web/src/components/business/agents/AgentTemplatePickerPanel.tsx` 中重构模板卡片与分类/内容布局，验证 why.md#需求-模板页必须具备-devbox-模板中心结构-场景-浏览与筛选模板

## 5. 创建页重构
- [√] 5.1 在 `web/src/app/pages/agent-hub/AgentCreatePage.tsx`、`web/src/app/pages/agent-hub/components/AgentCreateHeader.tsx`、`web/src/app/pages/agent-hub/components/AgentCreateSidebar.tsx` 中对齐 DevBox 创建页骨架，验证 why.md#需求-创建页必须是固定骨架工作流-场景-使用模板创建实例
- [√] 5.2 在 `web/src/components/business/agents/AgentConfigForm.tsx` 中对齐运行时卡、名称输入、资源块、模型块的固定宽与表单节奏，验证 why.md#需求-创建页必须是固定骨架工作流-场景-使用模板创建实例

## 6. 详情页重构
- [√] 6.1 在 `web/src/app/pages/agent-hub/AgentDetailPage.tsx`、`web/src/app/pages/agent-hub/components/AgentDetailHeader.tsx`、`web/src/app/pages/agent-hub/components/AgentDetailSidebar.tsx` 中对齐 DevBox 详情页 Header + Sidebar 骨架，验证 why.md#需求-详情页必须接近-devbox-的操作工作台-场景-查看实例详情与切换能力
- [√] 6.2 在 `web/src/app/pages/agent-hub/components/AgentDetailOverview.tsx` 中重构 Overview 分区，使其更接近 DevBox 的 Basic / LiveMonitoring / Network / Release 工作台语法，验证 why.md#需求-详情页必须接近-devbox-的操作工作台-场景-查看实例详情与切换能力

## 7. 安全检查
- [√] 7.1 执行安全检查，确认本次重构未新增敏感信息暴露、危险链接拼接或错误状态误导

## 8. 文档更新
- [√] 8.1 更新 `docs/DevBox-UI-Deep-Dive.md`，补齐本次对 Detail / Template / API / Store 的源码级结论
- [√] 8.2 更新 `helloagents/wiki/modules/agent-hub-frontend.md` 与 `helloagents/CHANGELOG.md`
- [√] 8.3 完成方案包归档并更新 `helloagents/history/index.md`

## 9. 测试
- [√] 9.1 执行 `cd web && npm run build`，验证前端构建通过

---

## 任务状态符号
- `[ ]` 待执行
- `[√]` 已完成
- `[X]` 执行失败
- `[-]` 已跳过
- `[?]` 待确认
