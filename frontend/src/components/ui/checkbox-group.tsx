'use client'

import { cn } from '@/lib/utils'

interface Option {
  value: string
  label: string
  hint?: string
}

interface CheckboxGroupProps {
  legend: string
  options: Option[]
  value: string[]
  onChange: (value: string[]) => void
  error?: string | undefined
  idPrefix: string
}

export function CheckboxGroup({ legend, options, value, onChange, error, idPrefix }: CheckboxGroupProps) {
  const toggle = (optionValue: string) => {
    onChange(value.includes(optionValue) ? value.filter((v) => v !== optionValue) : [...value, optionValue])
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {options.map((option) => {
          const id = `${idPrefix}-${option.value}`
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-start gap-2 rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted',
                value.includes(option.value) && 'border-primary/50 bg-primary/5',
              )}
            >
              <input
                id={id}
                type="checkbox"
                className="mt-0.5 size-4 accent-[var(--primary)]"
                checked={value.includes(option.value)}
                onChange={() => toggle(option.value)}
              />
              <span>
                {option.label}
                {option.hint && <span className="block text-xs text-muted-foreground">{option.hint}</span>}
              </span>
            </label>
          )
        })}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  )
}
