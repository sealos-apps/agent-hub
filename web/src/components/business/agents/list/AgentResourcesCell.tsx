import type { AgentListItem } from '../../../../domains/agents/types'
import { formatCpu, formatMemory, formatStorage } from '../../../../lib/format'

function ResourceMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px]/4.5 font-medium tracking-[0.06em] text-zinc-400">{label}</span>
      <span className="whitespace-nowrap text-[12px]/5 font-semibold tabular-nums text-zinc-900 sm:text-[13px]/5.5">
        {value}
      </span>
    </div>
  )
}

interface AgentResourcesCellProps {
  item: AgentListItem
}

export function AgentResourcesCell({ item }: AgentResourcesCellProps) {
  return (
    <div className="grid grid-cols-3 gap-2 py-0.5 pr-1 sm:gap-3 sm:pr-2 xl:gap-4 xl:pr-4">
      <ResourceMetric label="CPU" value={formatCpu(item.cpu)} />
      <ResourceMetric label="内存" value={formatMemory(item.memory)} />
      <ResourceMetric label="存储" value={formatStorage(item.storage)} />
    </div>
  )
}
