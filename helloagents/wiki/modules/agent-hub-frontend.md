# Agent Hub Frontend

## 目的

管理 Agent Hub 的前端页面结构、共享状态、导航策略与验证入口。

## 模块概述
- 职责：提供 Agent 列表、模板选择、创建页、详情工作台与桌面终端窗口
- 状态：✅稳定
- 最后更新：2026-04-24

## 页面结构

| 路由 | 页面 | 说明 |
|------|------|------|
| `/agents` | 列表页 | 搜索、筛选、打开详情、快捷操作 |
| `/agents/templates` | 模板选择页 | 选择可创建模板 |
| `/agents/create?template=...` | 创建页 | 模板驱动的表单化创建 |
| `/agents/:agentName` | 详情页 | overview / terminal / files / settings，chat 作为动作入口 |
| `/desktop/terminal` | 桌面终端页 | Sealos Desktop 独立终端窗口 |

## 状态流

### 共享控制器
- `AgentHubControllerProvider` 在路由层包裹 Agent Hub 页面
- 列表页、创建页、详情页通过 `useAgentHub()` 共享同一个 controller
- controller 首次加载固定同时请求 `getSystemConfig + listAgentTemplates + listAgents + getClusterInfo`
- `templates + system config + agent contracts` 组成同一份页面真相，不再维护前端静态模板权威

### DevBox 风格骨架
- `AgentWorkspaceShell` 只负责桌面工作区视口和横向滚动，具体页面自己声明 `px-*`、`min-w-*` 和内容骨架
- 列表页对齐 DevBox 首页：`Header + notice + list/empty`
- 列表页的最新收口规则：header 必须维持 `text-2xl/8` 标题、固定宽搜索、`h-10` 按钮和轻量蓝色辅助入口；空态不再使用通用图标卡，而是整块虚线工作区入口
- Agent 列表主体不再使用“独立表头卡片 + 独立行卡片”的堆叠写法；当前统一为单一 `workbench` 容器，表头作为容器顶栏，行之间只用细分隔线和 hover 底色表达层级
- 列表列宽要优先服务 Sealos 中等弹窗：当前表格最小工作区宽度收敛到约 `992px`，动作区保留 `主动作 + 详情 + ellipsis`，但按钮高度和宽度必须压回精致工作台密度，避免右侧被挤出可视区
- 列表中的时间字段必须格式化为本地可读时间，不再直接展示 ISO 原始字符串
- 列表行内的 `更多` 菜单禁止继续使用受滚动容器裁切的绝对定位；当前必须通过 portal/fixed 浮层挂到视口层，并在空间不足时自动改为向上展开
- 模板页对齐 DevBox 模板中心，但当前收口为单一工作面板：`Header + 全部模板标签 + 固定宽搜索 + 自适应模板网格`
- 模板市场概览态优先使用全宽自适应卡片网格，不能因为 section 拆分或内容容器限宽而长期退化成单列；当窗口允许时应优先并排展示多张模板卡片
- 模板卡片需要遵循更接近 DevBox `TemplateCard` 的细节语法：卡片宽度不应无限拉伸，描述要控制在短行内，标签使用更细颗粒的浅底 badge，hover 动作按钮必须轻量且不抢主层级
- 当前模板市场已简化为单一 `全部模板` 视图；暂不展示左侧分类与 `已接入` 相关入口，页面结构保持 `Header + Search + All Templates Grid`
- 模板市场与创建页必须共享同一套弹窗工作区宽度；当前统一使用共享 `max-w-[936px]` 内容容器，避免模板页突然膨胀成超宽工作区
- 创建页对齐 DevBox create：`Header + 左辅助轨 + 右固定宽表单流`
- 详情页对齐 DevBox detail：`Header + icon sidebar + overview workspace`
- 详情页 header 必须优先保持 DevBox 的动作控制台语法：左侧只保留 `返回 + 名称 + 状态` 主身份，模板、域名、namespace 等扩展信息下沉到 overview 的 `基础信息` 卡，不再堆在 header 第二行
- 详情页 overview 的 `基础信息` 必须使用接近 DevBox `Basic.tsx` 的 `single / double row` 行式组织，而不是通用字段网格；`网络接入` 必须使用接近 `Network.tsx` 的表格结构显性展示地址与可用性状态
- Agent Hub 不存在统一“公网地址”展示语义；详情页只允许展示模板真实支持的接入方式，其中 `API` 行仅对支持 `API + Key` 第三方客户端接入的模板显示，当前只有 `Hermes Agent`
- 默认设计目标不是浏览器大网页，而是 Sealos Desktop 中小弹窗；当前页面骨架以 `1100x760` 到 `1180x820` 的窗口密度优先
- 小窗约束下禁止出现创建页横向溢出；模板页和列表页要优先收紧 header、搜索宽度、卡片宽度与留白
- 列表页表格允许在小窗中横向滚动，不能为了“全部塞进视口”而把列宽、按钮和指标压成通用后台卡片风格
- 创建页新增更精细的字阶规则：顶部使用 eyebrow + 主标题 + 辅助说明三级层次，摘要侧栏使用低饱和小标题 + 高对比数值，避免“整体缩小但仍显粗糙”
- 创建页断点调整为更贴近弹窗：约 `920px` 宽度仍保持 `左摘要 + 右工作面板`，更窄时才退化为摘要先行的重排布局

