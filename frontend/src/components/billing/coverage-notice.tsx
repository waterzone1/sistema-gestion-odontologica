'use client'

import { ShieldCheck } from 'lucide-react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { CoverageQuote } from '@/lib/api'
import { formatMoney } from '@/lib/format'

export interface CoverageChoice {
  apply: boolean
  authorizationCode: string
}

interface Props {
  quote: CoverageQuote | undefined
  value: CoverageChoice
  onChange: (value: CoverageChoice) => void
}

export function CoverageNotice({ quote, value, onChange }: Props) {
  if (!quote?.coverage) return null
  const { coverage } = quote
  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
      <label className="flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={value.apply}
          onChange={(event) => onChange({ ...value, apply: event.target.checked })}
        />
        <span>
          <span className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Aplicar cobertura {coverage.provider.name} {coverage.plan.name}
          </span>
          <span className="block text-xs text-muted-foreground">
            Afiliado {coverage.affiliateNumber}
            {quote.insurerAmount !== null &&
              ` · Cubre ${formatMoney(quote.insurerAmount)} · Paga el paciente ${formatMoney(quote.patientCopay ?? '0')}`}
          </span>
        </span>
      </label>
      {value.apply && (
        <Field
          label={quote.requiresAuthorization ? 'Número de autorización' : 'Número de autorización (opcional)'}
          htmlFor="coverage-authorization"
          hint={quote.requiresAuthorization ? 'El convenio exige autorización para esta práctica.' : undefined}
        >
          <Input
            id="coverage-authorization"
            maxLength={60}
            value={value.authorizationCode}
            onChange={(event) => onChange({ ...value, authorizationCode: event.target.value })}
          />
        </Field>
      )}
    </div>
  )
}

export function coverageReady(quote: CoverageQuote | undefined, value: CoverageChoice): boolean {
  return !quote?.coverage || !value.apply || !quote.requiresAuthorization || value.authorizationCode.trim() !== ''
}

export function coverageInput(quote: CoverageQuote | undefined, value: CoverageChoice) {
  if (!quote?.coverage) return {}
  return {
    applyCoverage: value.apply,
    ...(value.apply && value.authorizationCode.trim() ? { authorizationCode: value.authorizationCode.trim() } : {}),
  }
}
