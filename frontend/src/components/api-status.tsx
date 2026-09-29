'use client'

import { useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchHealth } from '@/lib/api'

// con compact solo se muestra cuando hay algun problema con el servidor o la base
export function ApiStatus({ compact = false }: { compact?: boolean }) {
  const { data, isPending, isError, refetch, isFetching } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 15_000,
  })

  if (isPending) {
    if (compact) return null
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircle className="size-4 animate-spin" aria-hidden />
        Conectando con el servidor…
      </p>
    )
  }

  if (isError) {
    return (
      <div className="space-y-3" role="alert">
        <p className="flex items-center justify-center gap-2 text-sm text-destructive">
          <CircleAlert className="size-4" aria-hidden />
          No se pudo conectar con el servidor.
        </p>
        <Button variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
          Reintentar
        </Button>
      </div>
    )
  }

  const baseOk = data.db === 'up'
  if (compact && baseOk) return null

  return (
    <ul className="space-y-2 text-sm" role="status">
      <li className="flex items-center gap-2 text-success">
        <CircleCheck className="size-4" aria-hidden />
        Servidor operativo
      </li>
      <li className={`flex items-center gap-2 ${baseOk ? 'text-success' : 'text-destructive'}`}>
        {baseOk ? <CircleCheck className="size-4" aria-hidden /> : <CircleAlert className="size-4" aria-hidden />}
        {baseOk ? 'Base de datos conectada' : 'Base de datos sin respuesta'}
      </li>
    </ul>
  )
}
