import { cva, type VariantProps } from 'class-variance-authority'
import type * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = cva('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', {
  variants: {
    variant: {
      default: 'bg-primary/10 text-primary',
      muted: 'bg-muted text-muted-foreground',
      success: 'bg-success/10 text-success',
      destructive: 'bg-destructive/10 text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
})

interface BadgeProps extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
