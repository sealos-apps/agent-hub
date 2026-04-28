import type { AgentListItem } from '../../../../domains/agents/types'

interface AgentNameCellProps {
  item: AgentListItem
  onOpenDetail: (item: AgentListItem) => void
}

export function AgentNameCell({
  item,
  onOpenDetail,
}: AgentNameCellProps) {
  return (
    <div className="flex min-w-0 items-center gap-3.5 pr-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border-[0.5px] border-zinc-200 bg-zinc-50/90">
        <img
          alt={`${item.template.name} logo`}
          className="h-9 w-9 object-cover"
          src={item.template.logo}
        />
      </div>
      <div className="min-w-0 flex-1">
        <button
          className="block max-w-full truncate text-left text-[14px]/5 font-medium tracking-[-0.01em] text-zinc-950 transition hover:text-blue-600"
          onClick={() => onOpenDetail(item)}
          type="button"
        >
          {item.aliasName || item.name}
        </button>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[12px]/4 text-zinc-500">
          <span className="truncate">{item.template.name}</span>
          <span className="shrink-0 text-zinc-300">/</span>
          <span className="truncate font-mono text-[11px]/4 text-zinc-400">{item.name}</span>
        </div>
      </div>
    </div>
  )
}
