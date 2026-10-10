'use client'

import { useEffect } from 'react'
import { useSession } from '@/hooks/use-session'
import { rememberTheme, resolveDark } from '@/lib/theme'

export function ThemeSync() {
  const session = useSession()
  const preference = session.data?.user.theme

  useEffect(() => {
    if (!preference) return
    rememberTheme(preference)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', resolveDark(preference, media.matches))
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [preference])

  return null
}
