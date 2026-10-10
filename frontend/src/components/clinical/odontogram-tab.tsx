'use client'

import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { LoadingBlock } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input, Select } from '@/components/ui/input'
import { Tabs } from '@/components/ui/tabs'
import { useOdontogram, useRecordFinding } from '@/hooks/use-clinical'
import type { Odontogram } from '@/lib/api'
import { formatDateTime } from '@/lib/format'
import {
  CONDITION_COLORS,
  CONDITION_LABELS,
  isWholeTooth,
  PERMANENT_ROWS,
  surfaceAt,
  SURFACE_LABELS,
  TEMPORARY_ROWS,
  toothViews,
  type Condition,
  type Region,
  type Surface,
  type ToothView,
} from '@/lib/odontogram'
import { cn } from '@/lib/utils'

interface Props {
  patientId: string
  canWrite: boolean
}

const TOOTH = 40
const GAP = 6
const MIDLINE = 14

export function OdontogramTab({ patientId, canWrite }: Props) {
  const odontogram = useOdontogram(patientId)
  const [dentition, setDentition] = useState('permanente')
  const [selected, setSelected] = useState<number | null>(null)

  if (odontogram.isPending) return <LoadingBlock />
  if (odontogram.isError) return <FormError error={odontogram.error} />

  const rows = dentition === 'permanente' ? PERMANENT_ROWS : TEMPORARY_ROWS
  const views = toothViews(odontogram.data.current)

  return (
    <div className="space-y-4">
      <Tabs
        items={[
          { id: 'permanente', label: 'Permanente' },
          { id: 'temporal', label: 'Temporal' },
        ]}
        active={dentition}
        onChange={(value) => {
          setDentition(value)
          setSelected(null)
        }}
        label="Dentición"
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <section aria-label="Odontograma" className="space-y-3 rounded-lg border bg-card p-4 shadow-sm">
            <div className="hidden overflow-x-auto sm:block">
              <Chart
                rows={rows}
                views={views}
                planned={new Set(odontogram.data.planned.map((p) => p.tooth))}
                selected={selected}
                onSelect={setSelected}
              />
            </div>
            <div className="sm:hidden">
              <Field label="Pieza" htmlFor="tooth-select">
                <Select
                  id="tooth-select"
                  value={selected ?? ''}
                  onChange={(event) => setSelected(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">Elegí una pieza</option>
                  {rows.flat().map((tooth) => (
                    <option key={tooth} value={tooth}>
                      {tooth}
                      {views.has(tooth) ? ' · con registros' : ''}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Legend />
          </section>
          <ToothPanel
            key={selected ?? 'none'}
            patientId={patientId}
            tooth={selected}
            odontogram={odontogram.data}
            canWrite={canWrite}
          />
        </div>
      </Tabs>
    </div>
  )
}

function Chart({
  rows,
  views,
  planned,
  selected,
  onSelect,
}: {
  rows: number[][]
  views: Map<number, ToothView>
  planned: Set<number>
  selected: number | null
  onSelect: (tooth: number) => void
}) {
  const perRow = Math.max(...rows.map((row) => row.length))
  const width = perRow * (TOOTH + GAP) + MIDLINE
  const height = rows.length * (TOOTH + 34)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mx-auto w-full max-w-4xl" role="group" aria-label="Piezas dentarias">
      {rows.map((row, rowIndex) =>
        row.map((tooth, index) => {
          const x = index * (TOOTH + GAP) + (index >= row.length / 2 ? MIDLINE : 0) + ((perRow - row.length) * (TOOTH + GAP)) / 2
          const y = rowIndex * (TOOTH + 34) + (rowIndex === 0 ? 16 : 4)
          const labelY = rowIndex === 0 ? y - 4 : y + TOOTH + 13
          return (
            <ToothShape
              key={tooth}
              tooth={tooth}
              x={x}
              y={y}
              labelY={labelY}
              view={views.get(tooth)}
              planned={planned.has(tooth)}
              selected={selected === tooth}
              onSelect={() => onSelect(tooth)}
            />
          )
        }),
      )}
    </svg>
  )
}

const REGIONS: { region: Region; points: (x: number, y: number) => string }[] = [
  { region: 'top', points: (x, y) => `${x},${y} ${x + TOOTH},${y} ${x + 28},${y + 12} ${x + 12},${y + 12}` },
  { region: 'bottom', points: (x, y) => `${x + 12},${y + 28} ${x + 28},${y + 28} ${x + TOOTH},${y + TOOTH} ${x},${y + TOOTH}` },
  { region: 'left', points: (x, y) => `${x},${y} ${x + 12},${y + 12} ${x + 12},${y + 28} ${x},${y + TOOTH}` },
  { region: 'right', points: (x, y) => `${x + 28},${y + 12} ${x + TOOTH},${y} ${x + TOOTH},${y + TOOTH} ${x + 28},${y + 28}` },
  { region: 'center', points: (x, y) => `${x + 12},${y + 12} ${x + 28},${y + 12} ${x + 28},${y + 28} ${x + 12},${y + 28}` },
]

function ToothShape({
  tooth,
  x,
  y,
  labelY,
  view,
  planned,
  selected,
  onSelect,
}: {
  tooth: number
  x: number
  y: number
  labelY: number
  view: ToothView | undefined
  planned: boolean
  selected: boolean
  onSelect: () => void
}) {
  const whole = view?.whole ?? []
  const missing = whole.includes('MISSING')
  const extraction = whole.includes('EXTRACTION_INDICATED')
  const description = [
    `Pieza ${tooth}`,
    ...whole.map((c) => CONDITION_LABELS[c]),
    ...Object.entries(view?.surfaces ?? {}).map(([s, c]) => `${s}: ${CONDITION_LABELS[c]}`),
    ...(planned ? ['con tratamiento planificado'] : []),
  ].join(', ')
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={description}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--ring)]"
    >
      <title>{description}</title>
      <text x={x + TOOTH / 2} y={labelY} textAnchor="middle" fontSize="11" className="fill-muted-foreground">
        {tooth}
      </text>
      {REGIONS.map(({ region, points }) => {
        const condition = view?.surfaces[surfaceAt(tooth, region)]
        return (
          <polygon
            key={region}
            points={points(x, y)}
            fill={condition ? (CONDITION_COLORS[condition] ?? 'var(--muted-foreground)') : 'var(--card)'}
            stroke="var(--muted-foreground)"
            strokeWidth="0.8"
            opacity={missing ? 0.35 : 1}
          />
        )
      })}
      {whole.includes('CROWN') && (
        <circle cx={x + TOOTH / 2} cy={y + TOOTH / 2} r={TOOTH / 2 + 2} fill="none" stroke="var(--pro-blue)" strokeWidth="2.5" />
      )}
      {whole.includes('ROOT_CANAL') && (
        <line x1={x + TOOTH / 2} y1={y - 2} x2={x + TOOTH / 2} y2={y + TOOTH + 2} stroke="var(--pro-violet)" strokeWidth="3" />
      )}
      {whole.includes('IMPLANT') && (
        <rect x={x + 14} y={y + 6} width="12" height="28" rx="3" fill="none" stroke="var(--pro-slate)" strokeWidth="2.5" />
      )}
      {whole.includes('PROSTHESIS') && (
        <rect x={x - 2} y={y - 2} width={TOOTH + 4} height={TOOTH + 4} fill="none" stroke="var(--pro-teal)" strokeWidth="2" strokeDasharray="4 3" />
      )}
      {(missing || extraction) && (
        <g stroke={extraction ? 'var(--destructive)' : 'var(--muted-foreground)'} strokeWidth="3">
          <line x1={x + 2} y1={y + 2} x2={x + TOOTH - 2} y2={y + TOOTH - 2} />
          <line x1={x + TOOTH - 2} y1={y + 2} x2={x + 2} y2={y + TOOTH - 2} />
        </g>
      )}
      {planned && <circle cx={x + TOOTH - 2} cy={y + 2} r="4" fill="var(--primary)" />}
      <rect
        x={x - 3}
        y={y - 3}
        width={TOOTH + 6}
        height={TOOTH + 6}
        rx="4"
        fill="none"
        stroke={selected ? 'var(--primary)' : 'transparent'}
        strokeWidth="2"
      />
    </g>
  )
}

function Legend() {
  const items: { label: string; color?: string; mark?: string }[] = [
    { label: 'Caries', color: CONDITION_COLORS.CARIES },
    { label: 'Restauración', color: CONDITION_COLORS.RESTORATION },
    { label: 'Provisoria', color: CONDITION_COLORS.TEMP_RESTORATION },
    { label: 'Sellante', color: CONDITION_COLORS.SEALANT },
    { label: 'Fractura', color: CONDITION_COLORS.FRACTURE },
    { label: 'Corona: círculo azul', mark: '◯' },
    { label: 'Endodoncia: línea violeta', mark: '│' },
    { label: 'Ausente: cruz gris · Extracción indicada: cruz roja', mark: '✕' },
    { label: 'Con tratamiento planificado', mark: '●' },
  ]
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Referencias del odontograma">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {item.color ? (
            <span aria-hidden className="size-3 rounded-sm" style={{ backgroundColor: item.color }} />
          ) : (
            <span aria-hidden>{item.mark}</span>
          )}
          {item.label}
        </li>
      ))}
    </ul>
  )
}

