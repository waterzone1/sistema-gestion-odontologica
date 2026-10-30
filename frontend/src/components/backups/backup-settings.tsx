'use client'

import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { useOrganization, useSaveSettings } from '@/hooks/use-organization'
import type { OrganizationSettings } from '@/lib/api'
import { pad } from '@/lib/format'

type Backups = OrganizationSettings['backups']

const SCHEDULE_LABELS: Record<Backups['schedule'], string> = {
  EVERY_6H: 'Cada 6 horas',
  EVERY_12H: 'Cada 12 horas',
  DAILY: 'Una vez por día',
  WEEKLY: 'Una vez por semana',
}

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const STEP: Record<Exclude<Backups['schedule'], 'WEEKLY'>, number> = { EVERY_6H: 6, EVERY_12H: 12, DAILY: 24 }

export function scheduleSummary(backups: Backups): string {
  if (backups.paused) return 'El backup automático está en pausa.'
  if (backups.schedule === 'WEEKLY') {
    const day = WEEKDAYS[backups.weekday - 1] ?? ''
    return `Los ${day.endsWith('s') ? day : `${day}s`} a las ${pad(backups.hour)}:00.`
  }
  const step = STEP[backups.schedule]
  const hours: string[] = []
  for (let hour = backups.hour % step; hour < 24; hour += step) hours.push(`${pad(hour)}:00`)
  return `Todos los días a las ${hours.join(', ')}.`
}

export function BackupSettings() {
  const organization = useOrganization()
  if (!organization.data) return null
  return <BackupSettingsForm key={JSON.stringify(organization.data.settings.backups)} initial={organization.data.settings.backups} />
}

function BackupSettingsForm({ initial }: { initial: Backups }) {
  const save = useSaveSettings()
  const [draft, setDraft] = useState<Backups>(initial)
  const set = (patch: Partial<Backups>) => setDraft({ ...draft, ...patch })
  const number = (value: string) => Number.parseInt(value, 10) || 0
  const changed = JSON.stringify(draft) !== JSON.stringify(initial)

  return (
    <section aria-labelledby="backup-config" className="mb-6 rounded-lg border bg-card p-5 shadow-sm">
      <h2 id="backup-config" className="text-sm font-semibold">
        Backup automático
      </h2>
      <p className="text-xs text-muted-foreground">{scheduleSummary(draft)}</p>
      <form
        className="mt-3 space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate({ backups: draft })
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Frecuencia" htmlFor="backup-schedule">
            <Select id="backup-schedule" value={draft.schedule} onChange={(e) => set({ schedule: e.target.value as Backups['schedule'] })}>
              {Object.entries(SCHEDULE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={draft.schedule === 'DAILY' || draft.schedule === 'WEEKLY' ? 'Hora' : 'A partir de las'} htmlFor="backup-hour">
            <Select id="backup-hour" value={draft.hour} onChange={(e) => set({ hour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {pad(hour)}:00
                </option>
              ))}
            </Select>
          </Field>
          {draft.schedule === 'WEEKLY' && (
            <Field label="Día" htmlFor="backup-weekday">
              <Select id="backup-weekday" value={draft.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((day, index) => (
                  <option key={day} value={index + 1}>
                    {day}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Cuántos conservar</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Diarios" htmlFor="backup-keep-daily" hint="Uno por día, los más recientes">
              <Input id="backup-keep-daily" type="number" min={1} max={60} value={draft.keepDaily} onChange={(e) => set({ keepDaily: number(e.target.value) })} />
            </Field>
            <Field label="Semanales" htmlFor="backup-keep-weekly" hint="Uno por semana, además de los diarios">
              <Input id="backup-keep-weekly" type="number" min={0} max={52} value={draft.keepWeekly} onChange={(e) => set({ keepWeekly: number(e.target.value) })} />
            </Field>
            <Field label="Manuales" htmlFor="backup-keep-manual">
              <Input id="backup-keep-manual" type="number" min={1} max={50} value={draft.keepManual} onChange={(e) => set({ keepManual: number(e.target.value) })} />
            </Field>
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.paused} onChange={(e) => set({ paused: e.target.checked })} />
          Pausar el backup automático
        </label>
        <FormError error={save.error} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={!changed || save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
          {changed && (
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(initial)}>
              Descartar cambios
            </Button>
          )}
        </div>
      </form>
    </section>
  )
}
