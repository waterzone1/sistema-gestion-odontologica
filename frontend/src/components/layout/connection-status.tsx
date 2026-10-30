'use client'

import { useQuery } from '@tanstack/react-query'
import { fetchHealth } from '@/lib/api'
import { cn } from '@/lib/utils'

export function ConnectionStatus() {
  const health = useQuery({ queryKey: ['health', 'barra'], queryFn: fetchHealth, refetchInterval: 15_000, retry: false })
  const state = health.isPending ? 'checking' : health.isError ? 'offline' : health.data.db === 'up' ? 'online' : 'degraded'
  const label = {
    checking: 'Verificando conexión…',
    online: 'Conectado al servidor',
    degraded: 'Servidor sin base de datos',
    offline: 'Sin conexión con el servidor',
  }[state]
  return (
    <p role="status" aria-live="polite" data-tour="connection" className="flex items-center gap-2 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          state === 'online' && 'bg-success',
          state === 'checking' && 'bg-muted-foreground/50',
          (state === 'offline' || state === 'degraded') && 'animate-pulse bg-destructive',
        )}
      />
      <span className={cn((state === 'offline' || state === 'degraded') && 'font-medium text-destructive')}>{label}</span>
    </p>
  )
}
