# AIProxy Token API

本文档整理当前接入 AIProxy token 所需的接口、鉴权方式与注意事项。

重要说明：

- 不要把真实 `YOUR_SECRET_TOKEN` 提交到仓库
- 不要把真实 kubeconfig、url encoded kubeconfig、service account token 提交到仓库
- 下面所有示例都使用占位符

## 接口分组

当前按两种鉴权方式理解即可：

1. 管理接口：使用 `Bearer YOUR_SECRET_TOKEN`
2. 工作空间查询接口：`Authorization` 直接传 url encoded 后的 kubeconfig 字符串，不带 `Bearer`

Base URL:

```text
https://aiproxy-web.usw-1.sealos.io
```

当前项目建议把 AIProxy 的管理地址和模型地址分开理解。

推荐约定：

- 后端 token 管理地址：`AIPROXY_BASE_URL`
- 前端 token 管理地址兜底：`VITE_AGENTHUB_AIPROXY_MANAGER_BASE_URL`
- 前端模型地址兜底：`VITE_AGENTHUB_AIPROXY_MODEL_BASE_URL`

默认值：

```text
AIPROXY_BASE_URL=https://aiproxy-web.hzh.sealos.run
VITE_AGENTHUB_AIPROXY_MANAGER_BASE_URL=https://aiproxy-web.hzh.sealos.run
VITE_AGENTHUB_AIPROXY_MODEL_BASE_URL=https://aiproxy.hzh.sealos.run
```

说明：

- 文档里的 `https://aiproxy-web.usw-1.sealos.io` 是当前你提供的接口地址示例
- 项目配置层默认走 `https://aiproxy-web.hzh.sealos.run` 访问 token 管理接口
- Hermes 运行时真正写入 `agent-model-baseurl` 的模型地址应使用 `https://aiproxy.<region-host>`
- 例如 `https://usw-1.sealos.io:6443` 对应 `https://aiproxy.usw-1.sealos.io`
- 如果部署到其他 region，再通过环境变量覆盖兜底值

---

## 1. 管理接口

### 1.1 创建 token

```bash
curl https://aiproxy-web.usw-1.sealos.io/api/v2alpha/token \
  --request POST \
  --header 'Content-Type: application/json' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN' \
  --data '{
  "name": "brain"
}'
```

说明：

- `name` 为 token 名称
- 当前示例使用 `brain`

### 1.2 查询 token 列表

```bash
curl 'https://aiproxy-web.usw-1.sealos.io/api/v2alpha/token/search' \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

说明：

- 该接口用于查询当前可管理的 token 列表
- 通常可用于拿到 token 记录及其 `id`

### 1.3 删除 token

```bash
curl https://aiproxy-web.usw-1.sealos.io/api/v2alpha/token/{name} \
  --request DELETE \
  --header 'Authorization: Bearer YOUR_SECRET_TOKEN'
```

说明：

- `{name}` 替换成真实 token 名称
- 例如删除 `brain` 时，路径为 `/api/v2alpha/token/brain`

---

## 2. 工作空间查询接口

这个版本的查询接口与上面的管理接口不同：

- `Authorization` 不是 `Bearer xxx`
- `Authorization` 头里直接放 url encoded 后的 kubeconfig 字符串

### 2.1 按名称查询 token

```bash
curl 'https://aiproxy-web.usw-1.sealos.io/api/v2alpha/token/search?name=brain' \
  --header 'Authorization: URL_ENCODED_KUBECONFIG'
```

说明：

- `name=brain` 表示查询名为 `brain` 的 token
- `Authorization` 头直接传完整的、url encoded 后的 kubeconfig
- 不要加 `Bearer `

### 2.2 Authorization 头格式说明

错误示例：

```text
Authorization: Bearer URL_ENCODED_KUBECONFIG
```

正确示例：

```text
Authorization: URL_ENCODED_KUBECONFIG
```

### 2.3 kubeconfig 编码注意事项

- 这里传的是完整 kubeconfig 内容编码后的字符串，不是单独的 cluster token
- 编码前是标准 kubeconfig YAML
- 编码后整体作为 `Authorization` header 的值
- 当前前端 / 后端实现里如果复用已有 Sealos session kubeconfig，需要确保编码结果与服务端预期一致

JavaScript 示例：

```ts
const encodedKubeconfig = encodeURIComponent(kubeconfig)
```

Shell 示例：

```bash
python3 - <<'PY'
import urllib.parse
import sys

kubeconfig = sys.stdin.read()
print(urllib.parse.quote(kubeconfig, safe=''))
PY
```

---

## 3. 禁用 token

```bash
curl -X POST "https://aiproxy-web.usw-1.sealos.io/api/user/token/585" \
  -d '{"status":2}'
```

说明：

- `585` 是 token id，需要先通过查询接口拿到
- `status: 2` 表示禁用

建议实际调用时补充 `Content-Type`：

```bash
curl -X POST "https://aiproxy-web.usw-1.sealos.io/api/user/token/585" \
  --header 'Content-Type: application/json' \
  --data '{"status":2}'
```

---

## 4. 接入要点

### 4.1 两种鉴权方式不要混用

- 管理接口：`Authorization: Bearer YOUR_SECRET_TOKEN`
- 工作空间查询接口：`Authorization: URL_ENCODED_KUBECONFIG`

### 4.2 前端 / 后端落地建议

- 如果是平台级运维操作，走 `YOUR_SECRET_TOKEN`
- 如果是用户工作空间内的资源查询，优先走 kubeconfig 方式
- 所有真实凭证只放环境变量或服务端安全存储，不落前端仓库

### 4.3 建议封装的能力

后续可以统一封装为以下方法：

- `createAIProxyToken(name)`
- `searchAIProxyTokens()`
- `searchAIProxyTokenByName(name, kubeconfig)`
- `deleteAIProxyToken(name)`
- `disableAIProxyToken(id)`

### 4.4 Agent Hub 当前实现

当前仓库已经接入了一条后端 ensure 接口，专门给 Agent Hub 页面初始化使用。

后端接口：

```text
POST /api/v1/aiproxy/token/ensure
```

行为：

- 前端在用户首次打开 Agent Hub 页面时调用一次该接口
- 前端仍然把 url encoded kubeconfig 放在 `Authorization` 头里发给后端
- 后端使用 `AIPROXY_BASE_URL` 访问 token 管理接口，先查询再按需创建
- 默认 token 名称规则为 `agenthub-<namespace>`
- 名称会被标准化为小写、保留 `a-z` / `0-9` / `-`，并截断到 32 个字符以内
- 如果 token 已存在，直接复用；如果不存在，再调用创建接口
- 创建 Agent 时，前端会把 ensure 返回的 `key` 自动注入 `agent-model-apikey`

说明：

- 这个自动注入只用于当前页面会话内的部署流程，不会在页面上回显明文 key
- 如果 ensure 成功但上游查询结果没有返回 `key` 字段，则本次不会自动注入模型 key
- 如果后续需要支持手动指定 token 名称，可继续复用这个后端接口的 `name` 请求体字段

---

## 5. 占位符约定

文档中的占位符含义：

- `YOUR_SECRET_TOKEN`：平台侧 Bearer token
- `URL_ENCODED_KUBECONFIG`：url encoded 后的完整 kubeconfig
- `{name}`：token 名称
- `585`：示例 token id
