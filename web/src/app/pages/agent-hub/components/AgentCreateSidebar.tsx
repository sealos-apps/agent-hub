import type { ReactNode } from 'react'
import { readBlueprintSettingValue } from '../../../../domains/agents/blueprintFields'
import { formatModelProviderLabel } from '../../../../domains/agents/aiproxy'
import { formatCpu, formatMemory, formatStorage } from '../../../../lib/format'
import type {
  AgentBlueprint,
  AgentSettingField,
  AgentTemplateDefinition,
} from '../../../../domains/agents/types'

function formatKeySourceLabel(value = '', ready = false) {
  if (!ready) return '未准备'
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (!normalized || normalized === 'unset') return '未准备'
  if (normalized === 'workspace-aiproxy') return '由工作区提供'
  return value
}

function SidebarSection({
  title,
  description,
  children,
  className,
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section
      className={[
        'workbench-card-strong flex h-full flex-col rounded-[16px]',
        className || '',
      ].join(' ')}
    >
      <div className="px-6 pt-6">
        <div className="text-[1.02rem]/6 font-semibold tracking-[-0.02em] text-zinc-950">{title}</div>
        {description ? <div className="mt-1 text-[13px]/6 text-zinc-500">{description}</div> : null}
      </div>
      <div className="px-6 pt-5 pb-6">{children}</div>
    </section>
  )
}

function SummaryMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">{label}</div>
      <div className="mt-1 text-[1rem]/6 font-semibold tracking-[-0.03em] tabular-nums text-zinc-950">
        {value}
      </div>
    </div>
  )
}

function SummaryField({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="py-2.5">
      <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">{label}</div>
      <div className={mono ? 'mt-1 break-all font-mono text-[12px]/6 text-zinc-700' : 'mt-1 text-[13px]/6 text-zinc-700'}>
        {value || '--'}
      </div>
    </div>
  )
}

interface AgentCreateSidebarProps {
  template: AgentTemplateDefinition | null
  blueprint: AgentBlueprint
  workspaceModelBaseURL: string
  workspaceModelKeyReady: boolean
}

export function AgentCreateSidebar({
  template,
  blueprint,
  workspaceModelBaseURL,
  workspaceModelKeyReady,
}: AgentCreateSidebarProps) {
  if (!template) {
    return null
  }

  const resolveProviderValue = () => {
    const current = blueprint.modelProvider.trim()
    if (current) return current
    const selectedModel = blueprint.model.trim()
    if (!selectedModel) return ''
    const option = template.modelOptions.find((item) => item.value === selectedModel)
    return String(option?.provider || '').trim()
  }

  const isDisplayOnlyField = (field: AgentSettingField) => {
    const bindingKey = String(field.binding?.key || '').trim()
    return (
      field.readOnly ||
      bindingKey === 'modelProvider' ||
      bindingKey === 'modelBaseURL' ||
      bindingKey === 'keySource'
    )
  }

  const summaryFields = template.settings.agent.filter(isDisplayOnlyField)
  const resolvedModelBaseURL = workspaceModelBaseURL || blueprint.modelBaseURL

  const renderSummaryField = (field: AgentSettingField) => {
    const fieldValue = readBlueprintSettingValue(blueprint, field)
    const bindingKey = String(field.binding?.key || '').trim()

    if (bindingKey === 'modelProvider') {
      return formatModelProviderLabel(resolveProviderValue())
    }

    if (bindingKey === 'modelBaseURL') {
      return resolvedModelBaseURL || '--'
    }

    if (bindingKey === 'keySource') {
      return formatKeySourceLabel(fieldValue, workspaceModelKeyReady)
    }

    return fieldValue || '--'
  }

  return (
    <aside className="grid h-full w-full gap-4 pb-10 sm:pb-12 xl:pb-10">
      <SidebarSection
        description="这里汇总当前创建单里的核心信息，提交前在这一张卡里快速确认就可以。"
        title="摘要卡片"
        className="h-full"
      >
        <div className="space-y-4">
          <div className="border-b border-zinc-200 pb-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">别名</div>
            <div className="mt-1.5 text-[1.15rem]/7 font-semibold tracking-[-0.03em] text-zinc-950">
              {blueprint.aliasName || '未填写'}
            </div>
            <div className="mt-1 text-[12px]/5 text-zinc-500">实例名称会在提交后自动生成并用于资源关联。</div>
          </div>

          <div className="border-b border-zinc-200 pb-4">
            <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-400">模型</div>
            <div className="mt-1.5 break-all text-[1rem]/6 font-semibold tracking-[-0.02em] text-zinc-950">
              {blueprint.model || '未选择'}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <SummaryMetric label="CPU" value={formatCpu(blueprint.cpu)} />
            <SummaryMetric label="内存" value={formatMemory(blueprint.memory)} />
            <SummaryMetric label="存储" value={formatStorage(blueprint.storageLimit)} />
          </div>

          <div className="divide-y divide-zinc-200">
            <SummaryField
              label="实例名称"
              mono
              value={blueprint.appName || '提交后自动生成'}
            />
            <SummaryField
              label="命名空间"
              mono
              value={blueprint.namespace || '--'}
            />
            {summaryFields.map((field) => {
              const bindingKey = String(field.binding?.key || '').trim()
              const value = renderSummaryField(field)
              const mono = bindingKey === 'modelBaseURL' || bindingKey === 'keySource'

              return (
                <SummaryField
                  key={field.key}
                  label={field.label}
                  mono={mono}
                  value={value}
                />
              )
            })}
          </div>
        </div>
      </SidebarSection>
    </aside>
  )
}
