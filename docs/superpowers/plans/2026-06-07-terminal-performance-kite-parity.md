# Agent Hub 终端性能 Kite 对齐实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 Agent Hub 终端交互和渲染接近 Kite 的丝滑度，优先降低首字延迟、输入回显延迟和大输出时的帧阻塞。

**架构：** 当前 Agent Hub 把 auth、terminal、log、file 操作复用在同一 WebSocket 队列里，并在前后端都有输出 batching/backpressure；Kite 的终端链路更短，Pod exec WS 直接桥到 xterm。第一阶段不引入新的兜底策略，按“专用 WS 直接替换旧终端通道”实现；前端保留原终端入口，但 terminal 内容不进入 `transform: scale(...)` 容器。

**技术栈：** Go + Gin + gorilla/websocket + Kubernetes remotecommand；React + Vite + xterm；Vitest；Go test；Browser/DevTools 性能验证。

---

## 证据与边界

- Kite 后端终端入口是独立路由 `/api/v1/terminal/:namespace/:podName/ws`，不是通用 WS 多路复用；参考：`/Users/night/Documents/code/sealos/agenthub/reference/kite/routes.go:144`。
- Kite 后端 `TerminalSession` 直接把 WS JSON `stdin/resize` 桥到 Kubernetes `remotecommand.StreamWithContext`；参考：`/Users/night/Documents/code/sealos/agenthub/reference/kite/pkg/kube/terminal.go:52`。
- Kite 前端收到 `stdout/stderr` 后直接 `terminal.write(message.data)`；参考：`/Users/night/Documents/code/sealos/agenthub/reference/kite/ui/src/components/terminal-content.tsx:377`。
- Agent Hub 当前终端输出经过 `terminalChunkBatchBytes=24KB`、8ms 后端 batch、通用 outbound queue、二进制 frame、前端 output queue、前端 flush scheduler；相关入口：`backend/internal/ws/session.go:55`、`backend/internal/ws/session.go:875`、`frontend/src/components/business/terminal/AgentTerminalWorkspace.tsx:324`。
- Agent Hub 当前终端可能被放在 `transform: scale(...)` 容器里渲染；相关位置：`frontend/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx:1817`、`frontend/src/app/pages/agent-hub/AgentDetailPage.tsx:815`。
- 不允许擅自添加 fallback。计划里任何“兼容旧路径/失败切回旧协议”的设计都必须先和用户确认；本计划默认不添加 fallback。
- 线上验证目标已确认：`KUBECONFIG=/Users/night/.sealos/kubeconfig`，namespace `ns-fxeji0zb`，Agent Hub deployment `agenthub-fxeji0zb`，可用于真实性能 smoke 的 agent pod/name 优先使用 `gnd70bta`，备用只读对照为 `a57bx5og`。两者已通过 `kubectl exec` 验证可进入 `/workspace`。

## 已确认执行决策

- 终端通道：专用 WebSocket 直接替换旧终端通道；不实现旧 WS fallback。
- 布局策略：保留当前终端入口；只让 terminal 内容脱离 `transform: scale(...)`，不强制改成独立窗口。
- 验证目标：使用线上 `KUBECONFIG=/Users/night/.sealos/kubeconfig`、namespace `ns-fxeji0zb`、agent `gnd70bta` 做 smoke；`a57bx5og` 只作为同口径备用验证。
- 成功口径：单测/构建通过不等于性能完成；只有前后性能 smoke 有数据对比，才允许说“终端变快”。

## 文件结构

