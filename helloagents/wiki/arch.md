# 架构设计

## 总体架构

```mermaid
flowchart LR
    A["Sealos 用户"] --> B["React Router 页面层"]
    B --> C["AgentHubControllerProvider"]
    C --> D["useAgentHubController"]
    D --> E["GET /system/config"]
    D --> F["GET /templates"]
    D --> G["Agent Contract API"]
    D --> L["Schema Settings Mapper"]
    G --> H["Gin Router"]
    H --> I["Kubernetes / DevBox / Service / Ingress"]
    H --> J["AIProxy Token API"]
    H --> K["SSH Access API"]
```

## 前端状态流

```mermaid
sequenceDiagram
    participant List as 列表页
    participant Provider as AgentHubControllerProvider
    participant Detail as 详情页
    participant API as backend/api

    List->>Provider: 初次加载
    Provider->>API: getSystemConfig + listAgentTemplates + listAgents + getClusterInfo
    API-->>Provider: region + template catalog + agent contracts
    List->>Detail: navigate(state.agent)
    Detail->>Provider: primeItem(state.agent)
    Detail->>Provider: findItemByName(agentName)
```

## 关键设计点
- 路由共享同一个 `AgentHubControllerProvider`，列表页、模板页、创建页、详情页只消费一份 contract 快照。
- 前端模板权威已收回到后端：`/api/v1/templates` 提供模板目录、访问能力、动作、设置 schema 和按 `REGION` 裁剪后的模型预设。
- Agent 页面权威已切到 Contract V1：列表和详情统一消费 `core / workspaces / access / runtime / settings / actions`，不再允许通过镜像、域名、模型名做推断。
- `useAgentHubController` 只在实例处于 `creating` 或 `running but not ready` 时静默轮询，避免常态页面持续刷新。
- 详情页侧边工作区改为 contract 驱动：`overview / chat / terminal / files / settings / web-ui` 只在模板显式声明时出现。
- 设置平面已拆成两条显式更新链路：`PATCH /api/v1/agents/:agentName/runtime` 与 `PATCH /api/v1/agents/:agentName/settings`，不再保留宽泛更新接口。
- `settings` 字段新增 binding 语义：模板可显式声明某个字段写入 `agent built-in / env / annotation / derived`，创建与更新统一走同一份 schema 映射。
- SSH / IDE 接入走按需链路：列表 contract 只暴露入口能力，真正的私钥、token、config host 仅通过 `/api/v1/agents/:agentName/access/ssh` 返回。
- 发布顺序固定为“后端先发、前端后发、模板目录与知识库最后同步”，不保留旧 DTO 过渡窗口。
- Agent Console WS 链路升级为 Stream V2：统一二进制帧，后端单写协程消费有界队列，`terminal.output/log.chunk` 在高压下优先丢弃最旧片段并下发 `dropped + droppedCount` 标记，保证控制消息与输入交互优先。
- 终端渲染链路采用 `normal/burst` 双模式调度，前端优先启用 WebGL renderer（失败自动回退），并保留 Tab 切换后终端实例持续驻留，避免重建导致的抖动。
- 文件预览链路采用缓存优先策略（TTL=120s），返回 `fromCache/stale` 元信息并在 stale 命中时后台刷新，显著降低重复打开目录与文件的等待时间。
- 文件连接就绪策略从轮询改为事件驱动 ready gate，`file.request` 统一等待连接事件并附带超时回收，降低无效等待和悬挂请求风险。
- 后端文件操作链路按读/写场景拆分队列与超时窗口：`list/read/download` 与 `write/delete/mkdir/upload` 分级调度，降低目录浏览与文件预览被写操作阻塞的概率。
- 控制台目录树引入“工作目录优先锚点 + 手动折叠优先”状态机，保证首次可用速度与用户操作可预测性。

## 重大架构决策

| adr_id | title | date | status | affected_modules | details |
|--------|-------|------|--------|------------------|---------|
| ADR-20260418-01 | Agent Hub 页面改为共享 controller + 导航快照 | 2026-04-18 | ✅已采纳 | web/app/pages/agent-hub | 通过 Provider 与 route state 降低重复请求与状态滞后 |
| ADR-20260418-02 | Agent Hub 切换到 Template Catalog + Agent Contract V1 | 2026-04-18 | ✅已采纳 | backend/internal/handler, web/src/domains/agents | 模板能力、模型预设、访问平面和动作入口全部显式化，删除前端推断链 |
| ADR-20260418-03 | Agent Hub 工作区与设置字段改为模板 schema 显式绑定 | 2026-04-18 | ✅已采纳 | backend/internal/agenttemplate, backend/internal/handler, web/src/app/pages/agent-hub | 通过 `workspaces + settings.binding` 让工作区和设置写入都回到模板目录单一路径 |
| ADR-20260423-01 | Agent Console Stream V2 与高压背压策略 | 2026-04-23 | ✅已采纳 | backend/internal/ws, web/src/app/pages/agent-hub, web/src/components/business/terminal | WS 改为 Binary V2，后端单写队列 + 最旧流式数据淘汰并附带 dropped 标记，前端终端调度与文件缓存链路同步升级 |
| ADR-20260424-01 | 控制台深层性能与稳定性治理（文件 QoS + Ready Gate + 目录锚点） | 2026-04-24 | ✅已采纳 | backend/internal/ws, web/src/app/pages/agent-hub, web/src/components/business/terminal | 文件链路改为事件驱动就绪门控并补齐请求回收，后端按读/写分级队列与超时策略，目录树默认锚定工作目录且保留根目录切换，隐藏终端标签进入降压调度 |
