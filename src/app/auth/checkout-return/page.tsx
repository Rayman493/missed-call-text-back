'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function CheckoutReturnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    const processCheckoutReturn = async () => {
      const sessionId = searchParams?.get('session_id')
      
      console.log('[CheckoutReturn] Processing checkout return')
      console.log('[CheckoutReturn] Session ID:', sessionId)
      console.log('[CheckoutReturn] Current URL:', window.location.href)
      
      if (!sessionId) {
        console.error('[CheckoutReturn] No session_id in URL')
        setStatus('error')
        setError('No session ID found in URL')
        return
      }

      try {
        console.log('[CheckoutReturn] Calling checkout recovery API')
        const response = await fetch('/api/stripe/checkout-return', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId })
        })

        const data = await response.json()
        
        console.log('[CheckoutReturn] Checkout recovery response:', data)

        if (!response.ok || !data.success) {
          console.error('[CheckoutReturn] Checkout recovery failed:', data)
          setStatus('error')
          setError(data.error || 'Failed to process checkout')
          return
        }

        console.log('[CheckoutReturn] Checkout recovery successful, redirecting to dashboard')
        setStatus('success')
        
        // Redirect to dashboard with checkout success
        router.replace('/dashboard?checkout=success')
      } catch (error) {
        console.error('[CheckoutReturn] Error processing checkout return:', error)
        setStatus('error')
        setError('Network error processing checkout')
      }
    }

    processCheckoutReturn()
  }, [searchParams, router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent border-solid animate-spin rounded-full mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Activating your trial...
            </h2>
            <p className="text-muted-foreground">
              Please wait while we set up your account
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Trial activated!
            </h2>
            <p className="text-muted-foreground">
              Redirecting to your dashboard...
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Something went wrong
            </h2>
            <p className="text-muted-foreground mb-6">
              {error || 'We had trouble activating your trial. Please try again or contact support.'}
            </p>
            <button
              onClick={() => router.replace('/dashboard')}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Go to Dashboard
            </button>
          </>
        )}
      </div>
    </div>
  )
}
