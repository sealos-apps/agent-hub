# DevBox UI 深度拆解（源码级）

> 目标：把 DevBox 当作 Sealos 体系内的「产品级设计系统」来理解，而不是“参考一下布局/配色”。  
> 本文只基于仓库内参考源码 `reference/sealos/frontend/providers/devbox/` 的真实实现总结，不做臆测。

## 1. 总览：DevBox 的 UI 不是“响应式网页”，是“桌面工作台”

DevBox 设计思想的关键点只有一句话：

**DevBox 的默认目标不是让页面在窄宽度下优雅重排，而是让核心工作流在桌面小窗里保持稳定骨架与信息密度。**

这一点在多处实现中非常明确：

- 多页面都使用 `h-[calc(100vh-28px)]` 作为根容器高度，说明它运行在 Sealos Desktop 的窗口框架内，需要扣掉顶部系统条高度。
  - `reference/.../(home)/page.tsx`
  - `reference/.../devbox/detail/[name]/page.tsx`
- 大量使用 `min-w-[700px]`、`min-w-[1200px]`、`min-w-65`、`w-64`、`w-[370px]` 这类“强约束宽度”。
  - 典型：创建页表单项 `min-w-[700px]`（`devbox/create/components/Runtime.tsx`, `DevboxName.tsx`）
  - 典型：详情页整体 `min-w-[1200px]`（`devbox/detail/[name]/page.tsx`）
- 布局策略偏向“固定骨架 + 允许横向滚动”，而不是“断点触发单列堆叠”。

这也是为什么 DevBox 在非最大化窗口下依然“不丑”：它宁可让页面横向滚动，也不让表单变成移动端堆叠。

## 2. 视觉语言（不是配色表，是一套可复制的“视觉语法”）

### 2.1 基础组件体系

DevBox 不是自己写 UI 组件库，它依赖 Sealos 内部的 shadcn 变体与 shared styles：

- `reference/sealos/frontend/providers/devbox/app/[lang]/globals.css`：
  - `@import '@sealos/shadcn-ui/shadcn.css'`
  - `@import '@sealos/shadcn-ui/styles.css'`
  - `@import '@sealos/shared/components/shadcn/styles.css'`

结论：**DevBox 的“风格”来自组件库默认值 + 少量局部覆盖**，不是一堆自定义 CSS token。

### 2.2 形状与边界（DevBox 的“质感”来源）

反复出现的组合（强烈建议在 Agent Hub 里直接固定为规范）：

- 圆角：
  - `rounded-xl` 用于大多数“工作台卡片”
  - `rounded-2xl` 用于 EmptyState 或更大的承载容器
- 边框：
  - 细边框偏好 `border-[0.5px] border-zinc-200`（不是纯 1px）
- 阴影：
  - 常用 `shadow-xs`（轻）而不是大投影
- 背景：
  - 大多数卡片 `bg-white`
  - 次级面板/标签 `bg-zinc-50`
  - 信息提示使用 `text-blue-600` 与 `bg-blue-50` 家族

### 2.3 “蓝色强调”的用法是克制的

蓝色只在三个地方高频出现：

- 表格筛选/排序的“激活状态”提示（图标变蓝、Polygon 变蓝）：
  - `...(home)/components/list/headers/Name.tsx`
  - `...(home)/components/list/headers/StatusFilter.tsx`
  - `...(home)/components/list/headers/CreateTimeFilter.tsx`
- 链接式动作（docs link / open link / copy hover）
- 引导/Driver 的气泡（`globals.css` 对 driver popover arrow 的蓝色边）

这会让整个产品显得“系统级”而不是“营销页”。

## 3. 页面级拆解（逐页）

### 3.1 首页（列表页）Home

入口：`reference/.../(home)/page.tsx`

#### 3.1.1 根容器与节奏

- 根容器：`div.flex.h-[calc(100vh-28px)].flex-col.px-12`
- Header 固定高度：`h-24`
  - 左侧：标题 + docs 链接（图标 + 文本）
  - 右侧：Search Input（固定 `w-64`）、Scan templates（outline）、Create（Primary 或 Dropdown）
  - `...(home)/components/Header.tsx`

这套结构的重点：

