# Agent Hub

## 1. 项目概述

Agent Hub 是一个运行在 Sealos 中的 Agent 管理台，目标是让用户在工作区里完成 Agent 的创建、配置、运行态查看，以及对话、终端、文件等调试操作。

### 范围
- 范围内：Agent 列表、模板选择、创建页、详情工作台、后端统一管理 API、终端/文件 WebSocket
- 范围外：复杂的多租户权限系统、自定义模板编排器、完整 E2E 自动化体系

## 2. 模块索引

| 模块名称 | 职责 | 状态 | 文档 |
|---------|------|------|------|
| Agent Hub Frontend | 页面路由、共享状态、创建/详情工作台 | ✅稳定 | [modules/agent-hub-frontend.md](modules/agent-hub-frontend.md) |
| Agent Hub Security | 安全检查结果与证据 | ✅稳定 | [modules/agent-hub-security-checklist.md](modules/agent-hub-security-checklist.md) |

## 3. 快速链接
- [项目技术约定](../project.md)
- [架构设计](arch.md)
- [API 手册](api.md)
- [数据模型](data.md)
- [变更历史](../history/index.md)
- [前端联调清单](../../backend/api/frontend-checklist.md)
