type ExceptionType = 'BLOCK' | 'VACATION' | 'ABSENCE' | 'EXTRA'

export interface Rule {
  branchId: string
  weekday: number
  startMinute: number
  endMinute: number
}

export interface Exception {
  type: ExceptionType
  branchId: string | null
  startsAt: Date
  endsAt: Date
}

export interface LocalMoment {
  day: string
  weekday: number
  minute: number
}

const MINUTES_PER_DAY = 1440
const DAY_MS = 86_400_000

const EXCEPTION_LABELS: Record<ExceptionType, string> = {
  BLOCK: 'bloqueo de agenda',
  VACATION: 'vacaciones',
  ABSENCE: 'ausencia',
  EXTRA: 'horario extraordinario',
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }

export function toLocal(date: Date, timeZone: string): LocalMoment {
  const parts = Object.fromEntries(formatterFor(timeZone).formatToParts(date).map((p) => [p.type, p.value]))
  return {
    day: `${parts['year']}-${parts['month']}-${parts['day']}`,
    weekday: WEEKDAYS[parts['weekday'] ?? ''] ?? 0,
    minute: Number(parts['hour']) * 60 + Number(parts['minute']),
  }
}

export function fromLocal(day: string, minute: number, timeZone: string): Date {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  const wall = Date.UTC(year, month - 1, date, 0, minute)
  let guess = wall
  for (let i = 0; i < 2; i += 1) {
    const local = toLocal(new Date(guess), timeZone)
    const [y, m, d] = local.day.split('-').map(Number) as [number, number, number]
    const seen = Date.UTC(y, m - 1, d, 0, local.minute)
    guess += wall - seen
  }
  return new Date(guess)
}

export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, date) + days * DAY_MS).toISOString().slice(0, 10)
}

export function rulesProblem(rules: readonly Rule[]): string | null {
  for (const rule of rules) {
    if (!Number.isInteger(rule.weekday) || rule.weekday < 1 || rule.weekday > 7) return 'Día de la semana inválido'
    if (rule.startMinute < 0 || rule.endMinute > MINUTES_PER_DAY || rule.startMinute >= rule.endMinute) {
      return 'Cada franja debe terminar después de empezar, dentro del mismo día'
    }
  }
  const sorted = [...rules].sort((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
  for (let i = 1; i < sorted.length; i += 1) {
    const previous = sorted[i - 1] as Rule
    const current = sorted[i] as Rule
    if (previous.weekday === current.weekday && current.startMinute < previous.endMinute) {
      return 'Hay franjas que se superponen en el mismo día'
    }
  }
  return null
}

function mergeIntervals(intervals: [number, number][]): [number, number][] {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const interval of sorted) {
    const last = merged[merged.length - 1]
    if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1])
    else merged.push([interval[0], interval[1]])
  }
  return merged
}

const overlaps = (aStart: number, aEnd: number, bStart: number, bEnd: number) => aStart < bEnd && bStart < aEnd

interface AvailabilityCheck {
  startsAt: Date
  endsAt: Date
  branchId: string
  rules: readonly Rule[]
  exceptions: readonly Exception[]
  timeZone: string
}

export function availabilityProblem(check: AvailabilityCheck): string | null {
  const { startsAt, endsAt, branchId, rules, exceptions, timeZone } = check
  const start = startsAt.getTime()
  const end = endsAt.getTime()

  const blocking = exceptions.find(
    (e) =>
      e.type !== 'EXTRA' &&
      (e.branchId === null || e.branchId === branchId) &&
      overlaps(start, end, e.startsAt.getTime(), e.endsAt.getTime()),
  )
  if (blocking) return `El profesional no atiende en ese horario: ${EXCEPTION_LABELS[blocking.type]}`

  const from = toLocal(startsAt, timeZone)
  const to = toLocal(new Date(end - 1), timeZone)
  if (from.day !== to.day) return 'El turno debe empezar y terminar el mismo día'

  const windows = mergeIntervals([
    ...rules
      .filter((r) => r.branchId === branchId && r.weekday === from.weekday)
      .map((r): [number, number] => [r.startMinute, r.endMinute]),
    ...exceptions
      .filter((e) => e.type === 'EXTRA' && e.branchId === branchId && overlaps(start, end, e.startsAt.getTime(), e.endsAt.getTime()))
      .map((e): [number, number] => [
        e.startsAt.getTime() <= fromLocal(from.day, 0, timeZone).getTime() ? 0 : toLocal(e.startsAt, timeZone).minute,
        e.endsAt.getTime() >= fromLocal(addDays(from.day, 1), 0, timeZone).getTime()
          ? MINUTES_PER_DAY
          : toLocal(e.endsAt, timeZone).minute,
      ]),
  ])
  const endMinute = to.minute + 1
  const covered = windows.some(([windowStart, windowEnd]) => windowStart <= from.minute && endMinute <= windowEnd)
  return covered ? null : 'Fuera del horario de atención del profesional en esa sede'
}

export interface Interval {
  start: Date
  end: Date
  branchId: string
}

export function expandRules(rules: readonly Rule[], from: Date, to: Date, timeZone: string): Interval[] {
  const intervals: Interval[] = []
  let day = toLocal(from, timeZone).day
  const lastDay = toLocal(new Date(to.getTime() - 1), timeZone).day
  while (day <= lastDay) {
    const weekday = toLocal(fromLocal(day, 720, timeZone), timeZone).weekday
    for (const rule of rules.filter((r) => r.weekday === weekday)) {
      const start = fromLocal(day, rule.startMinute, timeZone)
      const end = fromLocal(day, rule.endMinute, timeZone)
      if (start < to && end > from) intervals.push({ start, end, branchId: rule.branchId })
    }
    day = addDays(day, 1)
  }
  return intervals
}
