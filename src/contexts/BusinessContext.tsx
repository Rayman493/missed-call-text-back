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
  const [businessMissingConfirmed, setBusinessMissingConfirmed] = useState(false)
  const userIdRef = useRef<string | null>(null)
  const authSubscriptionRef = useRef<any>(null)
  const hasInitialFetchRef = useRef(false)

  const supabase = useMemo(() => createBrowserClient(), [])

  const fetchBusiness = useCallback(async () => {
    if (!supabase) return
    log('[BusinessContext] Fetching business...')
    console.log('[LOGIN FLOW TRACE]', {
      location: 'BusinessContext.fetchBusiness',
      step: 'business_query_started',
      userId: userIdRef.current,
      sessionExists: false,
      businessLoading: true,
      businessFetchComplete: false,
      businessFound: false,
      businessId: null,
      redirectTarget: null,
      reason: 'Starting business fetch'
    })
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
        setBusinessMissingConfirmed(false)
        userIdRef.current = null
        setLoading(false)
        setFetchComplete(true)
        console.log('[BUSINESS FETCH] businessLoading:', false)
        console.log('[BUSINESS FETCH] business exists:', false)
        console.log('[BUSINESS FETCH] business fetch complete:', true)
        console.log('[BUSINESS FETCH] business missing confirmed:', false)
        console.log('[BUSINESS FETCH] render branch: no user')
        console.log('[LOGIN FLOW TRACE]', {
          location: 'BusinessContext.fetchBusiness',
          step: 'business_query_completed',
          userId: null,
          sessionExists: false,
          businessLoading: false,
          businessFetchComplete: true,
          businessFound: false,
          businessId: null,
          redirectTarget: null,
          reason: 'No user found'
        })
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

      console.log('[BUSINESS QUERY RESULT]', {
        userId: user.id,
        data: businessData ? { id: businessData.id, name: businessData.name, subscription_status: businessData.subscription_status } : null,
        errorCode: fetchError?.code,
        errorMessage: fetchError?.message,
        count: businessData ? 1 : 0,
        currentPath: typeof window !== 'undefined' ? window.location.pathname : 'server'
      })

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // No business found - do NOT auto-create, just set business to null
          log('[BusinessContext] No business found (PGRST116), not auto-creating. User must explicitly create business.')
          setBusiness(null)
          setBusinessMissingConfirmed(true) // Confirmed no business
          setLoading(false)
          setFetchComplete(true)
          console.log('[BUSINESS FETCH] businessLoading:', false)
          console.log('[BUSINESS FETCH] business exists:', false)
          console.log('[BUSINESS FETCH] business fetch complete:', true)
          console.log('[BUSINESS FETCH] business missing confirmed:', true)
          console.log('[BUSINESS FETCH] render branch: no business (PGRST116)')
          console.log('[LOGIN FLOW TRACE]', {
            location: 'BusinessContext.fetchBusiness',
            step: 'business_query_completed',
            userId: user.id,
            sessionExists: true,
            businessLoading: false,
            businessFetchComplete: true,
            businessFound: false,
            businessId: null,
            redirectTarget: null,
            reason: 'No business found (PGRST116)'
          })
        } else {
          console.error('[BusinessContext] Error fetching business:', fetchError)
          console.error('[BusinessContext] Error code:', fetchError.code)
          console.error('[BusinessContext] Error message:', fetchError.message)
          // For other errors, do NOT assume no business - keep business null but mark fetch as complete
          // This prevents sending existing users to onboarding due to transient failures
          log('[BusinessContext] Business query failed (non-PGRST116 error), treating as unknown state')
          setBusiness(null)
          setBusinessMissingConfirmed(false) // Not confirmed, could be error
          setLoading(false)
          setFetchComplete(true)
          console.log('[BUSINESS FETCH] businessLoading:', false)
          console.log('[BUSINESS FETCH] business exists:', false)
          console.log('[BUSINESS FETCH] business fetch complete:', true)
          console.log('[BUSINESS FETCH] business missing confirmed:', false)
          console.log('[BUSINESS FETCH] business fetch error:', fetchError.message)
          console.log('[BUSINESS FETCH] render branch: error (not PGRST116)')
          console.log('[LOGIN FLOW TRACE]', {
            location: 'BusinessContext.fetchBusiness',
            step: 'business_query_completed',
            userId: user.id,
            sessionExists: true,
            businessLoading: false,
            businessFetchComplete: true,
            businessFound: false,
            businessId: null,
            redirectTarget: null,
            reason: `Business query error: ${fetchError.code} - ${fetchError.message}`
          })
        }
      } else {
        log('[BusinessContext] Business found:', businessData?.id)
        setBusiness(businessData)
        setBusinessMissingConfirmed(false)
        setLoading(false)
        setFetchComplete(true)
        console.log('[BUSINESS FETCH] businessLoading:', false)
        console.log('[BUSINESS FETCH] business exists:', true)
        console.log('[BUSINESS FETCH] business fetch complete:', true)
        console.log('[BUSINESS FETCH] business missing confirmed:', false)
        console.log('[BUSINESS FETCH] render branch: business found')
        
        // USER ID MATCH CHECK
        console.log('[USER ID MATCH CHECK]', {
          authUserId: user.id,
          businessUserId: businessData?.user_id,
          businessId: businessData?.id,
          matches: businessData ? user.id === businessData.user_id : false
        })
        
        // BUSINESS OWNERSHIP CHECK - client found business
        console.log('[BUSINESS OWNERSHIP CHECK]', {
          authUserId: user.id,
          clientFoundBusiness: true,
          clientBusinessId: businessData?.id,
          adminFoundBusiness: 'not_checked',
          adminBusinessId: null,
          clientErrorCode: null,
          clientErrorMessage: null
        })
        
        console.log('[LOGIN FLOW TRACE]', {
          location: 'BusinessContext.fetchBusiness',
          step: 'business_query_completed',
          userId: user.id,
          sessionExists: true,
          businessLoading: false,
          businessFetchComplete: true,
          businessFound: true,
          businessId: businessData?.id,
          redirectTarget: null,
          reason: 'Business found'
        })
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

        console.log('[AUTH STATE CHANGE DEBUG]', {
          event,
          userId: session?.user?.id || null,
          previousUserId: userIdRef.current,
          businessFetchStarted: loading,
          businessFetchComplete: fetchComplete,
          businessExists: !!business
        })

        if (event === 'SIGNED_OUT') {
          console.log('[AUTH STATE CHANGE DEBUG] SIGNED_OUT - clearing state')
          setBusiness(null)
          setBusinessMissingConfirmed(false)
          userIdRef.current = null
          setLoading(false)
          setFetchComplete(false) // Reset fetch complete on logout
        } else if (event === 'SIGNED_IN') {
          console.log('[AUTH STATE CHANGE DEBUG] SIGNED_IN - checking if user changed')
          // Only refetch if user actually changed (avoids redundant refetch on initial mount)
          const newUserId = session?.user?.id
          if (newUserId && newUserId !== userIdRef.current) {
            log('[BusinessContext] User signed in (new user), fetching business')
            console.log('[AUTH STATE CHANGE DEBUG] SIGNED_IN - user changed, fetching business')
            fetchBusiness()
          } else {
            console.log('[AUTH STATE CHANGE DEBUG] SIGNED_IN - user same as before, skipping fetch')
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
  }, [supabase, fetchBusiness, loading, fetchComplete, business])

  // Initial fetch - only once
  useEffect(() => {
    if (!hasInitialFetchRef.current) {
      hasInitialFetchRef.current = true
      fetchBusiness()
    }
  }, [fetchBusiness])

  const contextValue = useMemo(() => {
    const value: BusinessContextType = {
      business,
      loading,
      error,
      fetchComplete,
      businessMissingConfirmed,
      refreshBusiness: fetchBusiness,
      setBusiness,
    }
    
    // Log business context state on every change
    console.log('[BUSINESS CONTEXT STATE]', {
      authUserId: userIdRef.current,
      businessId: business?.id,
      businessLoading: loading,
      businessFetchComplete: fetchComplete,
      businessMissingConfirmed,
      businessErrorCode: error,
      businessErrorMessage: error,
      businessFound: !!business
    })
    
    return value
  }, [business, loading, error, fetchComplete, businessMissingConfirmed, fetchBusiness])

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
