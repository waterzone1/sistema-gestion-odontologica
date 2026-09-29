import { CircleAlert, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface AlertProps {
  variant?: 'error' | 'info'
  title?: string
  children?: ReactNode
  className?: string
}

export function Alert({ variant = 'error', title, children, className }: AlertProps) {
  const Icon = variant === 'error' ? CircleAlert : Info
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex gap-2 rounded-md border p-3 text-sm',
        variant === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-primary/30 bg-primary/5 text-foreground',
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        {title && <p className="font-medium">{title}</p>}
        {children}
      </div>
    </div>
  )
}
