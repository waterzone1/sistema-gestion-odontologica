interface Props {
  label: string
  value: string
  hint?: string | undefined
  emphasis?: boolean | undefined
}

export function Figure({ label, value, hint, emphasis }: Props) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={emphasis ? 'mt-1 text-xl font-semibold text-primary' : 'mt-1 text-xl font-semibold'}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
