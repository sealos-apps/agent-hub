import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  widthClassName?: string
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  widthClassName = 'max-w-3xl',
}: ModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(15,23,42,0.62)] p-4 backdrop-blur-[1.5px]">
      <div
        className={`flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[18px] border border-white/70 bg-white shadow-[var(--shadow-modal)] ${widthClassName}`}
      >
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
            {description ? <p className="text-sm text-[var(--color-muted)]">{description}</p> : null}
          </div>
          <button
            aria-label="关闭"
            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-[#5c6678] transition hover:bg-[#f3f6fb] hover:text-[#111827]"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-3 border-t border-[var(--color-border)] bg-[#fafcff] px-6 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}
