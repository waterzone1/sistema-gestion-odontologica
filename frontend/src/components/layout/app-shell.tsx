'use client'

import { LogOut, Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type ReactNode } from 'react'
import { GlobalSearch } from '@/components/layout/global-search'
import { ConnectionStatus } from '@/components/layout/connection-status'
import { TourHost } from '@/components/layout/tour-host'
import { Button } from '@/components/ui/button'
import { LoadingBlock } from '@/components/page-header'
import { useLogout, useSession } from '@/hooks/use-session'
import { SERVER_UNREACHABLE, type SessionUser } from '@/lib/api'
import { visibleNav } from '@/lib/nav'
import { can, ROLE_LABELS } from '@/lib/permissions'
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

  return (
    <Shell user={data.user} pathname={pathname} onLogout={() => logout.mutate()} loggingOut={logout.isPending}>
      {children}
    </Shell>
  )
}

function Shell({
  user,
  pathname,
  onLogout,
  loggingOut,
  children,
}: {
  user: SessionUser
  pathname: string
  onLogout: () => void
  loggingOut: boolean
  children: ReactNode
}) {
  const groups = visibleNav(user)
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
      <aside className="hidden border-r bg-card md:sticky md:top-0 md:flex md:h-screen md:flex-col">
        <div className="px-5 py-4 text-sm font-semibold leading-tight">Sistema de Gestión Odontológica</div>
        <nav aria-label="Principal" data-tour="nav" className="flex-1 space-y-5 overflow-y-auto px-3 py-2">
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
        <div className="border-t px-5 py-3">
          <ConnectionStatus />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b bg-card px-4 py-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="md:hidden"
              data-tour="nav-toggle"
              aria-label={menuOpen ? 'Cerrar el menú' : 'Abrir el menú'}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? <X className="size-4" aria-hidden /> : <Menu className="size-4" aria-hidden />}
            </Button>
            {can(user, 'patients:read') && (
              <div data-tour="search" className="min-w-0 flex-1">
                <GlobalSearch />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3" data-tour="user">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium">{user.displayName}</p>
              <p className="text-xs text-muted-foreground">
                {user.roles.map((role) => ROLE_LABELS[role]).join(' · ')}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onLogout} disabled={loggingOut} aria-label="Cerrar sesión">
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </div>
        </header>

        {menuOpen && (
          <nav aria-label="Principal (móvil)" className="space-y-4 border-b bg-card px-3 py-3 md:hidden">
            <ConnectionStatus />
            {groups.map((group) => (
              <div key={group.label ?? 'inicio'} className="space-y-1">
                {group.label && (
                  <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.label}</p>
                )}
                <div className="grid grid-cols-2 gap-1" onClick={() => setMenuOpen(false)}>
                  {group.items.map((item) => (
                    <NavLink key={item.href} {...item} active={pathname.startsWith(item.href)} />
                  ))}
                </div>
              </div>
            ))}
          </nav>
        )}

        <main className={cn('mx-auto w-full flex-1 px-4 pb-24 pt-6', pathname.startsWith('/agenda') ? 'max-w-[110rem]' : 'max-w-5xl')}>{children}</main>
      </div>
      <TourHost user={user} pathname={pathname} />
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
