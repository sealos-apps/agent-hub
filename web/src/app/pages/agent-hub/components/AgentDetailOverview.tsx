import {
  Copy,
  Cpu,
  Database,
  HardDrive,
  Server,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { StatusBadge } from '../../../../components/ui/StatusBadge'
import { formatModelProviderLabel } from '../../../../domains/agents/aiproxy'
import type { AgentListItem } from '../../../../domains/agents/types'
import { cn, formatTime } from '../../../../lib/format'

function copyText(value: string, onErrorMessage?: (message: string) => void) {
  if (!value || typeof navigator === 'undefined' || !navigator.clipboard) {
    onErrorMessage?.('当前环境不支持复制到剪贴板')
    return
  }
  void navigator.clipboard.writeText(value).catch(() => onErrorMessage?.('复制失败，请手动复制'))
}

function formatKeySourceLabel(value = '') {
  if (!value) return '--'
  const normalized = String(value).trim().toLowerCase()
  if (!normalized || normalized === 'unset') return '未准备'
  if (normalized === 'workspace-aiproxy') return '由工作区提供'
  return value
}

function getWorkspaceEntry(item: AgentListItem) {
  if (item.chatAvailable && item.terminalAvailable) return '对话 / 控制台'
  if (item.chatAvailable) return '对话'
  if (item.terminalAvailable) return '控制台'
  return '初始化阶段'
}

function OverviewPanel({
  title,
  extra,
  className,
  children,
}: {
  title: string
  extra?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'workbench-card min-w-0 overflow-hidden rounded-[12px] border-[#e5e7eb] bg-white p-0 shadow-[0_1px_2px_rgba(15,23,42,0.04)]',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3.5 px-5 py-4">
        <div className="flex min-w-0 items-center justify-between gap-4 border-b border-[#f0f0f1] pb-3">
          <div className="min-w-0">
            <div className="text-[17px]/6 font-semibold text-[#18181b]">{title}</div>
          </div>
          {extra ? <div className="shrink-0">{extra}</div> : null}
        </div>
        {children}
      </div>
    </section>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Cpu
  label: string
  value: string
  detail?: string
}) {
  return (
    <div className="min-w-0 rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-3.5 py-3">
      <div className="flex items-center gap-2 text-[12px]/4 text-[#71717a]">
        <Icon className="h-3.5 w-3.5 shrink-0 text-[#52525b]" />
        <span>{label}</span>
      </div>
      <div className="mt-1.5 truncate text-[17px]/6 font-semibold tabular-nums text-[#18181b]">{value || '--'}</div>
      {detail ? <div className="mt-1 truncate text-[12px]/4 text-[#a1a1aa]">{detail}</div> : null}
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-4 border-t border-[#f0f0f1] py-2.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="shrink-0 text-[13px]/5 text-[#71717a]">{label}</div>
      <div
        className={cn(
          'min-w-0 text-right text-[13px]/5 font-medium text-[#27272a]',
          mono && 'break-all font-mono text-[12px] font-normal text-[#52525b]',
        )}
      >
        {value || '--'}
      </div>
    </div>
  )
}

function CompactField({
  label,
  value,
  mono = false,
  className,
}: {
  label: string
  value: string
  mono?: boolean
  className?: string
}) {
  return (
    <div className={cn('min-w-0 rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-3.5 py-3', className)}>
      <div className="text-[12px]/4 text-[#71717a]">{label}</div>
      <div
        className={cn(
          'mt-1.5 min-w-0 truncate text-[13px]/5 font-medium text-[#27272a]',
          mono && 'break-all font-mono text-[12px] font-normal text-[#52525b]',
        )}
      >
        {value || '--'}
      </div>
    </div>
  )
}

function StatusPill({
  tone,
  children,
}: {
  tone: 'active' | 'pending' | 'muted'
  children: ReactNode
}) {
  const className = {
    active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    muted: 'border-zinc-200 bg-zinc-50 text-zinc-600',
  }[tone]

  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-[7px] border px-2 text-[11px]/4 font-medium',
        className,
      )}
    >
      {children}
    </span>
  )
}

