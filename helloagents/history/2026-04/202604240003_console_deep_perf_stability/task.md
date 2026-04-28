# 任务清单: 控制台深层性能与稳定性治理（文件链路 + 终端渲染）

目录: `helloagents/plan/202604240003_console_deep_perf_stability/`

---

## 1. 资源树启动与展开状态机
- [√] 1.1 在 `web/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx` 中将目录树默认锚点调整为工作目录优先，并保留跳转 `/`/其他目录能力，验证 why.md#需求-进入控制台默认展开工作目录且可切换其他目录-场景-首次进入控制台
- [√] 1.2 在 `web/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx` 中修复自动展开与手动折叠冲突，确保 `/` 可折叠且不被自动逻辑立即覆盖，验证 why.md#需求-进入控制台默认展开工作目录且可切换其他目录-场景-用户手动折叠目录
- [√] 1.3 在 `web/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx` 中优化目录搜索匹配复杂度（避免递归重复计算），验证 why.md#需求-前端状态稳定且安全边界清晰-场景-高频状态切换

## 2. 文件请求就绪与重连链路
- [√] 2.1 在 `web/src/app/pages/agent-hub/hooks/useAgentFiles.ts` 中将 socket ready 检测从轮询改为事件驱动 gate，验证 why.md#需求-文件浏览与文件预览显著提速-场景-连续展开目录并打开文件
- [√] 2.2 在 `web/src/app/pages/agent-hub/hooks/useAgentFiles.ts` 中统一 pending request 生命周期与失败收敛，减少悬挂请求，验证 why.md#需求-文件浏览与文件预览显著提速-场景-连续展开目录并打开文件
- [√] 2.3 在 `web/src/app/pages/agent-hub/hooks/useAgentFiles.ts` 中重构重连策略（退避与上限配置），降低易断场景失败率，验证 why.md#需求-文件浏览与文件预览显著提速-场景-连续展开目录并打开文件

## 3. 后端文件操作 QoS 治理
- [√] 3.1 在 `backend/internal/ws/session.go` 中按操作类型治理文件队列与超时策略，降低 `file.list`/`file.read` 互相阻塞，验证 why.md#需求-文件浏览与文件预览显著提速-场景-连续展开目录并打开文件
- [√] 3.2 在 `backend/internal/ws/session.go` 中细化文件错误分类（队列拥塞/执行超时/路径错误），提升前端可恢复性，验证 why.md#需求-文件浏览与文件预览显著提速-场景-连续展开目录并打开文件
- [√] 3.3 在 `backend/internal/ws/session_test.go` 中补充 QoS 回归测试（并发 list/read + 超时边界），验证 why.md#需求-文件浏览与文件预览显著提速-场景-连续展开目录并打开文件

## 4. 终端持续输出丝滑治理
- [√] 4.1 在 `web/src/components/business/terminal/terminalOutputScheduler.ts` 中修复背压上限边界（告警追加不突破上限），验证 why.md#需求-终端在持续输出时仍保持丝滑交互-场景-持续-60s-输出--用户持续输入
- [√] 4.2 在 `web/src/components/business/terminal/AgentTerminalWorkspace.tsx` 中重构 burst 调度策略（减少 `setTimeout(0)` 抢占），验证 why.md#需求-终端在持续输出时仍保持丝滑交互-场景-持续-60s-输出--用户持续输入
- [√] 4.3 在 `web/src/components/business/terminal/AgentTerminalWorkspace.tsx` 与 `web/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx` 中补充隐藏标签调度降级策略（不断连但降压），验证 why.md#需求-终端在持续输出时仍保持丝滑交互-场景-持续-60s-输出--用户持续输入

## 5. 状态稳定性与消息安全
- [√] 5.1 在 `web/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx` 中收敛 effect 依赖与状态写入时机，规避递归更新，验证 why.md#需求-前端状态稳定且安全边界清晰-场景-高频状态切换
- [√] 5.2 在 `web/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx` 中增加 `postMessage` 来源校验（source + origin），验证 why.md#需求-前端状态稳定且安全边界清晰-场景-高频状态切换
- [√] 5.3 在 `web/src/app/pages/agent-hub/lib/desktopMessages.ts` 与 `web/src/app/pages/agent-hub/lib/terminalWindow.ts` 中收敛旧消息兼容分支，降低消息类型歧义，验证 why.md#需求-前端状态稳定且安全边界清晰-场景-高频状态切换

## 6. 前端回归测试
- [√] 6.1 在 `web/src/app/pages/agent-hub/hooks/useAgentTerminal.test.ts` 中增加调度边界测试（队列上限与告警次数），验证 why.md#需求-终端在持续输出时仍保持丝滑交互-场景-持续-60s-输出--用户持续输入
- [√] 6.2 在 `web/src/app/pages/agent-hub/hooks/useAgentFiles.test.ts` 中新增 ready gate 与重连链路测试，验证 why.md#需求-文件浏览与文件预览显著提速-场景-连续展开目录并打开文件
- [√] 6.3 在 `web/src/app/pages/agent-hub/AgentConsoleWindowPage.test.tsx` 中新增默认展开/手动折叠回归测试，验证 why.md#需求-进入控制台默认展开工作目录且可切换其他目录-场景-用户手动折叠目录

## 7. 安全检查
- [√] 7.1 执行安全检查（消息来源校验、路径边界控制、错误信息脱敏、EHRB 风险规避）

## 8. 文档更新
- [√] 8.1 更新 `helloagents/wiki/modules/agent-hub-frontend.md`（资源树与终端调度策略）
- [√] 8.2 更新 `helloagents/wiki/arch.md`（文件链路 QoS 与前端 ready gate）
- [√] 8.3 更新 `helloagents/CHANGELOG.md`（性能与稳定性治理记录）

## 9. 压测与验收
- [√] 9.1 执行控制台压测（目录展开、文件预览、持续输出 + 输入），产出关键指标对比并记录在方案包附录
> 补充: 新增可复用脚本 `web/scripts/agentConsolePerfSmoke.ts`（命令: `cd web && bun run perf:agent-console-smoke`），用于基线化目录链路、文件 ready gate、终端背压写入三项关键路径。

### 9.1 附录（2026-04-24，本地 smoke 基线）
- 执行命令: `cd web && bun run perf:agent-console-smoke`
- 资源树自动展开链路: `sample=3000`, `avg=0.186us`, `p95=0.25us`
- 文件 ready gate 唤醒: `sample=400`, `avg=6684.52us`, `p95=9036.666us`
- 终端背压写入: `sample=3000`, `avg=0.478us`, `p95=1.542us`
- 重连策略基线: `maxReconnectAttempts=6`, `delay=[500,1000,2000,4000,8000]ms`

---

## 任务状态符号
- `[ ]` 待执行
- `[√]` 已完成
- `[X]` 执行失败
- `[-]` 已跳过
- `[?]` 待确认
