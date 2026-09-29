'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const Dialog = DialogPrimitive.Root

interface DialogContentProps {
  title: string
  description?: string
  children: ReactNode
  className?: string
}

export function DialogContent({ title, description, children, className }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-foreground/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border bg-card p-6 shadow-lg',
          className,
        )}
      >
        <div className="mb-4 space-y-1 pr-6">
          <DialogPrimitive.Title className="text-lg font-semibold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', !description && 'sr-only')}>
            {description ?? title}
          </DialogPrimitive.Description>
        </div>
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-sm p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring"
          aria-label="Cerrar"
        >
          <X className="size-4" aria-hidden />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>
}
