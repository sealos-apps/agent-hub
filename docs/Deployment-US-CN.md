# Agent Hub US / CN Deployment Standard

本文定义 Agent Hub 的上线标准。Agent Hub 是一个单镜像服务，镜像内同时包含 Web 页面和后端 API，不需要拆成 Web、API 两个 Deployment。

## 0. 标准结论

生产上线必须满足以下 3 点：

1. 使用 Helm Chart 作为正式上线入口。
2. 保留等价的 Kubernetes YAML，用于审阅、排障和必要时手动部署。
3. 单独注册 `agenthub` 和 `agenthub-console` 两个 Sealos App 资源。

不使用表单式部署作为标准上线方式。

## 1. 镜像

镜像来自 GHCR：

```text
ghcr.io/sealos-apps/agent-hub:sha-<短 SHA>
```

生产环境不要使用 `latest`。镜像 tag 以 GitHub Actions 的 Docker Image 结果为准。

示例：

```text
ghcr.io/sealos-apps/agent-hub:sha-795462b
```

## 2. 命名

| 项目 | 建议值 |
| --- | --- |
| Helm release | `agenthub` |
| Deployment / Service / Ingress | `agenthub-<后缀>` |
| 桌面主入口 App | `agenthub` |
| Console 隐藏入口 App | `agenthub-console` |

线上已有实例示例：

```text
agenthub-fxeji0zb
```

## 3. 端口和健康检查

| 项目 | 值 |
| --- | --- |
| Container Port | `8999` |
| Service Port | `8999` |
| 环境变量 `PORT` | `8999` |
| Healthz | `/healthz` |
| Readyz | `/readyz` |

`Container Port`、`Service Port` 和 `PORT` 必须保持一致。当前线上标准端口是 `8999`，镜像默认端口是 `8888`，所以上线时必须显式设置 `PORT=8999`。

验证：

```bash
curl -fsS https://<APP_HOST>/healthz
curl -fsS https://<APP_HOST>/readyz
```

## 4. 环境变量

模板仓库地址固定使用：

```text
https://github.com/sealos-apps/Agent-Hub-Template
```

`INGRESS_SUFFIX` 用于拼接 Agent Hub 创建出来的新 Agent 访问域名，不是 Agent Hub Console 自己的访问域名。

### US 默认配置

| Key | Value |
| --- | --- |
| `PORT` | `8999` |
| `REGION` | `us` |
| `INGRESS_SUFFIX` | `agent.usw-1.sealos.app` |
| `SSH_DOMAIN` | `ssh.usw-1.sealos.app` |
| `AGENT_TEMPLATE_GITHUB_URL` | `https://github.com/sealos-apps/Agent-Hub-Template` |
| `AIPROXY_MANAGER_BASE_URL` | `https://aiproxy-web.usw-1.sealos.io` |
| `AIPROXY_MODEL_BASE_URL` | `https://aiproxy.usw-1.sealos.io/v1` |
| `K8S_PROXY_ALLOWED_HOSTS` | `usw.sealos.io,usw-1.sealos.io,hzh.sealos.run,bja.sealos.run,gzg.sealos.run` |

US 可选 AIProxy 地址：

| 集群 | `AIPROXY_MANAGER_BASE_URL` | `AIPROXY_MODEL_BASE_URL` |
| --- | --- | --- |
| `usw` | `https://aiproxy-web.usw.sealos.io` | `https://aiproxy.usw.sealos.io/v1` |
| `usw-1` | `https://aiproxy-web.usw-1.sealos.io` | `https://aiproxy.usw-1.sealos.io/v1` |

US 可选入口域名：

| 集群 | `INGRESS_SUFFIX` | `SSH_DOMAIN` |
| --- | --- | --- |
| `usw` | `agent.usw.sealos.io` | `ssh.usw.sealos.io` |
| `usw-1` | `agent.usw-1.sealos.app` | `ssh.usw-1.sealos.app` |

