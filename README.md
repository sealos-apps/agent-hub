# Agent Hub

Agent Hub is the Sealos workspace for launching, configuring, and operating AI agent runtimes on Kubernetes.

It combines a Go backend, a React frontend, and a template repository contract so users can create an agent, open its console, manage files and settings, and connect it to AIProxy-managed models.

## What It Does

- Loads the agent catalog from [sealos-apps/Agent-Hub-Template](https://github.com/sealos-apps/Agent-Hub-Template).
- Creates one agent instance as Kubernetes `Devbox`, `Service`, and `Ingress` resources.
- Provides Agent Hub Console for terminal, files, settings, web access, API access, and SSH entry points.
- Syncs model configuration through AIProxy and `ai-agent-switch`.
- Supports US and CN deployment configuration through the same runtime contract.

## Repository Layout

```text
backend/
  Go API service, Kubernetes integration, template loading, and agent lifecycle management
frontend/
  React + Vite Agent Hub UI and Agent Hub Console
deploy/
  App registration manifests and Helm chart
docs/
  Product, UI, branding, AIProxy, and deployment docs
Dockerfile
  Production image that bundles the backend and built frontend
```

## Template Repository

Agent Hub does not hard-code agent images or deployment manifests.

The template repository owns the runtime catalog:

- `registry/agents.yaml`: enabled agent list
- `agents/<agent-id>/template.yaml`: catalog metadata, image, port, access, settings, and model presets
- `agents/<agent-id>/manifests/*.yaml.tmpl`: `Devbox`, `Service`, and `Ingress` templates
- `agents/<agent-id>/Dockerfile`: agent runtime image build

The default template source is:

```text
https://github.com/sealos-apps/Agent-Hub-Template
```

Override it with `AGENT_TEMPLATE_GITHUB_URL` when running a custom template repository.

## Local Development

Start the backend first:

```bash
cd backend
REGION=us go run ./cmd/app
```

The backend listens on:

```text
http://127.0.0.1:8888
```

Then start the frontend:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

The frontend listens on:

```text
http://localhost:3000
```

By default, Vite proxies `/backend-api` to `http://127.0.0.1:8888`.

Override the backend target when needed:

```bash
VITE_AGENTHUB_BACKEND_TARGET=http://127.0.0.1:<port> npm run dev -- --host 0.0.0.0
```

`VITE_AGENTHUB_BACKEND_TARGET` only accepts localhost HTTP URLs.

## Configuration

| Variable | Description |
| --- | --- |
| `REGION` | Runtime region. Use `us` or `cn`. |
| `PORT` | Backend HTTP port. Default: `8888`. |
| `AGENT_TEMPLATE_GITHUB_URL` | Template repository URL. Default: `https://github.com/sealos-apps/Agent-Hub-Template`. |
| `AGENT_TEMPLATE_GITHUB_TOKEN` | Optional GitHub token for private template repositories. |
| `AGENT_TEMPLATE_CACHE_DIR` | Optional cache directory for downloaded template archives. |
| `INGRESS_SUFFIX` | Domain suffix used for newly created agent access domains. |
| `SSH_DOMAIN` | SSH gateway domain, when SSH access is enabled. |
| `AIPROXY_MANAGER_BASE_URL` | AIProxy token and workspace management base URL. |
| `AIPROXY_MODEL_BASE_URL` | AIProxy model API base URL. |
| `K8S_PROXY_ALLOWED_HOSTS` | Comma-separated Kubernetes API server allowlist. Default: `usw.sealos.io,usw-1.sealos.io,hzh.sealos.run,bja.sealos.run,gzg.sealos.run`. |
| `WS_ALLOWED_ORIGINS` | Optional WebSocket origin allowlist. |

## Deployment

The production image is published to GHCR:

```text
ghcr.io/sealos-apps/agent-hub:<tag>
```

Deployment options are documented in [docs/Deployment-US-CN.md](docs/Deployment-US-CN.md):

- Helm chart as the production deployment path
- Kubernetes YAML for review, troubleshooting, and manual deployment
- Sealos app registration for `agenthub` and `agenthub-console`

## Verification

Backend:

```bash
cd backend
go test ./...
```

Frontend:

```bash
cd frontend
npm run lint
npm run test
npm run build
```

## Related Docs

- [Backend README](backend/README.md)
- [Frontend README](frontend/README.md)
- [Deployment: US / CN](docs/Deployment-US-CN.md)
- [Branding](docs/Branding.md)
- [AIProxy Token API](docs/AIProxy-Token-API.md)

## 中文简介

Agent Hub 控制台是 Sealos 上用于创建、配置和管理 AI Agent 运行时的工作台。

它由 Go 后端、React 前端和模板仓库契约组成。后端从 [sealos-apps/Agent-Hub-Template](https://github.com/sealos-apps/Agent-Hub-Template) 读取 Agent 模板，创建对应的 `Devbox`、`Service` 和 `Ingress`，前端提供 Agent Hub Console，用于打开终端、文件、设置、Web 入口、API 入口和 SSH。

本地开发先启动后端：

```bash
cd backend
REGION=us go run ./cmd/app
```

再启动前端：

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

上线方式请看 [docs/Deployment-US-CN.md](docs/Deployment-US-CN.md)。当前标准是生产使用 Helm Chart，上线前保留 Kubernetes YAML 用于审阅和排障，并注册 `agenthub` / `agenthub-console` 两个 App 资源。
