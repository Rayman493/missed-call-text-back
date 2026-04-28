'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { Business } from '@/lib/types'
import SetupError from '@/components/SetupError'

interface BusinessContextType {
  business: Business | null
  loading: boolean
  error: string | null
  refreshBusiness: () => Promise<void>
}

const BusinessContext = createContext<BusinessContextType | undefined>(undefined)

export function BusinessProvider({ children }: { children: ReactNode }) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)

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
          // No business found - auto-create one
          console.log('[BusinessContext] No business found for user, auto-creating...')
          
          const newBusiness = {
            user_id: user.id,
            name: user.email || 'My Business',
            twilio_phone_number: process.env.NEXT_PUBLIC_TWILIO_PHONE_NUMBER || '',
            auto_reply_message: 'Hi, this is {{business_name}}. Sorry we missed your call—how can we help you?',
            subscription_status: 'inactive',
          }

          const { data: createdBusiness, error: createError } = await supabase
            .from('businesses')
            .insert(newBusiness)
            .select()
            .single()

          if (createError) {
            console.error('[BusinessContext] Error auto-creating business:', createError)
            // If twilio_phone_number is not unique, try without it
            if (createError.code === '23505') {
              console.log('[BusinessContext] Duplicate twilio_phone_number, retrying without it')
              const { data: createdBusinessNoPhone, error: createErrorNoPhone } = await supabase
                .from('businesses')
                .insert({
                  user_id: user.id,
                  name: user.email || 'My Business',
                  auto_reply_message: 'Hi, this is {{business_name}}. Sorry we missed your call—how can we help you?',
                  subscription_status: 'inactive',
                })
                .select()
                .single()

              if (createErrorNoPhone) {
                console.error('[BusinessContext] Error auto-creating business without phone:', createErrorNoPhone)
                setBusiness(null)
              } else {
                console.log('[BusinessContext] Business created without phone:', createdBusinessNoPhone?.id)
                setBusiness(createdBusinessNoPhone as Business)
              }
            } else {
              setBusiness(null)
            }
          } else {
            console.log('[BusinessContext] Business auto-created:', createdBusiness?.id)
            setBusiness(createdBusiness as Business)
          }
        } else {
          console.error('[BusinessContext] Error fetching business:', fetchError)
          throw fetchError
        }
      } else {
        console.log('[BusinessContext] Business result:', businessData)
        console.log('[BusinessContext] Business found:', businessData?.id)
        console.log('[BusinessContext] Business subscription status:', businessData?.subscription_status)
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

  // Listen to auth state changes
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
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

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchBusiness()
  }, [])

  const refreshBusiness = async () => {
    await fetchBusiness()
  }

  return (
    <BusinessContext.Provider value={{ business, loading, error, refreshBusiness }}>
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
