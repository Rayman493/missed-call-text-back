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

const BUSINESS_CACHE_KEY = 'replyflow_business_display_cache'
const BUSINESS_CACHE_TTL_MS = 6 * 60 * 60 * 1000
const FOCUS_REVALIDATION_THRESHOLD_MS = 10 * 60 * 1000
const FOCUS_DEBOUNCE_MS = 1000

type BusinessCachePayload = {
  business: Business
  verifiedAt: number
  userId?: string | null
}

function readBusinessCache(): BusinessCachePayload | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(BUSINESS_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BusinessCachePayload
    if (!parsed?.business?.id || !parsed.verifiedAt) return null
    if (Date.now() - parsed.verifiedAt > BUSINESS_CACHE_TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

function writeBusinessCache(business: Business, userId?: string | null) {
  if (typeof window === 'undefined') return
  localStorage.setItem(BUSINESS_CACHE_KEY, JSON.stringify({ business, verifiedAt: Date.now(), userId }))
  sessionStorage.setItem('replyflow_business_verified', 'true')
}

function clearBusinessCache() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(BUSINESS_CACHE_KEY)
  sessionStorage.removeItem('replyflow_business_verified')
}

export function BusinessProvider({ children }: { children: ReactNode }) {
  const cachedBusinessPayload = readBusinessCache()
  const [business, setBusinessState] = useState<Business | null>(cachedBusinessPayload?.business ?? null)
  const [loading, setLoading] = useState(!cachedBusinessPayload?.business)
  const [error, setError] = useState<string | null>(null)
  const [fetchComplete, setFetchComplete] = useState(!!cachedBusinessPayload?.business)
  const [businessMissingConfirmed, setBusinessMissingConfirmed] = useState(false)
  const [lastFetchTimestamp, setLastFetchTimestamp] = useState<number>(cachedBusinessPayload?.verifiedAt ?? 0)
  const userIdRef = useRef<string | null>(null)
  const authSubscriptionRef = useRef<any>(null)
  const hasInitialFetchRef = useRef(false)
  const focusTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isRevalidatingRef = useRef(false)

  const supabase = useMemo(() => createBrowserClient(), [])

  // Initialize businessVerified from sessionStorage immediately to prevent loading flash
  const [businessVerified, setBusinessVerified] = useState(() => {
    if (cachedBusinessPayload?.business) return true
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('replyflow_business_verified') === 'true'
    }
    return false
  })

  const setBusiness = useCallback((nextBusiness: Business | null) => {
    setBusinessState(nextBusiness)
    if (nextBusiness) {
      setBusinessVerified(true)
      writeBusinessCache(nextBusiness, nextBusiness.user_id)
    }
  }, [])

  const fetchBusiness = useCallback(async (force: boolean = false) => {
    if (!supabase) return
    log('[BusinessContext] Fetching business...', { force })
    
    // Check if we need to revalidate based on timestamp
    const now = Date.now()
    const shouldRevalidate = force || (now - lastFetchTimestamp > BUSINESS_CACHE_TTL_MS)
    
    // Skip loading if business is already verified, we have cached data, and not forcing revalidation
    if (!shouldRevalidate && businessVerified && business) {
      log('[BusinessContext] Skipping fetch - business already verified and data is fresh')
      setFetchComplete(true)
      return
    }
    
    // Skip loading state if revalidating for verified business with cached data (background refresh)
    // Only show loading if we don't have cached data or business is not verified
    const shouldShowLoading = !businessVerified || !business
    if (shouldShowLoading) {
      setLoading(true)
      setFetchComplete(false)
    } else {
      setFetchComplete(true)
    }
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        log('[BusinessContext] No user found')
        setBusiness(null)
        setBusinessMissingConfirmed(false)
        userIdRef.current = null
        clearBusinessCache()
        setBusinessVerified(false)
        setLoading(false)
        setFetchComplete(true)
        return
      }

      // If user changed, clear old business data
      if (userIdRef.current && userIdRef.current !== user.id) {
        log('[BusinessContext] User changed, clearing old business data')
        setBusiness(null)
        setBusinessMissingConfirmed(false)
        clearBusinessCache()
        setBusinessVerified(false)
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
          clearBusinessCache()
          setBusinessVerified(false)
          setLoading(false)
          setFetchComplete(true)
        } else {
          // For other errors, do NOT assume no business - keep business null but mark fetch as complete
          // This prevents sending existing users to onboarding due to transient failures
          log('[BusinessContext] Business query failed (non-PGRST116 error), treating as unknown state')
          log('[BusinessContext] Error:', fetchError.message, 'for user:', user.id)
          if (!business) setBusiness(null)
          setBusinessMissingConfirmed(false) // Not confirmed, could be error
          if (shouldShowLoading) setLoading(false)
          setFetchComplete(true)
        }
      } else {
        log('[BusinessContext] Business found:', businessData?.id, 'for user:', user.id)
        setBusiness(businessData)
        setBusinessMissingConfirmed(false)
        setBusinessVerified(true)
        if (businessData) writeBusinessCache(businessData, user.id)
        setLoading(false)
        setFetchComplete(true)
      }
      
      // Update last fetch timestamp
      setLastFetchTimestamp(now)
    } catch (err: any) {
      setError(err.message || 'Failed to fetch business')
      if (shouldShowLoading) setLoading(false)
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
          clearBusinessCache()
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
        const shouldRevalidate = now - lastFetchTimestamp > FOCUS_REVALIDATION_THRESHOLD_MS
        
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
