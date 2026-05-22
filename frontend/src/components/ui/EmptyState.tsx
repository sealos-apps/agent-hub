import { Bot } from 'lucide-react'
import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="workbench-empty flex h-full min-h-[280px] flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200 bg-white text-zinc-400">
        <Bot size={22} />
      </div>
      <h3 className="text-lg/7 font-medium text-zinc-950">{title}</h3>
      <p className="mt-1 max-w-[28rem] text-sm/6 text-zinc-500">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}