function InstanceSummaryCard({
  item,
  internalURL,
  onErrorMessage,
}: {
  item: AgentListItem
  internalURL: string
  onErrorMessage?: (message: string) => void
}) {
  const statusSummary = item.ready
    ? item.bootstrapPhase || 'ready'
    : item.bootstrapPhase || item.bootstrapMessage || 'initializing'

  return (
    <OverviewPanel
      extra={(
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <StatusBadge compact status={item.status} />
          <StatusPill tone={item.ready ? 'active' : 'pending'}>
            {item.ready ? '已就绪' : '准备中'}
          </StatusPill>
        </div>
      )}
      title="实例概览"
    >
      <div className="grid min-w-0 gap-3 min-[980px]:grid-cols-[minmax(260px,0.92fr)_minmax(330px,1.12fr)_minmax(300px,1fr)]">
        <div className="flex min-w-0 flex-col justify-between gap-3 rounded-[11px] border border-[#e5e7eb] bg-white px-4 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[11px] border bg-white"
              style={{
                borderColor: `${item.template.brandColor}2d`,
                backgroundColor: `${item.template.brandColor}0f`,
              }}
            >
              <img
                alt={`${item.template.name} logo`}
                className="h-8 w-8 object-cover"
                src={item.template.logo}
              />
            </div>
            <div className="min-w-0">
              <div className="truncate text-[18px]/6 font-semibold text-[#18181b]">
                {item.aliasName || item.name}
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-[12px]/4 text-[#71717a]">
                <span className="truncate font-mono">{item.name}</span>
                <span className="h-1 w-1 rounded-full bg-[#d4d4d8]" />
                <span>{item.template.name}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <CompactField label="运行阶段" mono value={statusSummary} />
            <CompactField label="最近同步" value={formatTime(item.updatedAt)} />
          </div>
        </div>

        <div className="grid min-w-0 gap-3 sm:grid-cols-3 min-[980px]:grid-cols-1 min-[1260px]:grid-cols-3">
          <StatTile detail="CPU" icon={Cpu} label="计算" value={item.cpu} />
          <StatTile detail="Memory" icon={Database} label="内存" value={item.memory} />
          <StatTile detail="Storage" icon={HardDrive} label="存储" value={item.storage} />
        </div>

        <div className="grid min-w-0 gap-0 rounded-[11px] border border-[#e5e7eb] px-4 py-3">
          <DetailRow label="命名空间" mono value={item.namespace} />
          <DetailRow label="工作目录" mono value={item.workingDir || '--'} />
          <DetailRow label="能力入口" value={getWorkspaceEntry(item)} />
        </div>
      </div>

      <div className="rounded-[11px] border border-[#e5e7eb] bg-[#fafafa] px-3.5 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px]/5 text-[#71717a]">集群内服务地址</div>
          <button
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[#71717a] transition hover:bg-white hover:text-[#18181b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#18181b]"
            onClick={() => copyText(internalURL, onErrorMessage)}
            title="复制服务地址"
            type="button"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-1.5 break-all font-mono text-[12px]/5 text-[#3f3f46]">{internalURL}</div>
      </div>
    </OverviewPanel>
  )
}

function ModelEnvironmentCard({ item }: { item: AgentListItem }) {
  return (
    <OverviewPanel
      extra={(
        <span className="inline-flex h-7 items-center rounded-[7px] border border-[#e5e7eb] bg-[#fafafa] px-2.5 text-[12px]/4 font-medium text-[#3f3f46]">
          {item.hasModelAPIKey ? '密钥已配置' : '密钥未配置'}
        </span>
      )}
      title="模型环境"
    >
      <div className="grid min-w-0 gap-3 min-[980px]:grid-cols-[minmax(260px,0.85fr)_minmax(260px,0.85fr)_minmax(360px,1.3fr)]">
        <div className="flex min-w-0 items-start gap-3 rounded-[11px] border border-[#e5e7eb] bg-white px-3.5 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#f4f4f5] text-[#3f3f46]">
            <Server className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px]/6 font-semibold text-[#18181b]">
              {item.model || '--'}
            </div>
            <div className="mt-1 text-[13px]/5 text-[#71717a]">
              {formatModelProviderLabel(item.modelProvider)}
            </div>
          </div>
        </div>

        <div className="grid min-w-0 gap-0 rounded-[11px] border border-[#e5e7eb] px-4 py-3">
          <DetailRow label="模型渠道" value={formatModelProviderLabel(item.modelProvider)} />
          <DetailRow label="密钥来源" value={formatKeySourceLabel(item.keySource)} />
        </div>

        <CompactField className="bg-white" label="Base URL" mono value={item.modelBaseURL || '--'} />
      </div>
    </OverviewPanel>
  )
}

export function AgentDetailOverview({
  item,
  onErrorMessage,
}: {
  item: AgentListItem
  onErrorMessage?: (message: string) => void
}) {
  const internalURL = `${item.name}.${item.namespace}.svc.cluster.local:${item.template.port}`

  return (
    <div className="flex w-full min-w-0 flex-col gap-3 pb-1 pr-1">
      <InstanceSummaryCard internalURL={internalURL} item={item} onErrorMessage={onErrorMessage} />
      <ModelEnvironmentCard item={item} />
    </div>
  )
}
