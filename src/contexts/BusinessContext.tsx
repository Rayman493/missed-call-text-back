'use client'

import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Business } from '@/lib/types'
import SetupError from '@/components/SetupError'

interface BusinessContextType {
  business: Business | null
  loading: boolean
  error: string | null
  refreshBusiness: () => Promise<void>
  setBusiness: (business: Business | null) => void
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined)

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const authSubscriptionRef = useRef<any>(null)

  const contextValue: BusinessContextType = {
    business,
    loading,
    error,
    refreshBusiness: async () => {
      await fetchBusiness()
    },
    setBusiness
  }

  const supabase = createBrowserClient()

  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  const fetchBusiness = async () => {
    console.log('[BusinessContext] Fetching business...')
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        console.log('[BusinessContext] No user found')
        setBusiness(null)
        setUserId(null)
        setLoading(false)
        return
      }

      // If user changed, clear old business data
      if (userId && userId !== user.id) {
        console.log('[BusinessContext] User changed, clearing old business data')
        setBusiness(null)
      }
      setUserId(user.id)

      console.log('[BusinessContext] User found, fetching business for user:', user.id)
      const { data, error: fetchError } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      const businessData = data as Business | null

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // No business found - use centralized getOrCreateBusiness API
          console.log('[BusinessContext] No business found for user:', user.id, 'using centralized business creation API...')
          
          const response = await fetch('/api/business/get-or-create', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              businessData: {
                name: user.email || 'My Business',
                // Don't set twilio_phone_number here - let backend assign shared number
              }
            })
          })
          
          if (response.ok) {
            const data = await response.json()
            if (data.business) {
              console.log('[BusinessContext] Business resolved via getOrCreateBusiness API:', data.business.id)
              setBusiness(data.business as Business)
            } else {
              console.error('[BusinessContext] No business returned from API')
              setBusiness(null)
            }
          } else {
            console.error('[BusinessContext] API call failed:', response.status)
            setBusiness(null)
          }
        } else {
          console.error('[BusinessContext] Error fetching business:', fetchError)
          throw fetchError
        }
      } else {
        console.log('[ProvisioningState] Business found:', businessData?.id, 'for user:', user.id)
        console.log('[ProvisioningState] Business subscription status:', businessData?.subscription_status)
        console.log('[ProvisioningState] Business provisioning state:', {
          business_id: businessData?.id,
          provisioning_status: businessData?.provisioning_status,
          provisioning_error: businessData?.provisioning_error,
          subscription_status: businessData?.subscription_status,
          twilio_phone_number: businessData?.twilio_phone_number,
          twilio_phone_number_sid: businessData?.twilio_phone_number_sid,
          provisioned_at: businessData?.provisioned_at
        })
        setBusiness(businessData)
      }
    } catch (err: any) {
      console.error('[BusinessContext] Fetch business failed:', err)
      setError(err.message || 'Failed to fetch business')
    } finally {
      console.log('[BusinessContext] Setting loading to false')
      setLoading(false)
    }
  }

  // Listen to auth state changes - only once
  useEffect(() => {
    if (!authSubscriptionRef.current && supabase) {
      authSubscriptionRef.current = supabase.auth.onAuthStateChange((event: string, session: any) => {
        console.log('[BusinessContext] Auth state changed:', event, session?.user?.id)
        
        if (event === 'SIGNED_OUT') {
          console.log('[BusinessContext] User signed out, clearing business data')
          setBusiness(null)
          setUserId(null)
          setLoading(false)
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          console.log('[BusinessContext] User signed in or token refreshed, fetching business')
          fetchBusiness()
        }
      })
    }

    return () => {
      console.log('[BusinessContext] Cleaning up auth subscription')
      if (authSubscriptionRef.current?.subscription) {
        try {
          authSubscriptionRef.current.subscription.unsubscribe()
          console.log('[BusinessContext] Auth subscription cleaned up successfully')
        } catch (error) {
          console.error('[BusinessContext] Error cleaning up auth subscription:', error)
        }
        authSubscriptionRef.current = null
      }
    }
  }, [supabase])

  // Initial fetch
  useEffect(() => {
    fetchBusiness()
  }, [])

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
