import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/format'

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'muted'

const badgeVariantClassName: Record<BadgeVariant, string> = {
  default: 'border-zinc-900 bg-zinc-900 text-white',
  secondary: 'border-zinc-200 bg-zinc-100 text-zinc-900',
  outline: 'border-zinc-200 bg-white text-zinc-700',
  muted: 'border-zinc-100 bg-zinc-50 text-zinc-500',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'secondary', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px]/5 font-medium whitespace-nowrap',
        badgeVariantClassName[variant],
        className,
      )}
      {...props}
    />
  )
}
