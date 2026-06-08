'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

const supabase = createBrowserClient()

interface AuthContextType {
  session: any
  loading: boolean
  user: any
  signOut: (options?: { manual?: boolean }) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const authSubscriptionRef = useRef<any>(null)
  const router = useRouter()
  const pathname = usePathname()

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

    // Restore session on app load
    const restoreSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('[Auth] Session restore error:', error)
        }
        
        if (session) {
          setSession(session)
          setUser(session.user)
        }
      } catch (error) {
        console.error('[Auth] Session restore failed:', error)
      } finally {
        setLoading(false)
      }
    }

    restoreSession()

    // Listen to auth state changes - only once
    if (!authSubscriptionRef.current && supabase) {
      authSubscriptionRef.current = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        if (session) {
          setSession(session)
          setUser(session.user)
        } else {
          setSession(null)
          setUser(null)
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
        
        // Clean up debug storage keys
        localStorage.removeItem('replyflow_auth_debug_logs')
        
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
      
      // Sign out from Supabase if available
      if (supabase) {
        await supabase.auth.signOut()
        console.log('[LOGOUT] Supabase session cleared')
      }
      
      // Clear auth state
      setSession(null)
      setUser(null)
      
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
    <AuthContext.Provider value={{ session, loading, user, signOut }}>
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
