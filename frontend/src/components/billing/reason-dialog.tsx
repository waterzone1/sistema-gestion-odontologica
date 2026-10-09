'use client'

import { useState } from 'react'
import { FormError } from '@/components/form-error'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  pending: boolean
  error: unknown
  onConfirm: (reason: string) => void
}

export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel, pending, error, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description}>
        <Field label="Motivo" htmlFor="void-reason">
          <Input id="void-reason" value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <FormError error={error} className="mt-3" />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={() => onConfirm(reason.trim())} disabled={pending || reason.trim().length < 3}>
            {pending ? 'Procesando…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
