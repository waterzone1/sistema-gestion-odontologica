'use client'

import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { adjustByPercent, isValidAmount, PRICE_PRESETS } from '@/lib/billing'
import { formatMoney } from '@/lib/format'

interface Props {
  id: string
  value: string
  onChange: (value: string) => void
  catalogPrice: string
}

export function PriceField({ id, value, onChange, catalogPrice }: Props) {
  const invalid = value !== '' && !isValidAmount(value)
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
        {PRICE_PRESETS.map((percent) => (
          <Button
            key={percent}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(adjustByPercent(catalogPrice, percent))}
          >
            {percent > 0 ? `+${percent}` : percent} %
          </Button>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => onChange(adjustByPercent(catalogPrice, 0))}>
          Catálogo
        </Button>
      </div>
    </Field>
  )
}
