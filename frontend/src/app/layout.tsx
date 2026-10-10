import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import './globals.css'
import { EARLY_THEME_SCRIPT } from '@/lib/theme'
import { Providers } from './providers'

export const metadata: Metadata = {
  title: 'Sistema de Gestión Odontológica',
  description: 'Gestión de pacientes, agenda, historia clínica y cobros para consultorios odontológicos.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: EARLY_THEME_SCRIPT }} />
      </head>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
