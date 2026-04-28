# 任务清单: Agent Hub 通用工作区与 schema 设置主链路补齐

目录: `helloagents/history/2026-04/202604181920_agent_hub_generic_workspace_settings_foundation/`

---

- [√] 1. 给模板 schema 增加 `workspaces` 和 `settings.binding`，并补齐校验。
- [√] 2. 后端 contract assembler 输出 `workspaces`，详情页不再硬编码工作区列表。
- [√] 3. 新增 schema 驱动的 `settings` 校验与映射逻辑，支持 `agent/env/annotation/derived` binding。
- [√] 4. 创建链路改为提交 `settings` map，并按模板 binding 映射到内建字段或 env/annotation。
- [√] 5. 设置更新链路改为依赖模板 schema，不再只支持 Hermes 的三字段特例。
- [√] 6. 详情页新增内嵌 `Web UI` 工作区，列表页和详情页主入口改为进入该工作区。
- [√] 7. Hermes 模板移除没有真实写入能力的 placeholder 字段，只保留真实能力。
- [√] 8. 更新前后端测试夹具并完成验证：
  - `cd backend && go test ./...`
  - `cd web && npm run build`
