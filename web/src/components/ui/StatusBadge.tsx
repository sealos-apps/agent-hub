import { getStatusText } from '../../domains/agents/templates'
import { cn } from '../../lib/format'
import type { AgentRuntimeStatus } from '../../domains/agents/types'

const badgeClassName: Record<AgentRuntimeStatus, string> = {
  running: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  creating: 'border-amber-200 bg-amber-50 text-amber-700',
  stopped: 'border-slate-200 bg-slate-50 text-slate-700',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
}

const dotClassName: Record<AgentRuntimeStatus, string> = {
  running: 'bg-emerald-500',
  creating: 'bg-amber-500',
  stopped: 'bg-slate-400',
  error: 'bg-rose-500',
}

interface StatusBadgeProps {
  status: AgentRuntimeStatus
  compact?: boolean
}

export function StatusBadge({ status, compact = false }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        compact
          ? 'inline-flex min-h-[23px] items-center gap-1.5 rounded-full border px-2.5 text-[12px]/4 font-semibold'
          : 'inline-flex min-h-7 items-center gap-2 rounded-md border px-2.5 text-xs/4 font-semibold',
        badgeClassName[status],
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dotClassName[status])} />
      {getStatusText(status)}
    </span>
  )
}