### CN 默认配置

| Key | Value |
| --- | --- |
| `PORT` | `8999` |
| `REGION` | `cn` |
| `INGRESS_SUFFIX` | `agent.hzh.sealos.run` |
| `SSH_DOMAIN` | `ssh.hzh.sealos.run` |
| `AGENT_TEMPLATE_GITHUB_URL` | `https://github.com/sealos-apps/Agent-Hub-Template` |
| `AIPROXY_MANAGER_BASE_URL` | `https://aiproxy-web.hzh.sealos.run` |
| `AIPROXY_MODEL_BASE_URL` | `https://aiproxy.hzh.sealos.run/v1` |
| `K8S_PROXY_ALLOWED_HOSTS` | `usw.sealos.io,usw-1.sealos.io,hzh.sealos.run,bja.sealos.run,gzg.sealos.run` |

CN 可选 AIProxy 地址：

| 集群 | `AIPROXY_MANAGER_BASE_URL` | `AIPROXY_MODEL_BASE_URL` |
| --- | --- | --- |
| `hzh` | `https://aiproxy-web.hzh.sealos.run` | `https://aiproxy.hzh.sealos.run/v1` |
| `bja` | `https://aiproxy-web.bja.sealos.run` | `https://aiproxy.bja.sealos.run/v1` |
| `gzg` | `https://aiproxy-web.gzg.sealos.run` | `https://aiproxy.gzg.sealos.run/v1` |

CN 可选入口域名：

| 集群 | `INGRESS_SUFFIX` | `SSH_DOMAIN` |
| --- | --- | --- |
| `hzh` | `agent.hzh.sealos.run` | `ssh.hzh.sealos.run` |
| `bja` | `agent.bja.sealos.run` | `ssh.bja.sealos.run` |
| `gzg` | `agent.gzg.sealos.run` | `ssh.gzg.sealos.run` |

注意：

- `REGION` 只能填 `us` 或 `cn`，不要填 `usw-1`、`hzh`、`bja` 或 `gzg`。
- `WS_ALLOWED_ORIGINS` 是可选项。只有 WebSocket 需要跨域访问时才配置，多个 Origin 用英文逗号分隔；同域访问不需要配置。

## 5. Helm Chart 部署

Helm Chart 路径：

```text
deploy/charts/agent-hub
```

### USW-1

```bash
helm upgrade --install agenthub deploy/charts/agent-hub \
  -n <NAMESPACE> \
  --set fullnameOverride=<APP_NAME> \
  --set image.tag=sha-<短 SHA> \
  --set ingress.host=<APP_HOST>
```

### CN hzh

```bash
helm upgrade --install agenthub deploy/charts/agent-hub \
  -n <NAMESPACE> \
  -f deploy/charts/agent-hub/values-cn.yaml \
  --set fullnameOverride=<APP_NAME> \
  --set image.tag=sha-<短 SHA> \
  --set ingress.host=<APP_HOST>
```

### 占位符

| 占位符 | 示例 |
| --- | --- |
| `<NAMESPACE>` | `ns-fxeji0zb` |
| `<APP_NAME>` | `agenthub-fxeji0zb` |
| `<APP_HOST>` | `agenthub-fxeji0zb.usw-1.sealos.app` |
| `sha-<短 SHA>` | `sha-795462b` |

### 渲染检查

上线前先渲染检查：

```bash
helm template agenthub deploy/charts/agent-hub \
  -n <NAMESPACE> \
  --set fullnameOverride=<APP_NAME> \
  --set image.tag=sha-<短 SHA> \
  --set ingress.host=<APP_HOST>
```

### 大请求头配置

当前 REST 请求仍会在 `Authorization` header 中携带 URL encoded kubeconfig，较大的 kubeconfig 可能超过默认 Ingress 请求头限制。

