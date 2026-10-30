'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, CircleHelp } from 'lucide-react'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { GuidedTour, visibleSteps } from '@/components/layout/guided-tour'
import { useSavePreferences } from '@/hooks/use-preferences'
import { sessionKey } from '@/hooks/use-session'
import { api, type SessionResponse, type SessionUser } from '@/lib/api'
import { ONBOARDING_TOUR, tourForPath, tourSteps, tourTitle, type TourStep } from '@/lib/tours'

const SETTLE_MS = 700

interface Running {
  id: string
  steps: TourStep[]
}

interface Tours {
  pageTour: string | null
  start: (id: string) => void
}

const ToursContext = createContext<Tours | null>(null)

export function TourHost({ user, pathname, children }: { user: SessionUser; pathname: string; children: ReactNode }) {
  const client = useQueryClient()
  const savePreferences = useSavePreferences()
  const completeOnboarding = useMutation({
    mutationFn: () => api.post('/api/auth/onboarding/complete'),
    onSuccess: () => client.invalidateQueries({ queryKey: sessionKey }),
  })
  const [running, setRunning] = useState<Running | null>(null)
  const handled = useRef(new Set<string>())
  const pageTour = tourForPath(pathname)
  const seen = user.preferences.toursSeen

  const start = (id: string) => {
    const steps = visibleSteps(tourSteps(id, user))
    if (steps.length > 0) setRunning({ id, steps })
  }

  const pending = !user.onboardingCompleted ? ONBOARDING_TOUR : pageTour && !seen.includes(pageTour) ? pageTour : null

  useEffect(() => {
    if (running || !pending || handled.current.has(pending)) return
    const timer = window.setTimeout(() => {
      handled.current.add(pending)
      const steps = visibleSteps(tourSteps(pending, user))
      if (steps.length > 0) setRunning({ id: pending, steps })
    }, SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [pending, running, user])

  const finish = () => {
    if (!running) return
    if (running.id === ONBOARDING_TOUR) {
      if (!user.onboardingCompleted) completeOnboarding.mutate()
    } else {
      const latest = client.getQueryData<SessionResponse | null>(sessionKey)?.user.preferences.toursSeen ?? seen
      if (!latest.includes(running.id)) savePreferences.mutate({ preferences: { toursSeen: [...latest, running.id] } })
    }
    setRunning(null)
  }

  return (
    <ToursContext.Provider value={{ pageTour, start }}>
      {children}
      {running && <GuidedTour title={tourTitle(running.id)} steps={running.steps} onClose={finish} />}
    </ToursContext.Provider>
  )
}

export function HelpMenu({ onPick }: { onPick?: () => void }) {
  const tours = useContext(ToursContext)
  const [open, setOpen] = useState(false)
  if (!tours) return null
  const pick = (id: string) => {
    setOpen(false)
    onPick?.()
    tours.start(id)
  }
  return (
    <div data-tour="help">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 whitespace-nowrap rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
      >
        <CircleHelp className="size-4" aria-hidden />
        Ayuda
        <ChevronDown className={`ml-auto size-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 border-l pl-3 ml-4">
          {tours.pageTour && (
            <li>
              <button type="button" className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => pick(tours.pageTour as string)}>
                Recorrido de esta pantalla
              </button>
            </li>
          )}
          <li>
            <button type="button" className="w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => pick(ONBOARDING_TOUR)}>
              Recorrido general
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