function ToothPanel({
  patientId,
  tooth,
  odontogram,
  canWrite,
}: {
  patientId: string
  tooth: number | null
  odontogram: Odontogram
  canWrite: boolean
}) {
  const record = useRecordFinding(patientId)
  const [condition, setCondition] = useState<Condition>('CARIES')
  const [surfaces, setSurfaces] = useState<Surface[]>([])
  const [note, setNote] = useState('')

  if (tooth === null) {
    return (
      <aside className="rounded-lg border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        Elegí una pieza para ver su estado, su historial y registrar cambios.
      </aside>
    )
  }

  const current = odontogram.current.filter((f) => f.tooth === tooth)
  const history = odontogram.history.filter((f) => f.tooth === tooth)
  const planned = odontogram.planned.filter((w) => w.tooth === tooth)
  const performed = odontogram.performed.filter((w) => w.tooth === tooth)
  const whole = isWholeTooth(condition)
  const valid = whole || condition === 'HEALTHY' || surfaces.length > 0

  return (
    <aside aria-label={`Pieza ${tooth}`} className="space-y-4 rounded-lg border bg-card p-4 shadow-sm">
      <h3 className="text-base font-semibold">Pieza {tooth}</h3>
      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">Estado actual</p>
        {current.length === 0 ? (
          <p className="text-sm">Sin registros: sana</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {current.map((f) => (
              <li key={f.id}>
                <Badge variant="muted">
                  {f.surface ? `${SURFACE_LABELS[f.surface]}: ` : ''}
                  {CONDITION_LABELS[f.condition]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(planned.length > 0 || performed.length > 0) && (
        <div className="space-y-2 border-t pt-3 text-sm">
          {planned.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Planificado</p>
              <ul className="space-y-0.5">
                {planned.map((w) => (
                  <li key={w.id}>
                    {w.practice}
                    {w.surfaces.length > 0 && ` (${w.surfaces.join(', ')})`}
                    <span className="text-xs text-muted-foreground"> · {w.status === 'IN_PROGRESS' ? 'en curso' : 'pendiente'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {performed.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Realizado</p>
              <ul className="space-y-0.5">
                {performed.map((w) => (
                  <li key={w.id}>
                    {w.practice}
                    {w.surfaces.length > 0 && ` (${w.surfaces.join(', ')})`}
                    <span className="text-xs text-muted-foreground"> · {formatDateTime(w.date)} · {w.professional}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {canWrite && (
        <form
          className="space-y-3 border-t pt-3"
          onSubmit={(event) => {
            event.preventDefault()
            record.mutate(
              { tooth, surfaces: whole ? [] : surfaces, condition, note },
              {
                onSuccess: () => {
                  setSurfaces([])
                  setNote('')
                },
              },
            )
          }}
        >
          <Field label="Registrar condición" htmlFor="finding-condition">
            <Select id="finding-condition" value={condition} onChange={(e) => setCondition(e.target.value as Condition)}>
              {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {!whole && (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">
                Superficies{condition === 'HEALTHY' ? ' (sin marcar: toda la pieza)' : ''}
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(SURFACE_LABELS) as Surface[]).map((surface) => {
                  const active = surfaces.includes(surface)
                  return (
                    <Button
                      key={surface}
                      type="button"
                      size="sm"
                      variant={active ? 'default' : 'outline'}
                      aria-pressed={active}
                      title={SURFACE_LABELS[surface]}
                      onClick={() =>
                        setSurfaces((current) => (active ? current.filter((s) => s !== surface) : [...current, surface]))
                      }
                    >
                      {surface}
                    </Button>
                  )
                })}
              </div>
            </fieldset>
          )}
          <Field label="Observación (opcional)" htmlFor="finding-note">
            <Input id="finding-note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <FormError error={record.error} />
          <Button type="submit" className="w-full" disabled={!valid || record.isPending}>
            {record.isPending ? 'Guardando…' : 'Registrar'}
          </Button>
        </form>
      )}

      <div className="border-t pt-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Historial</p>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin registros.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.map((f) => (
              <li key={f.id} className={cn('border-l-2 pl-2', f.condition === 'HEALTHY' ? 'border-success' : 'border-primary/50')}>
                <span className="font-medium">
                  {CONDITION_LABELS[f.condition]}
                  {f.surface ? ` · ${SURFACE_LABELS[f.surface]}` : ''}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatDateTime(f.createdAt)} · {f.professional.displayName}
                </span>
                {f.note && <span className="block text-xs">{f.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}
