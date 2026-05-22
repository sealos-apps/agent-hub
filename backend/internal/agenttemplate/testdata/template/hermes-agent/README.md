# hermes-agent fixture template

这是后端测试使用的 Hermes Agent 模板夹具，同时可作为本地 `AGENT_MANIFEST_TEMPLATE_DIR` 的兜底样例。

包含：

- `manifests/devbox.yaml.tmpl`
- `manifests/service.yaml.tmpl`
- `manifests/ingress.yaml.tmpl`
- `bootstrap.sh`
- `healthcheck.sh`

生产环境应把同样结构的模板放到 `AGENT_TEMPLATE_GITHUB_URL` 指向的 GitHub 仓库或目录。
