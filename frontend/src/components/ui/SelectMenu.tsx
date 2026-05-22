import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/format'

interface SelectMenuOption {
  label: string
  value: string
}

interface SelectMenuProps {
  className?: string
  disabled?: boolean
  menuClassName?: string
  onChange: (value: string) => void
  options: SelectMenuOption[]
  portal?: boolean
  showSelectedState?: boolean
  value: string
}

const PORTAL_MENU_GAP = 8
const PORTAL_MENU_MAX_HEIGHT = 188

export function SelectMenu({
  className,
  disabled = false,
  menuClassName,
  onChange,
  options,
  portal = false,
  showSelectedState = true,
  value,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false)
  const [portalStyle, setPortalStyle] = useState<CSSProperties>({
    boxSizing: 'border-box',
    left: -9999,
    maxHeight: PORTAL_MENU_MAX_HEIGHT,
    overflowY: 'auto',
    position: 'fixed',
    top: -9999,
    width: 0,
    zIndex: 70,
  })
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const activeOption = options.find((option) => option.value === value) || options[0]

  const updatePortalPosition = () => {
    if (!rootRef.current) return
    const rect = rootRef.current.getBoundingClientRect()
    const belowSpace = window.innerHeight - rect.bottom - PORTAL_MENU_GAP
    const aboveSpace = rect.top - PORTAL_MENU_GAP
    const openAbove = belowSpace < PORTAL_MENU_MAX_HEIGHT && aboveSpace > belowSpace
    const maxHeight = Math.max(
      96,
      Math.min(PORTAL_MENU_MAX_HEIGHT, openAbove ? aboveSpace : belowSpace),
    )
    setPortalStyle({
      boxSizing: 'border-box',
      left: rect.left,
      maxHeight,
      overflowY: 'auto',
      position: 'fixed',
      top: openAbove
        ? Math.max(PORTAL_MENU_GAP, rect.top - maxHeight - PORTAL_MENU_GAP)
        : rect.bottom + PORTAL_MENU_GAP,
      width: rect.width,
      zIndex: 70,
    })
  }

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !menuRef.current?.contains(target)) {
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

  useLayoutEffect(() => {
    if (!open || !portal || !rootRef.current) return

    updatePortalPosition()
    window.addEventListener('resize', updatePortalPosition)
    window.addEventListener('scroll', updatePortalPosition, true)

    return () => {
      window.removeEventListener('resize', updatePortalPosition)
      window.removeEventListener('scroll', updatePortalPosition, true)
    }
  }, [open, portal])

  const menu = open && !disabled ? (
    <div
      className={cn(
        portal
          ? 'overflow-hidden rounded-[10px] border border-zinc-200 bg-white p-1 shadow-[0_16px_40px_-18px_rgba(15,23,42,0.3)]'
          : 'absolute right-0 z-20 mt-2 min-w-full overflow-hidden rounded-[10px] border border-zinc-200 bg-white p-1 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.18)]',
        menuClassName,
      )}
      ref={menuRef}
      style={portal ? portalStyle : undefined}
    >
      {options.map((option) => {
        const selected = option.value === value
        const showSelected = showSelectedState && selected
        return (
          <button
            className={cn(
              'flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left text-[14px] leading-5 text-zinc-700 transition hover:bg-zinc-50',
              showSelected && 'bg-zinc-100 text-zinc-950',
            )}
            key={option.value}
            onClick={() => {
              onChange(option.value)
              setOpen(false)
            }}
            type="button"
          >
            <span className="min-w-0 truncate">{option.label}</span>
            {showSelected ? <Check className="h-4 w-4 shrink-0 text-zinc-500" /> : null}
          </button>
        )
      })}
    </div>
  ) : null

  return (
    <div className={cn('relative', className)} ref={rootRef}>
      <button
        aria-expanded={open}
        className={cn(
          'field-input flex h-10 w-full items-center justify-between rounded-[8px] border-zinc-200 bg-white px-4 text-[14px] leading-5 text-zinc-700 shadow-[0_1px_2px_rgba(0,0,0,0.04)]',
          open ? 'border-zinc-300 ring-4 ring-blue-50' : '',
          disabled && 'cursor-default bg-transparent text-zinc-700 shadow-none ring-0 hover:bg-transparent',
        )}
        disabled={disabled}
        onClick={() => {
          if (disabled) return
          if (!open && portal) {
            updatePortalPosition()
          }
          setOpen((current) => !current)
        }}
        type="button"
      >
        <span className="truncate">{activeOption?.label}</span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-zinc-400 transition-transform', open ? 'rotate-180' : '', disabled && 'hidden')} />
      </button>

      {portal ? (menu ? createPortal(menu as ReactNode, document.body) : null) : menu}
    </div>
  )
}
