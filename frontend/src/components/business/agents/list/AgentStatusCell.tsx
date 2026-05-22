import type { AgentListItem } from '../../../../domains/agents/types'
import { StatusBadge } from '../../../ui/StatusBadge'

interface AgentStatusCellProps {
  item: AgentListItem
}

export function AgentStatusCell({ item }: AgentStatusCellProps) {
  return (
    <div className="flex min-w-0 flex-col items-start gap-1.5 py-0.5 pr-3">
      <StatusBadge compact status={item.status} />
    </div>
  )
}
