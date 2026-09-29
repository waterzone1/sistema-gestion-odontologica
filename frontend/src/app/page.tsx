import { ApiStatus } from '@/components/api-status'

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-4 py-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Sistema de Gestión Odontológica</h1>
        <p className="text-sm text-muted-foreground">
          Pacientes, agenda, historia clínica y cobros en un solo lugar.
        </p>
      </header>
      <section className="rounded-lg border bg-card p-5 shadow-sm" aria-labelledby="estado">
        <h2 id="estado" className="mb-3 text-sm font-medium">
          Estado del sistema
        </h2>
        <ApiStatus />
      </section>
    </main>
  )
}
