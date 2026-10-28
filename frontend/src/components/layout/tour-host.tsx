'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleHelp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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

export function TourHost({ user, pathname }: { user: SessionUser; pathname: string }) {
  const client = useQueryClient()
  const savePreferences = useSavePreferences()
  const completeOnboarding = useMutation({
    mutationFn: () => api.post('/api/auth/onboarding/complete'),
    onSuccess: () => client.invalidateQueries({ queryKey: sessionKey }),
  })
  const [running, setRunning] = useState<Running | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
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
    <>
      <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2" style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {menuOpen && (
          <div role="menu" aria-label="Ayuda" className="w-60 rounded-lg border bg-card p-1 shadow-lg">
            {pageTour && (
              <button
                type="button"
                role="menuitem"
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false)
                  start(pageTour)
                }}
              >
                Recorrido de esta pantalla ({tourTitle(pageTour)})
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                setMenuOpen(false)
                start(ONBOARDING_TOUR)
              }}
            >
              Recorrido general del sistema
            </button>
          </div>
        )}
        <button
          type="button"
          data-tour="help"
          aria-label="Ayuda"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring motion-reduce:transition-none"
        >
          <CircleHelp className="size-6" aria-hidden />
        </button>
      </div>
      {running && <GuidedTour title={tourTitle(running.id)} steps={running.steps} onClose={finish} />}
    </>
  )
}
