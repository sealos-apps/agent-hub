import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/format'

interface SelectMenuOption {
  label: string
  value: string
}

interface SelectMenuProps {
  className?: string
  menuClassName?: string
  onChange: (value: string) => void
  options: SelectMenuOption[]
  value: string
}

export function SelectMenu({
  className,
  menuClassName,
  onChange,
  options,
  value,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const activeOption = options.find((option) => option.value === value) || options[0]

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      <button
        aria-expanded={open}
        className={cn(
          'field-input flex h-10 w-full items-center justify-between rounded-[8px] border-zinc-200 bg-white px-4 text-[14px] leading-5 text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
          open ? 'border-zinc-300 ring-4 ring-blue-50' : '',
        )}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="truncate">{activeOption?.label}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-zinc-400 transition-transform', open ? 'rotate-180' : '')} />
      </button>

      {open ? (
        <div
          className={cn(
            'absolute right-0 z-20 mt-2 min-w-full overflow-hidden rounded-[10px] border border-zinc-200 bg-white p-1 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.18)]',
            menuClassName,
          )}
        >
          {options.map((option) => {
            const selected = option.value === value
            return (
              <button
                className={cn(
                  'flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left text-[14px] leading-5 transition',
                  selected ? 'bg-zinc-100 text-zinc-950' : 'text-zinc-700 hover:bg-zinc-50',
                )}
                key={option.value}
                onClick={() => {
                  onChange(option.value)
                  setOpen(false)
                }}
                type="button"
              >
                <span>{option.label}</span>
                {selected ? <Check className="h-4 w-4 text-zinc-500" /> : <span className="h-4 w-4" />}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
