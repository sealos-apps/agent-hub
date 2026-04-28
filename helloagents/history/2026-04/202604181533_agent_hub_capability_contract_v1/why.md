# 变更提案: Agent Hub 通用能力契约 v1 与 DevBox 接入平面对齐

## 需求背景

当前 `Agent Hub` 已经完成了一轮 DevBox 风格对齐，但核心问题仍然不是“颜色和圆角”，而是**前后端能力模型还没有真正对齐 DevBox 的产品结构**。

现状里有四个根问题：

1. `Agent Hub` 仍然把能力散落在页面字段和布尔开关里。
   - 前端当前以 `supportsAPIAccess`、`chatAvailable`、`terminalAvailable`、`apiBaseURL` 等字段拼接页面语义。
   - 关键文件：
     - `web/src/domains/agents/types.ts`
     - `web/src/domains/agents/templates.ts`
     - `web/src/domains/agents/mappers.ts`
     - `web/src/app/pages/agent-hub/components/AgentDetailOverview.tsx`
2. 前端和后端仍然保留多处推断逻辑，这和“显式能力声明”目标冲突。
   - 当前仍存在：
     - 通过镜像反推模板：`inferTemplateIdFromImage`
     - 通过模型名反推 provider：`resolveAIProxyProviderProfile('', model)`
     - 通过域名/地址判断 API 是否可用
     - 缺省回落到 `hermes-agent` / `us`
3. 详情页虽然长得更像 DevBox 了，但结构仍不是 DevBox 的“访问平面 + 运行时平面”。
   - DevBox 的真实源码里，`SSH / IDE / WebIDE / Port / Runtime` 都是一等能力。
   - `Agent Hub` 现在只有 `overview / chat / terminal / files` 这组固定 tab，还没有“设置页”“SSH/IDE 接入”“Web UI 接入”的统一框架。
4. 现在的更新接口仍然是一个宽泛的 `PATCH /agents/:agentName`。
   - 它把运行时配置、模型配置、模板配置混在一起。
   - 这不适合后续接入 Hermes / OpenClaw / 更多 Agent 的模板私有设置。

与此同时，DevBox 参考源码已经给出了非常明确的产品事实：

- DevBox 的核心不是“某个页面长什么样”，而是**访问能力与运行时能力是系统一级对象**。
- 关键参考文件：
  - `reference/sealos/frontend/providers/devbox/components/IDEButton.tsx`
  - `reference/sealos/frontend/providers/devbox/stores/devbox.ts`
  - `reference/sealos/frontend/providers/devbox/api/devbox.ts`
  - `reference/sealos/frontend/providers/devbox/app/api/getSSHConnectionInfo/route.ts`
  - `reference/sealos/frontend/providers/devbox/utils/adapt.ts`
  - `docs/DevBox-UI-Deep-Dive.md`

这说明：如果我们要把 `Agent Hub` 做成能兼容很多 Agent 的部署框架，唯一正确方向不是继续加 `supportsXxx` 布尔字段，而是**建立一套显式、单一路径、无兜底的能力契约**。

## 产品分析

### 目标用户与场景

- **用户群体:** 在 Sealos 工作区里部署和使用 Agent 的普通技术用户、AI 应用使用者、内部产品和交付团队。
- **使用场景:** 用户创建 Agent 后，需要快速进入终端、文件、设置、API、SSH、IDE 或模板自己的 Web UI，而不是理解底层 Devbox / Service / Ingress 资源。
- **核心痛点:**
  - 当前页面能做的事情不少，但结构是“页面拼出来的”，不是“能力定义出来的”。
  - 用户会把“公共地址”“对话能力”“Web UI 能力”“模板设置能力”混淆。
  - 后续一旦接入更多 Agent，页面会继续长布尔开关和特判。

### 价值主张与成功指标

- **价值主张:** 把 `Agent Hub` 从“当前只适配 Hermes 的管理页”升级成“显式能力驱动的 Agent 工作台框架”。
- **成功指标:**
  - 前端不再通过 `image / model / domain` 推断模板与能力。
  - 列表页、创建页、详情页都消费同一份模板契约和实例契约。
  - 详情页只展示模板真实支持的入口：`terminal / files / ssh / ide / web-ui / api / settings`。
  - 设置能力拆成 `运行时设置` 与 `Agent 设置` 两类，不再混在一个宽泛配置弹窗里。
  - `Hermes Agent` 能完整展示 `API + Terminal + Files + SSH + IDE + Settings`。
  - `OpenClaw` 即使暂未完全接入，也通过显式模板契约展示成“无 API、可终端、可文件、可 Web UI”的真实能力集合，而不是前端猜测。

### 人文关怀

- 不展示实例并不具备的入口，避免给用户错误预期。
- 不把私钥、密钥、第三方集成配置作为列表态字段常驻在前端模型里。
- 不用“兼容老逻辑”的方式延长认知负担，统一切到单一路径，降低后续维护和培训成本。

## 变更内容

1. 建立 `Agent Contract v1`，把实例信息拆成五个平面：
   - `core`
   - `access`
   - `runtime`
   - `settings`
   - `actions`
2. 建立后端模板目录与模板 API，统一输出模板元数据、能力清单、设置 schema、按区域划分的模型预设。
3. 把实例详情改成能力驱动渲染：
   - 固定基础区：身份、状态、运行摘要
   - 动态能力区：访问入口、运行时、设置入口、模板特有入口
4. 把更新能力拆分成显式设置面：
   - `运行时设置`
   - `Agent 设置`
5. 为 `SSH / IDE` 建立正式接入链路：
   - 后端显式返回 SSH 连接信息
   - 前端提供复制 SSH 命令、下载私钥、IDE deeplink
