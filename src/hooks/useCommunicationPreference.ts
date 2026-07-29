import { useState, useEffect, useCallback } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { createBrowserClient } from '@/lib/supabase/browser'

// Check if running in native mobile app
const isNativeMobile = () => {
  try {
    return (window as any).Capacitor?.isNativePlatform?.() ?? false
  } catch {
    return false
  }
}

export type CommunicationSource = 'replyflow' | 'business'

interface UseCommunicationPreferenceReturn {
  defaultSource: CommunicationSource
  isLoading: boolean
  setDefaultSource: (source: CommunicationSource) => Promise<void>
  resolveSource: (override?: CommunicationSource) => CommunicationSource
}

export function useCommunicationPreference(): UseCommunicationPreferenceReturn {
  const { business, refreshBusiness } = useBusiness()
  const [defaultSource, setDefaultSourceState] = useState<CommunicationSource>('replyflow')
  const [isLoading, setIsLoading] = useState(true)

  // Load the mobile-only preference from database
  useEffect(() => {
    const loadPreference = async () => {
      setIsLoading(true)
      
      // Check for existing localStorage preference for migration
      const localPreference = localStorage.getItem('communicationSource') as CommunicationSource | null
      
      // Use database value if available
      if (business?.default_mobile_communication_source) {
        setDefaultSourceState(business.default_mobile_communication_source as CommunicationSource)
        // Clear localStorage migration fallback if database value exists
        if (localPreference) {
          localStorage.removeItem('communicationSource')
        }
      } 
      // Fall back to localStorage migration preference if no database value
      else if (localPreference) {
        setDefaultSourceState(localPreference)
        // Migrate localStorage preference to database
        await migratePreferenceToDatabase(localPreference)
      } 
      // Default to replyflow
      else {
        setDefaultSourceState('replyflow')
      }
      
      setIsLoading(false)
    }

    loadPreference()
  }, [business?.default_mobile_communication_source])

  // Migrate localStorage preference to database
  const migratePreferenceToDatabase = async (source: CommunicationSource) => {
    try {
      const supabase = createBrowserClient()
      const { error } = await supabase
        .from('businesses')
        .update({ default_mobile_communication_source: source })
        .eq('id', business?.id)
      
      if (!error) {
        localStorage.removeItem('communicationSource')
        await refreshBusiness()
      }
    } catch (err) {
      console.error('[COMMUNICATION PREFERENCE] Migration failed:', err)
    }
  }

  // Set the mobile-only default preference
  const setDefaultSource = useCallback(async (source: CommunicationSource) => {
    setIsLoading(true)
    
    try {
      const supabase = createBrowserClient()
      const { error } = await supabase
        .from('businesses')
        .update({ default_mobile_communication_source: source })
        .eq('id', business?.id)
      
      if (error) {
        throw error
      }
      
      // Optimistic update
      setDefaultSourceState(source)
      
      // Refresh business data to ensure consistency
      await refreshBusiness()
    } catch (err) {
      console.error('[COMMUNICATION PREFERENCE] Failed to save preference:', err)
      throw err
    } finally {
      setIsLoading(false)
    }
  }, [business?.id, refreshBusiness])

  // Resolve the communication source based on the resolution order:
  // Desktop: Always 'replyflow'
  // Mobile: 1. Explicit action override, 2. Current customer-page override, 3. Saved mobile preference, 4. ReplyFlow fallback
  const resolveSource = useCallback((override?: CommunicationSource): CommunicationSource => {
    // Desktop: Always use ReplyFlow
    if (!isNativeMobile()) {
      return 'replyflow'
    }
    
    // Mobile: Use override if provided
    if (override) {
      return override
    }
    
    // Check for current customer-page override from localStorage
    const customerOverride = localStorage.getItem('customerCommunicationSource') as CommunicationSource | null
    if (customerOverride) {
      return customerOverride
    }
    
    // Use mobile default
    return defaultSource
  }, [defaultSource])

  return {
    defaultSource,
    isLoading,
    setDefaultSource,
    resolveSource,
  }
}
