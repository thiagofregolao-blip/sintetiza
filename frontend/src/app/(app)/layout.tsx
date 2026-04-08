'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getMe, getWhatsappStatus } from '@/lib/api'
import { AppContext } from '@/lib/app-context'
import Sidebar from '@/components/sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<any | null>(null)
  const [session, setSession] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    try {
      const me = await getMe()
      setUser(me)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('access_token')

    if (!token) {
      router.push('/auth/login')
      return
    }

    async function init() {
      try {
        const me = await getMe()
        setUser(me)

        let sessionData = null
        try {
          sessionData = await getWhatsappStatus()
          setSession(sessionData)
        } catch {
          // session fetch can fail if not connected yet
        }

        // Redirect to onboarding if no connected session and not already on onboarding
        const isOnboarding = pathname.startsWith('/onboarding')
        const isConnected = sessionData?.status === 'connected'
        if (!isConnected && !isOnboarding) {
          router.push('/onboarding/connect')
        }
      } catch {
        // Auth failed — clear tokens and redirect
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        router.push('/auth/login')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [router, pathname])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#0b1326]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-[#4ff07f] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[#bbcbb9]">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <AppContext.Provider value={{ user, session, refreshUser }}>
      <div className="flex h-screen bg-[#0b1326]">
        <Sidebar currentPath={pathname} sessionStatus={session} />
        <main className="flex-1 md:ml-72 overflow-y-auto">{children}</main>
      </div>
    </AppContext.Provider>
  )
}
