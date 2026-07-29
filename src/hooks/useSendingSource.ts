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
  const [optimisticSource, setOptimisticSource] = useState<SendingSource | null>(null)

  // Get the current sending source, defaulting to 'replyflow'
  // Use optimistic value if available, otherwise use business value
  const sendingSource: SendingSource = optimisticSource || (business?.default_sending_source as SendingSource) || 'replyflow'

  // Determine the effective source (considering platform limitations)
  // Desktop can't use Business Number as default, but we preserve the saved preference
  const effectiveSource: SendingSource = (sendingSource === 'business' && isMobile) ? 'business' : 'replyflow'

  const updateSendingSource = useCallback(async (source: SendingSource) => {
    setIsLoading(true)
    setError(null)

    console.log('[useSendingSource] Starting update:', {
      requestedSource: source,
      currentBusinessId: business?.id,
      currentSavedSource: business?.default_sending_source,
      currentOptimisticSource: optimisticSource
    })

    // Optimistic update
    setOptimisticSource(source)

    try {
      console.log('[useSendingSource] Sending API request to /api/settings/sending-source')
      const response = await fetch('/api/settings/sending-source', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sendingSource: source })
      })

      console.log('[useSendingSource] API response status:', response.status)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('[useSendingSource] API error response:', errorData)
        throw new Error(errorData.error || 'Failed to update sending source')
      }

      const responseData = await response.json()
      console.log('[useSendingSource] API success response:', responseData)

      // Refresh business data to get the updated value
      console.log('[useSendingSource] Calling refreshBusiness()')
      await refreshBusiness()
      console.log('[useSendingSource] refreshBusiness() completed')
      
      // Clear optimistic state after successful refresh
      setOptimisticSource(null)
      console.log('[useSendingSource] Cleared optimistic state')
    } catch (err) {
      console.error('[useSendingSource] Error updating:', err)
      setError(err instanceof Error ? err.message : 'Failed to update sending source')
      
      // Rollback on failure by clearing optimistic state and refreshing
      setOptimisticSource(null)
      await refreshBusiness()
    } finally {
      setIsLoading(false)
    }
  }, [refreshBusiness, business, optimisticSource])

  return {
    sendingSource,
    isLoading,
    error,
    updateSendingSource,
    isNativeMobile: isMobile,
    effectiveSource
  }
}
