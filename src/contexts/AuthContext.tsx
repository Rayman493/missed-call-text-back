'use client'

import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import { logAuthEvent } from '@/components/AuthDebugPanel'

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
      const isMobile = typeof window !== 'undefined' ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent) : false
      
      const eventData = {
        pathname,
        isClient,
        billingReturned: pathname?.includes('billing=returned'),
        isBillingSuccess: pathname?.includes('/billing/success'),
        isMobile,
        timestamp: new Date().toISOString(),
        userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'server'
      }
      
      console.log('[AUTH SESSION RESTORE START]', eventData)
      logAuthEvent('SESSION_RESTORE_START', eventData)
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        
        const sessionData = {
          hasSession: !!session,
          userId: session?.user?.id,
          error: error?.message,
          timestamp: new Date().toISOString(),
          pathname,
          isMobile
        }
        
        console.log('[AUTH GETSESSION RESULT]', sessionData)
        logAuthEvent('GETSESSION_RESULT', sessionData)
        
        if (error) {
          console.error('[Auth] Session restore error:', error)
          logAuthEvent('SESSION_RESTORE_ERROR', { error: error.message, pathname, isMobile })
        }
        
        if (session) {
          const restoredData = {
            userId: session.user.id,
            pathname,
            isMobile,
            timestamp: new Date().toISOString()
          }
          
          console.log('[AUTH SESSION RESTORED]', restoredData)
          logAuthEvent('SESSION_RESTORED', restoredData)
          setSession(session)
          setUser(session.user)
          
          // Defensive check: verify the user still exists in Supabase Auth
          // This handles the case where the user was deleted but the session was still cached
          try {
            const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser()
            const verificationData = {
              hasCurrentUser: !!currentUser,
              currentUserId: currentUser?.id,
              userError: userError?.message,
              timestamp: new Date().toISOString(),
              pathname,
              isMobile
            }
            
            console.log('[AUTH USER VERIFICATION RESULT]', verificationData)
            logAuthEvent('USER_VERIFICATION_RESULT', verificationData)
            
            if (userError || !currentUser) {
              const failedData = {
                userError: userError?.message,
                pathname,
                isMobile,
                timestamp: new Date().toISOString()
              }
              
              console.log('[AUTH USER VERIFICATION FAILED - CLEARING SESSION]', failedData)
              logAuthEvent('USER_VERIFICATION_FAILED', failedData)
              await supabase.auth.signOut()
              setSession(null)
              setUser(null)
            }
          } catch (verifyError) {
            const verifyErrorData = {
              error: verifyError instanceof Error ? verifyError.message : String(verifyError),
              pathname,
              isMobile,
              timestamp: new Date().toISOString()
            }
            
            console.error('[AUTH USER VERIFICATION ERROR]', verifyErrorData)
            logAuthEvent('USER_VERIFICATION_ERROR', verifyErrorData)
            // If verification fails, clear the session to be safe
            await supabase.auth.signOut()
            setSession(null)
            setUser(null)
          }
        } else {
          const noSessionData = {
            pathname,
            isMobile,
            timestamp: new Date().toISOString()
          }
          
          console.log('[AUTH NO SESSION FOUND]', noSessionData)
          logAuthEvent('NO_SESSION_FOUND', noSessionData)
        }
      } catch (error) {
        const restoreErrorData = {
          error: error instanceof Error ? error.message : String(error),
          pathname,
          isMobile,
          timestamp: new Date().toISOString()
        }
        
        console.error('[AUTH SESSION RESTORE FAILED]', restoreErrorData)
        logAuthEvent('SESSION_RESTORE_FAILED', restoreErrorData)
      } finally {
        const completedData = {
          loading: false,
          pathname,
          isMobile,
          timestamp: new Date().toISOString()
        }
        
        console.log('[AUTH SESSION RESTORE COMPLETED]', completedData)
        logAuthEvent('SESSION_RESTORE_COMPLETED', completedData)
        setLoading(false)
      }
    }

    restoreSession()

    // Listen to auth state changes - only once
    if (!authSubscriptionRef.current && supabase) {
      authSubscriptionRef.current = supabase.auth.onAuthStateChange((_event: any, session: any) => {
        const isMobile = typeof window !== 'undefined' ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent) : false
        
        const stateChangeData = {
          event: _event,
          hasSession: !!session,
          userId: session?.user?.id,
          pathname,
          isMobile,
          timestamp: new Date().toISOString()
        }
        
        console.log('[AUTH STATE CHANGE]', stateChangeData)
        logAuthEvent('AUTH_STATE_CHANGE', stateChangeData)
        
        if (session) {
          const sessionSetData = {
            userId: session.user.id,
            pathname,
            isMobile,
            timestamp: new Date().toISOString()
          }
          
          console.log('[AUTH STATE CHANGE - SESSION SET]', sessionSetData)
          logAuthEvent('SESSION_SET', sessionSetData)
          setSession(session)
          setUser(session.user)
        } else {
          const sessionClearedData = {
            pathname,
            isMobile,
            timestamp: new Date().toISOString()
          }
          
          console.log('[AUTH STATE CHANGE - SESSION CLEARED]', sessionClearedData)
          logAuthEvent('SESSION_CLEARED', sessionClearedData)
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

    const isMobile = typeof window !== 'undefined' ? /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(window.navigator.userAgent) : false

    const routingData = {
      user: !!user,
      userId: user?.id,
      loading,
      pathname,
      isClient,
      isMobile,
      timestamp: new Date().toISOString()
    }

    console.log('[AUTH ROUTING DECISION]', routingData)
    logAuthEvent('ROUTING_DECISION', routingData)

    // If user is NOT authenticated and on dashboard or onboarding, redirect to login (not homepage)
    // BUT allow checkout success through even if auth is still loading
    const searchParams = new URLSearchParams(window.location.search)
    const checkoutStatus = searchParams.get('checkout')
    const sessionId = searchParams.get('session_id')
    const billingReturned = searchParams.get('billing') === 'returned'
    
    const isCheckoutSuccess = checkoutStatus === 'success' || sessionId?.startsWith('cs_')
    
    const checkoutParamsData = { 
      checkoutStatus, 
      sessionId: sessionId ? `${sessionId.substring(0, 8)}...` : null,
      billingReturned, 
      isCheckoutSuccess,
      pathname,
      isMobile,
      timestamp: new Date().toISOString()
    }
    
    console.log('[AUTH ROUTING CHECKOUT PARAMS]', checkoutParamsData)
    logAuthEvent('ROUTING_CHECKOUT_PARAMS', checkoutParamsData)
    
    // Allow users returning from Stripe checkout to have time to recover session
    // Do NOT redirect to signin when checkout=success - let AuthGuard handle recovery flow
    if (!user && (pathname?.startsWith('/dashboard') || pathname?.startsWith('/onboarding')) && !isCheckoutSuccess && !billingReturned) {
      const redirectData = {
        from: pathname,
        to: '/auth/signin',
        reason: 'unauthenticated_protected_route',
        checkoutSuccess: false,
        billingReturned: false,
        isMobile,
        callsite: 'AuthContext',
        timestamp: new Date().toISOString()
      }
      
      console.log('[AUTH REDIRECT TO SIGNIN]', redirectData)
      logAuthEvent('REDIRECT_TO_SIGNIN', redirectData)
      router.push('/auth/signin')
    } else if (!user && isCheckoutSuccess) {
      const recoveryData = {
        pathname,
        sessionId: sessionId ? `${sessionId.substring(0, 8)}...` : null,
        isMobile,
        reason: 'checkout_success_allow_recovery',
        timestamp: new Date().toISOString()
      }
      
      console.log('[AUTH ALLOWING CHECKOUT SUCCESS RECOVERY]', recoveryData)
      logAuthEvent('ALLOWING_CHECKOUT_RECOVERY', recoveryData)
    } else if (user && isCheckoutSuccess) {
      const authenticatedData = {
        userId: user.id,
        pathname,
        sessionId: sessionId ? `${sessionId.substring(0, 8)}...` : null,
        isMobile,
        timestamp: new Date().toISOString()
      }
      
      console.log('[AUTH USER AUTHENTICATED ON CHECKOUT SUCCESS]', authenticatedData)
      logAuthEvent('USER_AUTHENTICATED_ON_CHECKOUT_SUCCESS', authenticatedData)
    } else {
      const noRedirectData = {
        user: !!user,
        pathname,
        isCheckoutSuccess,
        billingReturned,
        isMobile,
        timestamp: new Date().toISOString()
      }
      
      console.log('[AUTH NO REDIRECT NEEDED]', noRedirectData)
      logAuthEvent('NO_REDIRECT_NEEDED', noRedirectData)
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
