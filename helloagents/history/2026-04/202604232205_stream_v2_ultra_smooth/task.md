# 任务清单: 全链路极限丝滑改造（Stream V2）

目录: `helloagents/plan/202604232205_stream_v2_ultra_smooth/`

---

## 1. 协议与后端会话层
- [√] 1.1 在 `backend/internal/ws/session.go` 中实现 Binary V2 帧结构与编解码入口，验证 why.md#需求-持续高压终端输出仍保持可交互-场景-连续-60s-输出压测
- [√] 1.2 在 `backend/internal/ws/session.go` 中实现单写协程与优先级队列（terminal/log/file/control），验证 why.md#需求-持续高压终端输出仍保持可交互-场景-连续-60s-输出压测，依赖任务1.1
- [√] 1.3 在 `backend/internal/ws/session.go` 中实现高压丢弃最旧输出与 `dropped` 标记下发，验证 why.md#需求-持续高压终端输出仍保持可交互-场景-连续-60s-输出压测，依赖任务1.2

## 2. 前端终端链路与渲染调度
- [√] 2.1 在 `web/src/app/pages/agent-hub/hooks/useAgentTerminal.ts` 中实现 Binary V2 消费与事件分发替换，验证 why.md#需求-标签切换不触发重连与重渲染抖动-场景-高频切换-tab，依赖任务1.1
- [√] 2.2 在 `web/src/components/business/terminal/AgentTerminalWorkspace.tsx` 中实现 normal/burst 双模式输出调度与队列背压策略，验证 why.md#需求-持续高压终端输出仍保持可交互-场景-连续-60s-输出压测，依赖任务2.1
- [√] 2.3 在 `web/src/components/business/terminal/AgentTerminalWorkspace.tsx` 中接入 WebGL 优先渲染并保持返回终端可立即输入，验证 why.md#需求-标签切换不触发重连与重渲染抖动-场景-高频切换-tab，依赖任务2.2

## 3. 文件读取与预览加速
- [√] 3.1 在 `web/src/app/pages/agent-hub/hooks/useAgentFiles.ts` 中实现缓存优先读取（TTL=120s）与 `fromCache/stale` 元信息，验证 why.md#需求-文件浏览与预览明显提速-场景-重复打开同一文件与目录
- [√] 3.2 在 `web/src/app/pages/agent-hub/hooks/useAgentFiles.ts` 中实现同路径 in-flight 去重，验证 why.md#需求-文件浏览与预览明显提速-场景-重复打开同一文件与目录，依赖任务3.1
- [√] 3.3 在 `web/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx` 中使用缓存元信息优化预览反馈，验证 why.md#需求-文件浏览与预览明显提速-场景-重复打开同一文件与目录，依赖任务3.1

## 4. 安全检查
- [√] 4.1 执行安全检查（鉴权校验、非法帧拒绝、路径边界控制、敏感信息脱敏、EHRB风险规避）

## 5. 文档更新
- [√] 5.1 更新 `helloagents/wiki/arch.md`（补充 Stream V2 链路和 ADR 索引）
- [√] 5.2 更新 `helloagents/wiki/api.md`（更新 WS 协议说明）
- [√] 5.3 更新 `helloagents/CHANGELOG.md`（记录协议替换与性能优化）

## 6. 测试
- [√] 6.1 在 `backend/internal/ws/session_test.go` 中新增协议编解码与 dropped 标记测试，验证点: 类型映射、非法帧、flags 语义
- [√] 6.2 在 `web/src/app/pages/agent-hub/hooks/useAgentTerminal.test.ts` 中新增高压输出调度测试，验证点: normal/burst 切换、队列上限、一次性告警
- [ ] 6.3 执行端到端压测场景: 连续60秒输出 + 高频切 tab + 并发文件预览，验证点: 输入回显 `p95 < 30ms`、无明显卡顿、超时显著下降

---

## 任务状态符号
- `[ ]` 待执行
- `[√]` 已完成
- `[X]` 执行失败
- `[-]` 已跳过
- `[?]` 待确认
