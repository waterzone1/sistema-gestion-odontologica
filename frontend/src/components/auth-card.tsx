import type { ReactNode } from 'react'

interface AuthCardProps {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}

export function AuthCard({ title, description, children, footer }: AuthCardProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div className="space-y-1 text-center">
        <p className="text-sm font-semibold text-primary">Sistema de Gestión Odontológica</p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="rounded-lg border bg-card p-6 shadow-sm">{children}</div>
      {footer}
    </main>
  )
}