6. 移除当前所有“猜测式”兜底逻辑：
   - 不再通过镜像推断模板
   - 不再通过模型名临时推断 provider
   - 不再通过域名临时推断 API 能力
   - 不再把 `us` 当作系统缺省 region

## 影响范围

- **模块:**
  - Agent 模板目录与模板元数据
  - 后端 DTO / Handler / Router
  - 前端模板模型 / 实例模型 / Controller
  - 详情页、创建页、列表页的信息架构
- **文件:**
  - `backend/internal/dto/agent.go`
  - `backend/internal/handler/agent.go`
  - `backend/internal/router/router.go`
  - `backend/internal/kube/agent_view.go`
  - `backend/internal/agenttemplate/template.go`
  - `backend/internal/config/config.go`
  - `template/hermes-agent/template.yaml`
  - `web/src/api/backend.ts`
  - `web/src/domains/agents/types.ts`
  - `web/src/domains/agents/templates.ts`
  - `web/src/domains/agents/models.ts`
  - `web/src/domains/agents/mappers.ts`
  - `web/src/app/pages/agent-hub/hooks/useAgentHubController.ts`
  - `web/src/components/business/agents/AgentConfigForm.tsx`
  - `web/src/components/business/agents/AgentInstancesTable.tsx`
  - `web/src/app/pages/agent-hub/AgentDetailPage.tsx`
  - `web/src/app/pages/agent-hub/components/AgentDetailOverview.tsx`
  - `web/src/app/pages/agent-hub/components/AgentDetailSidebar.tsx`
- **API:**
  - `GET /api/v1/templates`
  - `GET /api/v1/agents`
  - `GET /api/v1/agents/:agentName`
  - `GET /api/v1/agents/:agentName/access/ssh`
  - `PATCH /api/v1/agents/:agentName/runtime`
  - `PATCH /api/v1/agents/:agentName/settings`
- **数据:**
  - 实例视图模型从扁平字段升级为能力契约
  - 模板定义从前端静态表升级为后端显式模板目录

## 核心场景

### Requirement: contract-v1
**模块:** 前后端统一实例契约

统一的 `Agent Contract v1` 应成为列表页、详情页、设置页、模板页的唯一能力来源。

#### Scenario: capability-driven-detail
用户打开任意 Agent 详情页时：
- 页面固定展示基础身份与运行状态。
- 页面动态展示该模板真实支持的访问入口。
- 不支持的能力不展示，不出现“灰掉但其实无意义”的入口。

### Requirement: access-plane
**模块:** 访问平面

`Agent Hub` 必须把访问入口定义成显式能力，而不是页面硬编码。

#### Scenario: hermes-access
用户打开 `Hermes Agent` 详情页时：
- 能看到 `API / Terminal / Files / SSH / IDE`。
- `API` 显示真实地址与状态。
- `SSH` 可以复制命令、下载私钥。
- `IDE` 使用 SSH 信息生成 deeplink。

#### Scenario: openclaw-access
用户打开 `OpenClaw` 详情页时：
- 不显示 `API`。
- 只显示模板显式声明的 `Terminal / Files / Web UI / Settings`。
- 页面不再出现“当前实例还没有可用的 API 接入地址”这类错误语义。

### Requirement: settings-plane
**模块:** 设置平面

设置必须拆成系统能理解的两类，而不是继续共用一个宽泛更新接口。

#### Scenario: runtime-settings
用户进入 `设置` 页修改运行时配置时：
- 只编辑 `cpu / memory / storage / runtimeClass / lifecycle`。
- 表单提交到显式 `runtime` 更新接口。
- 页面不携带模型与集成配置。

#### Scenario: agent-settings
用户进入 `设置` 页修改 Agent 配置时：
- 只编辑模板定义允许修改的字段。
- Hermes 先支持 `provider / model / baseURL / keySource / integrations`。
- OpenClaw 后续通过同一 schema 补自己的模板字段。

### Requirement: template-catalog
**模块:** 模板目录

模板信息必须由后端显式提供，前端不再自己维护“半真半假的模板能力表”。

#### Scenario: region-model-catalog
用户进入创建页时：
- 前端先请求 `GET /api/v1/templates`。
- Hermes 模型列表按后端返回的 `region` 预设显示。
- `cn` 只返回 `GLM / MiniMax / Qwen`。
- `us` 返回 `GPT-5 / Claude / GLM / MiniMax / Qwen`。
- 每个模型选项显式携带 provider 与 api_mode，不再临时推断。

### Requirement: dynamic-navigation
**模块:** 详情页导航

详情页导航必须从“固定 tab”改成“固定骨架 + 动态入口”。

#### Scenario: sidebar-generated-by-contract
用户查看详情页左侧导航时：
- 永远有 `概览`。
- 如果模板支持 `terminal`，就出现 `终端`。
- 如果模板支持 `files`，就出现 `文件`。
- 如果模板支持 `settings`，就出现 `设置`。
- `chat` 不再作为全局固定 tab，只能作为模板可选工作区或动作入口。

## 风险评估

- **风险:** DTO 与前端模型同时改动，联调窗口大。
- **缓解:** 先定义契约和模板 API，再逐页替换消费方，不做双模型长期并存。

- **风险:** 当前工作树已很脏，继续叠加实现容易互相污染。
- **缓解:** 本次先落完整方案包，实施时按任务分批提交，严格控制文件组。

- **风险:** SSH/IDE 涉及 secret、私钥、token，安全边界容易模糊。
- **缓解:** 私钥只通过显式 SSH 接口按需获取，不进入列表模型，不进入本地持久化缓存。

- **风险:** 如果继续保留旧的推断逻辑，新的契约很快会再次被页面绕开。
- **缓解:** 本次设计明确要求删除旧推断入口，不保留“先兼容一下”的路径。
