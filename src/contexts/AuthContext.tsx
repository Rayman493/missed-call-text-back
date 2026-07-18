'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Capacitor } from '@capacitor/core'
import { pushService } from '@/lib/push-service'

const supabase = createBrowserClient()

interface AuthContextType {
  session: any
  loading: boolean
  user: any
  signOut: (options?: { manual?: boolean }) => Promise<void>
  accessToken: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const authSubscriptionRef = useRef<any>(null)
  const pushRetryRef = useRef(false)
  const router = useRouter()
  const pathname = usePathname()
  const initialLoadRef = useRef(true)
  const lastSignInTimeRef = useRef<number>(0)

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    // If supabase client is not available or not client side, set loading to false and return
    if (!isClient || !supabase) {
      if (!isClient) {
        // Still loading on server side
        return
      }
      console.error('[Auth] Supabase client not available')
      setLoading(false)
      return
    }

    // Check if we already have a cached authenticated session from sessionStorage
    const cachedAuth = typeof window !== 'undefined' ? sessionStorage.getItem('replyflow_auth_cache') : null
    const wasPreviouslyAuthenticated = cachedAuth === 'authenticated'

    // Restore session on app load
    const restoreSession = async () => {
      console.log('[Auth] startup session restore started')
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        console.log('[Auth] Initial getSession result:', session ? 'session present' : 'no session')
        console.log('[Auth] Initial access token present:', session?.access_token ? 'yes' : 'no')
        
        if (error) {
          console.error('[Auth] Session restore error:', error)
          // Check for refresh_token_not_found error and clear stale auth state
          if (error?.message?.includes('refresh_token_not_found') || error?.message?.includes('Refresh Token Not Found')) {
            console.log('[Auth] stale session detected - clearing Supabase auth state from localStorage')
            // Clear all Supabase keys from localStorage
            if (typeof window !== 'undefined') {
              const keysToRemove: string[] = []
              for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i)
                if (key && key.startsWith('sb-')) {
                  keysToRemove.push(key)
                }
              }
              keysToRemove.forEach(key => localStorage.removeItem(key))
              console.log('[Auth] stale session cleanup completed - removed', keysToRemove.length, 'Supabase keys')
            }
          }
        }
        
        if (session) {
          setSession(session)
          setUser(session.user)
          setAccessToken(session.access_token)
          // Cache authenticated state
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('replyflow_auth_cache', 'authenticated')
          }
          // Set access token in push service for native
          if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
            try {
              const { pushService } = await import('@/lib/push-service')
              console.log('[Auth] Calling pushService.setAccessToken from initial session')
              pushService.setAccessToken(session.access_token)
            } catch (error) {
              console.error('[Auth] Failed to set push access token:', error)
            }
          }
        } else {
          // Clear cache if no session
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('replyflow_auth_cache')
          }
        }
      } catch (error) {
        console.error('[Auth] Session restore failed:', error)
      } finally {
        console.log('[Auth] startup session restore completed')
        setLoading(false)
        initialLoadRef.current = false
      }
    }

    // If user was previously authenticated, skip loading state for faster navigation
    if (wasPreviouslyAuthenticated && !initialLoadRef.current) {
      setLoading(false)
      restoreSession()
    } else {
      restoreSession()
    }

    // Listen to auth state changes - only once
    if (!authSubscriptionRef.current && supabase) {
      authSubscriptionRef.current = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
        console.log('[Auth] auth event:', event)
        console.log('[Auth] Session present:', session ? 'yes' : 'no')
        console.log('[Auth] Access token present:', session?.access_token ? 'yes' : 'no')
        
        if (event === 'SIGNED_IN' && session) {
          console.log('[Auth] sign-in succeeded')
          // Track sign-in time to prevent race condition with delayed stale SIGNED_OUT events
          lastSignInTimeRef.current = Date.now()
          const currentSessionId = session.access_token?.substring(0, 10)
          console.log('[Auth] new session ID:', currentSessionId)
        }
        
        // Prevent race condition: ignore SIGNED_OUT events within 2 seconds of a sign-in
        // This handles the case where a stale refresh request fails after a fresh sign-in
        if (event === 'SIGNED_OUT' && !session) {
          const timeSinceSignIn = Date.now() - lastSignInTimeRef.current
          if (timeSinceSignIn < 2000) {
            console.log('[Auth] ignoring delayed SIGNED_OUT event (race condition protection)', { timeSinceSignIn })
            return // Don't clear the fresh session
          }
        }
        
        if (session) {
          setSession(session)
          setUser(session.user)
          setAccessToken(session.access_token)
          // Update cache on auth state change
          if (typeof window !== 'undefined') {
            sessionStorage.setItem('replyflow_auth_cache', 'authenticated')
          }
          // Set access token in push service for Bearer auth
          if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
            try {
              const { pushService } = await import('@/lib/push-service')
              console.log('[Auth] Calling pushService.setAccessToken from auth state change')
              pushService.setAccessToken(session.access_token)
            } catch (error) {
              console.error('[Auth] Failed to set push access token:', error)
            }
          }
        } else {
          setSession(null)
          setUser(null)
          setAccessToken(null)
          // Clear cache on sign out
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('replyflow_auth_cache')
          }
          // Reset push retry flag on sign out
          pushRetryRef.current = false
        }
      })
    }

    return () => {
      if (authSubscriptionRef.current?.subscription) {
        try {
          authSubscriptionRef.current.subscription.unsubscribe()
        } catch (error) {
          console.error('[Auth] Error cleaning up auth subscription:', error)
        }
        authSubscriptionRef.current = null
      }
    }
  }, [isClient])

  // Handle routing based on auth state
  useEffect(() => {
    if (loading || !isClient) return

    const searchParams = new URLSearchParams(window.location.search)
    const checkoutStatus = searchParams.get('checkout')
    const sessionId = searchParams.get('session_id')
    const billingReturned = searchParams.get('billing') === 'returned'
    
    const isCheckoutSuccess = checkoutStatus === 'success' || sessionId?.startsWith('cs_')
    
    // Allow users returning from Stripe checkout to have time to recover session
    // Do NOT redirect to signin when checkout=success - let AuthGuard handle recovery flow
    if (!user && (pathname?.startsWith('/dashboard') || pathname?.startsWith('/onboarding')) && !isCheckoutSuccess && !billingReturned) {
      router.push('/auth/signin')
    }
  }, [user, loading, router, isClient, pathname])

  // Sign out function that clears all sensitive data
  const signOut = async (options?: { manual?: boolean }) => {
    const isManualLogout = options?.manual !== false // Default to true if not specified

    console.log('[LOGOUT] Sign out initiated', {
      isManualLogout,
      pathname,
      timestamp: new Date().toISOString()
    })

    try {
      // Clear any credential-related form data from session storage
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('carrier_form_data')
        sessionStorage.removeItem('replyflow_auth_cache')
        sessionStorage.removeItem('replyflow_business_verified')

        // Clean up debug storage keys
        localStorage.removeItem('replyflow_auth_debug_logs')

        // Clear all business caches (user-scoped)
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('replyflow_business_display_cache')) {
            localStorage.removeItem(key)
          }
        }

        // Clear skip_homepage_redirect cookie to prevent trapping users on homepage
        document.cookie = 'skip_homepage_redirect=; path=/; max-age=0'

        const localKeysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (
            key.includes('credential') ||
            key.includes('token') ||
            key.includes('secret') ||
            key.includes('key') ||
            key.includes('email') ||
            key.includes('password')
          ) && !key.startsWith('supabase.')) { // CRITICAL: Exclude Supabase keys to preserve session
            localKeysToRemove.push(key)
          }
        }
        localKeysToRemove.forEach(key => localStorage.removeItem(key))

        console.log('[LOGOUT] Local storage cleared', {
          keysRemoved: localKeysToRemove.length
        })
      }

      // Unregister push device (native only)
      try {
        await pushService.unregisterDevice()
        console.log('[LOGOUT] Push device unregistered')
      } catch (error) {
        console.warn('[LOGOUT] Failed to unregister push device:', error)
      }

      // Sign out from Supabase if available
      if (supabase) {
        await supabase.auth.signOut()
        console.log('[LOGOUT] Supabase session cleared')
      }

      // Clear auth state
      setSession(null)
      setUser(null)
      setAccessToken(null)

      // Clear push service access token and registration state
      if (typeof window !== 'undefined' && Capacitor.isNativePlatform()) {
        try {
          const { pushService } = await import('@/lib/push-service')
          pushService.clearRegistrationState()
        } catch (error) {
          console.error('[Auth] Failed to clear push registration state:', error)
        }
      }

      console.log('[LOGOUT] Auth state cleared')

      // Redirect: manual logout goes to homepage, session expiration goes to signin
      if (isManualLogout) {
        console.log('[LOGOUT] Redirecting to homepage')
        router.push('/')
      } else {
        // Session expiration: go to signin if not already on homepage
        if (pathname === '/') {
          console.log('[LOGOUT] Already on homepage, staying here')
          router.push('/')
        } else {
          console.log('[LOGOUT] Redirecting to signin')
          router.push('/auth/signin')
        }
      }
    } catch (error) {
      console.error('[LOGOUT] Sign out error:', error)
    }
  }

  return (
    <AuthContext.Provider value={{ session, loading, user, signOut, accessToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