- 修改：`backend/internal/router/router.go` — 增加专用终端 WS 路由。
- 创建：`backend/internal/handler/agent_terminal.go` — 处理专用终端 WS 的鉴权、agent pod resolve、K8s exec 桥接。
- 创建：`backend/internal/handler/agent_terminal_test.go` — 覆盖专用路由参数、消息解析、错误协议、resize 最新值行为。
- 可复用/修改：`backend/internal/kube/pod_access.go` — 继续使用现有 `ExecInPod`，不复制 K8s exec 逻辑。
- 修改：`frontend/src/api/backend.ts` — 增加专用终端 WS URL builder。
- 修改：`frontend/src/app/pages/agent-hub/hooks/useAgentTerminal.ts` — 从通用 binary WS 协议切换到专用终端协议。
- 修改：`frontend/src/app/pages/agent-hub/lib/wsBinaryProtocol.ts` — 只在文件/日志仍需要时保留；终端路径不再依赖它。
- 修改：`frontend/src/components/business/terminal/AgentTerminalWorkspace.tsx` — 简化输出调度，保留必要的 requestAnimationFrame 合并和 xterm write callback。
- 修改/删除：`frontend/src/components/business/terminal/terminalOutputScheduler.ts` — 若专用通道验证后不再需要，删除；否则只保留轻量队列上限。
- 修改：`frontend/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx` — 终端 tab 避免处于 scale transform 内，或强制打开独立终端窗口。
- 修改：`frontend/src/app/pages/agent-hub/AgentDetailPage.tsx` — detail 内终端避免处于 scale transform 内，或只提供终端窗口入口。
- 创建：`frontend/scripts/agentTerminalPerfSmoke.ts` — 本地性能 smoke，输出固定大文本并采集首字/吞吐/帧阻塞。
- 修改：`frontend/package.json` — 增加 `perf:agent-terminal-smoke` 脚本。
- 修改：`backend/api/websocket.md` 或新增 `backend/api/terminal-websocket.md` — 记录专用终端 WS 协议。

---

### 任务 1：建立可量化性能基线

**文件：**
- 创建：`frontend/scripts/agentTerminalPerfSmoke.ts`
- 修改：`frontend/package.json`

- [ ] **步骤 1：编写失败的性能 smoke 脚本**

创建 `frontend/scripts/agentTerminalPerfSmoke.ts`，先让它在没有目标 URL 时明确失败，避免假通过：

```ts
const target = process.env.AGENT_TERMINAL_PERF_URL || ''

if (!target) {
  console.error('AGENT_TERMINAL_PERF_URL is required')
  process.exit(2)
}

console.log(JSON.stringify({ target }))
```

- [ ] **步骤 2：运行脚本验证失败**

运行：

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm run perf:agent-terminal-smoke
```

预期：命令失败，stderr 包含 `AGENT_TERMINAL_PERF_URL is required`。

- [ ] **步骤 3：添加 npm script**

修改 `frontend/package.json` 的 `scripts`：

```json
"perf:agent-terminal-smoke": "bun scripts/agentTerminalPerfSmoke.ts"
```

保留已有 `perf:agent-console-smoke`。

- [ ] **步骤 4：实现最小可运行 smoke**

把 `frontend/scripts/agentTerminalPerfSmoke.ts` 扩展为：打开 `AGENT_TERMINAL_PERF_URL`，等待 `.xterm` 出现，通过 `window.performance.mark` 记录页面加载、首个 `.xterm-rows` 文本变化、5 秒内文本长度增长。使用 Playwright 或仓库已有浏览器脚本模式；如果当前依赖没有 Playwright，不新增依赖，改用已有 Browser/DevTools 手动验证命令并在脚本中保留环境检查失败。

- [ ] **步骤 5：运行 smoke 并记录基线**

运行：

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH AGENT_TERMINAL_PERF_URL=http://localhost:3000/terminal?agentName=gnd70bta npm run perf:agent-terminal-smoke
```

预期：输出 JSON，至少包含：`firstOutputMs`、`charsIn5s`、`longTasks`。验证目标使用线上 namespace `ns-fxeji0zb` 的 `gnd70bta`；如果该 agent 临时不可用，使用 `a57bx5og` 复测并在记录里标明。

- [ ] **步骤 6：Commit**

