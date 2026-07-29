import { useState, useCallback } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { supportsBusinessNumber } from '@/lib/platform-capabilities'

export type SendingSource = 'replyflow' | 'business'

interface UseSendingSourceReturn {
  sendingSource: SendingSource
  isLoading: boolean
  error: string | null
  updateSendingSource: (source: SendingSource) => Promise<void>
  isNativeMobile: boolean
  effectiveSource: SendingSource // The actual source to use (considering platform)
}

// Check if running in native mobile app - use shared capability helper
const isNativeMobile = () => {
  return supportsBusinessNumber()
}

export function useSendingSource(): UseSendingSourceReturn {
  const { business, refreshBusiness } = useBusiness()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMobile] = useState(isNativeMobile())

  // Get the current sending source, defaulting to 'replyflow'
  const sendingSource: SendingSource = (business?.default_sending_source as SendingSource) || 'replyflow'

  // Determine the effective source (considering platform limitations)
  // Desktop can't use Business Number as default, but we preserve the saved preference
  const effectiveSource: SendingSource = sendingSource

  const updateSendingSource = useCallback(async (source: SendingSource) => {
    setIsLoading(true)
    setError(null)

    // Optimistic update
    if (business) {
      const originalValue = business.default_sending_source
      // Update local state optimistically through context
      // This will be reflected in the UI immediately
    }

    try {
      const response = await fetch('/api/settings/sending-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sendingSource: source })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update sending source')
      }

      // Refresh business data to get the updated value
      await refreshBusiness()
    } catch (err) {
      console.error('[useSendingSource] Error updating:', err)
      setError(err instanceof Error ? err.message : 'Failed to update sending source')
      
      // Rollback on failure by refreshing
      await refreshBusiness()
    } finally {
      setIsLoading(false)
    }
  }, [business, refreshBusiness])

  return {
    sendingSource,
    isLoading,
    error,
    updateSendingSource,
    isNativeMobile: isMobile,
    effectiveSource
  }
}
