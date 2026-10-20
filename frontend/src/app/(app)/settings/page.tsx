'use client'

import { ArrowDown, ArrowUp, Monitor, Moon, Sun } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { FormError } from '@/components/form-error'
import { LoadingBlock, PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { useExchangeRates, useSetExchangeRate } from '@/hooks/use-billing'
import { useSavePreferences } from '@/hooks/use-preferences'
import { useSession } from '@/hooks/use-session'
import type { SessionUser } from '@/lib/api'
import { isValidAmount, normalizeAmount } from '@/lib/billing'
import { formatDateTime, formatMoney, pad } from '@/lib/format'
import { moveInOrder, navLinks } from '@/lib/nav'
import { can } from '@/lib/permissions'
import { THEME_LABELS, type ThemePreference } from '@/lib/theme'
import { cn } from '@/lib/utils'

const THEME_ICONS = { SYSTEM: Monitor, LIGHT: Sun, DARK: Moon } as const

const VIEW_LABELS = { timeGridWeek: 'Semana', timeGridDay: 'Día', listWeek: 'Lista' } as const

const HOURS = Array.from({ length: 25 }, (_, hour) => hour)
const hourText = (hour: number) => `${pad(hour)}:00`

export default function SettingsPage() {
  const session = useSession()
  const save = useSavePreferences()
  const user = session.data?.user
  if (!user) return <LoadingBlock />

  const preferences = user.preferences
  const set = (patch: Partial<SessionUser['preferences']>) => save.mutate({ preferences: patch })

  return (
    <>
      <PageHeader title="Configuración" description="Preferencias de tu usuario. Se aplican en cualquier computadora donde ingreses." />
      <FormError error={save.error} className="mb-4" />
      <div className="space-y-4">
        <Section id="tema" title="Tema">
          <div role="radiogroup" aria-labelledby="tema" className="grid gap-3 sm:grid-cols-3">
            {(Object.keys(THEME_LABELS) as ThemePreference[]).map((theme) => {
              const Icon = THEME_ICONS[theme]
              const selected = user.theme === theme
              return (
                <button
                  key={theme}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={save.isPending}
                  onClick={() => save.mutate({ theme })}
                  className={cn(
                    'flex items-center gap-3 rounded-md border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-muted',
                    selected && 'border-primary bg-primary/10',
                  )}
                >
                  <Icon className="size-5 text-primary" aria-hidden />
                  {THEME_LABELS[theme]}
                </button>
              )
            })}
          </div>
        </Section>

        <MenuSection user={user} save={save} />

        <Section id="agenda" title="Agenda" description="Cómo se ve la agenda al abrirla.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Vista inicial" htmlFor="pref-view">
              <Select
                id="pref-view"
                value={preferences.agendaView}
                disabled={save.isPending}
                onChange={(event) => set({ agendaView: event.target.value as keyof typeof VIEW_LABELS })}
              >
                {(Object.keys(VIEW_LABELS) as (keyof typeof VIEW_LABELS)[]).map((view) => (
                  <option key={view} value={view}>
                    {VIEW_LABELS[view]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Desde" htmlFor="pref-start">
              <Select
                id="pref-start"
                value={preferences.agendaStartHour}
                disabled={save.isPending}
                onChange={(event) => set({ agendaStartHour: Number(event.target.value) })}
              >
                {HOURS.slice(0, 24)
                  .filter((hour) => hour < preferences.agendaEndHour)
                  .map((hour) => (
                    <option key={hour} value={hour}>
                      {hourText(hour)}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Hasta" htmlFor="pref-end">
              <Select
                id="pref-end"
                value={preferences.agendaEndHour}
                disabled={save.isPending}
                onChange={(event) => set({ agendaEndHour: Number(event.target.value) })}
              >
                {HOURS.filter((hour) => hour > preferences.agendaStartHour).map((hour) => (
                  <option key={hour} value={hour}>
                    {hourText(hour)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Intervalo de la grilla" htmlFor="pref-slot">
              <Select
                id="pref-slot"
                value={preferences.agendaSlotMinutes}
                disabled={save.isPending}
                onChange={(event) => set({ agendaSlotMinutes: Number(event.target.value) === 15 ? 15 : 30 })}
              >
                <option value={15}>15 minutos</option>
                <option value={30}>30 minutos</option>
              </Select>
            </Field>
          </div>
          <fieldset className="mt-4 space-y-2">
            <legend className="text-sm font-medium">Fines de semana</legend>
            <p className="text-xs text-muted-foreground">Solo se pueden ocultar si ningún profesional atiende ese día.</p>
            <div className="flex flex-wrap gap-4 text-sm">
              {(
                [
                  ['showSaturday', 'Mostrar sábados'],
                  ['showSunday', 'Mostrar domingos'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    disabled={save.isPending}
                    onChange={(event) => set({ [key]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </Section>

        {can(user, 'account:read') && <ExchangeRateSection canEdit={can(user, 'exchange-rate:manage')} />}
      </div>
    </>
  )
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border bg-card p-5 shadow-sm">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function MenuSection({ user, save }: { user: SessionUser; save: ReturnType<typeof useSavePreferences> }) {
  const links = navLinks(user)
  const order = links.map((link) => link.href)
  const pending = save.isPending
  const onChange = (menuOrder: string[]) => save.mutate({ preferences: { menuOrder } })
  return (
    <Section id="menu" title="Menú y pantalla de inicio" description="Ordená el menú a tu gusto y elegí qué pantalla se abre al entrar.">
      <ol className="divide-y rounded-md border">
        {links.map((link, index) => {
          const Icon = link.icon
          return (
            <li key={link.href} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <span className="flex items-center gap-2">
                <Icon className="size-4 text-muted-foreground" aria-hidden />
                {link.label}
              </span>
              <span className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Subir ${link.label}`}
                  disabled={pending || index === 0}
                  onClick={() => onChange(moveInOrder(order, link.href, -1))}
                >
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Bajar ${link.label}`}
                  disabled={pending || index === links.length - 1}
                  onClick={() => onChange(moveInOrder(order, link.href, 1))}
                >
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
              </span>
            </li>
          )
        })}
      </ol>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <Field label="Pantalla al entrar" htmlFor="pref-home" className="sm:w-64">
          <Select
            id="pref-home"
            value={links.some((link) => link.href === user.preferences.homePage) ? user.preferences.homePage : '/dashboard'}
            disabled={pending}
            onChange={(event) => save.mutate({ preferences: { homePage: event.target.value } })}
          >
            {links
              .filter((link) => link.href !== '/settings')
              .map((link) => (
                <option key={link.href} value={link.href}>
                  {link.label}
                </option>
              ))}
          </Select>
        </Field>
        <Button variant="outline" size="sm" disabled={pending || user.preferences.menuOrder.length === 0} onClick={() => onChange([])}>
          Restablecer el orden
        </Button>
      </div>
    </Section>
  )
}

function ExchangeRateSection({ canEdit }: { canEdit: boolean }) {
  const rates = useExchangeRates(true)
  const setRate = useSetExchangeRate()
  const [value, setValue] = useState('')
  const current = rates.data?.current

  return (
    <Section id="consultorio" title="Consultorio: cotización del dólar" description="Es una sola para todo el consultorio y se usa en los cobros en dólares.">
      <p className="text-sm">
        {current ? (
          <>
            Vigente: <span className="font-semibold">{formatMoney(current.rate)}</span> por dólar
            <span className="text-xs text-muted-foreground">
              {' '}
              · cargada por {current.setBy} el {formatDateTime(current.createdAt)}
            </span>
          </>
        ) : (
          'Todavía no se cargó ninguna cotización.'
        )}
      </p>
      {canEdit && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            setRate.mutate(normalizeAmount(value), { onSuccess: () => setValue('') })
          }}
        >
          <Field
            label="Nueva cotización (pesos por dólar)"
            htmlFor="exchange-rate"
            className="sm:w-64"
            error={value && !isValidAmount(value) ? 'Importe inválido' : undefined}
          >
            <Input id="exchange-rate" inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
          </Field>
          <Button type="submit" disabled={!isValidAmount(value) || setRate.isPending}>
            Guardar cotización
          </Button>
        </form>
      )}
      <FormError error={setRate.error ?? rates.error} className="mt-3" />
      {rates.data && rates.data.history.length > 1 && (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Historial de cambios</summary>
          <ul className="mt-2 space-y-1">
            {rates.data.history.map((rate) => (
              <li key={rate.id} className="text-xs">
                {formatMoney(rate.rate)} · {rate.setBy} · {formatDateTime(rate.createdAt)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  )
}