标准做法是在目标集群的 ingress-nginx Controller 层配置请求头 buffer。只有确认目标 Controller 允许 `server-snippet` annotation 时，才把下面这个参数追加到前面的 USW-1 或 CN hzh Helm 命令中：

```bash
--set ingress.largeClientHeaderBuffers.enabled=true
```

默认 Helm Chart 不开启 `server-snippet`，避免在禁用 snippet annotation 的集群上部署失败。

### Rollout 检查

```bash
kubectl -n <NAMESPACE> rollout status deploy/<APP_NAME> --timeout=180s
kubectl -n <NAMESPACE> get deploy <APP_NAME> -o wide
kubectl -n <NAMESPACE> get pods -l app.kubernetes.io/instance=agenthub -o wide
```

如果 `fullnameOverride` 和 release name 不一致，以 `deploy/<APP_NAME>` 为准。

## 6. Kubernetes YAML

Kubernetes YAML 用于等价审阅、排障和必要时手动部署。正式上线仍以 Helm Chart 为准。

替换以下占位符：

| 占位符 | 说明 |
| --- | --- |
| `<NAMESPACE>` | 部署到的用户 namespace |
| `<APP_NAME>` | 应用名，例如 `agenthub-fxeji0zb` |
| `<APP_HOST>` | Agent Hub 自己的访问域名，例如 `agenthub-fxeji0zb.usw-1.sealos.app` |
| `<IMAGE>` | 镜像，例如 `ghcr.io/sealos-apps/agent-hub:sha-<短 SHA>` |

USW-1 示例：

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: <APP_NAME>
  namespace: <NAMESPACE>
  labels:
    app: <APP_NAME>
    cloud.sealos.io/app-deploy-manager: <APP_NAME>
spec:
  replicas: 1
  revisionHistoryLimit: 1
  selector:
    matchLabels:
      app: <APP_NAME>
  template:
    metadata:
      labels:
        app: <APP_NAME>
    spec:
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: <APP_NAME>
          image: <IMAGE>
          imagePullPolicy: IfNotPresent
          ports:
            - name: http
              containerPort: 8999
          env:
            - name: PORT
              value: "8999"
            - name: REGION
              value: us
            - name: INGRESS_SUFFIX
              value: agent.usw-1.sealos.app
            - name: SSH_DOMAIN
              value: ssh.usw-1.sealos.app
            - name: AGENT_TEMPLATE_GITHUB_URL
              value: https://github.com/sealos-apps/Agent-Hub-Template
            - name: AIPROXY_MANAGER_BASE_URL
              value: https://aiproxy-web.usw-1.sealos.io
            - name: AIPROXY_MODEL_BASE_URL
              value: https://aiproxy.usw-1.sealos.io/v1
            - name: K8S_PROXY_ALLOWED_HOSTS
              value: usw.sealos.io,usw-1.sealos.io,hzh.sealos.run,bja.sealos.run,gzg.sealos.run
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: "1"
              memory: 1Gi
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop:
                - ALL
          startupProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 5
            failureThreshold: 24
          readinessProbe:
            httpGet:
              path: /readyz
              port: http
            periodSeconds: 10
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /healthz
              port: http
            periodSeconds: 10
            failureThreshold: 3
---
apiVersion: v1
kind: Service
metadata:
  name: <APP_NAME>
  namespace: <NAMESPACE>
  labels:
    app: <APP_NAME>
    cloud.sealos.io/app-deploy-manager: <APP_NAME>
