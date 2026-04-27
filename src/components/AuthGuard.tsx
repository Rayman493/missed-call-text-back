'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import SetupError from '@/components/SetupError'

const supabase = createBrowserClient()

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)

  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  useEffect(() => {
    const checkAuth = async () => {
      console.log('[AuthGuard] Checking authentication session...')
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (error) {
          console.error('[AuthGuard] Auth error:', error)
        }
        
        if (!user) {
          console.log('[AuthGuard] No user found, redirecting to /auth/signin')
          router.push('/auth/signin')
        } else {
          console.log('[AuthGuard] User authenticated:', user.id)
          setAuthenticated(true)
        }
      } catch (error) {
        console.error('[AuthGuard] Auth check failed:', error)
      } finally {
        console.log('[AuthGuard] Setting loading to false')
        setLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  if (!authenticated) {
    return null // Will redirect
  }

  return <>{children}</>
}
