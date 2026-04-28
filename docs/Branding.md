# Agent Hub Branding

本文档说明当前项目里 `Agent Hub` 名称与 SVG logo 的配置方式。

## 1. 品牌名称

前端统一品牌名入口：

- [branding.ts](../web/src/branding.ts)

当前默认值：

```ts
APP_NAME = 'Agent Hub'
```

如果只想改前端展示名称，可通过环境变量覆盖：

```bash
VITE_AGENTHUB_BRAND_NAME="Agent Hub"
```

说明：

- 这里只影响前端页面里的品牌展示
- `agenthub` 相关技术 slug、app key、token name 前缀暂时不自动改，避免影响兼容性

## 2. 前端页面 Logo

前端页面品牌 logo 入口：

- [branding.ts](../web/src/branding.ts)

当前默认值：

```ts
APP_LOGO_URL = '/brand/agent-hub.svg'
```

也就是说，最简单的方式有两种：

1. 直接替换：
   - [agent-hub.svg](../web/public/brand/agent-hub.svg)
2. 用环境变量指定新的 SVG 路径：

```bash
VITE_AGENTHUB_LOGO_URL="/brand/agent-hub.svg"
```

当前仓库已经落了一份默认 SVG：

- [agent-hub.svg](../web/public/brand/agent-hub.svg)

推荐做法：

- 直接替换 `web/public/brand/agent-hub.svg`
- 或者再设置 `VITE_AGENTHUB_LOGO_URL=/brand/agent-hub.svg`

原因：

- `public/` 下的文件会被 Vite 直接按静态资源暴露
- SVG 不需要额外打包处理，路径最稳定

## 3. 浏览器页签 Favicon / Title

浏览器页签标题和 favicon 现在也支持配置：

- [index.html](../web/index.html)
- [vite.config.ts](../web/vite.config.ts)

可用环境变量：

```bash
VITE_AGENTHUB_BROWSER_TITLE="Agent Hub Web"
VITE_AGENTHUB_FAVICON_URL="/brand/agent-hub.svg"
```

说明：

- `VITE_AGENTHUB_FAVICON_URL` 适合配置为 SVG 路径
- 默认仍然回退到 `/brand/agent-hub.svg`

## 4. Sealos App 图标

Sealos App 清单里的 icon 不是文件路径，而是一个可访问的 URL。

入口文件：

- [agenthub-app.yaml.tmpl](../deploy/manifests/agenthub-app.yaml.tmpl)
- [agenthub-terminal-app.yaml.tmpl](../deploy/manifests/agenthub-terminal-app.yaml.tmpl)

对应字段：

```yaml
spec:
  icon: "{{ .iconUrl }}"
```

当前建议拆成两个 App：

- 显式 App：
  - `agenthub`
  - `displayType: normal`
  - 用户在 Sealos 桌面上看到的主入口
- 隐式 App：
  - `agenthub-terminal`
  - `displayType: hidden`
  - 只供 `openDesktopApp` 打开终端窗口，不直接暴露给用户

这意味着：

- 如果是部署 Sealos App 图标，需要给模板渲染参数传一个 SVG 的公网 URL
- 不能直接传本地文件系统路径

例如：

```text
https://example.com/agent-hub.svg
```

## 5. 当前建议

如果你现在就要把品牌收口，建议按这个顺序：

1. 把最终 SVG 放到 `web/public/brand/agent-hub.svg`
2. 设置：
   - `VITE_AGENTHUB_LOGO_URL=/brand/agent-hub.svg`
   - `VITE_AGENTHUB_FAVICON_URL=/brand/agent-hub.svg`
3. Sealos 桌面应用建议同时部署两个 App 清单：
   - `deploy/manifests/agenthub-app.yaml.tmpl`
   - `deploy/manifests/agenthub-terminal-app.yaml.tmpl`
4. 如果需要 Sealos App 图标，同一份 SVG 再发布一个外部可访问 URL，传给两个清单里的 `.iconUrl`
