import { useState, useCallback, useRef } from 'react'
import { useBusiness } from '@/contexts/BusinessContext'
import { supportsBusinessNumber } from '@/lib/platform-capabilities'

// Check if we're in a browser environment
const isClient = typeof window !== 'undefined' && typeof document !== 'undefined'

// Toast styles injection
let toastStylesInjected = false

function injectToastStyles() {
  if (!isClient) return

  if (document.getElementById('error-toast-styles')) return

  const style = document.createElement('style')
  style.id = 'error-toast-styles'
  style.textContent = `
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fade-out {
      from { opacity: 1; transform: translateY(0); }
      to { opacity: 0; transform: translateY(10px); }
    }
    .animate-fade-in {
      animation: fade-in 0.3s ease-out;
    }
    .animate-fade-out {
      animation: fade-out 0.3s ease-out;
    }
  `
  document.head.appendChild(style)
}

function showErrorToast(message: string) {
  if (!isClient) return

  if (!toastStylesInjected) {
    injectToastStyles()
    toastStylesInjected = true
  }

  const toast = document.createElement('div')
  toast.className = 'fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg z-50 flex items-center gap-2 animate-fade-in'
  toast.innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
    </svg>
    <span class="text-sm font-medium">${message}</span>
  `

  document.body.appendChild(toast)

  setTimeout(() => {
    toast.classList.add('animate-fade-out')
    setTimeout(() => {
      if (document.body.contains(toast)) {
        document.body.removeChild(toast)
      }
    }, 300)
  }, 3000)
}

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
  const { business, refreshBusiness, updateBusinessField } = useBusiness()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMobile] = useState(isNativeMobile())
  const [optimisticSource, setOptimisticSource] = useState<SendingSource | null>(null)
  const inFlightRef = useRef<SendingSource | null>(null)

  // Get the current sending source, defaulting to 'replyflow'
  // Use optimistic value if available, otherwise use business value
  const sendingSource: SendingSource = optimisticSource || (business?.default_sending_source as SendingSource) || 'replyflow'

  // Determine the effective source (considering platform limitations)
  // Desktop can't use Business Number as default, but we preserve the saved preference
  const effectiveSource: SendingSource = (sendingSource === 'business' && isMobile) ? 'business' : 'replyflow'

  const updateSendingSource = useCallback(async (source: SendingSource) => {
    // In-flight guard: prevent duplicate requests for the same source
    if (inFlightRef.current === source) {
      return
    }

    setIsLoading(true)
    setError(null)
    inFlightRef.current = source

    // Optimistic update
    setOptimisticSource(source)

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

      const responseData = await response.json()

      // Verify API response matches requested source
      if (responseData.sendingSource !== source) {
        console.error('[useSendingSource] API response mismatch:', {
          requested: source,
          received: responseData.sendingSource
        })
        throw new Error('API response does not match requested source')
      }

      // Update BusinessContext directly from verified API response
      updateBusinessField('default_sending_source', responseData.sendingSource)

      // Clear optimistic state after context update
      setOptimisticSource(null)

      // Optionally refresh business in background for broader reconciliation
      refreshBusiness().catch(err => {
        console.error('[useSendingSource] Background refresh failed:', err)
      })
    } catch (err) {
      console.error('[useSendingSource] Error updating:', err)
      setError(err instanceof Error ? err.message : 'Failed to update sending source')

      // Show user-facing error toast
      showErrorToast("Couldn't update Sending Number. Please try again.")

      // Rollback on failure by clearing optimistic state and refreshing
      setOptimisticSource(null)
      await refreshBusiness()
    } finally {
      setIsLoading(false)
      inFlightRef.current = null
    }
  }, [refreshBusiness, updateBusinessField])

  return {
    sendingSource,
    isLoading,
    error,
    updateSendingSource,
    isNativeMobile: isMobile,
    effectiveSource
  }
}
