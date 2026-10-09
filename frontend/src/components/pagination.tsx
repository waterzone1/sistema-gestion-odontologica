'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface PaginationProps {
  page: number
  totalPages: number
  summary: string
  onChange: (page: number) => void
  label?: string
}

export function Pagination({ page, totalPages, summary, onChange, label = 'Paginación' }: PaginationProps) {
  return (
    <nav aria-label={label} className="mt-3 flex items-center justify-between gap-3 text-sm">
      <p className="text-muted-foreground">
        {summary} · Página {page} de {totalPages}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Anterior
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
          Siguiente
        </Button>
      </div>
    </nav>
  )
}

export function usePagedList<T>(items: readonly T[], pageSize = 10) {
  const [requested, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(requested, totalPages)
  return {
    page,
    totalPages,
    setPage,
    items: items.slice((page - 1) * pageSize, page * pageSize),
  }
}