spec:
  selector:
    app: <APP_NAME>
  ports:
    - name: http
      port: 8999
      targetPort: http
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: <APP_NAME>
  namespace: <NAMESPACE>
  labels:
    cloud.sealos.io/app-deploy-manager: <APP_NAME>
    cloud.sealos.io/app-deploy-manager-domain: <APP_NAME>
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/backend-protocol: HTTP
    nginx.ingress.kubernetes.io/client-body-buffer-size: 64k
    nginx.ingress.kubernetes.io/proxy-body-size: 32m
    nginx.ingress.kubernetes.io/proxy-buffer-size: 64k
    nginx.ingress.kubernetes.io/proxy-read-timeout: "300"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "300"
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
spec:
  rules:
    - host: <APP_HOST>
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: <APP_NAME>
                port:
                  number: 8999
  tls:
    - hosts:
        - <APP_HOST>
      secretName: wildcard-cert
```

CN 部署时只改 5 个值：

| Key | USW-1 | CN hzh 示例 |
| --- | --- | --- |
| `REGION` | `us` | `cn` |
| `INGRESS_SUFFIX` | `agent.usw-1.sealos.app` | `agent.hzh.sealos.run` |
| `SSH_DOMAIN` | `ssh.usw-1.sealos.app` | `ssh.hzh.sealos.run` |
| `AIPROXY_MANAGER_BASE_URL` | `https://aiproxy-web.usw-1.sealos.io` | `https://aiproxy-web.hzh.sealos.run` |
| `AIPROXY_MODEL_BASE_URL` | `https://aiproxy.usw-1.sealos.io/v1` | `https://aiproxy.hzh.sealos.run/v1` |

## 7. Sealos App 资源

Agent Hub 服务上线后，还需要注册 2 个 Sealos App 资源：

| App | displayType | 作用 |
| --- | --- | --- |
| `agenthub` | `normal` | Sealos 桌面主入口 |
| `agenthub-console` | `hidden` | Console 窗口入口 |

把 `<AGENT_HUB_URL>` 替换成 Agent Hub 的正式访问地址，例如 `https://agenthub-fxeji0zb.usw-1.sealos.app`。

主入口：

```yaml
apiVersion: app.sealos.io/v1
kind: App
metadata:
  name: agenthub
  namespace: app-system
spec:
  data:
    desc: Agent Hub Workspace
    url: "<AGENT_HUB_URL>"
  icon: "<AGENT_HUB_URL>/brand/agent-hub.svg"
  i18n:
    zh:
      name: Agent Hub
    zh-Hans:
      name: Agent Hub
  menuData:
  name: Agent Hub
  type: iframe
  displayType: normal
```

Console 窗口入口：

```yaml
apiVersion: app.sealos.io/v1
kind: App
metadata:
  name: agenthub-console
  namespace: app-system
spec:
  data:
    desc: Agent Hub Console Window
    url: "<AGENT_HUB_URL>"
  icon: "<AGENT_HUB_URL>/brand/agenthub-console.svg"
  i18n:
    zh:
      name: Agent Hub 控制台
    zh-Hans:
      name: Agent Hub 控制台
  menuData:
  name: Agent Hub Console
  type: iframe
  displayType: hidden
```

对应仓库模板：

```text
deploy/manifests/agenthub-app.yaml.tmpl
deploy/manifests/agenthub-console-app.yaml.tmpl
```

`agenthub-console` 必须注册，否则前端无法通过 `openDesktopApp` 打开 Console 窗口。

## 8. 发布核对清单

- [ ] 使用 GitHub Actions 产出的 `sha-<短 SHA>` 镜像。
- [ ] 使用 Helm Chart 执行正式上线。
- [ ] `PORT`、Container Port 和 Service Port 都是 `8999`。
- [ ] `REGION` 只填写 `us` 或 `cn`。
- [ ] `AGENT_TEMPLATE_GITHUB_URL` 指向 `https://github.com/sealos-apps/Agent-Hub-Template`。
- [ ] `INGRESS_SUFFIX` 和 `SSH_DOMAIN` 与目标集群一致。
- [ ] AIProxy 管理地址和模型地址与目标集群一致。
- [ ] `agenthub` 和 `agenthub-console` 两个 App 资源都已注册。
- [ ] `/healthz` 和 `/readyz` 返回成功。
