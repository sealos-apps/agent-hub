# 变更提案: Agent Hub 通用工作区与 schema 设置主链路补齐

## 需求背景

上一轮 `Agent Contract V1` 已经把 `core / access / runtime / settings / actions` 拆出来了，但核心问题仍然存在：

1. 详情页的“工作区”仍然是前端硬编码。
   - 当前只固定支持 `overview / terminal / files / settings`。
   - `web-ui` 仍然只是外部打开链接，不是 Agent Hub 内的一等工作区。
2. 设置页和创建页虽然已经引入 `settings schema`，但写入链路仍然是 Hermes 特例。
   - 前端只会提交 `provider / model / baseURL`。
   - 后端只会校验和落库这三个字段。
   - 模板里写出来的其它字段，本质上是“看得见、写不进去”的伪能力。
3. 模板目录还在继续输出占位字段。
   - 例如 `integrations.feishu / integrations.telegram` 之前只是 placeholder，没有真实 binding。

这会直接导致一个问题：现在的 Agent Hub 看起来像通用框架，但行为仍然是“一个 Hermes 专页 + 一层 contract 外壳”。

## 目标

- 把“工作区”升级成模板显式声明的一等能力。
- 把 `Agent settings` 变成真正的 schema 驱动写入链路。
- 删除没有写入能力的伪字段，避免继续误导产品和研发判断。

## 变更内容

1. 模板目录新增 `workspaces` 声明，详情页侧边栏和内容区改为完全按模板工作区生成。
2. 模板设置字段新增 `binding`，明确每个字段写到：
   - `agent` 内建字段
   - `annotation`
   - `env`
   - `derived`
3. 创建接口和设置接口统一改为消费 `settings` 对象，不再只认 Hermes 的少数字段。
4. 详情页新增内嵌 `Web UI` 工作区，列表页和详情页主入口统一跳转到该工作区。
5. Hermes 模板删除此前没有真实写入链路的 IM 占位字段，只保留当前真正可配置的模型字段。

## 影响范围

- 后端模板 schema、DTO、contract assembler、创建与设置更新 handler
- 前端类型系统、controller、创建页、设置页、详情页侧栏与内容区
- `template/hermes-agent/template.yaml`
- `template/openclaw/template.yaml`

## 成功标准

- 详情页工作区只由模板 `workspaces` 决定，不再由前端硬编码猜。
- `Agent settings` 创建与更新都走同一份 schema binding。
- `web-ui` 成为 Agent Hub 内部可切换的工作区，而不是额外散落的链接按钮。
- 模板目录不再保留无法真实写入的占位字段。
