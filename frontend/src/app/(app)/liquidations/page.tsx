'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { MaskedInput, Select } from '@/components/ui/input'
import { useCoverageProviders } from '@/hooks/use-coverages'
import { useCreateLiquidation, useLiquidations } from '@/hooks/use-liquidations'
import { useSession } from '@/hooks/use-session'
import { formatDate, formatMoney, maskDate, parseDateText, toDateText } from '@/lib/format'
import { LIQUIDATION_STATUS_LABELS, liquidationVariant } from '@/lib/liquidations'
import { can } from '@/lib/permissions'

export default function LiquidationsPage() {
  const router = useRouter()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'liquidations:manage')
  const liquidations = useLiquidations(allowed)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed || liquidations.isPending) return <LoadingBlock />
  if (liquidations.isError) return <FormError error={liquidations.error} />

  return (
    <>
      <PageHeader
        title="Liquidaciones"
        description="Lo que las coberturas tienen que pagar por las prestaciones de sus afiliados, agrupado por período."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" aria-hidden />
            Nueva liquidación
          </Button>
        }
      />
      {liquidations.data.length === 0 ? (
        <EmptyState title="Todavía no hay liquidaciones" />
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-sm">
          {liquidations.data.map((liquidation) => (
            <li key={liquidation.id}>
              <Link
                href={`/liquidations/${liquidation.id}`}
                className="flex flex-col gap-1 px-4 py-3 hover:bg-muted sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm">
                  <span className="font-medium">{liquidation.provider.name}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {formatDate(liquidation.periodFrom)} al {formatDate(liquidation.periodTo)} · {liquidation.totals.items}{' '}
                    prestaciones · Reclamado {formatMoney(liquidation.totals.claimed)}
                  </span>
                </span>
                <Badge variant={liquidationVariant(liquidation.status)}>{LIQUIDATION_STATUS_LABELS[liquidation.status]}</Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        {creating && (
          <DialogContent
            title="Nueva liquidación"
            description="Toma las prestaciones cubiertas del período que todavía no están en otra liquidación."
          >
            <NewLiquidationForm onDone={(id) => router.push(`/liquidations/${id}`)} onCancel={() => setCreating(false)} />
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}

function NewLiquidationForm({ onDone, onCancel }: { onDone: (id: string) => void; onCancel: () => void }) {
  const providers = useCoverageProviders()
  const create = useCreateLiquidation()
  const today = new Date()
  const [providerId, setProviderId] = useState('')
  const [from, setFrom] = useState(() => toDateText(new Date(today.getFullYear(), today.getMonth(), 1)))
  const [to, setTo] = useState(() => toDateText(today))
  const periodFrom = parseDateText(from)
  const periodTo = parseDateText(to)

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (periodFrom && periodTo) create.mutate({ providerId, periodFrom, periodTo }, { onSuccess: (data) => onDone(data.id) })
      }}
    >
      <Field label="Cobertura" htmlFor="liquidation-provider">
        <Select id="liquidation-provider" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          <option value="">Elegí una cobertura</option>
          {(providers.data ?? []).map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde" htmlFor="liquidation-from">
          <MaskedInput id="liquidation-from" mask={maskDate} placeholder="dd/mm/aaaa" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="Hasta" htmlFor="liquidation-to">
          <MaskedInput id="liquidation-to" mask={maskDate} placeholder="dd/mm/aaaa" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <FormError error={create.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={create.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!providerId || !periodFrom || !periodTo || create.isPending}>
          Armar liquidación
        </Button>
      </DialogFooter>
    </form>
  )
}
