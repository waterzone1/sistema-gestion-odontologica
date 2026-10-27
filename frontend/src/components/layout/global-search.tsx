'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { usePatients } from '@/hooks/use-patients'
import { documentLabel, fullName } from '@/lib/format'

export function GlobalSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const term = useDebouncedValue(query.trim(), 250)
  const results = usePatients({ q: term, status: 'active', page: 1, pageSize: 6 }, term.length >= 2)
  const items = term.length >= 2 ? (results.data?.items ?? []) : []

  const go = (href: string) => {
    setOpen(false)
    setQuery('')
    router.push(href)
  }

  return (
    <div className="relative w-full max-w-xs">
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault()
          if (query.trim()) go(`/patients?q=${encodeURIComponent(query.trim())}`)
        }}
      >
        <label htmlFor="global-search" className="sr-only">
          Búsqueda rápida de pacientes
        </label>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          id="global-search"
          type="search"
          autoComplete="off"
          placeholder="Buscar paciente, DNI o teléfono"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </form>
      {open && items.length > 0 && (
        <ul aria-label="Pacientes encontrados" className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-lg">
          {items.map((patient) => (
            <li key={patient.id}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(`/patients/${patient.id}`)}
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{fullName(patient)}</span>
                <span className="block text-xs text-muted-foreground">
                  {[documentLabel(patient), patient.phone].filter(Boolean).join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
