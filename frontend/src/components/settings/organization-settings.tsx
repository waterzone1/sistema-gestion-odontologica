'use client'

import { useState, type ReactNode } from 'react'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Select, Textarea } from '@/components/ui/input'
import { useOrganization, useSaveSettings, useUpdateOrganization } from '@/hooks/use-organization'
import type { Organization, SessionUser } from '@/lib/api'
import { can } from '@/lib/permissions'

const VARIABLES = ['nombre', 'fecha', 'hora', 'profesional', 'sede', 'consultorio'] as const
const IDLE_OPTIONS = [15, 30, 60, 120, 240, 480, 720] as const
const ZONES = [
  'America/Argentina/Buenos_Aires',
  'America/Argentina/Cordoba',
  'America/Argentina/Mendoza',
  'America/Argentina/Salta',
  'America/Argentina/Jujuy',
  'America/Argentina/Tucuman',
  'America/Argentina/Catamarca',
  'America/Argentina/La_Rioja',
  'America/Argentina/San_Juan',
  'America/Argentina/San_Luis',
  'America/Argentina/Rio_Gallegos',
  'America/Argentina/Ushuaia',
]

export function previewMessage(template: string, clinic: string): string {
  const sample: Record<(typeof VARIABLES)[number], string> = {
    nombre: 'Ana',
    fecha: '12/11/2026',
    hora: '10:30',
    profesional: 'Dra. Paz',
    sede: 'Sede Central',
    consultorio: clinic,
  }
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in sample ? sample[key as keyof typeof sample] : match))
}

const idleLabel = (minutes: number) => (minutes < 60 ? `${minutes} minutos` : `${minutes / 60} ${minutes === 60 ? 'hora' : 'horas'}`)

function Card({ id, title, description, children }: { id: string; title: string; description: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  )
}

function SaveRow({ changed, pending, onReset }: { changed: boolean; pending: boolean; onReset: () => void }) {
  return (
    <div className="flex gap-2">
      <Button type="submit" size="sm" disabled={!changed || pending}>
        {pending ? 'Guardando…' : 'Guardar'}
      </Button>
      {changed && (
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          Descartar cambios
        </Button>
      )}
    </div>
  )
}

function ClinicCard({ organization }: { organization: Organization }) {
  const update = useUpdateOrganization()
  const [name, setName] = useState(organization.name)
  const [timezone, setTimezone] = useState(organization.timezone)
  const changed = name.trim() !== organization.name || timezone !== organization.timezone
  const zones = ZONES.includes(organization.timezone) ? ZONES : [organization.timezone, ...ZONES]
  return (
    <Card id="consultorio-datos" title="Consultorio: datos" description="El nombre aparece en los recordatorios. La zona horaria rige la agenda, la caja y los reportes.">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          update.mutate({ name: name.trim(), timezone })
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nombre del consultorio" htmlFor="org-name">
            <Input id="org-name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Zona horaria" htmlFor="org-timezone">
            <Select id="org-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
              {zones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replace('America/Argentina/', '').replace('_', ' ')}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <FormError error={update.error} />
        <SaveRow
          changed={changed}
          pending={update.isPending}
          onReset={() => {
            setName(organization.name)
            setTimezone(organization.timezone)
          }}
        />
      </form>
    </Card>
  )
}

function RemindersCard({ organization }: { organization: Organization }) {
  const save = useSaveSettings()
  const initial = organization.settings.reminders
  const [daysAhead, setDaysAhead] = useState(initial.daysAhead)
  const [template, setTemplate] = useState(initial.template)
  const changed = daysAhead !== initial.daysAhead || template.trim() !== initial.template
  return (
    <Card id="consultorio-recordatorios" title="Consultorio: recordatorios" description="Cuándo se generan los avisos de turnos y qué dice el mensaje de WhatsApp.">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate({ reminders: { daysAhead, template: template.trim() } })
        }}
      >
        <Field label="Generar los avisos" htmlFor="reminders-days" className="sm:w-64">
          <Select id="reminders-days" value={daysAhead} onChange={(e) => setDaysAhead(Number(e.target.value))}>
            <option value={1}>1 día antes del turno</option>
            <option value={2}>2 días antes del turno</option>
            <option value={3}>3 días antes del turno</option>
          </Select>
        </Field>
        <Field label="Mensaje" htmlFor="reminders-template" hint={`Variables: ${VARIABLES.map((v) => `{${v}}`).join(' ')}`}>
          <Textarea id="reminders-template" rows={4} maxLength={600} value={template} onChange={(e) => setTemplate(e.target.value)} />
        </Field>
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Así lo recibe el paciente</p>
          <p>{previewMessage(template, organization.name)}</p>
        </div>
        <FormError error={save.error} />
        <SaveRow
          changed={changed}
          pending={save.isPending}
          onReset={() => {
            setDaysAhead(initial.daysAhead)
            setTemplate(initial.template)
          }}
        />
      </form>
    </Card>
  )
}

function SecurityCard({ organization }: { organization: Organization }) {
  const save = useSaveSettings()
  const [maxMb, setMaxMb] = useState(organization.settings.files.maxMb)
  const [idle, setIdle] = useState(organization.settings.sessions.idleMinutes)
  const changed = maxMb !== organization.settings.files.maxMb || idle !== organization.settings.sessions.idleMinutes
  return (
    <Card id="consultorio-archivos" title="Consultorio: archivos y sesiones" description="Límites que se aplican a todo el equipo.">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate({ files: { maxMb }, sessions: { idleMinutes: idle } })
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tamaño máximo de archivo clínico (MB)" htmlFor="files-max" hint={`El servidor admite hasta ${organization.limits.fileMaxMb} MB.`}>
            <Input
              id="files-max"
              type="number"
              min={1}
              max={organization.limits.fileMaxMb}
              value={maxMb}
              onChange={(e) => setMaxMb(Number.parseInt(e.target.value, 10) || 1)}
            />
          </Field>
          <Field label="Cerrar la sesión tras" htmlFor="sessions-idle" hint="Sin actividad. Se aplica en el próximo pedido de cada sesión.">
            <Select id="sessions-idle" value={idle} onChange={(e) => setIdle(Number(e.target.value))}>
              {IDLE_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {idleLabel(minutes)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <FormError error={save.error} />
        <SaveRow
          changed={changed}
          pending={save.isPending}
          onReset={() => {
            setMaxMb(organization.settings.files.maxMb)
            setIdle(organization.settings.sessions.idleMinutes)
          }}
        />
      </form>
    </Card>
  )
}

export function OrganizationSettingsSections({ user }: { user: SessionUser }) {
  const organization = useOrganization()
  const data = organization.data
  if (!data) return null
  const key = JSON.stringify(data)
  return (
    <>
      {can(user, 'organization:manage') && <ClinicCard key={`datos-${key}`} organization={data} />}
      {can(user, 'appointments:manage') && <RemindersCard key={`recordatorios-${key}`} organization={data} />}
      {can(user, 'organization:manage') && <SecurityCard key={`seguridad-${key}`} organization={data} />}
    </>
  )
}
