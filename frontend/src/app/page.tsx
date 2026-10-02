'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { LoadingBlock } from '@/components/page-header'
import { useSession, useSetupStatus } from '@/hooks/use-session'
import { SERVER_UNREACHABLE } from '@/lib/api'

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
    return <LoadingBlock label={SERVER_UNREACHABLE} />
  }
  return <LoadingBlock />
}
