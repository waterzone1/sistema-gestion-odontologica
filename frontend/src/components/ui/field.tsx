import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface FieldProps {
  label: string
  htmlFor: string
  error?: string | undefined
  hint?: string
  className?: string
  children: ReactNode
}

export function Field({ label, htmlFor, error, hint, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
