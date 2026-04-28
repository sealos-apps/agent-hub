# Changelog

本文件记录 `helloagents/` 知识库范围内的重要变更。

## [Unreleased]

### 变更
- Agent Console 深层性能治理：目录树改为“工作目录优先锚点 + 可切换根目录 + 手动折叠优先”，文件链路从轮询 ready 改为事件门控并补齐请求超时回收；后端文件操作按读/写分级队列与超时策略，终端隐藏标签采用降压刷写以降低持续输出卡顿。
- 新增 `web/scripts/agentConsolePerfSmoke.ts` 与 `perf:agent-console-smoke` 命令，补齐控制台关键路径（目录链路、文件 ready gate、终端背压）的可复用 smoke 基线。
- Agent Console Stream V2 全链路升级：WebSocket 改为 Binary V2 帧协议；后端新增单写有界队列与流式高压淘汰（附 `dropped/droppedCount` 标记）；前端终端优先启用 WebGL renderer + burst 调度，文件预览支持 `fromCache/stale` 反馈与后台刷新。
- 补齐 Agent Hub 的通用基础能力主链路：模板目录新增 `workspaces + settings.binding`，前后端统一按 schema 驱动创建与设置更新，不再只认 Hermes 的硬编码模型字段。
- 详情页工作区升级为模板显式声明能力：侧边栏不再硬编码 `overview / terminal / files / settings`，并新增内嵌 `Web UI` 工作区。
- Hermes 模板移除没有真实写入链路的 IM 占位字段，避免继续把 placeholder 当成通用能力。
- Agent Hub 切换到 `Template Catalog + Agent Contract V1`：前端不再维护静态模板权威，列表/详情统一消费 `core / access / runtime / settings / actions`。
- 新增后端模板目录与 SSH 接口：
  - `GET /api/v1/system/config`
  - `GET /api/v1/templates`
  - `GET /api/v1/agents/:agentName/access/ssh`
