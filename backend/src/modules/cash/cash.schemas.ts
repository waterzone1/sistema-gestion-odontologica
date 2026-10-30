import { z } from 'zod'
import { currencySchema, paymentMethodSchema } from '../billing/billing.schemas.js'

export const setExchangeRateSchema = z
  .object({
    rate: z
      .string()
      .trim()
      .regex(/^(?!0+(\.0+)?$)\d{1,8}(\.\d{1,2})?$/, 'Ingresá una cotización mayor a cero, con hasta 2 decimales')
      .meta({ description: 'Pesos por dólar', example: '1250.50' }),
  })
  .meta({ id: 'SetExchangeRateInput' })

const exchangeRateSchema = z
  .object({
    id: z.uuid(),
    currency: currencySchema,
    rate: z.string(),
    setBy: z.string(),
    createdAt: z.iso.datetime(),
  })

export const exchangeRatesSchema = z
  .object({
    current: exchangeRateSchema.nullable(),
    history: z.array(exchangeRateSchema).meta({ description: 'Últimos 20 cambios, del más reciente al más antiguo' }),
  })
  .meta({ id: 'ExchangeRates' })

export const cashQuerySchema = z.object({
  date: z.iso.date('Fecha inválida').optional().meta({ description: 'Día en la zona horaria del consultorio. Por defecto, hoy' }),
})

const movementSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['PAYMENT', 'CREDIT']).meta({ description: 'CREDIT es un uso de saldo a favor: no entra plata' }),
  receivedAt: z.iso.datetime(),
  patient: z.object({ id: z.uuid(), fullName: z.string() }),
  method: z.enum(['CASH', 'TRANSFER', 'CARD', 'MERCADOPAGO', 'OTHER', 'CREDIT']),
  currency: currencySchema,
  originalAmount: z.string(),
  exchangeRate: z.string(),
  amount: z.string().meta({ description: 'Equivalente en pesos' }),
  externalReference: z.string().nullable(),
  createdBy: z.string(),
  status: z.enum(['ACTIVE', 'VOIDED']),
  voidReason: z.string().nullable(),
})

const totalSchema = z.object({
  method: paymentMethodSchema,
  currency: currencySchema,
  count: z.number().int(),
  originalTotal: z.string(),
  amountTotal: z.string(),
})

export const cashDaySchema = z
  .object({
    date: z.iso.date(),
    movements: z.array(movementSchema),
    totals: z.array(totalSchema).meta({ description: 'Cobros vigentes por medio y moneda' }),
    byCurrency: z.array(z.object({ currency: currencySchema, originalTotal: z.string(), amountTotal: z.string() })),
    totalArs: z.string().meta({ description: 'Total cobrado en el día, en pesos' }),
    creditTotal: z.string().meta({ description: 'Saldo a favor aplicado en el día. No suma a la caja' }),
    voidedCount: z.number().int(),
  })
  .meta({ id: 'CashDay' })

export type ExchangeRateDto = z.infer<typeof exchangeRateSchema>
export type ExchangeRatesDto = z.infer<typeof exchangeRatesSchema>
export type CashDayDto = z.infer<typeof cashDaySchema>
