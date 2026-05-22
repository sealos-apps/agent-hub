import { Search } from 'lucide-react'
import { cn } from '../../lib/format'
import type { InputHTMLAttributes } from 'react'
import { FIELD_SIZE_CLASSNAME, type ControlSize } from './tokens'

interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: ControlSize
}

export function SearchField({ className, size = 'md', ...props }: SearchFieldProps) {
  return (
    <label className={cn('relative block', className)}>
      <Search
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#98a2b3]"
        size={15}
      />
      <input className={cn('input bg-white pl-9', FIELD_SIZE_CLASSNAME[size])} {...props} />
    </label>
  )
}
