# hermes-agent template

这里预留 Hermes Agent 的自定义镜像模板。

目的：

- 不直接依赖官方 `nousresearch/hermes-agent` 镜像
- 根据 Agent Hub 的部署方式裁剪运行时依赖
- 为后续 GitHub Actions 自动构建提供稳定上下文

当前仅建立占位目录，后续再补充：

- 自定义 `Dockerfile`
- 启动入口脚本
- 运行用户与工作目录约定
- 健康检查与发布配置

当前已经补充：

- `manifests/devbox.yaml.tmpl`
- `manifests/service.yaml.tmpl`
- `manifests/ingress.yaml.tmpl`

这些清单模板现在由 Agent Hub 后端直接读取，用来渲染创建 Hermes Agent 所需的 Kubernetes 资源。
