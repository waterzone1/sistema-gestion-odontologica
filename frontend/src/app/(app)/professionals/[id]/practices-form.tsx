'use client'

import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { LoadingBlock } from '@/components/page-header'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { CheckboxGroup } from '@/components/ui/checkbox-group'
import { usePractices, useSaveProfessional } from '@/hooks/use-catalog'
import type { Professional } from '@/lib/api'

export function PracticesForm({ professional, editable }: { professional: Professional; editable: boolean }) {
  const practices = usePractices('active')
  const save = useSaveProfessional(professional.userId)
  const [selected, setSelected] = useState<string[]>(professional.practiceIds)
  const [saved, setSaved] = useState(false)

  if (practices.isPending) return <LoadingBlock />
  if (practices.isError) return <FormError error={practices.error} />

  const options = practices.data.map((practice) => ({ value: practice.id, label: practice.name }))

  return (
    <div className="space-y-4 rounded-lg border bg-card p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">
        Si no marcás ninguna, puede recibir turnos de cualquier práctica. Si marcás algunas, la agenda solo ofrece esas
        para este profesional.
      </p>
      <FormError error={save.error} />
      {saved && <Alert variant="info">Prácticas guardadas.</Alert>}
      {editable ? (
        <CheckboxGroup
          legend="Prácticas que realiza"
          idPrefix="practica"
          options={options}
          value={selected}
          onChange={(value) => {
            setSaved(false)
            setSelected(value)
          }}
        />
      ) : (
        <ul className="list-disc pl-5 text-sm">
          {professional.practiceIds.length === 0 ? (
            <li>Todas las prácticas</li>
          ) : (
            options.filter((o) => professional.practiceIds.includes(o.value)).map((o) => <li key={o.value}>{o.label}</li>)
          )}
        </ul>
      )}
      {editable && (
        <div className="flex justify-end">
          <Button
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { licenseNumber: professional.licenseNumber, practiceIds: selected },
                { onSuccess: () => setSaved(true) },
              )
            }
          >
            {save.isPending ? 'Guardando…' : 'Guardar prácticas'}
          </Button>
        </div>
      )}
    </div>
  )
}
