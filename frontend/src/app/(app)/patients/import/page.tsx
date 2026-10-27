'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Download, Upload } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FormError } from '@/components/form-error'
import { LoadingBlock, PageHeader } from '@/components/page-header'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { patientsKey } from '@/hooks/use-patients'
import { useSession } from '@/hooks/use-session'
import { api } from '@/lib/api'
import type { components } from '@/lib/api-types'
import { can } from '@/lib/permissions'

type Preview = components['schemas']['PatientImportPreview']
type Result = components['schemas']['PatientImportResult']

export default function PatientImportPage() {
  const router = useRouter()
  const client = useQueryClient()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'patients:write')
  const [fileName, setFileName] = useState('')
  const preview = useMutation({ mutationFn: (content: string) => api.post<Preview>('/api/patient-imports/preview', { csv: content }) })
  const run = useMutation({
    mutationFn: (content: string) => api.post<Result>('/api/patient-imports', { csv: content }),
    onSuccess: () => client.invalidateQueries({ queryKey: patientsKey }),
  })

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed) return <LoadingBlock />

  return (
    <>
      <Link href="/patients" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Pacientes
      </Link>
      <PageHeader
        title="Importar pacientes"
        description="Bajá la plantilla, completala en Excel o Google Sheets y guardala como CSV. Antes de importar vas a ver los errores fila por fila."
        actions={
          <a href="/api/patient-imports/template" className={buttonVariants({ variant: 'outline' })}>
            <Download className="size-4" aria-hidden />
            Bajar plantilla
          </a>
        }
      />
      <div className="space-y-4">
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed bg-card p-6 text-sm hover:bg-muted">
          <Upload className="size-6 text-primary" aria-hidden />
          <span>{fileName || 'Elegí el archivo CSV'}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Archivo CSV de pacientes"
            onChange={async (event) => {
              const file = event.target.files?.[0]
              if (!file) return
              const text = await file.text()
              setFileName(file.name)
              run.reset()
              preview.mutate(text)
            }}
          />
        </label>
        <FormError error={preview.error ?? run.error} />
        {run.data && (
          <Alert variant="info" title="Importación terminada">
            Se cargaron {run.data.created} pacientes. {run.data.skipped > 0 && `Se omitieron ${run.data.skipped} filas con errores.`}{' '}
            <Link href="/patients" className="font-medium underline">
              Ver pacientes
            </Link>
          </Alert>
        )}
        {preview.data && !run.data && (
          <section aria-label="Vista previa" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm">
                <span className="font-semibold">{preview.data.valid}</span> filas listas para importar ·{' '}
                <span className="font-semibold">{preview.data.invalid}</span> con errores (se omiten)
              </p>
              <Button disabled={preview.data.valid === 0 || run.isPending} onClick={() => run.mutate(preview.variables)}>
                {run.isPending ? 'Importando…' : `Importar ${preview.data.valid} pacientes`}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border bg-card shadow-sm">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="border-b bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 font-medium">Fila</th>
                    <th scope="col" className="px-3 py-2 font-medium">Paciente</th>
                    <th scope="col" className="px-3 py-2 font-medium">Documento</th>
                    <th scope="col" className="px-3 py-2 font-medium">Nacimiento</th>
                    <th scope="col" className="px-3 py-2 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.data.rows.map((row) => (
                    <tr key={row.line}>
                      <td className="px-3 py-2">{row.line}</td>
                      <td className="px-3 py-2">
                        {row.lastName}, {row.firstName}
                      </td>
                      <td className="px-3 py-2">
                        {row.documentType} {row.documentNumber}
                      </td>
                      <td className="px-3 py-2">{row.birthDate}</td>
                      <td className="px-3 py-2">
                        {row.errors.length === 0 ? (
                          <Badge variant="success">Lista</Badge>
                        ) : (
                          <span className="text-xs text-destructive">{row.errors.join(' · ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  )
}
