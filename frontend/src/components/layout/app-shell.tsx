'use client'

import { LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { LoadingBlock } from '@/components/page-header'
import { useLogout, useSession } from '@/hooks/use-session'
import { SERVER_UNREACHABLE } from '@/lib/api'
import { visibleNav } from '@/lib/nav'
import { ROLE_LABELS } from '@/lib/permissions'
import { cn } from '@/lib/utils'

export function AppShell({ children }: { children: ReactNode }) {
  const { data, isPending, isError, refetch } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const logout = useLogout()

  const noSession = data === null
  const mustChange = data?.user.mustChangePassword ?? false
  useEffect(() => {
    if (noSession) router.replace('/login')
    else if (mustChange) router.replace('/cambiar-clave')
  }, [noSession, mustChange, router])

  if (isError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-sm text-destructive">{SERVER_UNREACHABLE}</p>
        <Button variant="outline" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </main>
    )
  }
  if (isPending || !data || mustChange) return <LoadingBlock label="Cargando…" />

  const { user } = data
  const groups = visibleNav(user)

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r bg-card md:flex md:flex-col">
        <div className="px-5 py-4 text-sm font-semibold leading-tight">Sistema de Gestión Odontológica</div>
        <nav aria-label="Principal" className="flex-1 space-y-5 px-3 py-2">
          {groups.map((group) => (
            <div key={group.label ?? 'inicio'} className="space-y-1">
              {group.label && (
                <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.label}
                </p>
              )}
              {group.items.map((item) => (
                <NavLink key={item.href} {...item} active={pathname.startsWith(item.href)} />
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3">
          <span className="text-sm font-semibold md:hidden">SGO</span>
          <span className="hidden md:block" />
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{user.displayName}</p>
              <p className="text-xs text-muted-foreground">
                {user.roles.map((role) => ROLE_LABELS[role]).join(' · ')}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => logout.mutate()}
              disabled={logout.isPending}
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </header>

        <nav aria-label="Principal (móvil)" className="flex gap-1 overflow-x-auto border-b bg-card px-3 py-2 md:hidden">
          {groups.flatMap((group) => group.items).map((item) => (
            <NavLink key={item.href} {...item} active={pathname.startsWith(item.href)} />
          ))}
        </nav>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </div>
    </div>
  )
}

interface NavLinkProps {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>
  active: boolean
}

function NavLink({ href, label, icon: Icon, active }: NavLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted',
        active && 'bg-primary/10 font-medium text-primary hover:bg-primary/10',
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  )
}