```bash
git add frontend/package.json frontend/scripts/agentTerminalPerfSmoke.ts
git commit -m "test: add terminal performance smoke"
```

---

### 任务 2：新增后端专用终端 WebSocket

**文件：**
- 创建：`backend/internal/handler/agent_terminal.go`
- 创建：`backend/internal/handler/agent_terminal_test.go`
- 修改：`backend/internal/router/router.go`
- 复用：`backend/internal/kube/pod_access.go`

- [ ] **步骤 1：编写失败的路由测试**

在 `backend/internal/router/router_test.go` 或新建 `backend/internal/handler/agent_terminal_test.go` 添加测试：专用终端路由存在，非 WS upgrade 返回非 404。

```go
func TestAgentTerminalWebSocketRouteRequiresUpgrade(t *testing.T) {
	router := setupTestRouter(t)
	recorder := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/agents/demo/terminal/ws", nil)
	router.ServeHTTP(recorder, req)
	if recorder.Code == http.StatusNotFound {
		t.Fatalf("terminal websocket route returned 404")
	}
}
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
cd backend
go test -count=1 ./internal/router ./internal/handler -run 'TestAgentTerminalWebSocketRouteRequiresUpgrade|TestAgentTerminal'
```

预期：失败，原因是 route 404 或 handler 未定义。

- [ ] **步骤 3：实现路由注册**

在 `backend/internal/router/router.go` 的 agent WS 附近增加：

```go
v1.GET("/agents/:agentName/terminal/ws", handler.AgentTerminalWebSocket)
```

- [ ] **步骤 4：实现最小 handler 骨架**

创建 `backend/internal/handler/agent_terminal.go`：

```go
package handler

import (
  "net/http"
  "strings"

  "github.com/gin-gonic/gin"
  "github.com/gorilla/websocket"
)

func AgentTerminalWebSocket(c *gin.Context) {
  agentName := strings.TrimSpace(c.Param("agentName"))
  if agentName == "" {
    c.JSON(http.StatusUnprocessableEntity, gin.H{"error": "invalid agent name"})
    return
  }
  upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
  conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
  if err != nil {
    return
  }
  _ = conn.Close()
}
```

这是骨架，不是最终行为；不得作为完成状态部署。

- [ ] **步骤 5：运行路由测试通过**

运行：

```bash
cd backend
go test -count=1 ./internal/router ./internal/handler -run 'TestAgentTerminalWebSocketRouteRequiresUpgrade|TestAgentTerminal'
```

预期：路由测试通过，终端行为测试仍待补。

- [ ] **步骤 6：Commit**

```bash
git add backend/internal/router/router.go backend/internal/handler/agent_terminal.go backend/internal/handler/agent_terminal_test.go
git commit -m "feat: add dedicated terminal websocket route"
```

---

### 任务 3：实现专用终端协议与 K8s exec 桥接

**文件：**
- 修改：`backend/internal/handler/agent_terminal.go`
- 修改：`backend/internal/handler/agent_terminal_test.go`
- 复用：`backend/internal/kube/pod_access.go`

- [ ] **步骤 1：编写消息协议测试**

在 `backend/internal/handler/agent_terminal_test.go` 中定义专用协议结构并测试 JSON 解码：

```go
type terminalWSMessage struct {
  Type string `json:"type"`
  Data string `json:"data,omitempty"`
  Rows uint16 `json:"rows,omitempty"`
  Cols uint16 `json:"cols,omitempty"`
  Cwd  string `json:"cwd,omitempty"`
}

func TestTerminalWSMessageDecodeInput(t *testing.T) {
  var msg terminalWSMessage
  if err := json.Unmarshal([]byte(`{"type":"stdin","data":"ls\n"}`), &msg); err != nil {
    t.Fatal(err)
  }
  if msg.Type != "stdin" || msg.Data != "ls\n" {
    t.Fatalf("decoded = %#v", msg)
  }
}
```

