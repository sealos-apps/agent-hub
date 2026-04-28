import {
  PauseCircle,
  PlayCircle,
  Settings,
  Terminal,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../../../../components/ui/Button'
import type { AgentListItem } from '../../../../domains/agents/types'

interface AgentDetailHeaderProps {
  item: AgentListItem
  onOpenTerminalWindow: () => void
  onDelete: () => void
  onOpenConfig: () => void
  onToggleState: () => void
  extraActions?: ReactNode
}

const detailIconButtonClassName =
  'h-10 w-10 rounded-[8px] border-[#e4e4e7] bg-white px-0 text-[#737373] shadow-[0_1px_1px_rgba(0,0,0,0.05)] hover:border-[#d4d4d8] hover:bg-white hover:text-[#525252]'
const detailSegmentButtonClassName =
  'h-10 w-[88px] rounded-none border-0 px-4 text-[14px] font-medium leading-5 text-[#18181b] shadow-none hover:bg-zinc-50'

export function AgentDetailHeader({
  item,
  onOpenTerminalWindow,
  onDelete,
  onOpenConfig,
  onToggleState,
  extraActions,
}: AgentDetailHeaderProps) {
  const toggleLabel = item.status === 'running' ? '暂停' : '启动'
  const toggleDisabled = item.status === 'creating'
  const toggleTitle = toggleDisabled ? '实例创建中，暂时不可切换状态' : toggleLabel
  const primaryAction = {
    label: '控制台',
    icon: Terminal,
    onClick: onOpenTerminalWindow,
    disabled: !item.terminalAvailable,
    title: item.terminalAvailable ? '打开控制台' : item.terminalDisabledReason || '控制台不可用',
  }

  return (
    <header className="flex w-full flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[9px] border border-[var(--color-border)] bg-[#f7f9fd]">
            <img
              alt={`${item.template.name} logo`}
              className="h-7 w-7 object-cover"
              src={item.template.logo}
            />
          </div>
          <div className="truncate text-[22px]/7 font-semibold text-[#151b2d]">
            {item.aliasName || item.name}
          </div>
        </div>
      </div>

      <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-3 lg:w-auto lg:flex-nowrap lg:justify-end">
        {extraActions}

        <Button
          className={detailIconButtonClassName}
          onClick={onDelete}
          size="md"
          title="删除"
          type="button"
          variant="secondary"
        >
          <Trash2 className="h-4 w-4 shrink-0" />
        </Button>

        <div className="flex items-center overflow-hidden rounded-[8px] border border-[#e4e4e7] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
          <Button
            className={detailSegmentButtonClassName}
            disabled={toggleDisabled}
            onClick={onToggleState}
            size="md"
            title={toggleTitle}
            type="button"
            variant="secondary"
          >
            {item.status === 'running' ? <PauseCircle className="h-4 w-4" /> : <PlayCircle className="h-4 w-4" />}
            {toggleLabel}
          </Button>
          <Button
            className={`${detailSegmentButtonClassName} border-l border-[#e4e4e7]`}
            onClick={onOpenConfig}
            size="md"
            title="配置"
            type="button"
            variant="secondary"
          >
            <Settings className="h-4 w-4" />
            配置
          </Button>
        </div>

        <Button
          className="h-10 min-w-[88px] rounded-[10px] px-4 text-[14px] leading-5 font-semibold text-white"
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
          size="md"
          title={primaryAction.title}
          type="button"
          variant="primary"
        >
          <primaryAction.icon className="h-4 w-4" />
          {primaryAction.label}
        </Button>
      </div>
    </header>
  )
}
