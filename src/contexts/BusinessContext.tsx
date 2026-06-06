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
  refreshBusiness: () => Promise<void>
  setBusiness: (business: Business | null) => void
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined)

export function BusinessProvider({ children }: { children: ReactNode }) {
  console.log('[BusinessContext] Provider render -', new Date().toISOString())
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [fetchComplete, setFetchComplete] = useState(false)
  const userIdRef = useRef<string | null>(null)
  const authSubscriptionRef = useRef<any>(null)
  const hasInitialFetchRef = useRef(false)

  const supabase = useMemo(() => createBrowserClient(), [])

  const fetchBusiness = useCallback(async () => {
    if (!supabase) return
    log('[BusinessContext] Fetching business...')
    console.log('[BUSINESS FETCH] auth user id:', (await supabase.auth.getUser()).data.user?.id || 'none')
    console.log('[BUSINESS FETCH] businessLoading:', true)
    setLoading(true)
    setFetchComplete(false)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        log('[BusinessContext] No user found')
        setBusiness(null)
        userIdRef.current = null
        setLoading(false)
        setFetchComplete(true)
        console.log('[BUSINESS FETCH] businessLoading:', false)
        console.log('[BUSINESS FETCH] business exists:', false)
        console.log('[BUSINESS FETCH] business fetch complete:', true)
        console.log('[BUSINESS FETCH] render branch: no user')
        return
      }

      // If user changed, clear old business data
      if (userIdRef.current && userIdRef.current !== user.id) {
        log('[BusinessContext] User changed, clearing old business data')
        setBusiness(null)
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
          log('[BusinessContext] No business found, not auto-creating. User must explicitly create business.')
          setBusiness(null)
          setLoading(false)
          setFetchComplete(true)
          console.log('[BUSINESS FETCH] businessLoading:', false)
          console.log('[BUSINESS FETCH] business exists:', false)
          console.log('[BUSINESS FETCH] business fetch complete:', true)
          console.log('[BUSINESS FETCH] render branch: no business')
        } else {
          console.error('[BusinessContext] Error fetching business:', fetchError)
          throw fetchError
        }
      } else {
        log('[BusinessContext] Business found:', businessData?.id)
        setBusiness(businessData)
        setLoading(false)
        setFetchComplete(true)
        console.log('[BUSINESS FETCH] businessLoading:', false)
        console.log('[BUSINESS FETCH] business exists:', true)
        console.log('[BUSINESS FETCH] business fetch complete:', true)
        console.log('[BUSINESS FETCH] render branch: business found')
      }
    } catch (err: any) {
      console.error('[BusinessContext] Fetch business failed:', err)
      setError(err.message || 'Failed to fetch business')
      setLoading(false)
      setFetchComplete(true)
      console.log('[BUSINESS FETCH] businessLoading:', false)
      console.log('[BUSINESS FETCH] business exists:', false)
      console.log('[BUSINESS FETCH] business fetch complete:', true)
      console.log('[BUSINESS FETCH] business fetch error:', err.message)
      console.log('[BUSINESS FETCH] render branch: error')
    } finally {
      // setLoading(false) // Already set in each path
    }
  }, [supabase])

  // Listen to auth state changes - only once
  useEffect(() => {
    if (!authSubscriptionRef.current && supabase) {
      authSubscriptionRef.current = supabase.auth.onAuthStateChange((event: string, session: any) => {
        log('[BusinessContext] Auth state changed:', event)

        if (event === 'SIGNED_OUT') {
          setBusiness(null)
          userIdRef.current = null
          setLoading(false)
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
        } catch (error) {
          console.error('[BusinessContext] Error cleaning up auth subscription:', error)
        }
        authSubscriptionRef.current = null
      }
    }
  }, [supabase, fetchBusiness])

  // Initial fetch - only once
  useEffect(() => {
    // Reset ref if loading is stuck (loading=true but fetch not complete)
    // This can happen if the initial fetch is interrupted (e.g., during Stripe return flow)
    // The ref prevents re-fetching, causing infinite loading on refresh
    if (hasInitialFetchRef.current && loading && !fetchComplete) {
      console.log('[BusinessContext] Detected stuck loading state - resetting initial fetch ref to allow retry', {
        hasInitialFetchRef: hasInitialFetchRef.current,
        loading,
        fetchComplete
      })
      hasInitialFetchRef.current = false
    }
    
    if (!hasInitialFetchRef.current) {
      console.log('[BusinessContext] Starting initial business fetch')
      hasInitialFetchRef.current = true
      fetchBusiness()
    }
  }, [fetchBusiness, loading, fetchComplete])

  const contextValue = useMemo(() => {
    const value: BusinessContextType = {
      business,
      loading,
      error,
      fetchComplete,
      refreshBusiness: fetchBusiness,
      setBusiness,
    }
    return value
  }, [business, loading, error, fetchComplete, fetchBusiness])

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
