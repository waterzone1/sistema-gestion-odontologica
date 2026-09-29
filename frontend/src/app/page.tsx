'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { LoadingBlock } from '@/components/page-header'
import { useSession, useSetupStatus } from '@/hooks/use-session'

// la raiz solo decide a donde ir: configuracion inicial, ingreso o inicio
export default function RootPage() {
  const router = useRouter()
  const session = useSession()
  const setup = useSetupStatus()

  const destino = session.data
    ? session.data.user.mustChangePassword
      ? '/cambiar-clave'
      : '/dashboard'
    : setup.data?.needsSetup
      ? '/setup'
      : session.data === null && setup.data
        ? '/login'
        : null

  useEffect(() => {
    if (destino) router.replace(destino)
  }, [destino, router])

  if (session.isError || setup.isError) {
    return <LoadingBlock label="No se pudo conectar con el servidor." />
  }
  return <LoadingBlock />
}
