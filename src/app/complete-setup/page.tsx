'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import BrandIcon from '@/components/BrandIcon'

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
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        {/* Brand header */}
        <div className="flex justify-center mb-8">
          <BrandIcon size={48} />
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">
              Complete your free trial setup
            </h1>
            <p className="text-slate-400">
              Your account is almost ready. Complete one final step to activate your 14-day free trial through our secure billing partner, Stripe.
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-200 text-sm">
              {error}
            </div>
          )}

          {!showDeleteConfirm ? (
            <div className="space-y-6">
              {/* Trial benefits */}
              <div className="bg-slate-800/50 rounded-lg p-4">
                <ul className="space-y-2">
                  {[
                    '14-day free trial',
                    'No charges during your trial',
                    'Cancel anytime before the trial ends',
                  ].map((benefit, index) => (
                    <li key={index} className="flex items-center gap-3 text-sm text-slate-300">
                      <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {benefit}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Primary CTA */}
              <button
                onClick={handleContinueToStripe}
                disabled={isRedirectingToStripe}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRedirectingToStripe ? 'Redirecting to Stripe...' : 'Activate My Free Trial'}
              </button>

              <p className="text-center text-xs text-slate-500">
                Securely powered by Stripe
              </p>

              {/* Come back later message */}
              <div className="text-center pt-2">
                <p className="text-sm font-medium text-slate-300 mb-1">Not ready yet?</p>
                <p className="text-sm text-slate-500">
                  You can safely close this page and come back later by signing in with your email. We&apos;ll save your progress until you&apos;re ready to activate your free trial.
                </p>
              </div>

              {/* Delete account section */}
              <div className="border-t border-slate-800 pt-8 mt-4">
                <p className="text-sm font-medium text-slate-300 mb-1 text-center">Changed your mind?</p>
                <p className="text-sm text-slate-500 text-center mb-4">
                  If you&apos;ve decided ReplyFlow isn&apos;t right for you, you can permanently delete your account before activating your free trial.
                </p>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="w-full sm:w-auto mx-auto block bg-transparent hover:bg-red-950/30 text-red-400 text-sm font-medium py-2 px-4 rounded-lg border border-red-500/30 transition-colors"
                >
                  Delete my account
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-white mb-2">
                  Delete your account?
                </h2>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4 text-sm text-slate-300 space-y-3">
                <p>
                  Your ReplyFlow account has not been activated yet.
                </p>
                <p className="font-medium text-white">Deleting your account will permanently remove:</p>
                <ul className="space-y-1.5">
                  {[
                    'Your business profile',
                    'Your login',
                    'Your onboarding progress',
                  ].map((item, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-slate-500">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <p className="text-slate-400">
                  No subscription has been created.
                  <br />
                  No business phone number has been provisioned.
                </p>
                <p className="text-red-400 font-medium">
                  This action cannot be undone.
                </p>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-1">
                  Enter your password to confirm account deletion
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
                <div className="mt-2">
                  <Link
                    href="/forgot-password"
                    className="text-sm text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    Forgot your password?
                  </Link>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false)
                    setPassword('')
                    setError(null)
                  }}
                  disabled={isDeleting}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || !password}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeleting ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
