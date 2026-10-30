'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, MessageCircle, Phone } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FormError } from '@/components/form-error'
import { EmptyState, LoadingBlock, PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { useSession } from '@/hooks/use-session'
import { api } from '@/lib/api'
import type { components } from '@/lib/api-types'
import { formatDate, formatTime, shiftIsoDay, toIsoDay } from '@/lib/format'
import { can } from '@/lib/permissions'
import { useOrganization } from '@/hooks/use-organization'

type Day = components['schemas']['RemindersDay']
type Reminder = components['schemas']['Reminder']

const STATUS: Record<Reminder['status'], { label: string; variant: 'default' | 'success' | 'muted' | 'destructive' }> = {
  PENDING: { label: 'Para enviar', variant: 'default' },
  SENT: { label: 'Enviado', variant: 'default' },
  CONFIRMED: { label: 'Confirmó', variant: 'success' },
  CANCELLED: { label: 'Descartado', variant: 'muted' },
  FAILED: { label: 'Sin celular', variant: 'destructive' },
}

export default function RemindersPage() {
  const router = useRouter()
  const client = useQueryClient()
  const session = useSession()
  const user = session.data?.user
  const allowed = can(user, 'appointments:manage')
  const organization = useOrganization()
  const [chosen, setDay] = useState<string | null>(null)
  const [today] = useState(() => toIsoDay(new Date()))
  const day = chosen ?? shiftIsoDay(today, organization.data?.settings.reminders.daysAhead ?? 1)
  const key = ['reminders', day]
  const reminders = useQuery({ queryKey: key, queryFn: () => api.get<Day>(`/api/reminders?date=${day}`), enabled: allowed && !organization.isPending })
  const refresh = (data: Day) => client.setQueryData(key, data)
  const generate = useMutation({ mutationFn: () => api.post<Day>('/api/reminders/generate', { date: day }), onSuccess: refresh })
  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'sent' | 'confirm' | 'cancel' }) => api.post<Reminder>(`/api/reminders/${id}/${action}`),
    onSuccess: (updated) =>
      client.setQueryData<Day>(key, (current) =>
        current ? { ...current, reminders: current.reminders.map((r) => (r.id === updated.id ? updated : r)) } : current,
      ),
  })

  useEffect(() => {
    if (user && !allowed) router.replace('/dashboard')
  }, [user, allowed, router])

  if (!user || !allowed) return <LoadingBlock />

  const list = reminders.data?.reminders ?? []
  const pending = list.filter((r) => r.status === 'PENDING').length

  return (
    <>
      <PageHeader
        title="Recordatorios"
        description="Avisos de turnos para mandar por WhatsApp. El botón abre WhatsApp con el mensaje escrito; vos lo enviás y queda registrado."
        actions={
          <Button disabled={generate.isPending} onClick={() => generate.mutate()}>
            Generar los que faltan
          </Button>
        }
      />
      <div className="mb-4 flex items-center gap-2">
        <Button variant="outline" size="sm" aria-label="Día anterior" onClick={() => setDay(shiftIsoDay(day, -1))}>
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <span className="min-w-32 text-center text-sm font-semibold">Turnos del {formatDate(day)}</span>
        <Button variant="outline" size="sm" aria-label="Día siguiente" onClick={() => setDay(shiftIsoDay(day, 1))}>
          <ChevronRight className="size-4" aria-hidden />
        </Button>
        {pending > 0 && <span className="text-sm text-muted-foreground">{pending} para enviar</span>}
      </div>
      <FormError error={reminders.error ?? generate.error ?? act.error} className="mb-4" />
      {reminders.isPending ? (
        <LoadingBlock />
      ) : list.length === 0 ? (
        <EmptyState title="No hay recordatorios para ese día" description="Tocá «Generar los que faltan» para crearlos a partir de los turnos." />
      ) : (
        <ul className="divide-y rounded-lg border bg-card shadow-sm" data-tour="reminders-list">
          {list.map((reminder) => (
            <li key={reminder.id} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p>
                  <span className="font-medium">{formatTime(reminder.appointment.startsAt)}</span>{' '}
                  <Link href={`/patients/${reminder.patient.id}`} className="text-primary hover:underline">
                    {reminder.patient.fullName}
                  </Link>
                  <span className="text-muted-foreground">
                    {' '}
                    · {reminder.appointment.professional} · {reminder.appointment.branch}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {[reminder.phone, reminder.failureReason].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS[reminder.status].variant}>{STATUS[reminder.status].label}</Badge>
                {reminder.whatsappUrl && (reminder.status === 'PENDING' || reminder.status === 'SENT') && (
                  <a
                    href={reminder.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => act.mutate({ id: reminder.id, action: 'sent' })}
                    className={buttonVariants({ size: 'sm' })}
                  >
                    <MessageCircle className="size-4" aria-hidden />
                    {reminder.status === 'SENT' ? 'Reenviar' : 'Enviar por WhatsApp'}
                  </a>
                )}
                {!reminder.whatsappUrl && reminder.status === 'PENDING' && reminder.phone && (
                  <>
                    <a href={`tel:${reminder.phone.replace(/[^\d+]/g, '')}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
                      <Phone className="size-4" aria-hidden />
                      Llamar
                    </a>
                    <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: reminder.id, action: 'sent' })}>
                      Marcar avisado
                    </Button>
                  </>
                )}
                {(reminder.status === 'PENDING' || reminder.status === 'SENT' || reminder.status === 'FAILED') &&
                  reminder.appointment.status !== 'CANCELLED' && (
                    <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: reminder.id, action: 'confirm' })}>
                      Confirmó
                    </Button>
                  )}
                {reminder.status !== 'CONFIRMED' && reminder.status !== 'CANCELLED' && (
                  <Button variant="outline" size="sm" disabled={act.isPending} onClick={() => act.mutate({ id: reminder.id, action: 'cancel' })}>
                    Descartar
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