- **Header 永远稳定，右侧控件永远靠右对齐，不被内容挤压**
- Search 的宽度是固定的，不会因窗口变化变成 100% 导致视觉崩坏

#### 3.1.2 List：不是“表格”，是“带操作策略的工作台”

入口：`...(home)/components/List.tsx`（TanStack Table）

关键点（很值得复刻到 Agent Hub）：

- 列头不是静态文本，而是“交互触发器”：
  - Name：排序 Dropdown（`ArrowUpAZ/ArrowDownAZ + Polygon`）
  - Status：多选过滤 Dropdown（勾选项右侧 `Check` 图标）
  - CreateTime：时间范围 + 排序组合 Dropdown，且激活状态会把图标/Polygon 染蓝
- 空状态与搜索空状态分离：
  - `...(home)/components/Empty.tsx`：鼓励用户创建第一个实例，整个区域可点击，背景是大 SVG，文字通过绝对定位叠加在 SVG 上。
  - `...(home)/components/SearchEmpty.tsx`：提示修改搜索/过滤条件，视觉结构同上。
- 列内容重度组件化，并做 memo + 自定义比较函数降低重渲染：
  - Name cell：`memo` + 比较 `id/name/remark`（`.../columns/Name.tsx`）
  - Monitor cell：对 cpu/memory data 做 JSON 比较（`.../columns/Monitor.tsx`）

#### 3.1.3 性能策略：列表“快”不是因为少渲染，是因为少更新

入口：`...(home)/hooks/useDevboxList.tsx`

核心策略：

- 列表轮询间隔动态决定：
  - 如果所有 devbox 都是 stopped/shutdown 就停止轮询
  - 否则每 3s refetch
- Monitor 数据每 2 分钟刷新一次（仅存在 running devbox 时）
- 只对 viewport 内的 devbox 取 monitor（DOM 里 `.devboxListItem` + viewport 判断）
- 维护 `prevListRef`，只有数据真的变化才 `setList([...])`，减少无意义 re-render

这套策略保证了：

- UI 看起来“实时”，但不会因为轮询而卡顿
- 小窗里滚动列表不会抖动

### 3.2 模板页 Template

入口：`reference/.../template/page.tsx`

#### 3.2.1 骨架与控件

- 结构：`Header + Tabs + Search`
- Search Input 固定宽：`w-[370px]`
- Tabs 使用 `variant="ghost"`，大图标（LayoutTemplate/User）+ 文本 `text-base`

Header 的 back 行为与来源耦合：

- from=create 时回到 create（`template/components/Header.tsx`）
- 否则回首页

这是一种“工作流导航”，不是浏览器历史导航。

#### 3.2.2 TemplateCard：卡片不是可视化块，是一个小型“对象行”

入口：`template/components/TemplateCard.tsx`

几个非常细节但非常关键的点：

- 卡片宽度上限：`max-w-[375px]`
  - 这会保证同屏卡片网格不至于过宽（卡片过宽会显得像营销页）
- 主要动作按钮“只在 hover 时出现”
  - `visible/opacity` 组合隐藏，避免列表噪音
- 图标有 Skeleton 预占位，避免加载抖动
- Tag 采用“小 Badge + 彩色小圆点”，信息密度高但不抢主视觉

#### 3.2.3 PublicTemplate：不是简单分页，是“视图模式状态机”

入口：`template/components/PublicTemplate.tsx`

它把模板浏览分成三种模式：

- `overview`：总览（按 category 概览）
- `category`：进入某个分类后按标签筛选
- `searchResults`：从 overview 搜索进入的结果页

同时做了大量“数据层的 UX 优化”：

- query `staleTime`、`refetchOnWindowFocus: false` 控制请求噪音
- category 自动选择标签、展开唯一分类（expandedCategories 用 Set）
- 视图切换会重置分页 state

结论：**DevBox 的“模板页体验”主要来自状态建模，而不是 UI 皮肤。**

### 3.3 创建页 Create

入口：`devbox/create/page.tsx` + `components/Form.tsx`

#### 3.3.1 Header：重操作、轻说明

入口：`devbox/create/components/Header.tsx`

- 左侧：返回 + 标题（大字号）
- 右侧：
  - export yaml（outline）
  - apply（primary，`min-w-30 h-10`）
  - guide 模式下有额外 overlay（driver）

