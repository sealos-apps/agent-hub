import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/format'

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded-md bg-zinc-100', className)} {...props} />
}
