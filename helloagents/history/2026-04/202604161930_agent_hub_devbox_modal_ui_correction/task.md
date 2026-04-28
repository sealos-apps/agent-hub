# 任务清单: Agent Hub DevBox 风格纠偏

目录: `helloagents/plan/202604161930_agent_hub_devbox_modal_ui_correction/`

## 1. 方案包
- [√] 1.1 创建本次纠偏方案包，明确上一轮与 DevBox 设计思想的偏差

## 2. 页面骨架收缩
- [√] 2.1 收缩列表页骨架，移除总览卡片
- [√] 2.2 收缩创建页骨架，改为表单优先布局
- [√] 2.3 收缩详情页骨架，压缩 header 与 overview

## 3. 组件细拆
- [√] 3.1 拆分 Agent 列表名称、状态、资源、操作渲染组件
- [√] 3.2 拆出详情页 overview 组件
- [√] 3.3 收缩创建页侧栏与模板选择组件

## 4. 基础样式
- [√] 4.1 调整 Button / Input / StatusBadge / EmptyState 为更贴近 DevBox 的紧凑风格
- [√] 4.2 调整全局背景、边框、阴影与间距

## 5. 验证
- [√] 5.1 运行前端构建验证
- [√] 5.2 回写任务状态