这是典型的“系统工具”头部，不会塞解释性段落。

#### 3.3.2 Form 的布局决定了“小窗不丑”

入口：`devbox/create/components/Form.tsx`

- 外层：`flex justify-center gap-6`
- 左侧辅助轨（固定最小宽）：`min-w-65`
  - Tabs（Form/Yaml）
  - PriceBox（估价）
  - QuotaBox（额度）
- 右侧主表单（连续流）：`relative flex flex-col gap-4`
  - Runtime（模板信息 + 版本选择 + change）
  - DevboxName
  - Usage（GPU/CPU/Memory）
  - Network
  - AdvancedConfig（可选）

关键强约束：

- Runtime/DevboxName 的 FormItem 带 `min-w-[700px]`
  - 这不是“偷懒”，而是明确告诉系统：不要在桌面小窗下把表单挤成一列难看的窄输入框
- **输入框不是 `w-full`，而是“固定宽度 + 留白”**（避免大屏拉伸、也避免小窗挤压成响应式形变）
  - DevboxName：`Input className="h-10 w-[400px]"`（`create/components/DevboxName.tsx`）
  - Runtime：左侧信息容器固定 `w-[500px]`（`create/components/Runtime.tsx`）

实现启示（Agent Hub 复刻时的坑）：

- 如果项目用 `@apply` 定义了类似 `.field-input { @apply w-full ... }` 的基础类，且这段 CSS 写在 Tailwind utilities 之后，会导致 `w-[400px]` 这类宽度覆盖失效（看起来像“明明写了固定宽度却还在自适应”）。
- 正确做法是把这类基础样式放进 `@layer components`（或更早的层），让 Tailwind utilities 能覆盖它，从而实现 DevBox 的“固定宽度 + 留白”节奏。

#### 3.3.3 资源配置控件：滑杆是为“快速决策”服务

- CPU / Memory 用 Slider + marks（`Cpu.tsx`, `Memory.tsx`）
  - marks 可由 env 配置（`cpuSlideMarkList`, `memorySlideMarkList`）
- GPU 是 Select + 库存显示 + 数量按钮（`Gpu.tsx`）

结论：DevBox 资源配置的目标是“快”，不是“表单严谨”。

#### 3.3.4 Yaml 模式不是另一个页面，是同工作流的“另一个视图”

入口：`create/components/Yaml.tsx`

- 左侧仍然保留 `min-w-65` 辅助轨（Tabs + 文件列表）
- 右侧是 Code 展示（Card + ScrollArea）
- Tabs 切换通过 query param `type=form|yaml` 控制

这保持了“创建工作流不离开页面上下文”的一致性。

### 3.4 详情页 Detail

入口：`devbox/detail/[name]/page.tsx`

#### 3.4.1 根容器：直接声明最小宽度

- `min-w-[1200px]` 是硬要求
- 内容区布局：`Sidebar + renderContent()`

#### 3.4.2 Header：状态 + 一组强动作

入口：`detail/components/Header.tsx`

右侧动作组合非常典型：

- 危险动作：Delete（outline + hover 红）
- Terminal：outline icon（只有 running 才可用）
- Start/Pause/Update/Restart：ButtonGroup（outline）
- IDEButton：强品牌按钮（全黑 + 白字 + 分裂按钮）

结论：DevBox 的 Header 是“动作控制台”，不是信息展示区。

#### 3.4.3 Sidebar：极度紧凑的 icon tab

入口：`detail/components/Sidebar.tsx`

- 宽度用 `w-15`
- 每个 tab 是 `flex flex-col items-center gap-1`
- active 背景 `bg-zinc-100`，文字从 zinc-500 到 zinc-900

这是“桌面侧边栏”的典型样式，和网站型侧边栏完全不同。

#### 3.4.4 Overview 的布局：60% 顶部信息密度 + 底部版本/发布

入口：`detail/[name]/page.tsx`

- overview：上半部分 `h-[60%]` 分两列
  - 左侧 Basic（`min-w-[450px]`）
  - 右侧 LiveMonitoring + Network
- 下半部分 Release：版本与发布工作流（相当复杂）

#### 3.4.5 Network：把“可用性”做成显性状态