- [ ] **步骤 2：运行测试验证失败或编译失败**

运行：

```bash
cd backend
go test -count=1 ./internal/handler -run TestTerminalWSMessageDecodeInput
```

预期：若类型尚未实现会失败；若测试内临时类型通过，则继续下一步添加 handler 行为测试。

- [ ] **步骤 3：实现专用协议类型与 session**

在 `backend/internal/handler/agent_terminal.go` 中实现：

```go
type agentTerminalMessage struct {
  Type string `json:"type"`
  Data string `json:"data,omitempty"`
  Rows uint16 `json:"rows,omitempty"`
  Cols uint16 `json:"cols,omitempty"`
  Cwd  string `json:"cwd,omitempty"`
}

type agentTerminalSession struct {
  conn *websocket.Conn
  resizeChan chan remotecommand.TerminalSize
}
```

- [ ] **步骤 4：编写 resize 最新值测试**

```go
func TestAgentTerminalResizeKeepsLatest(t *testing.T) {
  session := &agentTerminalSession{resizeChan: make(chan remotecommand.TerminalSize, 1)}
  session.resize(80, 24)
  session.resize(120, 32)
  size := terminalSizeQueue(session.resizeChan).Next()
  if size == nil || size.Width != 120 || size.Height != 32 {
    t.Fatalf("size = %#v, want 120x32", size)
  }
}
```

如果 `terminalSizeQueue` 在 `internal/ws` 不可访问，则在 handler 内复制一个小型 `latestTerminalSizeQueue`，不要引入跨包依赖到 internal ws 大文件。

- [ ] **步骤 5：运行 resize 测试确认失败**

运行：

```bash
cd backend
go test -count=1 ./internal/handler -run TestAgentTerminalResizeKeepsLatest
```

预期：失败，提示 `resize` 或 queue 未实现。

- [ ] **步骤 6：实现 resize 和 read/write 桥接**

实现：

```go
func (s *agentTerminalSession) resize(cols, rows uint16) { ...latest-only queue... }
func (s *agentTerminalSession) writeStdout(p []byte) (int, error) { websocket.JSON.Send(s.conn, agentTerminalMessage{Type:"stdout", Data:string(p)}) }
```

输入读取使用 goroutine 从 WS 收消息，`stdin` 写入 `io.PipeWriter`；不要把 stdout 再塞进通用 `session.writeLoop`。

- [ ] **步骤 7：接入 K8s exec**

在 handler 中复用现有认证逻辑的最小路径：从 header/query 读取 kubeconfig，`kube.NewFactoryFromEncodedKubeconfig`，`kube.ResolveAgentPod`，然后调用：

```go
kube.ExecInPod(ctx, clientset, factory.RESTConfig(), factory.Namespace(), pod.Name, pod.Container, command, stdinReader, stdoutWriter, stdoutWriter, true, latestTerminalSizeQueue(resizeChan))
```

命令复用 `buildTerminalBootstrapCommand` 的逻辑；若该函数仍在 `internal/ws` 私有包，移动到 `backend/internal/kube` 或 `backend/internal/handler` 的小 helper，避免 import cycle。

- [ ] **步骤 8：运行后端相关测试**

运行：

```bash
cd backend
go test -count=1 ./internal/handler ./internal/router ./internal/kube ./internal/ws
```

预期：全部通过。

- [ ] **步骤 9：Commit**

```bash
git add backend/internal/handler/agent_terminal.go backend/internal/handler/agent_terminal_test.go backend/internal/router/router.go backend/internal/kube/pod_access.go
git commit -m "feat: stream terminal over dedicated websocket"
```

---

### 任务 4：前端切换到专用终端 WS

**文件：**
- 修改：`frontend/src/api/backend.ts`
- 修改：`frontend/src/app/pages/agent-hub/hooks/useAgentTerminal.ts`
- 修改：`frontend/src/app/pages/agent-hub/hooks/useAgentTerminal.test.ts`

