'use client'

import { useAuth } from '@/contexts/AuthContext'
import { useSearchParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import SetupError from '@/components/SetupError'
import { createBrowserClient } from '@/lib/supabase/browser'

const supabase = createBrowserClient()

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isRecovering, setIsRecovering] = useState(false)
  const [recoveryAttempted, setRecoveryAttempted] = useState(false)

  // Detect checkout success and attempt session recovery
  useEffect(() => {
    const checkoutSuccess = searchParams?.get('checkout') === 'success'
    
    if (checkoutSuccess && !user && !loading && !recoveryAttempted) {
      // Detect mobile device for extended recovery
      const isMobile = typeof window !== 'undefined' && (
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.innerWidth < 768
      )
      
      console.log('[AuthGuard] ===== CHECKOUT SUCCESS DETECTED, STARTING AUTH RECOVERY =====')
      console.log('[AuthGuard] Mobile-specific debug info:', {
        userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'unknown',
        isMobile,
        screenWidth: typeof window !== 'undefined' ? window.innerWidth : 'unknown',
        screenHeight: typeof window !== 'undefined' ? window.innerHeight : 'unknown',
        checkoutSuccess,
        userExists: !!user,
        loading,
        recoveryAttempted
      })
      
      setIsRecovering(true)
      setRecoveryAttempted(true)

      // Extend recovery attempts for mobile (5 retries with 1.5s delays = 7.5s total)
      // Mobile browsers may restore localStorage/session slower after external redirect
      const maxRetries = isMobile ? 5 : 3
      const retryDelay = isMobile ? 1500 : 1000

      const attemptSessionRecovery = async () => {
        console.log('[AuthGuard] Attempting session recovery for checkout success', {
          isMobile,
          maxRetries,
          retryDelay
        })
        
        // First try getUser() to recover from refresh token
        try {
          const userResult = await supabase.auth.getUser()
          console.log('[AuthGuard] getUser() result:', {
            userExists: !!userResult.data.user,
            userId: userResult.data.user?.id,
            userEmail: userResult.data.user?.email,
            error: userResult.error?.message
          })
          
          if (userResult.data.user) {
            console.log('[AuthGuard] Session recovered via getUser() refresh token')
            setIsRecovering(false)
            return true
          }
        } catch (error) {
          console.log('[AuthGuard] getUser() recovery failed:', error)
        }
        
        // Then try getSession() with retries (extended for mobile)
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          console.log(`[AuthGuard] getSession() recovery attempt ${attempt}/${maxRetries}`, {
            isMobile,
            retryDelay,
            timestamp: new Date().toISOString()
          })
          
          const sessionResult = await supabase.auth.getSession()
          console.log('[AuthGuard] getSession() result:', {
            sessionExists: !!sessionResult.data.session,
            userId: sessionResult.data.session?.user?.id,
            error: sessionResult.error?.message,
            accessTokenPresent: !!sessionResult.data.session?.access_token,
            refreshTokenPresent: !!sessionResult.data.session?.refresh_token
          })
          
          if (sessionResult.data.session) {
            console.log('[AuthGuard] Session recovered via getSession() attempt', attempt)
            setIsRecovering(false)
            return true
          }
          
          if (attempt < maxRetries) {
            console.log(`[AuthGuard] Waiting ${retryDelay}ms before next attempt...`)
            await new Promise(resolve => setTimeout(resolve, retryDelay))
          }
        }
        
        console.log('[AuthGuard] Session recovery failed after all attempts', {
          maxRetries,
          isMobile,
          totalWaitTime: (maxRetries - 1) * retryDelay
        })
        setIsRecovering(false)
        return false
      }

      attemptSessionRecovery().then((recovered) => {
        if (!recovered) {
          console.log('[AuthGuard] Session recovery failed, redirecting to signin with preserved URL')
          const currentUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/dashboard'
          const encodedRedirect = encodeURIComponent(currentUrl)
          console.log('[AuthGuard] Redirecting to signin with redirect:', encodedRedirect)
          router.push(`/signin?redirect=${encodedRedirect}`)
        } else {
          console.log('[AuthGuard] Session recovery successful, remaining on dashboard')
        }
      })
    }
  }, [searchParams, user, loading, recoveryAttempted, router])

  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  // Show loading during auth recovery
  if (isRecovering) {
    console.log('[AuthGuard] Showing recovery loading state')
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-200 text-lg">Finishing your trial setup…</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-200">Loading...</div>
      </div>
    )
  }

  if (!user) {
    console.log('[AuthGuard] No user found, returning null (AuthProvider will handle redirect)')
    return null // Will redirect via AuthProvider
  }

  console.log('[AuthGuard] User authenticated, rendering children')
  return <>{children}</>
}
