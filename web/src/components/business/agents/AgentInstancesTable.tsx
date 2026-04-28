import {
  ArrowUpAZ,
  ChevronDown,
  Check,
  ArrowUpWideNarrow,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Filter,
} from 'lucide-react'
import { getStatusText } from '../../../domains/agents/templates'
import { cn, formatTime } from '../../../lib/format'
import type { AgentListItem, AgentRuntimeStatus } from '../../../domains/agents/types'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../ui/DropdownMenu'
import { AgentActionsCell } from './list/AgentActionsCell'
import { AgentNameCell } from './list/AgentNameCell'
import { AgentResourcesCell } from './list/AgentResourcesCell'
import { AgentStatusCell } from './list/AgentStatusCell'

export type AgentListSortKey = 'name' | 'updatedAt'
export type AgentListSortOrder = 'asc' | 'desc'
export type AgentListStatusFilter = AgentRuntimeStatus[]

const STATUS_FILTER_OPTIONS: AgentRuntimeStatus[] = ['running', 'creating', 'stopped', 'error']
const STATUS_FILTER_DOT_CLASSNAME: Record<AgentRuntimeStatus, string> = {
  running: 'bg-emerald-500',
  creating: 'bg-amber-400',
  stopped: 'bg-rose-500',
  error: 'bg-violet-400',
}

interface AgentInstancesTableProps {
  items: AgentListItem[]
  sortKey: AgentListSortKey
  sortOrder: AgentListSortOrder
  statusFilter: AgentListStatusFilter
  onToggleNameSort: () => void
  onToggleUpdatedAtSort: () => void
  onStatusFilterChange: (value: AgentListStatusFilter) => void
  onOpenDetail: (item: AgentListItem) => void
  onChat: (item: AgentListItem) => void
  onFiles: (item: AgentListItem) => void
  onTerminal: (item: AgentListItem) => void
  onWebUI: (item: AgentListItem) => void
  onToggleState: (item: AgentListItem) => void
  onEdit: (item: AgentListItem) => void
  onDelete: (item: AgentListItem) => void
}

