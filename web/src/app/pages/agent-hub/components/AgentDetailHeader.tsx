import {
  Check,
  ChevronDown,
  Copy,
  MoreVertical,
  PauseCircle,
  PlayCircle,
  Settings,
  Terminal,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../../../../components/ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../components/ui/DropdownMenu'
import { StatusBadge } from '../../../../components/ui/StatusBadge'
import type { AgentListItem } from '../../../../domains/agents/types'

interface AgentDetailHeaderProps {
  item: AgentListItem
  onOpenTerminalWindow: () => void
  onDelete: () => void
  onOpenConfig: () => void
  configActionDisabled?: boolean
  configEditing?: boolean
  onToggleState: () => void
  extraActions?: ReactNode
}

const detailActionButtonClassName =
  'h-10 min-w-[104px] rounded-[10px] border-[#dfe5ee] bg-white px-4 text-[14px] font-medium leading-5 text-[#18181b] shadow-[0_1px_1px_rgba(15,23,42,0.04)] hover:border-[#cfd8e6] hover:bg-[#f8fafc]'

function copyText(value: string) {
  if (!value || typeof navigator === 'undefined' || !navigator.clipboard) return
  void navigator.clipboard.writeText(value)
}

export function AgentDetailHeader({
  item,
  onOpenTerminalWindow,
  onDelete,
  onOpenConfig,
  configActionDisabled = false,
  configEditing = false,
  onToggleState,
  extraActions,
}: AgentDetailHeaderProps) {
  const toggleLabel = item.status === 'running' ? '暂停实例' : '启动实例'
  const toggleDisabled = item.status === 'creating'
  const toggleTitle = toggleDisabled ? '实例创建中，暂时不可切换状态' : toggleLabel
  const primaryAction = {
    label: '进入控制台',
    icon: Terminal,
    onClick: onOpenTerminalWindow,
    disabled: !item.terminalAvailable,
    title: item.terminalAvailable ? '打开控制台' : item.terminalDisabledReason || '控制台不可用',
  }

  return (
    <header className="my-4 flex w-full flex-row items-center justify-between gap-4 rounded-[18px] border border-[#dde5f0] bg-white px-5 py-4 shadow-[0_18px_44px_rgba(35,48,76,0.08)]">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex h-[60px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-[15px] border border-[#dfe6f0] bg-[#f7f9fd] shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
          <img
            alt={`${item.template.name} logo`}
            className="h-11 w-11 object-cover"
            src={item.template.logo}
          />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="truncate text-[24px]/7 font-semibold text-[#111827]">
              {item.aliasName || item.name}
            </div>
            <StatusBadge compact status={item.status} />
          </div>
          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-5 gap-y-1 text-[13px]/5 text-[#657084]">
            <span className="inline-flex items-center gap-1.5">
              实例 ID: <span className="font-mono text-[#111827]">{item.name}</span>
              <button
                aria-label="复制实例 ID"
                className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                onClick={() => copyText(item.name)}
                type="button"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </span>
            <span className="inline-flex items-center gap-1.5">
              命名空间: <span className="font-mono text-[#111827]">{item.namespace}</span>
              <button
                aria-label="复制命名空间"
                className="inline-flex h-5 w-5 items-center justify-center rounded-[5px] text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                onClick={() => copyText(item.namespace)}
                type="button"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
            </span>
            <span className="inline-flex min-w-0 items-center gap-1.5">
              模型: <span className="truncate font-medium text-[#111827]">{item.model || '--'}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="flex w-auto shrink-0 flex-nowrap items-center justify-end gap-2.5">
        {extraActions}

        <Button
          className="h-10 min-w-[116px] rounded-[10px] px-4 text-[14px] leading-5 font-semibold text-white shadow-[0_12px_24px_rgba(17,24,39,0.18)]"
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

        <Button
          className={detailActionButtonClassName}
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
          className={detailActionButtonClassName}
          disabled={configActionDisabled}
          onClick={onOpenConfig}
          size="md"
          title={configEditing ? '保存' : '变更'}
          type="button"
          variant="secondary"
        >
          {configEditing ? <Check className="h-4 w-4" /> : <Settings className="h-4 w-4" />}
          {configEditing ? '保存配置' : '修改配置'}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className="h-10 min-w-[104px] rounded-[10px] border-[#dfe5ee] bg-white px-4 text-[14px] font-medium leading-5 text-[#18181b] shadow-[0_1px_1px_rgba(15,23,42,0.04)] hover:border-[#cfd8e6] hover:bg-[#f8fafc]"
              size="md"
              title="更多操作"
              type="button"
              variant="secondary"
            >
              <MoreVertical className="h-4 w-4" />
              更多
              <ChevronDown className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[180px]">
            <DropdownMenuItem destructive onSelect={onDelete}>
              <Trash2 className="h-4 w-4" />
              删除实例
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
