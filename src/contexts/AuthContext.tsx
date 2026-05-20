'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

const supabase = createBrowserClient()

interface AuthContextType {
  session: any
  loading: boolean
  user: any
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isClient, setIsClient] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const authSubscriptionRef = useRef<any>(null)

  // Ensure we're on client side before accessing browser APIs
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
      console.log('[Auth] Restoring session...', {
        pathname,
        isClient,
        billingReturned: pathname?.includes('billing=returned')
      })
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('[Auth] Session restore error:', error)
        }
        
        if (session) {
          console.log('[Auth] Session restored:', session.user.id)
          setSession(session)
          setUser(session.user)
          
          // Defensive check: verify the user still exists in Supabase Auth
          // This handles the case where the user was deleted but the session was still cached
          try {
            const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
            if (userError || !currentUser) {
              console.log('[Auth] User no longer exists in Supabase, clearing session')
              await supabase.auth.signOut()
              setSession(null)
              setUser(null)
            }
          } catch (verifyError) {
            console.error('[Auth] User verification error:', verifyError)
            // If verification fails, clear the session to be safe
            await supabase.auth.signOut()
            setSession(null)
            setUser(null)
          }
        } else {
          console.log('[Auth] No session found')
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
        console.log('[Auth] Auth state changed:', _event, session?.user?.id)
        
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
      console.log('[Auth] Cleaning up auth subscription')
      if (authSubscriptionRef.current?.subscription) {
        try {
          authSubscriptionRef.current.subscription.unsubscribe()
          console.log('[Auth] Auth subscription cleaned up successfully')
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

    console.log('[Auth] Auth routing decision:', {
      user: !!user,
      userId: user?.id,
      loading,
      pathname,
      isClient
    })

    // If user is NOT authenticated and on dashboard or onboarding, redirect to login (not homepage)
    // BUT allow checkout success through even if auth is still loading
    const searchParams = new URLSearchParams(window.location.search)
    const checkoutStatus = searchParams.get('checkout')
    const sessionId = searchParams.get('session_id')
    const billingReturned = searchParams.get('billing') === 'returned'
    
    const isCheckoutSuccess = checkoutStatus === 'success' || sessionId?.startsWith('cs_')
    
    console.log('[Auth] Checkout params check:', { checkoutStatus, sessionId, billingReturned, isCheckoutSuccess })
    
    // Allow users returning from Stripe checkout to have time to recover session
    // Add a brief delay before redirect to allow session to load from cookies
    if (!user && (pathname?.startsWith('/dashboard') || pathname?.startsWith('/onboarding')) && !isCheckoutSuccess && !billingReturned) {
      console.log('[Auth] Auth routing redirect decision:', {
        pathname,
        hasUser: !!user,
        userId: user?.id,
        isCheckoutSuccess,
        billingReturned,
        redirectDecision: 'to_signin'
      })
      router.push('/auth/signin')
    } else if (!user && (pathname?.startsWith('/dashboard') || pathname?.startsWith('/onboarding')) && isCheckoutSuccess) {
      console.log('[Auth] ===== CHECKOUT SUCCESS DETECTED, ALLOWING SESSION RECOVERY =====')
      console.log('[Auth] Checkout success params:', {
        checkoutStatus,
        sessionId,
        billingReturned,
        isCheckoutSuccess,
        pathname,
        hasUser: !!user,
        userId: user?.id
      })
      console.log('[Auth] Delaying redirect to allow session recovery from cookies after Stripe redirect')
      
      // Delay redirect to allow session to load from cookies after Stripe redirect
      // Mobile browsers may take longer to restore localStorage/session
      setTimeout(() => {
        if (!user) {
          console.log('[Auth] ===== SESSION RECOVERY FAILED, REDIRECTING TO SIGNIN =====')
          console.log('[Auth] Session still missing after delay, redirecting to signin with preserved checkout success')
          
          // Preserve the exact URL with checkout=success parameter
          const currentUrl = window.location.pathname + window.location.search
          const encodedRedirect = encodeURIComponent(currentUrl)
          
          console.log('[Auth] Redirect decision:', {
            attemptedRedirectTarget: '/auth/signin',
            redirectParam: currentUrl,
            encodedRedirect,
            reason: 'Session recovery failed after checkout success',
            finalRedirectPath: `/auth/signin?redirect=${encodedRedirect}`
          })
          
          router.push(`/auth/signin?redirect=${encodedRedirect}`)
        } else {
          console.log('[Auth] ===== SESSION RECOVERY SUCCESSFUL =====')
          console.log('[Auth] Session recovered, staying on dashboard')
          console.log('[Auth] User authenticated:', {
            userId: user.id,
            email: user.email
          })
        }
      }, 2000)
    }
  }, [user, loading, pathname, router, isClient])

  // Sign out function that clears all sensitive data
  const signOut = async () => {
    console.log('[Auth] Signing out and clearing sensitive data')
    
    try {
      // Clear any credential-related form data from session storage
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('carrier_form_data')
        const localKeysToRemove = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.includes('credential') || key.includes('token') || key.includes('secret') || key.includes('key') || key.includes('auth') || key.includes('email') || key.includes('password'))) {
            localKeysToRemove.push(key)
          }
        }
        localKeysToRemove.forEach(key => localStorage.removeItem(key))
      }
      
      // Sign out from Supabase if available
      if (supabase) {
        await supabase.auth.signOut()
      }
      
      // Clear auth state
      setSession(null)
      setUser(null)
      
      // Redirect: stay on homepage if already there, otherwise go to signin
      if (pathname === '/') {
        console.log('[Auth] User on homepage, staying on homepage after logout')
        router.push('/')
      } else {
        console.log('[Auth] Redirecting to login after logout')
        router.push('/auth/signin')
      }
    } catch (error) {
      console.error('[Auth] Sign out error:', error)
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
