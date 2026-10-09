import type { SessionUser } from './api'

export type ThemePreference = SessionUser['theme']

const THEME_STORAGE_KEY = 'sgo-tema'

export const THEME_LABELS: Record<ThemePreference, string> = {
  SYSTEM: 'Igual que el sistema',
  LIGHT: 'Claro',
  DARK: 'Oscuro',
}

export function resolveDark(preference: ThemePreference, systemDark: boolean): boolean {
  return preference === 'DARK' || (preference === 'SYSTEM' && systemDark)
}

export const EARLY_THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'SYSTEM';if(t==='DARK'||(t==='SYSTEM'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}`

export function rememberTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    return
  }
}