- 清理前后端旧推断链：删除 `inferTemplateIdFromImage`、`supportsAPIAccess`、`applyManagedAIProxyBlueprint`，创建链路改为强制显式 `agent-model-provider + agent-model-baseurl`。
- Hermes Agent 的 AI-Proxy 接入已收口为显式命名 provider：模型选项自带 `provider + apiMode`，前后端都不再根据模型名自动推断 provider。
- 为 Agent Hub 前端引入共享控制器上下文，列表页、创建页、详情页共用同一份状态与缓存。
- 收敛 `AgentListItem`：移除列表视图模型中的敏感字段与旧推断输入，公开接入地址改为从 `access` contract 派生。
- 拆分 Agent 设置更新接口：后端新增 `PATCH /api/v1/agents/:agentName/runtime` 与 `PATCH /api/v1/agents/:agentName/settings`，前端设置页同步拆成两组提交链路。
- 新增 SSH / IDE 工作台闭环：详情页支持查看 SSH 连接信息、复制 SSH 命令、复制 token、下载私钥，以及 `Cursor / VSCode / Zed / Gateway` deeplink。
- 补齐 Contract V1 回归测试：新增模板目录、runtime/settings 校验、SSH 接口、详情访问平面和列表动作区测试，并跑通 `go test`、`vitest`、`lint`、`build`。
- 补充 `helloagents/wiki`、安全检查文档与前端验证清单，完成剩余计划收口。
- 基于 DevBox 真实源码补全 Template / Detail / BFF / Store 分析，并将 Agent Hub 的列表、模板、创建、详情页重构为统一的 DevBox 工作台语法。
- 继续按 Sealos 默认弹窗窗口收紧 Agent Hub：压缩列表 header / 空态、模板页分类与卡片宽度、创建页左右轨和表单卡宽度，并验证 `1100x760` 下无横向溢出。
- 重新打磨创建页的精致感：重做 header 字阶与动作区、摘要侧栏的排版层级、缺失上下文空态，并把 `左摘要 + 右工作面板` 的断点下调到窄窗可用区间，保证 `920px` 仍保留工作台结构。
- 继续收口 Agent 列表页的 DevBox 对齐：header 改回 `标题 + docs-like 辅助入口 + 固定宽搜索 + h-10 动作按钮`，列表空态改为整块虚线工作区入口并复用 DevBox `list-empty/search-empty` 视觉素材。
- 收轻列表行语法：表格恢复更宽的工作台列宽与横向滚动策略，行内主动作去掉黑色 CTA，资源规格改为克制指标列，状态 badge 与名称单元统一回收到更轻的桌面工具表达。
- 模板市场改回真正的自适应网格：概览态不再拆成纵向 section，而是直接全宽展示模板卡片网格；去掉内容区 `max-w-[760px]` 和卡片 `max-w-[300px]` 限制后，`全部模板` 在常见弹窗宽度下可一行多个展示，窄窗再自然退回单列。
- 继续对齐 DevBox 模板卡片的精致度：收紧模板卡片宽度与 hover 阴影，弱化主按钮压迫感，描述改为两行内收住，能力标签改成细颗粒 badge，底部信息条改成更稳定的卡片 footer。
- 模板市场进一步简化为单一工作面板：移除左侧分类、顶部 `已接入` 切换和卡片中的 `已接入` 状态标签，只保留 `全部模板 + 搜索 + 自适应卡片网格`。
- 模板市场在宽窗口下增加响应式水平边距：外层容器使用 `max-w + px` 渐进留白，保证全屏模式下左右不贴边，小窗模式维持原有紧凑度。
- 模板市场与创建页进一步统一为同一套弹窗工作区宽度：抽出共享 `936px` 内容容器，模板页不再使用超宽工作区；顶部搜索与统计区同步改成窄窗可重排布局，避免出现“一页宽一页窄”的割裂感。
- Agent 列表重新收口为统一工作台表格：去掉“表头卡片 + 行卡片”堆叠感，改成单一列表容器、内部分隔行和更窄的动作区宽度；同步格式化更新时间、收紧名称/资源/状态单元的字阶，解决常驻横向滚动条和右侧操作区被挤爆的问题。
- 修复 Agent 列表 `更多` 菜单被遮挡：操作菜单改为 portal 浮层定位，脱离表格滚动容器后可根据视口自动向上或向下展开，不再被列表边界裁切。
- 详情页继续按 DevBox detail 真实源码收口：Header 改回“返回 + 名称 + 状态 + 强动作区”的控制台结构，overview 的 `基础信息` 改成 `Basic` 式 single/double row，`网络接入` 改成 `Network` 式表格并显性展示 `可访问 / 准备中 / 未接入 / 集群内` 状态，避免再次退回业务信息卡堆叠。
- 修正详情页接入逻辑：前端不再展示统一“公网地址”，并将 `apiBaseURL` 提升为 API 接入能力的唯一字段；`API` 行只对支持 `API + Key` 第三方客户端接入的模板展示，当前仅 `Hermes Agent`，后端 `/chat/completions` 与 `APIBaseURL` 返回也同步按模板能力收口。
- 固化发布约束：不保留旧 `PATCH /api/v1/agents/:agentName` 过渡窗口，上线顺序固定为“后端先发、前端后发、模板目录与知识库最后同步”。
- 后端本地开发新增 `.env` 约定：启动时自动读取 `backend/.env`，并新增 `backend/.env.example`；线上 Sealos 部署仍保持显式环境变量注入。
- 修复文件工作台切目录卡顿与超时：后端 `file.list` 不再通过 `wc -c` 逐个读取文件内容计算大小，而是改为 `stat` 读取元数据；前端目录导航新增“仅最后一次切换请求生效”控制，避免连续点击时旧目录结果回刷新状态并放大 `context deadline exceeded` 体感。
- 继续优化文件工作台目录浏览的丝滑度：前端为目录列表新增短时缓存、同路径请求去重、刷新强制失效与目录卡片 hover/focus 预取，目录前进/后退/重复打开时优先走本地结果，只在必要时重新发起 `file.list`。
- 文件工作台重构为 `选中项 + 打开项` 双状态模型：左侧列表单击只负责选中，中栏负责明确动作，右侧主面板只渲染真正打开的目录/文件，避免目录进入、预览和编辑继续共用同一条 `activeItem` 状态线。
- 文件工作台 UI 改成新的三段式工作台：`目录列表 / 当前选择 / 预览与编辑`，列表行内动作统一为进入/预览/编辑按钮，Markdown 编辑保持分栏预览，窄窗下不再依赖“整卡点击即跳转”的不稳定交互。
- 移除文件管理器的 `/opt/hermes` 根目录限制：后端 `resolveFilePath` 改为支持容器内任意绝对路径与相对路径解析，前端目录跳转同步取消“超出工作区根目录即拦截”的限制，`/opt`、`/root` 等目录可直接打开。
