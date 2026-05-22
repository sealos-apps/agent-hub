import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { cn } from '../../lib/format'

export function Tabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-3', className)} {...props} />
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'inline-flex w-fit items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-100/80 p-1',
        className,
      )}
      {...props}
    />
  )
}

interface TabsTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
}

export function TabsTrigger({
  className,
  active = false,
  type = 'button',
  ...props
}: TabsTriggerProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-white text-zinc-950 shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
          : 'text-zinc-500 hover:text-zinc-900',
        className,
      )}
      type={type}
      {...props}
    />
  )
}
