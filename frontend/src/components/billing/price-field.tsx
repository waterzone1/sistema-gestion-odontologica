'use client'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { adjustByPercent, isValidAmount, normalizeAmount, PRICE_PRESETS } from '@/lib/billing'
import { formatMoney } from '@/lib/format'

interface Props {
  id: string
  value: string
  onChange: (value: string) => void
  catalogPrice: string
}

export function PriceField({ id, value, onChange, catalogPrice }: Props) {
  const invalid = value !== '' && !isValidAmount(value)
  const current = isValidAmount(value) ? Number(normalizeAmount(value)).toFixed(2) : null
  const preset = (percent: number) => {
    const target = adjustByPercent(catalogPrice, percent)
    const active = current === target
    return (
      <Button
        key={percent}
        type="button"
        variant={active ? 'default' : 'outline'}
        size="sm"
        aria-pressed={active}
        onClick={() => onChange(target)}
      >
        {percent === 0 ? 'Catálogo' : `${percent > 0 ? '+' : ''}${percent} %`}
      </Button>
    )
  }
  return (
    <Field
      label="Precio"
      htmlFor={id}
      hint={`Precio de catálogo: ${formatMoney(catalogPrice)}. Los porcentajes se aplican sobre ese precio.`}
      error={invalid ? 'Ingresá un importe mayor a cero, con hasta 2 decimales' : undefined}
    >
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
      />
      <div className="flex flex-wrap gap-1.5">
        {[...PRICE_PRESETS, 0].map(preset)}
      </div>
    </Field>
  )
}
