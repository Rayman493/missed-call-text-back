'use client'

import { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo, ReactNode } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Business } from '@/lib/types'
import SetupError from '@/components/SetupError'

const DEBUG = process.env.NODE_ENV === 'development'
const log = (...args: any[]) => { if (DEBUG) console.log(...args) }

interface BusinessContextType {
  business: Business | null
  loading: boolean
  error: string | null
  fetchComplete: boolean
  businessMissingConfirmed: boolean // True only if PGRST116 confirmed no business
  businessVerified: boolean // True if business was previously verified (cached)
  refreshBusiness: (force?: boolean) => Promise<void>
  setBusiness: (business: Business | null) => void
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined)

// Revalidation configuration
const REVALIDATION_THRESHOLD_MS = 60 * 1000 // 60 seconds
const FOCUS_DEBOUNCE_MS = 1000 // 1 second debounce

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchComplete, setFetchComplete] = useState(false)
  const [businessMissingConfirmed, setBusinessMissingConfirmed] = useState(false)
  const [lastFetchTimestamp, setLastFetchTimestamp] = useState<number>(0)
  const userIdRef = useRef<string | null>(null)
  const authSubscriptionRef = useRef<any>(null)
  const hasInitialFetchRef = useRef(false)
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isRevalidatingRef = useRef(false)

  const supabase = useMemo(() => createBrowserClient(), [])

  // Initialize businessVerified from sessionStorage immediately to prevent loading flash
  const [businessVerified, setBusinessVerified] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('replyflow_business_verified') === 'true'
    }
    return false
  })

  const fetchBusiness = useCallback(async (force: boolean = false) => {
    if (!supabase) return
    log('[BusinessContext] Fetching business...', { force })
    
    // Check if we need to revalidate based on timestamp
    const now = Date.now()
    const shouldRevalidate = force || (now - lastFetchTimestamp > REVALIDATION_THRESHOLD_MS)
    
    // Skip loading if business is already verified, we have cached data, and not forcing revalidation
    if (!shouldRevalidate && businessVerified && business) {
      log('[BusinessContext] Skipping fetch - business already verified and data is fresh')
      setFetchComplete(true)
      return
    }
    
    setLoading(true)
    setFetchComplete(false)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        log('[BusinessContext] No user found')
        setBusiness(null)
        setBusinessMissingConfirmed(false)
        userIdRef.current = null
        setLoading(false)
        setFetchComplete(true)
        return
      }

      // If user changed, clear old business data
      if (userIdRef.current && userIdRef.current !== user.id) {
        log('[BusinessContext] User changed, clearing old business data')
        setBusiness(null)
        setBusinessMissingConfirmed(false)
      }
      userIdRef.current = user.id

      const { data, error: fetchError } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      const businessData = data as Business | null

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // No business found - do NOT auto-create, just set business to null
          log('[BusinessContext] No business found (PGRST116), not auto-creating. User must explicitly create business.')
          log('[BusinessContext] Orphan auth recovery triggered for user:', user.id)
          setBusiness(null)
          setBusinessMissingConfirmed(true) // Confirmed no business
          setLoading(false)
          setFetchComplete(true)
        } else {
          // For other errors, do NOT assume no business - keep business null but mark fetch as complete
          // This prevents sending existing users to onboarding due to transient failures
          log('[BusinessContext] Business query failed (non-PGRST116 error), treating as unknown state')
          log('[BusinessContext] Error:', fetchError.message, 'for user:', user.id)
          setBusiness(null)
          setBusinessMissingConfirmed(false) // Not confirmed, could be error
          setLoading(false)
          setFetchComplete(true)
        }
      } else {
        log('[BusinessContext] Business found:', businessData?.id, 'for user:', user.id)
        setBusiness(businessData)
        setBusinessMissingConfirmed(false)
        setBusinessVerified(true)
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('replyflow_business_verified', 'true')
        }
        setLoading(false)
        setFetchComplete(true)
      }
      
      // Update last fetch timestamp
      setLastFetchTimestamp(now)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch business')
      setLoading(false)
      setFetchComplete(true)
    }
  }, [supabase, businessVerified, business, lastFetchTimestamp])

  // Listen to auth state changes - only once
  useEffect(() => {
    if (!authSubscriptionRef.current && supabase) {
      authSubscriptionRef.current = supabase.auth.onAuthStateChange((event: string, session: any) => {
        log('[BusinessContext] Auth state changed:', event)

        if (event === 'SIGNED_OUT') {
          setBusiness(null)
          setBusinessMissingConfirmed(false)
          setBusinessVerified(false)
          userIdRef.current = null
          setLoading(false)
          setFetchComplete(false) // Reset fetch complete on logout
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('replyflow_business_verified')
          }
        } else if (event === 'SIGNED_IN') {
          // Only refetch if user actually changed (avoids redundant refetch on initial mount)
          const newUserId = session?.user?.id
          if (newUserId && newUserId !== userIdRef.current) {
            log('[BusinessContext] User signed in (new user), fetching business')
            fetchBusiness()
          }
        }
        // Intentionally NOT refetching on TOKEN_REFRESHED - the business data hasn't changed,
        // and Supabase fires this event periodically which causes a re-render/refetch loop.
      })
    }

    return () => {
      if (authSubscriptionRef.current?.subscription) {
        try {
          authSubscriptionRef.current.subscription.unsubscribe()
        } catch {
          // Ignore cleanup errors
        }
        authSubscriptionRef.current = null
      }
    }
  }, [supabase, fetchBusiness])

  // Initial fetch - only once
  useEffect(() => {
    if (!hasInitialFetchRef.current) {
      hasInitialFetchRef.current = true
      fetchBusiness()
    }
  }, [fetchBusiness])

  // Handle window focus and visibility change for revalidation
  useEffect(() => {
    const handleFocus = () => {
      // Clear any existing timeout
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current)
      }
      
      // Debounce the revalidation
      focusTimeoutRef.current = setTimeout(() => {
        const now = Date.now()
        const shouldRevalidate = now - lastFetchTimestamp > REVALIDATION_THRESHOLD_MS
        
        if (shouldRevalidate && !isRevalidatingRef.current && businessVerified) {
          log('[BusinessContext] App resumed after idle, revalidating business data')
          isRevalidatingRef.current = true
          fetchBusiness(true).finally(() => {
            isRevalidatingRef.current = false
          })
        }
      }, FOCUS_DEBOUNCE_MS)
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleFocus()
      }
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current)
      }
    }
  }, [fetchBusiness, lastFetchTimestamp, businessVerified])

  const contextValue = useMemo(() => {
    return {
      business,
      loading,
      error,
      fetchComplete,
      businessMissingConfirmed,
      businessVerified,
      refreshBusiness: (force?: boolean) => fetchBusiness(force),
      setBusiness,
    }
  }, [business, loading, error, fetchComplete, businessMissingConfirmed, businessVerified, fetchBusiness])

  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  return (
    <BusinessContext.Provider value={contextValue}>
      {children}
    </BusinessContext.Provider>
  )
}

export function useBusiness() {
  const context = useContext(BusinessContext)
  if (context === undefined) {
    throw new Error('useBusiness must be used within a BusinessProvider')
  }
  return context
}

export function useBusinessSafe() {
  const context = useContext(BusinessContext)
  if (context === undefined) {
    // Return safe default values when BusinessProvider is not available
    return {
      business: null,
      loading: false,
      refreshBusiness: async () => {},
      error: null
    }
  }
  return context
}
