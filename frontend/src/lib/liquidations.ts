import type { Liquidation, LiquidationSummary } from './api'

export const LIQUIDATION_STATUS_LABELS: Record<LiquidationSummary['status'], string> = {
  DRAFT: 'Borrador',
  SUBMITTED: 'Presentada',
  PAID: 'Pagada',
  CANCELLED: 'Anulada',
}

export const ITEM_RESULT_LABELS: Record<Liquidation['items'][number]['status'], string> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  DEBITED: 'Debitada',
  REJECTED: 'Rechazada',
}

export function liquidationVariant(status: LiquidationSummary['status']): 'default' | 'success' | 'muted' {
  return status === 'PAID' ? 'success' : status === 'CANCELLED' ? 'muted' : 'default'
}
