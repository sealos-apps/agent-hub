# agenttemplate test fixtures

这个目录只保留后端单元测试和本地兜底所需的模板夹具。

生产环境不再从仓库根目录读取 `template/`，而是通过 `AGENT_TEMPLATE_GITHUB_URL` 指定的 GitHub 源下载模板。

当前夹具按 Agent 维度拆分：

- `backend/internal/agenttemplate/testdata/template/hermes-agent/`
- `backend/internal/agenttemplate/testdata/template/openclaw/`

每个子目录包含对应的 `template.yaml`，可部署模板还包含 manifest 和生命周期脚本。
