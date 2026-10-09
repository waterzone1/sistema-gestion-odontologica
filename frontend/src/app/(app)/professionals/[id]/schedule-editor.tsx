'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { LoadingBlock } from '@/components/page-header'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { MaskedInput, Select } from '@/components/ui/input'
import { useProfessionalAvailability, useSaveRules } from '@/hooks/use-availability'
import type { Branch, ProfessionalAvailability } from '@/lib/api'
import { draftProblem, WEEKDAYS, type DraftRule } from '@/lib/availability'
import { maskTime } from '@/lib/format'

interface Props {
  professionalId: string
  branches: Branch[]
  editable: boolean
}

export function ScheduleEditor({ professionalId, branches, editable }: Props) {
  const availability = useProfessionalAvailability(professionalId)
  if (availability.isPending) return <LoadingBlock />
  if (availability.isError) return <FormError error={availability.error} />
  if (branches.length === 0) {
    return <Alert>El profesional no tiene sedes asignadas. Asignale al menos una desde Usuarios.</Alert>
  }
  return (
    <Editor
      key={professionalId}
      professionalId={professionalId}
      branches={branches}
      editable={editable}
      initial={availability.data}
    />
  )
}

function Editor({ professionalId, branches, editable, initial }: Props & { initial: ProfessionalAvailability }) {
  const save = useSaveRules(professionalId)
  const [rules, setRules] = useState<DraftRule[]>(() => initial.rules.map((rule, key) => ({ key, ...rule })))
  const [nextKey, setNextKey] = useState(initial.rules.length)
  const [saved, setSaved] = useState(false)
  const branchName = new Map(branches.map((b) => [b.id, b.name]))
  const problem = draftProblem(rules)

  const update = (key: number, patch: Partial<DraftRule>) => {
    setSaved(false)
    setRules((current) => current.map((rule) => (rule.key === key ? { ...rule, ...patch } : rule)))
  }
  const add = (weekday: number) => {
    setSaved(false)
    setRules((current) => [...current, { key: nextKey, weekday, branchId: branches[0]?.id ?? '', start: '09:00', end: '13:00' }])
    setNextKey(nextKey + 1)
  }
  const copyMonday = () => {
    const monday = rules.filter((rule) => rule.weekday === 1)
    const copies = [2, 3, 4, 5].flatMap((weekday) =>
      monday.map((rule, index) => ({ ...rule, weekday, key: nextKey + (weekday - 2) * monday.length + index })),
    )
    setSaved(false)
    setRules((current) => [...current.filter((rule) => rule.weekday < 2 || rule.weekday > 5), ...copies])
    setNextKey(nextKey + copies.length)
  }
  const remove = (key: number) => {
    setSaved(false)
    setRules((current) => current.filter((rule) => rule.key !== key))
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Horario semanal de atención. Los turnos solo se pueden dar dentro de estas franjas; para un día puntual usá
        Excepciones.
      </p>
      <FormError error={save.error} />
      {saved && <Alert variant="info">Horario guardado.</Alert>}
      <ul className="divide-y rounded-lg border bg-card shadow-sm">
        {WEEKDAYS.map((day) => {
          const dayRules = rules.filter((rule) => rule.weekday === day.value).sort((a, b) => a.start.localeCompare(b.start))
          return (
            <li key={day.value} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
              <span className="w-28 shrink-0 pt-2 text-sm font-medium">{day.label}</span>
              <div className="flex-1 space-y-2">
                {dayRules.length === 0 && <p className="pt-2 text-sm text-muted-foreground">No atiende</p>}
                {dayRules.map((rule) =>
                  editable ? (
                    <div key={rule.key} className="flex flex-wrap items-center gap-2">
                      <MaskedInput
                        aria-label={`${day.label}: desde`}
                        className="w-20"
                        mask={maskTime}
                        value={rule.start}
                        onChange={(event) => update(rule.key, { start: event.target.value })}
                      />
                      <span className="text-sm text-muted-foreground">a</span>
                      <MaskedInput
                        aria-label={`${day.label}: hasta`}
                        className="w-20"
                        mask={maskTime}
                        value={rule.end}
                        onChange={(event) => update(rule.key, { end: event.target.value })}
                      />
                      {branches.length > 1 && (
                        <Select
                          aria-label={`${day.label}: sede`}
                          className="w-auto min-w-36 flex-1 sm:flex-none"
                          value={rule.branchId}
                          onChange={(event) => update(rule.key, { branchId: event.target.value })}
                        >
                          {branches.map((branch) => (
                            <option key={branch.id} value={branch.id}>
                              {branch.name}
                            </option>
                          ))}
                        </Select>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Quitar franja del ${day.label.toLowerCase()}`}
                        onClick={() => remove(rule.key)}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </div>
                  ) : (
                    <p key={rule.key} className="pt-2 text-sm">
                      {rule.start} a {rule.end}
                      {branches.length > 1 && ` · ${branchName.get(rule.branchId) ?? ''}`}
                    </p>
                  ),
                )}
                {editable && (
                  <Button type="button" variant="outline" size="sm" onClick={() => add(day.value)}>
                    <Plus className="size-4" aria-hidden />
                    Agregar franja
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
      {editable && (
        <div className="flex flex-col items-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!rules.some((rule) => rule.weekday === 1)}
            onClick={copyMonday}
          >
            Copiar el lunes de martes a viernes
          </Button>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <Button
            disabled={!!problem || save.isPending}
            onClick={() =>
              save.mutate(
                rules.map(({ branchId, weekday, start, end }) => ({ branchId, weekday, start, end })),
                { onSuccess: () => setSaved(true) },
              )
            }
          >
            {save.isPending ? 'Guardando…' : 'Guardar horario'}
          </Button>
        </div>
      )}
    </div>
  )
}