- [ ] **步骤 1：编写 URL builder 测试**

在 `frontend/src/api/backend.test.ts` 增加：

```ts
it('builds dedicated agent terminal websocket url', () => {
  expect(buildAgentTerminalWebSocketUrl('demo')).toContain('/api/v1/agents/demo/terminal/ws')
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm test -- src/api/backend.test.ts
```

预期：失败，`buildAgentTerminalWebSocketUrl` 未导出。

- [ ] **步骤 3：实现 URL builder**

在 `frontend/src/api/backend.ts` 增加：

```ts
export const buildAgentTerminalWebSocketUrl = (agentName: string) =>
  buildWebSocketUrl(`/api/v1/agents/${encodeURIComponent(agentName)}/terminal/ws`)
```

按现有 `buildAgentWebSocketUrl` 的协议/host 生成方式实现，避免复制 URL 规则。

- [ ] **步骤 4：改 hook 的消息协议**

在 `frontend/src/app/pages/agent-hub/hooks/useAgentTerminal.ts`：

- 删除终端路径对 `encodeWSBinaryMessage/decodeWSBinaryMessage` 的依赖。
- WS `onmessage` 使用 `JSON.parse(event.data)`。
- `stdout/stderr` 直接 `emitOutput(message.data)`。
- `connected` 或 WS open 后将 session 标记 `connected`。
- `sendTerminalInput` 发送 `JSON.stringify({ type: 'stdin', data: normalizedInput })`。
- `resizeTerminal` 发送 `JSON.stringify({ type: 'resize', cols, rows })`。

- [ ] **步骤 5：更新 hook 测试**

在 `frontend/src/app/pages/agent-hub/hooks/useAgentTerminal.test.ts` 增加/修改测试：模拟 `WebSocket` 收到 `{"type":"stdout","data":"hello"}` 时，订阅 listener 收到 `hello`；发送 input 时实际发送 JSON `stdin`，不是 binary frame。

- [ ] **步骤 6：运行前端单测**

