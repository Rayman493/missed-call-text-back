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
        setLoading(false)
        return
      }

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
          // No business found
          console.log('[BusinessContext] No business found for user')
          setBusiness(null)
        } else {
          console.error('[BusinessContext] Error fetching business:', fetchError)
          throw fetchError
        }
      } else {
        console.log('[BusinessContext] Business result:', businessData)
        console.log('[BusinessContext] Business found:', businessData?.id)
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
