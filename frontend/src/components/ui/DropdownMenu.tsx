/* eslint-disable react-refresh/only-export-components */
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { ChevronRight } from 'lucide-react'
import type { ComponentPropsWithoutRef, ElementRef } from 'react'
import { forwardRef } from 'react'
import { cn } from '../../lib/format'

export const DropdownMenu = DropdownMenuPrimitive.Root
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
export const DropdownMenuPortal = DropdownMenuPrimitive.Portal
export const DropdownMenuGroup = DropdownMenuPrimitive.Group
export const DropdownMenuSub = DropdownMenuPrimitive.Sub
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

export const DropdownMenuSubTrigger = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    className={cn(
      'flex cursor-default select-none items-center rounded-md px-2.5 py-2 text-sm outline-none transition focus:bg-zinc-100 data-[state=open]:bg-zinc-100',
      inset && 'pl-8',
      className,
    )}
    ref={ref}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </DropdownMenuPrimitive.SubTrigger>
))
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName

export const DropdownMenuSubContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent
    className={cn(
      'z-50 min-w-[188px] overflow-hidden rounded-[10px] border border-zinc-200 bg-white p-1.5 text-zinc-950 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.18)]',
      className,
    )}
    ref={ref}
    {...props}
  />
))
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName

export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      align="end"
      className={cn(
        'z-50 min-w-[188px] overflow-hidden rounded-[10px] border border-zinc-200 bg-white p-1.5 text-zinc-950 shadow-[0_12px_32px_-16px_rgba(0,0,0,0.18)]',
        className,
      )}
      ref={ref}
      sideOffset={sideOffset}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean
    destructive?: boolean
  }
>(({ className, inset, destructive = false, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    className={cn(
      'relative flex cursor-default select-none items-center gap-2 rounded-[6px] px-3 py-2 text-[13px]/5 outline-none transition focus:bg-zinc-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
      inset && 'pl-8',
      destructive ? 'text-rose-600 focus:bg-rose-50 focus:text-rose-600' : 'text-zinc-700',
      className,
    )}
    ref={ref}
    {...props}
  />
))
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName

export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    className={cn('-mx-1 my-1 h-px bg-zinc-100', className)}
    ref={ref}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    className={cn('px-3 py-2 text-xs font-medium text-zinc-500', inset && 'pl-8', className)}
    ref={ref}
    {...props}
  />
))
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName
