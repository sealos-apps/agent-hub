import { Info, X } from 'lucide-react'

interface AgentHubOverviewProps {
  message: string
  onClose?: () => void
}

export function AgentHubOverview({ message, onClose }: AgentHubOverviewProps) {
  if (!message) return null

  return (
    <div className="flex items-start gap-2 rounded-lg border-[0.5px] border-sky-200 bg-sky-50/80 px-3.5 py-2.5 text-sm text-sky-950 shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
      <div className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-white text-sky-700">
        <Info size={14} />
      </div>
      <div className="min-w-0 flex-1 leading-6">{message}</div>
      {onClose ? (
        <button
          aria-label="关闭提示"
          className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-sky-600 transition hover:bg-white/80 hover:text-sky-900"
          onClick={onClose}
          type="button"
        >
          <X size={14} />
        </button>
      ) : null}
    </div>
  )
}