运行：

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm test -- src/api/backend.test.ts src/app/pages/agent-hub/hooks/useAgentTerminal.test.ts
```

预期：全部通过。

- [ ] **步骤 7：Commit**

```bash
git add frontend/src/api/backend.ts frontend/src/api/backend.test.ts frontend/src/app/pages/agent-hub/hooks/useAgentTerminal.ts frontend/src/app/pages/agent-hub/hooks/useAgentTerminal.test.ts
git commit -m "feat: use dedicated terminal websocket client"
```

---

### 任务 5：简化前端输出调度

**文件：**
- 修改：`frontend/src/components/business/terminal/AgentTerminalWorkspace.tsx`
- 修改或删除：`frontend/src/components/business/terminal/terminalOutputScheduler.ts`
- 修改：`frontend/src/components/business/terminal/AgentTerminalWorkspace.test.tsx`

- [ ] **步骤 1：编写输出顺序测试**

在 `AgentTerminalWorkspace.test.tsx` 增加：连续推送 `a`、`b`、`c` 后，xterm mock 的 `write` 收到 `abc`，且不触发多余 React state 更新。

```ts
it('coalesces terminal output in order', async () => {
  const listeners = new Set<(chunk: string) => void>()
  render(<AgentTerminalWorkspace session={connectedSession} onAttachOutput={(listener) => { listeners.add(listener); return () => listeners.delete(listener) }} />)
  await waitFor(() => expect(xtermMock.instances[0]).toBeTruthy())
  listeners.forEach((listener) => listener('a'))
  listeners.forEach((listener) => listener('b'))
  listeners.forEach((listener) => listener('c'))
  await vi.runAllTimersAsync()
  expect(xtermMock.instances[0]?.write).toHaveBeenCalledWith('abc', expect.any(Function))
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm test -- src/components/business/terminal/AgentTerminalWorkspace.test.tsx
```

预期：失败，现有 flush 行为不是该简化契约。

- [ ] **步骤 3：实现轻量 output writer**

在 `AgentTerminalWorkspace.tsx` 内把 output queue 简化为：

```ts
const pendingOutputRef = useRef('')
const flushFrameRef = useRef<number | null>(null)
const writeInFlightRef = useRef(false)

const scheduleOutputFlush = () => {
  if (writeInFlightRef.current || flushFrameRef.current !== null) return
  flushFrameRef.current = window.requestAnimationFrame(() => {
    flushFrameRef.current = null
    const chunk = pendingOutputRef.current
    pendingOutputRef.current = ''
    if (!chunk || !terminalRef.current) return
    writeInFlightRef.current = true
    terminalRef.current.write(chunk, () => {
      writeInFlightRef.current = false
      if (pendingOutputRef.current) scheduleOutputFlush()
    })
  })
}
```

保留一个明确上限，例如 pending 超过 1MB 时丢弃最旧文本并插入 notice；这是现有 backpressure 的延续，不是新增 fallback。

- [ ] **步骤 4：删除不再需要的 scheduler**

如果 `terminalOutputScheduler.ts` 只剩终端使用，删除文件并清理 import；如果测试仍需要 backpressure 常量，把常量内联到 `AgentTerminalWorkspace.tsx` 或保留一个 `terminalOutputLimits.ts`。

- [ ] **步骤 5：运行前端测试**

运行：

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm test -- src/components/business/terminal/AgentTerminalWorkspace.test.tsx src/app/pages/agent-hub/hooks/useAgentTerminal.test.ts
```

预期：全部通过。

- [ ] **步骤 6：Commit**

```bash
git add frontend/src/components/business/terminal/AgentTerminalWorkspace.tsx frontend/src/components/business/terminal/AgentTerminalWorkspace.test.tsx frontend/src/components/business/terminal/terminalOutputScheduler.ts frontend/src/app/pages/agent-hub/hooks/useAgentTerminal.test.ts
git commit -m "perf: simplify terminal output rendering"
```

---

### 任务 6：解除 xterm 所在区域的 scale transform

**文件：**
- 修改：`frontend/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx`
- 修改：`frontend/src/app/pages/agent-hub/AgentDetailPage.tsx`
- 修改：`frontend/src/app/pages/agent-hub/AgentConsoleWindowPage.test.tsx`

- [ ] **步骤 1：编写布局测试**

在 `AgentConsoleWindowPage.test.tsx` 增加测试：当 active tab 是 terminal 时，终端容器不在 `console-scale-frame` 子树里，或 `consoleScale.enabled` 为 false。

```tsx
expect(screen.queryByTestId('console-scale-frame')).not.toContainElement(screen.getByTestId('agent-terminal-surface'))
```

先给 `AgentTerminalWorkspace` root 加 `data-testid="agent-terminal-surface"`。

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm test -- src/app/pages/agent-hub/AgentConsoleWindowPage.test.tsx
```

预期：失败，当前 terminal 仍在 scaled frame 内或缺少 test id。

- [ ] **步骤 3：实现 terminal 不参与 scale**

在 `AgentConsoleWindowPage.tsx`：当 `activeTab?.type === 'terminal'` 时禁用 `consoleScale.enabled` 分支，使用普通 `flex min-h-0 flex-1 flex-col overflow-hidden`。不要影响 web/file tab 的 scale 行为。

- [ ] **步骤 4：Detail 页处理**

在 `AgentDetailPage.tsx`：如果当前 tab 是 terminal，禁用 `fixedDetailScale/fluidDetailScale` 的 transform 包裹；或将终端入口固定为独立 window，不在 Detail 内嵌 xterm。优先选“不 scale terminal 内容”，因为保留用户当前入口最小。

- [ ] **步骤 5：运行布局测试**

运行：

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm test -- src/app/pages/agent-hub/AgentConsoleWindowPage.test.tsx src/components/business/terminal/AgentTerminalWorkspace.test.tsx
```

预期：全部通过。

- [ ] **步骤 6：Browser 视觉验证**

启动本地：

```bash
cd backend
REGION=us go run ./cmd/app
```

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm run dev -- --host 0.0.0.0
```

用 Browser 打开 `http://localhost:3000/`，进入 terminal，使用截图或 `getBoundingClientRect()` 验证 terminal root 没有非 1 的 CSS transform 祖先。

- [ ] **步骤 7：Commit**

```bash
git add frontend/src/app/pages/agent-hub/AgentConsoleWindowPage.tsx frontend/src/app/pages/agent-hub/AgentDetailPage.tsx frontend/src/app/pages/agent-hub/AgentConsoleWindowPage.test.tsx frontend/src/components/business/terminal/AgentTerminalWorkspace.tsx
git commit -m "perf: keep terminal outside scaled layouts"
```

---

### 任务 7：文档和全量验证

**文件：**
- 修改：`backend/api/websocket.md` 或创建：`backend/api/terminal-websocket.md`
- 修改：`backend/README.md` 如需说明新 endpoint

- [ ] **步骤 1：更新协议文档**

记录专用终端 WS：

```md
GET /api/v1/agents/:agentName/terminal/ws

Client -> Server:
{"type":"stdin","data":"ls\n"}
{"type":"resize","cols":120,"rows":32}
{"type":"ping"}

Server -> Client:
{"type":"connected","data":"Terminal connected successfully"}
{"type":"stdout","data":"..."}
{"type":"stderr","data":"..."}
{"type":"error","data":"..."}
{"type":"pong"}
```

- [ ] **步骤 2：运行后端测试**

```bash
cd backend
go test -count=1 ./...
```

预期：全部通过。

- [ ] **步骤 3：运行前端测试和构建**

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm test -- src/components/business/terminal/AgentTerminalWorkspace.test.tsx src/app/pages/agent-hub/hooks/useAgentTerminal.test.ts src/app/pages/agent-hub/AgentConsoleWindowPage.test.tsx src/api/backend.test.ts
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npx tsc --noEmit
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH npm run build
```

预期：全部通过。

- [ ] **步骤 4：运行性能 smoke 对比**

```bash
cd frontend
PATH=/Users/jingyang/.local/share/fnm/node-versions/v22.16.0/installation/bin:$PATH AGENT_TERMINAL_PERF_URL=http://localhost:3000/terminal?agentName=gnd70bta npm run perf:agent-terminal-smoke
```

预期：`firstOutputMs`、`charsIn5s`、`longTasks` 明显优于任务 1 基线。若没有提升，不继续合并，回到系统化调试第三阶段重新提出单一假设。真实性能目标固定为 `gnd70bta`，必要时用 `a57bx5og` 做同口径复测。

- [ ] **步骤 5：Commit**

```bash
git add backend/api/websocket.md backend/api/terminal-websocket.md backend/README.md
git commit -m "docs: document dedicated terminal websocket"
```

---

## 自检

- 规格覆盖：计划覆盖了参考实现克隆后的核心差异：后端专用 WS、前端轻量输出、scale 布局、性能 smoke。
- 占位符扫描：没有使用“待定/TODO/后续实现”；每个代码变更任务包含具体文件、命令、预期结果。
- 类型一致性：后端专用协议统一使用 `stdin/stdout/stderr/resize/ping/pong/error/connected`；前端 hook 与文档一致。
- 风险边界：没有新增 fallback；如果实现时想保留旧通用 WS 作为失败切回，必须先向用户确认。
- 验证边界：只有跑完任务 7 的后端测试、前端测试、构建、Browser/性能 smoke，才能声称“终端性能已改善”。
