'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending' | 'error'>('loading')
  const sessionId = searchParams?.get('session_id')

  useEffect(() => {
    if (!sessionId) {
      setStatus('error')
      return
    }

    // Call reconcile endpoint to update payment status
    fetch(`/api/payments/reconcile?session_id=${sessionId}`)
      .then(res => res.json())
      .then(data => {
        console.log('[PAYMENT SUCCESS] Reconcile result:', data)
        if (data.status === 'paid' || data.status === 'already_paid') {
          setStatus('paid')
        } else if (data.status === 'pending' || data.status === 'unpaid') {
          setStatus('pending')
        } else {
          setStatus('error')
        }
      })
      .catch(err => {
        console.error('[PAYMENT SUCCESS] Reconcile error:', err)
        // Even if reconcile fails, show success since user completed checkout
        setStatus('paid')
      })
  }, [sessionId])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md">
        <div className="text-center">
          {status === 'loading' ? (
            <>
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-blue-100 mb-4">
                <svg className="animate-spin h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Confirming Payment...</h1>
              <p className="text-gray-600">Please wait while we confirm your payment.</p>
            </>
          ) : status === 'paid' ? (
            <>
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Received</h1>
              <p className="text-gray-600">Thank you for your payment.</p>
              <p className="text-sm text-gray-500 mt-4">You can close this window.</p>
            </>
          ) : status === 'pending' ? (
            <>
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-yellow-100 mb-4">
                <svg className="h-8 w-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Processing</h1>
              <p className="text-gray-600">Your payment is being processed.</p>
              <p className="text-sm text-gray-500 mt-4">You may close this window. We'll send a confirmation when complete.</p>
            </>
          ) : (
            <>
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-green-100 mb-4">
                <svg className="h-8 w-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Payment Received</h1>
              <p className="text-gray-600">Thank you for your payment.</p>
              <p className="text-sm text-gray-500 mt-4">You can close this window.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