### 导航快照
- 列表页进入详情页时，会把当前 `AgentListItem` 作为 route state 传入
- 创建页提交成功后，会把 `loadAll()` 刷新后的新实例快照一并传入详情页
- 详情页优先 `primeItem()`，再读取共享 controller 中的最新数据

### 数据与动作
- 列表页、详情页当前共用 `AgentListItem` 视图模型，但其来源已改为 `AgentContract + TemplateCatalogItem`
- 运行态切换通过 `toggleItemState()` 复用 `/api/v1/agents/:agentName/run|pause`
- 创建页通过 `prepareCreateBlueprint()` 拉起模板种子，默认模型、provider、Base URL 全部来自模板目录与系统配置
- AIProxy token 仍由 controller 负责 ensure，前端页面只展示准备状态，不直接暴露敏感配置
- Hermes Agent 当前的标准模型接入语义已经从“根据模型名推断 provider”收口为“模型选项自带 provider/apiMode，前后端都只认显式值”
- 设置页已经拆成独立工作区：`AgentSettingsWorkspace` 把 runtime 与 agent settings 分成两张卡，并分别提交到 `/runtime` 与 `/settings`
- 详情页 overview 的 SSH 信息改为按需加载：只有用户展开 SSH/IDE 操作时才请求 `/api/v1/agents/:agentName/access/ssh`
- 文件工作台的目录导航必须保证“只认最后一次浏览请求”：连续点击目录、返回上级、手动输入路径时，旧的 `file.list` 结果禁止覆盖最新目录状态；否则在容器 IO 慢或目录较大时会产生明显的 UI 乱跳和误判超时体验
- 文件工作台的目录浏览层现在还要求具备短时缓存与预取：同一路径的重复进入应优先命中本地缓存，目录项在 hover/focus 时可预取下一层 listing，刷新动作必须显式绕过缓存，文件写入/创建/删除/上传后要主动失效当前目录缓存
- 文件工作台当前使用 `selectedItem + openedItem` 双状态模型：`selectedItem` 只表示左侧当前选中对象，`openedItem` 才表示右侧主工作区真正打开的文件/目录。禁止再把“选中”和“打开”折叠回单一字段，否则会重新引入“单击到底是切目录还是改预览”的混乱
- 文件工作台交互职责已经固定为三段：
  - 左栏 `目录列表`：单击只选中，行内按钮负责进入/预览/编辑
  - 中栏 `当前选择`：展示选中对象的元信息与明确动作，不自动切换主工作区
  - 右栏 `预览与编辑`：只渲染 `openedItem`，允许“已选中 A，但仍保持打开 B”这种稳定状态，避免编辑中的内容被瞬时选择动作打断
- `AgentListItem` 中的能力字段来自 contract：
  - `apiBaseURL` 只由 `access.api.url` 派生
  - `chatAvailable / terminalAvailable / webUIAvailable / sshAvailable / ideAvailable` 只由 `actions/access` 组合判断
- 详情页 overview 明确区分 `API / SSH / IDE / Web UI / 集群内服务地址`，不再展示统一“公网地址”语义

## 规范
- 列表视图模型只保留展示与状态判断需要的字段；敏感字段与 API 路径禁止驻留在 `AgentListItem`
- 详情页不应依赖独立 controller 副本；页面间跳转必须尽量携带导航快照
- 前端验证基线统一维护在 `backend/api/frontend-checklist.md`
- 页面设计规范以 `reference/sealos/frontend/providers/devbox/` 的真实源码为准，不再使用“近似 DevBox”作为目标
- 固定宽度、窄侧栏、动作优先 Header 和 `border-[0.5px] + bg-white + rounded-xl` 是 Agent Hub 当前必须遵守的工作台语法
- 详情页禁止回退成“标题 + 多行元信息 + 多张业务卡”的后台概览页；只允许延续 DevBox detail 的 `Header / Sidebar / Basic / Network / Release-like table` 语法做领域映射
- 列表行操作区遵循 `主动作 + 详情 + ellipsis` 组合，主动作使用轻量 outline/secondary 语法；资源列优先使用紧凑指标表达，不再使用碎 pill
- 列表表头与数据行必须共用同一套 grid 轨道，禁止再次回到依赖多张浮卡 + 各列 magic number 的分裂布局
- AI-Proxy 相关 UI 只允许使用模板目录中的显式 provider；禁止再根据模型名、base URL、集群域名做任何推断
- 文件管理器禁止继续使用“整卡点击同时承担选中 + 打开 + 进入”的混合交互；当前标准是单击选中、显式动作打开，右侧工作区只跟随 `openedItem`
- 控制台目录树的默认锚点改为“工作目录优先”：首次进入优先展开默认工作目录；同时保留一键切换到 `/` 根目录继续浏览其他路径
- 控制台目录树新增“手动折叠优先”约束：用户主动折叠（含 `/`）后，自动展开逻辑不会立即覆盖用户操作
- 控制台文件链路改为事件驱动 ready gate：移除轮询等待 socket ready，统一通过连接事件推进请求发送并补齐 pending 请求超时回收
- 终端输出调度新增隐藏标签降压策略：标签切走后保留会话不断连，但降低每次刷写预算，减少持续输出场景的主线程卡顿

## 验证
- 构建：`cd web && npm run build`
- lint：`cd web && npm run lint`
- 控制台性能 smoke：`cd web && bun run perf:agent-console-smoke`
- 联调/回归清单：`backend/api/frontend-checklist.md`
