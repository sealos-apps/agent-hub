# Agent Hub 安全检查

## 范围
- 前端：`web/src/app/pages/agent-hub/`、`web/src/domains/agents/`
- 后端：`backend/internal/router/`、`backend/internal/handler/`
- 文档：`backend/api/frontend-checklist.md`

## 结论
- 本轮检查未发现需要立即阻断上线的新增风险
- 已确认：鉴权缺失处理、非法 Authorization 拒绝、敏感 key 不回显、SSH 私钥按需返回、文件名输入清洗、前端视图模型不驻留密钥
- 持续关注：目前仍以构建与单元测试为主，尚未建立自动化 E2E 安全回归

## 检查项

| 检查项 | 结论 | 证据 |
|--------|------|------|
| 业务接口必须鉴权 | 通过 | `backend/internal/router/router_test.go` 中缺失/非法 Authorization 用例 |
| 敏感 key 不允许回读 | 通过 | `GET /api/v1/agents/:agentName/key` 在 README 与路由测试中固定返回禁用结果 |
| SSH 私钥不进入常驻列表态 | 通过 | `GET /api/v1/agents/:agentName/access/ssh` 按需读取 secret，`AgentContract` 不承载私钥与 token |
| 创建/更新请求存在输入校验 | 通过 | 路由与 handler 测试已覆盖非法 URL、空 payload、区域模型校验等场景 |
| 文件操作输入名清洗 | 通过 | `useAgentFiles.ts` 的 `sanitizeNameInput` 会移除首尾 `/` 并裁剪空白 |
| 前端视图模型不驻留密钥 | 通过 | `AgentListItem` 只保留公开接入地址与能力状态，不保存 API key / SSH 私钥 / AI-Proxy key |

## 建议
- 后续补充浏览器级 E2E，用真实页面覆盖鉴权失效、状态恢复与敏感信息不展示场景
- 若后端后续开放更多模板，继续保持“视图模型不携带密钥，敏感材料按需独立接口返回”的约束