export function AgentInstancesTable({
  items,
  sortKey,
  sortOrder,
  statusFilter,
  onToggleNameSort,
  onToggleUpdatedAtSort,
  onStatusFilterChange,
  onOpenDetail,
  onChat,
  onFiles,
  onTerminal,
  onWebUI,
  onToggleState,
  onEdit,
  onDelete,
}: AgentInstancesTableProps) {
  const allStatusesSelected = statusFilter.length === STATUS_FILTER_OPTIONS.length
  const statusFilterLabel =
    allStatusesSelected
      ? '全部状态'
      : statusFilter.length === 1
        ? getStatusText(statusFilter[0])
        : `已选 ${statusFilter.length} 项`
  const tableGridClassName =
    'grid min-w-[892px] grid-cols-[minmax(188px,1.5fr)_minmax(124px,0.82fr)_minmax(160px,1fr)_minmax(136px,0.86fr)_minmax(188px,1fr)] items-center gap-4'

  if (!items.length) {
    return null
  }

  return (
    <section className="flex min-h-[320px] flex-1 flex-col">
      <Card className="overflow-hidden rounded-[12px] border-zinc-200/90 px-0 py-3.5 text-[14px]/5 text-zinc-500 shadow-[0_1px_2px_rgba(24,24,27,0.03)]">
        <div className="overflow-x-auto px-5 lg:px-6">
          <div className={tableGridClassName}>
          <button
            className="flex min-w-0 items-center gap-1 truncate pr-2 text-left transition hover:text-zinc-700"
            onClick={onToggleNameSort}
            type="button"
          >
            <ArrowUpAZ className="h-4 w-4 text-zinc-400" />
            <span>实例</span>
            {sortKey === 'name' ? (
              <span className="shrink-0 text-[11px]/4 font-medium text-blue-600">
                {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
              </span>
            ) : null}
          </button>
          <div className="min-w-0 truncate pr-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex min-w-0 items-center gap-1 text-left transition hover:text-zinc-700 focus:outline-none"
                  type="button"
                >
                  <Filter className="h-4 w-4 text-zinc-400" />
                  <span className="truncate">状态</span>
                  <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[180px] p-2" sideOffset={8}>
                <div className="px-2.5 pb-1.5 pt-1 text-[13px]/5 font-medium text-zinc-500">状态</div>
                <DropdownMenuItem
                  className={cn(
                    'min-h-10 rounded-[8px] text-zinc-700',
                    allStatusesSelected ? 'text-zinc-950' : '',
                  )}
                  onClick={() => onStatusFilterChange(STATUS_FILTER_OPTIONS)}
                  onSelect={(event) => event.preventDefault()}
                >
                  <span>全部状态</span>
                  <span className="ml-auto flex h-4 w-4 items-center justify-center">
                    {allStatusesSelected ? <Check className="h-4 w-4 text-blue-600" /> : null}
                  </span>
                </DropdownMenuItem>
                {STATUS_FILTER_OPTIONS.map((value) => {
                  const active = statusFilter.includes(value)
                  return (
                    <DropdownMenuItem
                      className={cn(
                        'min-h-10 rounded-[8px] text-zinc-700',
                        active ? 'text-zinc-950' : '',
                      )}
                      key={value}
                      onSelect={(event) => event.preventDefault()}
                      onClick={() =>
                        onStatusFilterChange(
                          active
                            ? statusFilter.filter((item) => item !== value)
                            : [...statusFilter, value],
                        )
                      }
                    >
                      <span className={cn('h-2 w-2 rounded-[2px]', STATUS_FILTER_DOT_CLASSNAME[value])} />
                      <span>{getStatusText(value)}</span>
                      <span className="ml-auto flex h-4 w-4 items-center justify-center">
                        {active ? <Check className="h-4 w-4 text-blue-600" /> : null}
                      </span>
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            {!allStatusesSelected ? (
              <div className="mt-1 text-[11px]/4 font-medium text-blue-600">{statusFilterLabel}</div>
            ) : null}
          </div>
          <div className="min-w-0 truncate pr-2">资源规格</div>
          <button
            className="flex min-w-0 items-center gap-1 truncate pr-2 text-left transition hover:text-zinc-700"
            onClick={onToggleUpdatedAtSort}
            type="button"
          >
            <ArrowUpWideNarrow className="h-4 w-4 text-blue-500" />
            <span>更新时间</span>
            {sortKey === 'updatedAt' ? (
              <span className="shrink-0 text-[11px]/4 font-medium text-blue-600">
                {sortOrder === 'asc' ? '最早' : '最新'}
              </span>
            ) : null}
          </button>
            <div className="min-w-0 truncate text-left">操作</div>
          </div>
        </div>
      </Card>

      <div className="mt-3 min-h-0 flex-1 overflow-x-auto">
        <div className="flex min-h-full min-w-[892px] flex-col gap-3.5">
          {items.map((item) => (
            <Card
              className={`${tableGridClassName} group min-h-[84px] rounded-[14px] border-zinc-200/90 px-5 py-4 transition-colors hover:bg-zinc-50 lg:px-6`}
              key={item.id}
            >
              <div className="min-w-0">
                <AgentNameCell item={item} onOpenDetail={onOpenDetail} />
              </div>
              <div className="min-w-0">
                <AgentStatusCell item={item} />
              </div>
              <div className="min-w-0">
                <AgentResourcesCell item={item} />
              </div>
              <div className="min-w-0 truncate pr-2 text-[13px]/5 tabular-nums text-zinc-500">
                {formatTime(item.updatedAt)}
              </div>
              <div className="min-w-0">
                <AgentActionsCell
                  item={item}
                  onChat={onChat}
                  onDelete={onDelete}
                  onEdit={onEdit}
                  onFiles={onFiles}
                  onOpenDetail={onOpenDetail}
                  onTerminal={onTerminal}
                  onToggleState={onToggleState}
                  onWebUI={onWebUI}
                />
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-[14px] text-zinc-500">
        <div>总计：{items.length}</div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <Button
              className="h-8 w-8 rounded-full px-0 text-zinc-400 shadow-none"
              disabled
              size="sm"
              type="button"
              variant="secondary"
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              className="h-8 w-8 rounded-full px-0 text-zinc-400 shadow-none"
              disabled
              size="sm"
              type="button"
              variant="secondary"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </div>
          <div>
            <span className="font-medium text-zinc-900">1</span>
            <span className="px-2">/</span>
            <span>1</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="h-8 w-8 rounded-full px-0 text-zinc-900 shadow-none"
              disabled
              size="sm"
              type="button"
              variant="secondary"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              className="h-8 w-8 rounded-full px-0 text-zinc-900 shadow-none"
              disabled
              size="sm"
              type="button"
              variant="secondary"
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
          <div>30 /页</div>
        </div>
      </div>
    </section>
  )
}
