/* eslint-disable react-refresh/only-export-components */
import {
  Bot,
  FolderOpen,
  Globe,
  LayoutDashboard,
  Settings,
} from 'lucide-react'
import type {
  AgentListItem,
  AgentWorkspaceItem,
} from '../../../../domains/agents/types'
import { cn } from '../../../../lib/format'

export type AgentDetailTab = AgentWorkspaceItem['key']

export const HIDDEN_AGENT_DETAIL_TABS = new Set<AgentDetailTab>(['overview', 'chat', 'files', 'settings'])

interface AgentDetailSidebarProps {
  item: AgentListItem
  currentTab: AgentDetailTab
  onTabChange: (tab: AgentDetailTab) => void
}

export function AgentDetailSidebar({
  item,
  currentTab,
  onTabChange,
}: AgentDetailSidebarProps) {
  const iconMap = {
    overview: LayoutDashboard,
    chat: Bot,
    files: FolderOpen,
    settings: Settings,
    'web-ui': Globe,
  } as const;

  const tabs = item.workspaces
    .filter((workspace) => workspace.key !== 'terminal')
    .filter((workspace) => !HIDDEN_AGENT_DETAIL_TABS.has(workspace.key))
    .map((workspace) => ({
      value: workspace.key,
      label: workspace.label,
      icon: iconMap[workspace.key as keyof typeof iconMap] || LayoutDashboard,
      enabled: workspace.enabled,
      reason: workspace.reason || '',
    }));

  if (tabs.length === 0) {
    return null
  }

  return (
    <aside
      className={cn(
        'flex w-full shrink-0 self-stretch flex-row rounded-[12px] border-[0.5px] border-zinc-200 bg-white p-2 shadow-[0_1px_2px_rgba(0,0,0,0.05)] min-[860px]:h-full min-[860px]:w-[76px] min-[860px]:flex-col',
      )}
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-row items-start gap-2 overflow-x-auto overflow-y-hidden min-[860px]:flex-col min-[860px]:overflow-x-hidden min-[860px]:overflow-y-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              className={cn(
                'flex h-[56px] w-[64px] shrink-0 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[8px] p-2 text-center text-[8px] font-medium tracking-[0.2px] text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 min-[860px]:h-[60px] min-[860px]:w-[60px]',
                currentTab === tab.value && 'bg-zinc-100 text-zinc-900',
                !tab.enabled &&
                  'cursor-not-allowed opacity-45 hover:bg-transparent hover:text-zinc-500',
              )}
              key={tab.value}
              onClick={() => {
                if (!tab.enabled) return
                onTabChange(tab.value)
              }}
              title={tab.enabled ? tab.label : tab.reason}
              type="button"
            >
              <Icon className="h-6 w-6 shrink-0" strokeWidth={1.6} />
              <span className="leading-[16px]">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
