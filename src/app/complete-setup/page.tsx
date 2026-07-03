'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'

export default function CompleteSetupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { business, loading: businessLoading, refreshBusiness } = useBusiness()
  const [password, setPassword] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRedirectingToStripe, setIsRedirectingToStripe] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const checkoutCancelled = searchParams?.get('checkout') === 'cancelled'

  useEffect(() => {
    if (checkoutCancelled && refreshBusiness) {
      refreshBusiness(true)
    }
  }, [checkoutCancelled, refreshBusiness])

  // If user is not authenticated, redirect to signin
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/auth/signin')
    }
  }, [authLoading, user, router])

  // If business has active subscription, redirect to dashboard
  useEffect(() => {
    if (!businessLoading && business && business.subscription_status) {
      router.replace('/dashboard')
    }
  }, [businessLoading, business, router])

  // If no business after loading, redirect to onboarding
  useEffect(() => {
    if (!businessLoading && !business && user) {
      router.replace('/onboarding')
    }
  }, [businessLoading, business, user, router])

  const handleContinueToStripe = async () => {
    setIsRedirectingToStripe(true)
    setError(null)

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkout_mode: 'trial',
        }),
      })

      const checkoutData = await response.json()

      if (response.ok && checkoutData.url) {
        window.location.href = checkoutData.url
      } else {
        console.error('[CompleteSetup] Failed to create checkout session:', checkoutData)
        setError('Could not create checkout session. Please try again.')
        setIsRedirectingToStripe(false)
      }
    } catch (err) {
      console.error('[CompleteSetup] Error creating checkout session:', err)
      setError('Could not create checkout session. Please try again.')
      setIsRedirectingToStripe(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (!password) {
      setError('Please enter your password to confirm account deletion.')
      return
    }

    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/delete-incomplete-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
      })

      const data = await response.json()

      if (response.ok) {
        router.replace('/signup')
      } else {
        setError(data.error || 'Could not delete account. Please try again.')
        setIsDeleting(false)
      }
    } catch (err) {
      console.error('[CompleteSetup] Error deleting account:', err)
      setError('Could not delete account. Please try again.')
      setIsDeleting(false)
    }
  }

  if (authLoading || businessLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-14 h-14 border-4 border-blue-600/30 border-t-blue-600 border-solid rounded-full animate-spin"></div>
      </div>
    )
  }

  if (!user || !business) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-lg shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            Complete your free trial setup
          </h1>
          <p className="text-slate-400">
            Your ReplyFlow account has been created, but your free trial is not active yet. Complete Stripe Checkout to start using ReplyFlow.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
            {error}
          </div>
        )}

        {!showDeleteConfirm ? (
          <div className="space-y-4">
            <button
              onClick={handleContinueToStripe}
              disabled={isRedirectingToStripe}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRedirectingToStripe ? 'Redirecting to Stripe...' : 'Continue to Stripe Checkout'}
            </button>

            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full bg-transparent hover:bg-slate-800 text-red-400 font-semibold py-3 px-4 rounded-lg border border-slate-700 transition-colors"
            >
              Delete my account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-slate-300 text-sm">
              This will permanently delete your ReplyFlow account and all associated data. Since you have not completed checkout, no Twilio number or subscription will remain.
            </p>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                Confirm your password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isDeleting}
              />
            </div>

            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting || !password}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDeleting ? 'Deleting account...' : 'Permanently delete my account'}
            </button>

            <button
              onClick={() => {
                setShowDeleteConfirm(false)
                setPassword('')
                setError(null)
              }}
              disabled={isDeleting}
              className="w-full bg-transparent hover:bg-slate-800 text-slate-300 font-semibold py-3 px-4 rounded-lg border border-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
