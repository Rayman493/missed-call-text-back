'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Business } from '@/lib/types'

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

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const fetchBusiness = async () => {
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setBusiness(null)
        setLoading(false)
        return
      }

      const { data: businessData, error: fetchError } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', user.id)
        .limit(1)
        .single()

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          // No business found
          setBusiness(null)
        } else {
          throw fetchError
        }
      } else {
        setBusiness(businessData)
      }
    } catch (err: any) {
      console.error('Error fetching business:', err)
      setError(err.message || 'Failed to fetch business')
    } finally {
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