入口：`detail/components/Network.tsx`

外网地址显示有“Accessible / prepare”状态胶囊：

- Accessible：绿点 + emerald 文案
- prepare：灰底 + help 图标 + Tooltip 教程

并且它不是一次性判断，而是：

- `checkReady()` + retry + 自己再做指数退避 refetch

结论：DevBox 把“网络可用性”当成用户焦虑点来解决，UI 上必须显性化。

#### 3.4.6 Monitor：过滤条 + refresh 的韧性设计

入口：`detail/components/Monitor.tsx` + `components/RefreshButton.tsx`

- 顶部 filter 卡片：DatePicker + RefreshButton + 更新时间
- RefreshButton 会在连续失败达到阈值后自动 pause 一段时间（toast 提示），避免刷爆/卡死

这是典型的“系统工具韧性体验”。

#### 3.4.7 Basic / Release：DevBox 详情页不是展示页，而是运维工作台

入口：

- `detail/components/Basic.tsx`
- `detail/components/Release.tsx`

`Basic.tsx` 的重点不是“多几个字段”，而是把基础信息和 SSH 操作合并进同一张工作台卡片：

- 顶部标题右侧直接带 runtime 标识胶囊
- 基础信息按 single / double row 结构组织，而不是自由流式排版
- SSH 连接串在 Running 时直接可复制，并配合 Tooltip 和复制图标
- 私钥下载、一键配置 SSH 都是卡片内动作，不需要跳页

`Release.tsx` 更能说明 DevBox 的详情页逻辑：

- 版本表格不是历史记录展示，而是发布控制台
- 空态不是“暂无数据”，而是明确告诉用户“点击 release 后才能部署 app”
- deploy、convert to runtime、delete 等动作都围绕版本对象本身展开
- 版本列表的 polling 会根据最新 release 状态动态启停

结论：**DevBox 详情页的 overview 实际上是“信息 + 运维动作”混合工作台，不是普通概览页。**

## 4.6 Template Empty / PrivateTemplate：空态与数据规模都被视作产品语义的一部分

入口：

- `template/components/Empty.tsx`
- `template/components/PrivateTemplate.tsx`

两个额外特征值得记录：

- Empty 依然坚持“大底图 + 中央叠字”的表达，即使源码里作者吐槽“ugly”，仍然保持了与首页空态同一视觉语法
- PrivateTemplate 与 PublicTemplate 共享卡片语言、分页脚和滚动容器，说明 DevBox 的一致性依赖“容器语法复用”，不是每个页面各自定义视觉

## 5. DevBox 的前后端协同方式

如果只看前端页面，很容易误判 DevBox 是一个“视觉样式很统一的前端应用”。实际上它的工作台感来自前后端同时建模。

### 5.1 `api/devbox.ts`：前端只暴露工作流级动作

入口：`reference/sealos/frontend/providers/devbox/api/devbox.ts`

特征：

- 前端 API 按“工作流动作”命名，而不是裸资源操作
  - `getMyDevboxList`
  - `getDevboxByName`
  - `startDevbox`
  - `shutdownDevbox`
  - `restartDevbox`
  - `releaseDevbox`
- 这让页面可以直接围绕“创建 / 启动 / 暂停 / 发布 / 部署”组织动作区，而不是先解释 Kubernetes 资源

### 5.2 `stores/devbox.ts`：视图状态本身就是产品体验的一部分

入口：`reference/sealos/frontend/providers/devbox/stores/devbox.ts`

几个关键点：

- `devboxList` 与 `devboxDetail` 分开维护，但 monitor / status 会在 store 层统一补齐
- `setDevboxList()` 会保留旧 monitor 数据，避免列表刷新时图表闪烁
- `setDevboxDetail()` 在读取详情后会继续补 SSH 配置与 pod uptime
- `intervalLoadPods()` 会同步更新 detail 与 list 的状态，确保页面不分裂

结论：**DevBox 把“列表页和详情页状态一致”当作 store 层责任，而不是页面自己凑。**

### 5.3 `useControlDevbox.tsx`：操作成功后的多次 refetch 是刻意设计

入口：`reference/sealos/frontend/providers/devbox/hooks/useControlDevbox.tsx`

