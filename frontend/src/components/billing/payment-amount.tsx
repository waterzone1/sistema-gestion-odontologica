'use client'

import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { Currency } from '@/lib/api'
import { formatMoney } from '@/lib/format'

interface Props {
  payment: { amount: string; currency: Currency; originalAmount: string; exchangeRate: string }
}

export function PaymentAmount({ payment }: Props) {
  const [open, setOpen] = useState(false)
  if (payment.currency === 'ARS') return <>{formatMoney(payment.amount)}</>
  return (
    <>
      {formatMoney(payment.originalAmount, payment.currency)}
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? 'Ocultar la conversión a pesos' : 'Ver la conversión a pesos'}
        onClick={() => setOpen(!open)}
        className="ml-1 inline-flex items-center rounded px-0.5 align-middle text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ChevronDown className={`size-3.5 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <span className="text-xs font-normal text-muted-foreground">
          {' '}
          a {formatMoney(payment.exchangeRate)} = {formatMoney(payment.amount)}
        </span>
      )}
    </>
  )
}
