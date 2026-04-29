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
import type { ReactNode } from 'react'
import { translateStatus, useI18n } from '../../../i18n'
import { cn, formatCpu, formatMemory, formatStorage, formatTime } from '../../../lib/format'
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

function StatusFilterDropdown({
  allStatusesSelected,
  showSelectionLabel = true,
  statusFilter,
  statusFilterLabel,
  onStatusFilterChange,
}: {
  allStatusesSelected: boolean
  showSelectionLabel?: boolean
  statusFilter: AgentListStatusFilter
  statusFilterLabel: string
  onStatusFilterChange: (value: AgentListStatusFilter) => void
}) {
  const { t } = useI18n()
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex min-w-0 items-center gap-1 text-left font-medium transition hover:text-zinc-700 focus:outline-none"
            type="button"
          >
            <Filter className="h-4 w-4 text-zinc-400" />
            <span className="truncate font-medium">{t('agent.status')}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[180px] p-2" sideOffset={8}>
          <div className="px-2.5 pb-1.5 pt-1 text-[13px]/5 font-medium text-zinc-500">{t('agent.status')}</div>
          <DropdownMenuItem
            className={cn(
              'min-h-10 rounded-[8px] text-zinc-700',
              allStatusesSelected ? 'text-zinc-950' : '',
            )}
            onClick={() => onStatusFilterChange(STATUS_FILTER_OPTIONS)}
            onSelect={(event) => event.preventDefault()}
          >
            <span>{t('agent.allStatus')}</span>
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
                <span>{translateStatus(value, t)}</span>
                <span className="ml-auto flex h-4 w-4 items-center justify-center">
                  {active ? <Check className="h-4 w-4 text-blue-600" /> : null}
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {showSelectionLabel && !allStatusesSelected ? (
        <div className="mt-1 text-[11px]/4 font-medium text-blue-600">{statusFilterLabel}</div>
      ) : null}
    </>
  )
}

function CompactSortButton({
  active,
  children,
  icon,
  onClick,
}: {
  active: boolean
  children: ReactNode
  icon: ReactNode
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        'flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-[10px] border px-3 text-[13px] font-medium transition',
        active
          ? 'border-blue-200 bg-blue-50 text-blue-700'
          : 'border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
      )}
      onClick={onClick}
      type="button"
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  )
}

function CompactMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="min-w-0 rounded-[10px] border border-zinc-200/80 bg-zinc-50/80 px-3 py-2">
      <div className="text-[11px]/4 font-medium text-zinc-400">{label}</div>
      <div className="mt-0.5 truncate text-[14px]/5 font-semibold tabular-nums text-zinc-950">{value}</div>
    </div>
  )
}

function CompactAgentCard({
  item,
  onOpenDetail,
  onChat,
  onDelete,
  onEdit,
  onFiles,
  onTerminal,
  onToggleState,
  onWebUI,
}: {
  item: AgentListItem
  onOpenDetail: (item: AgentListItem) => void
  onChat: (item: AgentListItem) => void
  onDelete: (item: AgentListItem) => void
  onEdit: (item: AgentListItem) => void
  onFiles: (item: AgentListItem) => void
  onTerminal: (item: AgentListItem) => void
  onToggleState: (item: AgentListItem) => void
  onWebUI: (item: AgentListItem) => void
}) {
  const { t } = useI18n()
  return (
    <Card className="rounded-[16px] border-zinc-200/90 p-4 shadow-[0_1px_2px_rgba(24,24,27,0.03)]">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <AgentNameCell item={item} onOpenDetail={onOpenDetail} />
        </div>
        <div className="shrink-0 pt-0.5">
          <AgentStatusCell item={item} />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        <CompactMetric label="CPU" value={formatCpu(item.cpu)} />
        <CompactMetric label={t('agent.memory')} value={formatMemory(item.memory)} />
        <CompactMetric label={t('agent.storage')} value={formatStorage(item.storage)} />
      </div>

      <div className="mt-4 flex min-w-0 items-center justify-between gap-3 border-t border-zinc-100 pt-3">
        <div className="min-w-0 text-[12px]/5 text-zinc-500">
          <span className="text-zinc-400">{t('agent.update')}</span>
          <span className="ml-2 tabular-nums text-zinc-700">{formatTime(item.updatedAt)}</span>
        </div>
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
  )
}

