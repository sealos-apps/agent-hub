import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface AgentPageHeaderProps {
  title: string
  description?: string
  backTo: string
  backLabel: string
  badge?: ReactNode
  actions?: ReactNode
}

export function AgentPageHeader({
  title,
  description,
  backTo,
  backLabel,
  badge,
  actions,
}: AgentPageHeaderProps) {
  return (
    <header className="flex min-h-20 w-full flex-shrink-0 items-center justify-between gap-5 border-b border-zinc-200 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          title={backLabel}
          to={backTo}
        >
          <ArrowLeft size={22} />
        </Link>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-xl font-semibold tracking-[-0.02em] text-zinc-950">{title}</h1>
            {badge}
          </div>
          {description ? (
            <p className="mt-1 max-w-3xl text-xs text-zinc-500">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center justify-end gap-3">{actions}</div> : null}
    </header>
  )
}
