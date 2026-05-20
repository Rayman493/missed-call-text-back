'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'

export default function CheckoutReturnPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'needs_signin'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    const processCheckoutReturn = async () => {
      const sessionId = searchParams?.get('session_id')
      const checkoutStatus = searchParams?.get('checkout')
      
      console.log('[CheckoutReturn] ===== PROCESSING CHECKOUT RETURN =====')
      console.log('[CheckoutReturn] Query params:', {
        sessionId,
        checkoutStatus,
        fullUrl: window.location.href,
        pathname: window.location.pathname,
        userAgent: navigator.userAgent,
        isMobile: /Mobile|Android|iPhone/i.test(navigator.userAgent)
      })
      
      if (!sessionId) {
        console.error('[CheckoutReturn] ERROR: No session_id in URL')
        console.log('[CheckoutReturn] Redirect decision: error (no session_id)')
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
        
        console.log('[CheckoutReturn] Checkout recovery API response:', {
          ok: response.ok,
          status: response.status,
          success: data.success,
          error: data.error,
          subscriptionStatus: data.subscriptionStatus,
          businessId: data.businessId
        })

        if (!response.ok || !data.success) {
          console.error('[CheckoutReturn] ERROR: Checkout recovery failed:', data)
          console.log('[CheckoutReturn] Redirect decision: error (checkout recovery failed)')
          setStatus('error')
          setError(data.error || 'Failed to process checkout')
          return
        }

        console.log('[CheckoutReturn] Checkout recovery successful')
        console.log('[CheckoutReturn] Business ID:', data.businessId)
        console.log('[CheckoutReturn] Subscription status:', data.subscriptionStatus)
        
        // Check if Supabase session exists with recovery attempts
        const supabase = createBrowserClient()
        if (!supabase) {
          console.error('[CheckoutReturn] ERROR: Failed to create Supabase client')
          console.log('[CheckoutReturn] Redirect decision: needs_signin (no supabase client)')
          setStatus('needs_signin')
          return
        }

        console.log('[CheckoutReturn] Supabase client created successfully')
        console.log('[CheckoutReturn] Attempting session recovery with retries')
        
        let session = null
        let sessionError = null
        
        for (let attempt = 1; attempt <= 3; attempt++) {
          console.log(`[CheckoutReturn] ===== SESSION RECOVERY ATTEMPT ${attempt}/3 =====`)
          
          // Wait a bit between attempts to allow cookies to load
          if (attempt > 1) {
            console.log('[CheckoutReturn] Waiting 1 second before retry...')
            await new Promise(resolve => setTimeout(resolve, 1000))
          }
          
          const result = await supabase.auth.getSession()
          session = result.data.session
          sessionError = result.error
          
          console.log('[CheckoutReturn] Session check result:', {
            attempt,
            sessionExists: !!session,
            userId: session?.user?.id,
            userEmail: session?.user?.email,
            sessionError: sessionError?.message,
            accessTokenPresent: !!session?.access_token,
            refreshTokenPresent: !!session?.refresh_token
          })
          
          if (session) {
            console.log('[CheckoutReturn] SUCCESS: Session recovered on attempt', attempt)
            console.log('[CheckoutReturn] User:', {
              id: session.user.id,
              email: session.user.email,
              createdAt: session.user.created_at
            })
            break
          } else {
            console.log('[CheckoutReturn] Session not found on attempt', attempt)
          }
        }

        if (!session) {
          console.log('[CheckoutReturn] ===== SESSION RECOVERY FAILED =====')
          console.log('[CheckoutReturn] Final session error:', sessionError)
          console.log('[CheckoutReturn] Redirect decision: needs_signin (session recovery failed after 3 attempts)')
          console.log('[CheckoutReturn] Redirect target: /auth/signin?redirect=/dashboard&checkout=success')
          setStatus('needs_signin')
          return
        }

        console.log('[CheckoutReturn] ===== SESSION RECOVERY SUCCESSFUL =====')
        console.log('[CheckoutReturn] Redirecting to dashboard with checkout success')
        console.log('[CheckoutReturn] Redirect decision: success (session recovered)')
        setStatus('success')
        
        // Redirect to dashboard with checkout success
        setTimeout(() => {
          console.log('[CheckoutReturn] Executing redirect to /dashboard?checkout=success')
          router.replace('/dashboard?checkout=success')
        }, 500)
      } catch (error) {
        console.error('[CheckoutReturn] ERROR: Network error processing checkout return:', error)
        console.log('[CheckoutReturn] Redirect decision: error (network error)')
        setStatus('error')
        setError('Network error processing checkout')
      }
    }

    processCheckoutReturn()
  }, [searchParams, router])

  const handleSignIn = () => {
    router.push('/auth/signin?redirect=/dashboard')
  }

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

        {status === 'needs_signin' && (
          <>
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Your trial is active!
            </h2>
            <p className="text-muted-foreground mb-6">
              We just need to reconnect your session.
            </p>
            <button
              onClick={() => router.push('/auth/signin?redirect=/dashboard&checkout=success')}
              className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
            >
              Continue to Dashboard
            </button>
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