function AgentListFooter({ total }: { total: number }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-3 text-[14px] text-zinc-500">
      <div>{t('common.total', { total })}</div>
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
        <div>{t('common.pageSize')}</div>
      </div>
    </div>
  )
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
  const { t } = useI18n()
  const allStatusesSelected = statusFilter.length === STATUS_FILTER_OPTIONS.length
  const statusFilterLabel =
    allStatusesSelected
      ? t('agent.allStatus')
      : statusFilter.length === 1
        ? translateStatus(statusFilter[0], t)
        : t('agent.selectedCount', { count: statusFilter.length })
  const tableGridClassName =
    'grid min-w-[936px] grid-cols-[minmax(188px,1.5fr)_minmax(124px,0.82fr)_minmax(160px,1fr)_minmax(136px,0.86fr)_minmax(232px,1fr)] items-center gap-4'

  if (!items.length) {
    return null
  }

  return (
    <section className="flex min-h-[320px] flex-1 flex-col">
      <div className="hidden min-h-0 flex-1 flex-col min-[960px]:flex">
        <Card className="overflow-hidden rounded-[12px] border-zinc-200/90 px-0 py-3.5 text-[14px]/5 text-zinc-500 shadow-[0_1px_2px_rgba(24,24,27,0.03)]">
          <div className="overflow-x-auto px-5 lg:px-6">
            <div className={tableGridClassName}>
              <button
                className="flex min-w-0 items-center gap-1 truncate pr-2 text-left font-medium transition hover:text-zinc-700"
                onClick={onToggleNameSort}
                type="button"
              >
                <ArrowUpAZ className="h-4 w-4 text-zinc-400" />
                <span className="font-medium">{t('agent.instance')}</span>
                {sortKey === 'name' ? (
                  <span className="shrink-0 text-[11px]/4 font-medium text-blue-600">
                    {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
                  </span>
                ) : null}
              </button>
              <div className="min-w-0 truncate pr-2">
                <StatusFilterDropdown
                  allStatusesSelected={allStatusesSelected}
                  onStatusFilterChange={onStatusFilterChange}
                  statusFilter={statusFilter}
                  statusFilterLabel={statusFilterLabel}
                />
              </div>
              <div className="min-w-0 truncate pr-2 font-medium">{t('agent.resourceSpec')}</div>
              <button
                className="flex min-w-0 items-center gap-1 truncate pr-2 text-left font-medium transition hover:text-zinc-700"
                onClick={onToggleUpdatedAtSort}
                type="button"
              >
                <ArrowUpWideNarrow className="h-4 w-4 text-blue-500" />
                <span className="font-medium">{t('agent.updatedAt')}</span>
                {sortKey === 'updatedAt' ? (
                  <span className="shrink-0 text-[11px]/4 font-medium text-blue-600">
                    {sortOrder === 'asc' ? t('agent.earliest') : t('agent.latest')}
                  </span>
                ) : null}
              </button>
              <div className="min-w-0 truncate text-left font-medium">{t('agent.actions')}</div>
            </div>
          </div>
        </Card>

        <div className="mt-3 min-h-0 flex-1 overflow-x-auto">
          <div className="flex min-h-full min-w-[936px] flex-col gap-3.5">
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

        <AgentListFooter total={items.length} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col min-[960px]:hidden">
        <Card className="rounded-[14px] border-zinc-200/90 p-3 shadow-[0_1px_2px_rgba(24,24,27,0.03)]">
          <div className="grid grid-cols-3 gap-2">
            <div className="flex h-10 min-w-0 items-center justify-center rounded-[10px] border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-600">
              <StatusFilterDropdown
                allStatusesSelected={allStatusesSelected}
                onStatusFilterChange={onStatusFilterChange}
                showSelectionLabel={false}
                statusFilter={statusFilter}
                statusFilterLabel={statusFilterLabel}
              />
            </div>
            <CompactSortButton
              active={sortKey === 'name'}
              icon={<ArrowUpAZ className="h-4 w-4" />}
              onClick={onToggleNameSort}
            >
              {sortKey === 'name' ? (sortOrder === 'asc' ? t('agent.sortNameAsc') : t('agent.sortNameDesc')) : t('agent.sortName')}
            </CompactSortButton>
            <CompactSortButton
              active={sortKey === 'updatedAt'}
              icon={<ArrowUpWideNarrow className="h-4 w-4" />}
              onClick={onToggleUpdatedAtSort}
            >
              {sortKey === 'updatedAt' ? (sortOrder === 'asc' ? t('agent.sortEarliest') : t('agent.sortLatest')) : t('agent.sortUpdated')}
            </CompactSortButton>
          </div>
        </Card>

        <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <CompactAgentCard
                item={item}
                key={item.id}
                onChat={onChat}
                onDelete={onDelete}
                onEdit={onEdit}
                onFiles={onFiles}
                onOpenDetail={onOpenDetail}
                onTerminal={onTerminal}
                onToggleState={onToggleState}
                onWebUI={onWebUI}
              />
            ))}
          </div>
        </div>

        <AgentListFooter total={items.length} />
      </div>
    </section>
  )
}
