# 项目技术约定

## 技术栈
- 前端：React 19、TypeScript、Vite、React Router、Tailwind CSS、lucide-react
- 后端：Go、Gin、client-go、gorilla/websocket
- 部署：Sealos / Kubernetes，模板与清单位于 `deploy/`、`template/`

## 目录约定
- `web/`：Agent Hub 前端
- `backend/`：统一管理 API、AIProxy 接口与终端/文件 WebSocket
- `deploy/`：Sealos 模板与部署清单
- `template/hermes-agent/`：Hermes Agent 模板资源
- `helloagents/`：方案包、知识库与历史索引

## 开发约定
- Agent Hub 页面状态统一经由 `useAgentHubController` 管理；跨页共享优先使用 Provider，而不是在各页面重复实例化。
- 列表视图模型禁止携带明文 API Key，也不再保留 API URL 作为展示字段。
- 任何新增页面流转都应优先带导航快照，避免详情页重新加载时出现短暂空态。
- 后端本地开发统一使用 `backend/.env`；Sealos 线上部署继续使用 Deployment `env`，不依赖仓库内 `.env` 文件。

## 验证命令
- 前端构建：`cd web && npm run build`
- 前端 lint：`cd web && npm run lint`
- 后端路由测试：`cd backend && go test ./internal/router`
