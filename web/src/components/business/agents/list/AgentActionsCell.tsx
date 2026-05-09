import {
  Bot,
  Ellipsis,
  FolderOpen,
  Globe,
  PauseCircle,
  PlayCircle,
  Settings,
  Terminal,
  Trash2,
} from 'lucide-react'
import { getAccessItem, getActionItem } from '../../../../domains/agents/mappers'
import type { AgentListItem } from '../../../../domains/agents/types'
import { useI18n } from '../../../../i18n'
import { cn } from '../../../../lib/format'
import { Button } from '../../../ui/Button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../../ui/DropdownMenu'

interface AgentActionsCellProps {
  item: AgentListItem
  layout?: 'default' | 'mobileCard'
  onChat: (item: AgentListItem) => void
  onFiles: (item: AgentListItem) => void
  onTerminal: (item: AgentListItem) => void
  onToggleState: (item: AgentListItem) => void
  onEdit: (item: AgentListItem) => void
  onDelete: (item: AgentListItem) => void
  onWebUI: (item: AgentListItem) => void
}

const hiddenMenuActionKeys = new Set(['chat', 'terminal', 'files'])

export function AgentActionsCell({
  item,
  layout = 'default',
  onChat,
  onFiles,
  onTerminal,
  onToggleState,
  onEdit,
  onDelete,
  onWebUI,
}: AgentActionsCellProps) {
  const { t } = useI18n()
  const isMobileCardLayout = layout === 'mobileCard'
  const chatAction = getActionItem(item, 'open-chat')
  const terminalAction = getActionItem(item, 'open-terminal')
  const filesAction = getActionItem(item, 'open-files')
  const settingsAction = getActionItem(item, 'open-settings')
  const runAction = getActionItem(item, 'run')
  const pauseAction = getActionItem(item, 'pause')
  const deleteAction = getActionItem(item, 'delete')
  const webUIAccess = getAccessItem(item, 'web-ui')

  const canChat = Boolean(chatAction?.enabled && item.chatAvailable)
  const canFiles = Boolean(filesAction?.enabled && getAccessItem(item, 'files')?.enabled)
  const canTerminal = Boolean(terminalAction?.enabled && item.terminalAvailable)
  const canWebUI = Boolean(webUIAccess?.enabled)
  const canEdit = Boolean(settingsAction?.enabled)
  const canToggleState = Boolean(runAction?.enabled || pauseAction?.enabled)
  const toggleTitle = pauseAction?.enabled ? t('agent.pause') : runAction?.enabled ? t('agent.start') : t('agent.currentStatusCannotToggle')

  const menuItems = [
    chatAction || getAccessItem(item, 'api')
      ? {
      key: 'chat',
      label: t('agent.chat'),
      icon: Bot,
      disabled: !canChat,
      title: chatAction?.reason || item.chatDisabledReason || t('agent.chatUnavailable'),
      onClick: () => onChat(item),
    }
      : null,
    terminalAction || getAccessItem(item, 'terminal')
      ? {
      key: 'terminal',
      label: t('agent.console'),
      icon: Terminal,
      disabled: !canTerminal,
      title: terminalAction?.reason || item.terminalDisabledReason || t('agent.terminalUnavailable'),
      onClick: () => onTerminal(item),
    }
      : null,
    filesAction || getAccessItem(item, 'files')
      ? {
      key: 'files',
      label: t('agent.files'),
      icon: FolderOpen,
      disabled: !canFiles,
      title: filesAction?.reason || t('agent.filesUnavailable'),
      onClick: () => onFiles(item),
    }
      : null,
    webUIAccess
      ? {
      key: 'web-ui',
      label: 'Web UI',
      icon: Globe,
      disabled: !canWebUI,
      title: webUIAccess?.reason || t('agent.webUIUnavailable'),
      onClick: () => onWebUI(item),
    }
      : null,
    runAction || pauseAction
      ? {
      key: 'toggle',
      label: toggleTitle,
      icon: pauseAction?.enabled ? PauseCircle : PlayCircle,
      disabled: !canToggleState,
      title: pauseAction?.reason || runAction?.reason || toggleTitle,
      onClick: () => onToggleState(item),
    }
      : null,
    deleteAction
      ? {
      key: 'delete',
      label: t('common.delete'),
      icon: Trash2,
      disabled: !deleteAction?.enabled,
      title: deleteAction?.reason || t('common.delete'),
      destructive: true,
      onClick: () => onDelete(item),
    }
      : null,
  ]
    .filter((menuItem): menuItem is NonNullable<typeof menuItem> => Boolean(menuItem))
    .filter((menuItem) => !hiddenMenuActionKeys.has(menuItem.key))

  const renderDropdownContent = () => (
    <DropdownMenuContent className="w-[196px]" sideOffset={8}>
      {menuItems.map((menuItem, index) => {
        const Icon = menuItem.icon

        return (
          <div key={menuItem.key}>
            {index > 0 && menuItem.destructive ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              destructive={menuItem.destructive}
              disabled={menuItem.disabled}
              onClick={menuItem.onClick}
              title={menuItem.title}
            >
              <Icon size={15} />
              <span>{menuItem.label}</span>
            </DropdownMenuItem>
          </div>
        )
      })}
    </DropdownMenuContent>
  )

  return (
    <div
      className={cn(
        'relative whitespace-nowrap',
        isMobileCardLayout
          ? 'grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_40px] items-center gap-2'
          : 'inline-flex min-w-[232px] flex-nowrap items-center justify-start gap-2',
      )}
    >
      <button
        className={cn(
          'inline-flex h-10 items-center justify-center gap-2 rounded-[8px] bg-zinc-950 px-3 text-[14px]/5 font-semibold text-white shadow-[0_1px_2px_rgba(24,24,27,0.18)] transition hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50',
          isMobileCardLayout ? 'w-full min-w-0' : 'w-[104px] shrink-0',
        )}
        disabled={!canTerminal}
        onClick={() => onTerminal(item)}
        title={terminalAction?.reason || item.terminalDisabledReason || t('agent.terminalUnavailable')}
        type="button"
      >
        <Terminal className="h-5 w-5 shrink-0 text-white" strokeWidth={2} />
        <span>{t('agent.console')}</span>
      </button>
      <Button
        className={cn(
          'h-10 rounded-[8px] border-0 bg-zinc-100 px-4 py-2 text-[14px]/5 font-semibold text-zinc-900 shadow-none hover:bg-zinc-200/60',
          isMobileCardLayout ? 'w-full min-w-0' : 'min-w-[72px] shrink-0',
        )}
        disabled={!canEdit}
        onClick={() => onEdit(item)}
        size="sm"
        title={settingsAction?.reason || t('agent.editConfig')}
        type="button"
        variant="secondary"
      >
        <Settings className="h-4 w-4 shrink-0" strokeWidth={2} />
        <span>{t('common.config')}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="h-10 w-10 shrink-0 rounded-[8px] border-0 bg-transparent px-0 text-zinc-600 shadow-none outline-none ring-0 hover:bg-zinc-100 hover:text-zinc-900 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
            size="sm"
            title={t('common.moreActions')}
            type="button"
            variant="secondary"
          >
            <Ellipsis className="h-5 w-5" strokeWidth={2} />
          </Button>
        </DropdownMenuTrigger>
        {renderDropdownContent()}
      </DropdownMenu>
    </div>
  )
}
