import { cn } from '../../lib/format'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { CONTROL_SIZE_CLASSNAME, type ControlSize } from './tokens'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ControlSize
  leading?: ReactNode
}

const variantClassName: Record<ButtonVariant, string> = {
  primary:
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[8px] border border-[#171717] bg-[#171717] font-medium whitespace-nowrap text-[#fafafa] transition-all hover:border-black hover:bg-black disabled:cursor-not-allowed disabled:opacity-50',
  secondary:
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[var(--color-border)] bg-white font-medium whitespace-nowrap text-[var(--color-text)] transition-all hover:border-[#d7deea] hover:bg-[#fbfcff] disabled:cursor-not-allowed disabled:opacity-50',
  ghost:
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] font-medium whitespace-nowrap text-[#5e6b80] transition hover:bg-[var(--color-brand-soft)] hover:text-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-[#fecaca] bg-[#fff1f2] font-medium whitespace-nowrap text-[#dc2626] transition hover:border-[#fda4af] hover:bg-[#ffe4e6] disabled:cursor-not-allowed disabled:opacity-50',
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  leading,
  children,
  ...props
}: ButtonProps) {
  return (
    <button className={cn(variantClassName[variant], CONTROL_SIZE_CLASSNAME[size], className)} {...props}>
      {leading}
      {children}
    </button>
  )
}
