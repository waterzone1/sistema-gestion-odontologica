'use client'

import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Textarea } from '@/components/ui/input'
import { useClinicalProfile, useSaveClinicalProfile, type ClinicalProfileInput } from '@/hooks/use-clinical'
import type { ClinicalProfile } from '@/lib/api'
import { formatDateTime } from '@/lib/format'

const FIELDS: { key: keyof ClinicalProfileInput; label: string; rows: number }[] = [
  { key: 'allergies', label: 'Alergias', rows: 2 },
  { key: 'medications', label: 'Medicación', rows: 2 },
  { key: 'background', label: 'Antecedentes y observaciones', rows: 4 },
]

interface Props {
  patientId: string
  canWrite: boolean
}

export function ClinicalProfileCard({ patientId, canWrite }: Props) {
  const profile = useClinicalProfile(patientId, true)
  const [editing, setEditing] = useState(false)

  if (profile.isPending) return null
  if (profile.isError) return <FormError error={profile.error} />

  const current = profile.data.current

  return (
    <section aria-label="Perfil clínico" className="rounded-lg border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Perfil clínico</h2>
        {canWrite && !editing && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden />
            {current ? 'Actualizar' : 'Completar'}
          </Button>
        )}
      </div>
      {editing ? (
        <ProfileForm patientId={patientId} current={current} onDone={() => setEditing(false)} />
      ) : current ? (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Item label="Alertas" value={current.alerts} />
          {FIELDS.map((field) => (
            <Item key={field.key} label={field.label} value={current[field.key]} />
          ))}
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Actualizado por {current.professional.displayName} el {formatDateTime(current.updatedAt)} · versión{' '}
            {profile.data.versions}
          </p>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no se cargaron alergias, medicación ni antecedentes.</p>
      )}
    </section>
  )
}

function Item({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap">{value || '—'}</dd>
    </div>
  )
}

function ProfileForm({
  patientId,
  current,
  onDone,
}: {
  patientId: string
  current: ClinicalProfile['current']
  onDone: () => void
}) {
  const save = useSaveClinicalProfile(patientId)
  const [values, setValues] = useState<ClinicalProfileInput>({
    alerts: current?.alerts ?? '',
    allergies: current?.allergies ?? '',
    medications: current?.medications ?? '',
    background: current?.background ?? '',
  })
  const set = (key: keyof ClinicalProfileInput, value: string) => setValues((v) => ({ ...v, [key]: value }))

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate(values, { onSuccess: onDone })
      }}
    >
      <Field label="Alertas" htmlFor="profile-alerts" hint="Texto breve que se muestra en la ficha, por ejemplo: Alérgico a la penicilina.">
        <Input id="profile-alerts" maxLength={300} value={values.alerts} onChange={(e) => set('alerts', e.target.value)} />
      </Field>
      {FIELDS.map((field) => (
        <Field key={field.key} label={field.label} htmlFor={`profile-${field.key}`}>
          <Textarea
            id={`profile-${field.key}`}
            rows={field.rows}
            className="min-h-0"
            maxLength={field.key === 'background' ? 4000 : 1000}
            value={values[field.key]}
            onChange={(e) => set(field.key, e.target.value)}
          />
        </Field>
      ))}
      <p className="text-xs text-muted-foreground">Cada cambio queda como una versión nueva; las anteriores se conservan.</p>
      <FormError error={save.error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar perfil'}
        </Button>
      </div>
    </form>
  )
}