`refetchThreeTimes()` 非常值得注意：

- start / restart 成功后，不是只刷一次
- 而是立刻刷 + 3 秒后再刷 + 再 3 秒后再刷

这说明 DevBox 默认接受 Kubernetes 资源状态变化有传播延迟，UI 需要主动“追上真实状态”。

### 5.4 BFF 路由：后端负责把 Kubernetes 资源转成工作台对象

入口：

- `app/api/getDevboxList/route.ts`
- `app/api/getDevboxByName/route.ts`
- `app/api/startDevbox/route.ts`
- `app/api/shutdownDevbox/route.ts`
- `app/api/restartDevbox/route.ts`

总结：

- `getDevboxList` 负责把 CRD + 模板库信息合成列表项
- `getDevboxByName` 负责把 devbox / ingress / service / configmap / pvc 合成 detail 对象
- `startDevbox` / `shutdownDevbox` 不只改状态，还会同步恢复或暂停 ingress class
- `restartDevbox` 直接删 pod，而不是先做“停止再启动”的双阶段前端流程

这也是为什么 DevBox 前端可以理直气壮地做“动作控制台”：后端已经把底层资源语义收敛成产品动作了。

## 4. 关键可复用的“DevBox 规则”（给 Agent Hub 对齐用）

这部分是把上面的细节提炼成可以落地的规则，便于 Agent Hub 在后续迭代时统一执行。

### 4.1 桌面窗口规则（必须遵守）

- 页面根容器高度用 `calc(100vh - 28px)`（或等价变量），保持与 Desktop 框架一致
- 创建/详情页要明确 `min-width` 策略：
  - 不要在普通桌面小窗里触发移动端单列
  - 优先保证信息密度，必要时允许横向滚动

### 4.2 Header 规则

- Header 是“动作台”，不是“说明书”
- 控件宽度要稳定（Search 固定宽、按钮高度一致 `h-10`）
- 危险动作要用 hover 红色视觉语义

### 4.3 列表规则

- 列头 = 交互入口（排序/过滤/时间范围）
- 空状态要教用户下一步操作（并且视觉强：大 SVG + 叠字）
- 性能上要“少更新而不是少渲染”：
  - 轮询策略依赖状态
  - 可视区域优先
  - 变更检测后再 setState

### 4.4 模板选择规则

- 模板选择是独立页面（工作流入口），不是 create 表单里的一个 section
- TemplateCard 的主动作建议 hover 才显现，降低噪音

### 4.5 详情页规则

- Sidebar 用 icon tab，极窄但信息明确
- Overview 布局要像“控制面板”，而不是堆卡片
- 网络可用性必须显性反馈（可访问/准备中 + 教程 Tooltip）

### 4.6 前后端状态规则

- 列表页、详情页、操作按钮必须共享同一状态语义
- 成功操作后要考虑真实状态传播延迟，必要时主动多次刷新
- 页面动作名尽量直接使用产品工作流语义，而不是底层资源术语

## 6. Agent Hub 对齐落地映射

本次 Agent Hub 重构最终采用了以下映射策略：

- 列表页：保留 Agent 业务特有动作，但把 Header、表头、行容器、空态统一为 DevBox 首页语法
- 模板页：没有照搬 DevBox 的 public/private 数据结构，而是用 Agent 模板的 active/beta/category 视图去复刻其左分类 + 右内容的工作流骨架
- 创建页：沿用 Agent 模板与 AIProxy 配置语义，但严格收敛到 `左辅助轨 + 右固定宽表单流`
- 详情页：没有强行伪造 DevBox 的 release/network 数据模型，而是把 Agent 的运行状态、接入信息、资源规格、能力状态重组为 DevBox 式 overview 工作台

## 7. Agent Hub 对齐清单（建议）

如果 Agent Hub 要“严格对齐 DevBox”，建议按优先级执行：

1. 固化页面骨架：`Header(动作) + Sidebar(icon tabs) + Workspace(固定 min-width)`
2. 列表页引入 DevBox 的 Header + Table 交互结构（列头过滤/排序）
3. 模板页引入 DevBox 的“Tabs + Search + 视图模式”思路（至少先做到结构一致）
4. 性能策略对齐：列表轮询节流、viewport 优先、变更检测更新
