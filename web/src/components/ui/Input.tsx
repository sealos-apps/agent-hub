import { cn } from '../../lib/format'
import type { InputHTMLAttributes } from 'react'
import { FIELD_LABEL_CLASSNAME, FIELD_SIZE_CLASSNAME, type ControlSize } from './tokens'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  size?: ControlSize
}

export function Input({
  label,
  hint,
  error,
  size = 'md',
  className,
  ...props
}: InputProps) {
  return (
    <label className="block space-y-1.5">
      {label ? <span className={FIELD_LABEL_CLASSNAME[size]}>{label}</span> : null}
      <input
        className={cn(
          'field-input px-3',
          FIELD_SIZE_CLASSNAME[size],
          error
            ? 'border-rose-300 bg-rose-50/60 focus:border-rose-500 focus:ring-rose-500/10'
            : '',
          className,
        )}
        {...props}
      />
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      {!error && hint ? <span className="text-[11px]/5 text-[#8a94a6]">{hint}</span> : null}
    </label>
  )
}
