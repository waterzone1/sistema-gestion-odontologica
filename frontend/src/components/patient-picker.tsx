'use client'

import { Search, X } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { usePatients } from '@/hooks/use-patients'
import { documentLabel, fullName } from '@/lib/format'

export interface PickedPatient {
  id: string
  fullName: string
}

interface PatientPickerProps {
  id: string
  value: PickedPatient | null
  onChange: (patient: PickedPatient | null) => void
  disabled?: boolean
}

export function PatientPicker({ id, value, onChange, disabled }: PatientPickerProps) {
  const [search, setSearch] = useState('')
  const q = useDebouncedValue(search.trim(), 250)
  const results = usePatients({ q, status: 'active', page: 1 })

  if (value) {
    return (
      <div className="flex h-9 items-center justify-between rounded-md border bg-muted/40 px-3 text-sm">
        <span className="font-medium">{value.fullName}</span>
        {!disabled && (
          <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => onChange(null)}>
            <X className="size-3" aria-hidden />
            Cambiar
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
        <Input
          id={id}
          className="pl-9"
          placeholder="Buscar por apellido, documento o teléfono"
          autoComplete="off"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      {q && results.data && (
        <ul className="max-h-48 divide-y overflow-y-auto rounded-md border bg-card text-sm" aria-label="Resultados">
          {results.data.items.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">No se encontraron pacientes</li>
          )}
          {results.data.items.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-muted"
                onClick={() => onChange({ id: patient.id, fullName: fullName(patient) })}
              >
                <span className="font-medium">{fullName(patient)}</span>
                <span className="text-xs text-muted-foreground">{documentLabel(patient)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
