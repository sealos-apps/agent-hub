# template

这个目录预留给后续通过 GitHub Actions 构建和发布不同 Agent 镜像的模板。

当前先建立基础结构，不绑定具体实现。

建议后续按 Agent 维度拆分，例如：

- `template/hermes-agent/`
- `template/openclaw/`

每个子目录再分别放置：

- `Dockerfile`
- 构建脚本
- 运行时配置模板
- Actions 需要的上下文文件
