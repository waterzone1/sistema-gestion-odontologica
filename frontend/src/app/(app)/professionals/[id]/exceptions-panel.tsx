'use client'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock } from '@/components/page-header'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input, MaskedInput, Select } from '@/components/ui/input'
import {
  useCreateException,
  useProfessionalAvailability,
  useRevokeException,
  type ExceptionInput,
} from '@/hooks/use-availability'
import type { AvailabilityException, AvailabilityExceptionResult, Branch } from '@/lib/api'
import { EXCEPTION_LABELS } from '@/lib/availability'
import { formatDateTime, maskDate, maskTime, parseDateTimeText, toDateText } from '@/lib/format'

interface Props {
  professionalId: string
  branches: Branch[]
}

export function ExceptionsPanel({ professionalId, branches }: Props) {
  const availability = useProfessionalAvailability(professionalId)
  const revoke = useRevokeException(professionalId)
  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState<AvailabilityException | null>(null)
  const [result, setResult] = useState<AvailabilityExceptionResult | null>(null)

  if (availability.isPending) return <LoadingBlock />
  if (availability.isError) return <FormError error={availability.error} />

  const branchName = new Map(branches.map((b) => [b.id, b.name]))
  const exceptions = availability.data.exceptions

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Vacaciones, ausencias y bloqueos impiden dar turnos; un horario extraordinario habilita un día fuera del
          horario semanal.
        </p>
        <Button onClick={() => setCreating(true)} className="self-end sm:self-auto">
          <Plus className="size-4" aria-hidden />
          Nueva excepción
        </Button>
      </div>

      {result && result.conflicts.length > 0 && (
        <Alert title="Hay turnos dentro de ese período">
          <p>No se cancelaron: conviene reprogramarlos o cancelarlos desde la agenda.</p>
          <ul className="list-disc pl-4">
            {result.conflicts.map((conflict) => (
              <li key={conflict.id}>
                {formatDateTime(conflict.startsAt)} · {conflict.patient}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      {exceptions.length === 0 ? (
        <EmptyState title="No hay excepciones vigentes" />
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-sm">
          {exceptions.map((exception) => (
            <li key={exception.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <Badge variant={exception.type === 'EXTRA' ? 'success' : 'default'}>{EXCEPTION_LABELS[exception.type]}</Badge>
                  {formatDateTime(exception.startsAt)} a {formatDateTime(exception.endsAt)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {exception.reason} · {exception.branchId ? branchName.get(exception.branchId) : 'Todas las sedes'}
                </p>
              </div>
              <Button variant="outline" size="sm" className="self-start sm:self-auto" onClick={() => setRevoking(exception)}>
                Dejar sin efecto
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        {creating && (
          <DialogContent title="Nueva excepción" description="Queda registrada a tu nombre." className="max-w-xl">
            <ExceptionForm
              professionalId={professionalId}
              branches={branches}
              onDone={(created) => {
                setResult(created)
                setCreating(false)
              }}
              onCancel={() => setCreating(false)}
            />
          </DialogContent>
        )}
      </Dialog>
      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title="Dejar sin efecto la excepción"
        description="Vuelve a regir el horario semanal en ese período. La excepción queda registrada como revocada."
        confirmLabel="Dejar sin efecto"
        pending={revoke.isPending}
        error={revoke.error ? 'No se pudo completar la acción' : undefined}
        onConfirm={() => revoking && revoke.mutate(revoking.id, { onSuccess: () => setRevoking(null) })}
      />
    </div>
  )
}

function ExceptionForm({
  professionalId,
  branches,
  onDone,
  onCancel,
}: {
  professionalId: string
  branches: Branch[]
  onDone: (result: AvailabilityExceptionResult) => void
  onCancel: () => void
}) {
  const create = useCreateException(professionalId)
  const today = toDateText(new Date())
  const [type, setType] = useState<ExceptionInput['type']>('VACATION')
  const [branchId, setBranchId] = useState('')
  const [fromDate, setFromDate] = useState(today)
  const [fromTime, setFromTime] = useState('00:00')
  const [toDate, setToDate] = useState(today)
  const [toTime, setToTime] = useState('23:59')
  const [reason, setReason] = useState('')

  const startsAt = parseDateTimeText(fromDate, fromTime)
  const endsAt = parseDateTimeText(toDate, toTime)
  const rangeError = !startsAt || !endsAt ? 'Revisá las fechas y horas' : endsAt <= startsAt ? 'El final debe ser posterior al inicio' : null
  const needsBranch = type === 'EXTRA' && !branchId
  const valid = !rangeError && !needsBranch && reason.trim().length >= 3

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!startsAt || !endsAt) return
        create.mutate(
          {
            type,
            branchId: branchId || null,
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            reason: reason.trim(),
          },
          { onSuccess: onDone },
        )
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="exception-type">
          <Select
            id="exception-type"
            value={type}
            onChange={(event) => setType(event.target.value as ExceptionInput['type'])}
          >
            {Object.entries(EXCEPTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sede" htmlFor="exception-branch" error={needsBranch ? 'Elegí la sede del horario extraordinario' : undefined}>
          <Select id="exception-branch" value={branchId} onChange={(event) => setBranchId(event.target.value)}>
            <option value="">{type === 'EXTRA' ? 'Elegí una sede' : 'Todas las sedes'}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Desde (fecha)" htmlFor="exception-from-date">
          <MaskedInput id="exception-from-date" placeholder="dd/mm/aaaa" mask={maskDate} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="Desde (hora)" htmlFor="exception-from-time">
          <MaskedInput id="exception-from-time" placeholder="hh:mm" mask={maskTime} value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
        </Field>
        <Field label="Hasta (fecha)" htmlFor="exception-to-date">
          <MaskedInput id="exception-to-date" placeholder="dd/mm/aaaa" mask={maskDate} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
        <Field label="Hasta (hora)" htmlFor="exception-to-time" error={rangeError ?? undefined}>
          <MaskedInput id="exception-to-time" placeholder="hh:mm" mask={maskTime} value={toTime} onChange={(e) => setToTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Motivo" htmlFor="exception-reason">
        <Input id="exception-reason" maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <FormError error={create.error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={create.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!valid || create.isPending}>
          {create.isPending ? 'Guardando…' : 'Guardar excepción'}
        </Button>
      </DialogFooter>
    </form>
  )
}
