import { Ban, Check, CircleCheck, Clock, UserX, type LucideIcon } from 'lucide-react'
import type { Appointment, AppointmentStatus, Professional } from '@/lib/api'
import { STATUS_LABELS } from '@/lib/appointments'
import { formatTime } from '@/lib/format'
import { colorVar } from '@/lib/professional-colors'
import { cn } from '@/lib/utils'

const STATUS_ICONS: Record<AppointmentStatus, LucideIcon> = {
  SCHEDULED: Clock,
  CONFIRMED: CircleCheck,
  ATTENDED: Check,
  NO_SHOW: UserX,
  CANCELLED: Ban,
}

const LEGEND_ORDER: AppointmentStatus[] = ['SCHEDULED', 'CONFIRMED', 'ATTENDED', 'NO_SHOW', 'CANCELLED']

function CellBody({ name, shortName, practice, status }: { name: string; shortName: string; practice: string | null; status: AppointmentStatus }) {
  const Icon = STATUS_ICONS[status]
  return (
    <div className="flex h-full min-w-0 gap-1 overflow-hidden px-1 py-0.5 text-xs leading-tight @max-[5.5rem]:px-0.5">
      <Icon className="mt-px size-3 shrink-0 @max-[5.5rem]:hidden" aria-label={STATUS_LABELS[status]} />
      <div className="min-w-0">
        <p className="line-clamp-2 break-words font-semibold @max-[7rem]:hidden">{name}</p>
        <p className="hidden break-all font-semibold leading-none @max-[7rem]:line-clamp-2">{shortName}</p>
        {practice && <p className="truncate opacity-90 @max-[5.5rem]:hidden">{practice}</p>}
      </div>
    </div>
  )
}

export function AppointmentCell({ appointment, list }: { appointment: Appointment; list: boolean }) {
  const name = appointment.patient.fullName
  const practice = appointment.practice?.name ?? null
  const title = [
    `${formatTime(appointment.startsAt)} a ${formatTime(appointment.endsAt)}`,
    name,
    practice,
    appointment.professional.displayName,
    STATUS_LABELS[appointment.status],
  ]
    .filter(Boolean)
    .join(' · ')
  if (list) {
    const Icon = STATUS_ICONS[appointment.status]
    return (
      <span className="flex flex-wrap items-center gap-x-2 text-sm" title={title}>
        <Icon className="size-3.5 shrink-0" aria-hidden />
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">{[practice, appointment.professional.displayName, STATUS_LABELS[appointment.status]].filter(Boolean).join(' · ')}</span>
      </span>
    )
  }
  return (
    <div title={title} className="h-full">
      <CellBody name={name} shortName={name.split(',')[0] ?? name} practice={practice} status={appointment.status} />
    </div>
  )
}

export function AgendaLegend({ professionals }: { professionals: Professional[] }) {
  return (
    <div data-tour="agenda-legend" className="mt-3 space-y-2 text-xs text-muted-foreground" aria-label="Referencias">
      {professionals.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {professionals.map((professional) => (
            <span key={professional.id} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: colorVar(professional.color) }} />
              {professional.displayName}
            </span>
          ))}
        </div>
      )}
      <div className="fc">
        <ul className="flex flex-row flex-wrap gap-2" aria-label="Estados de los turnos">
          {LEGEND_ORDER.map((status) => (
            <li key={status} className="w-32">
              <div className={cn('fc-event fc-v-event fc-turno h-9', `fc-estado-${status.toLowerCase()}`)}>
                <div className="fc-event-main h-full">
                  <CellBody name={STATUS_LABELS[status]} shortName={STATUS_LABELS[status]} practice={null} status={status} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
