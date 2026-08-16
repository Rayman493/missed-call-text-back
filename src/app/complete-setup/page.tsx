'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useAuth } from '@/contexts/AuthContext'
import { useBusiness } from '@/contexts/BusinessContext'
import { clearAnonymousAppState } from '@/lib/clear-anonymous-state'
import BrandIcon from '@/components/BrandIcon'
import PasswordInput from '@/components/PasswordInput'
import { openStripeCheckout, isNativeIOS } from '@/lib/stripe-checkout'
import AppBackButton from '@/components/AppBackButton'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'

const supabase = createBrowserClient()

export default function CompleteSetupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { business, loading: businessLoading, refreshBusiness, invalidateBusinessCache } = useBusiness()
  const [password, setPassword] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRedirectingToStripe, setIsRedirectingToStripe] = useState(false)
  const [isResolvingCheckoutState, setIsResolvingCheckoutState] = useState(true)
  const [isInitialMount, setIsInitialMount] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [appResumeTrigger, setAppResumeTrigger] = useState(0) // Increment on app resume to trigger retry loop
  const pollingStartedRef = useRef(false)

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

  // If business has active subscription AND provisioning is complete, redirect to dashboard
  useEffect(() => {
    if (!businessLoading && business) {
      const subscriptionActive = business.subscription_status === 'trialing' || business.subscription_status === 'active'
      const provisioningComplete = business.provisioning_status === 'completed'
      const onboardingComplete = business.onboarding_status === 'completed'

      console.log('[COMPLETE_SETUP_RUNTIME] Navigation effect check:', {
        business_id: business.id?.substring(0, 8),
        subscription_status: business.subscription_status,
        provisioning_status: business.provisioning_status,
        onboarding_status: business.onboarding_status,
        subscriptionActive,
        provisioningComplete,
        onboardingComplete
      })

      // Only navigate if BOTH subscription is active AND provisioning is complete
      if (subscriptionActive && provisioningComplete && onboardingComplete) {
        console.log('[COMPLETE_SETUP_RUNTIME] → NAVIGATING to dashboard (completion detected in BusinessContext)')
        router.replace('/dashboard')
      } else {
        console.log('[COMPLETE_SETUP_RUNTIME] → SKIP navigation: not complete yet', {
          reason: !subscriptionActive ? 'subscription_not_active' : !provisioningComplete ? 'provisioning_not_complete' : 'onboarding_not_complete'
        })
      }
    }
  }, [businessLoading, business, router])

  // If no business after loading, redirect to onboarding
  useEffect(() => {
    if (!businessLoading && !business && user) {
      console.log('[CompleteSetup] No business found, redirecting to onboarding')
      router.replace('/onboarding')
    }
  }, [businessLoading, business, user, router])

  useEffect(() => {
    setIsInitialMount(false)
    console.log('[COMPLETE_SETUP_RUNTIME] Component MOUNTED')
    return () => {
      console.log('[COMPLETE_SETUP_RUNTIME] Component UNMOUNTED')
    }
  }, [])

  // Handle Stripe return via custom event (primary signal) and app resume (fallback)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return
    }

    console.log('[ACCOUNT_CREATION_RESUME] Setting up Stripe return listeners')

    const handleStripeReturn = async (event: Event) => {
      const customEvent = event as CustomEvent<{ flow: string; url: string; timestamp: number }>
      console.log('[ACCOUNT_CREATION_BRIDGE] JS Stripe return event received:', customEvent.detail)

      if (customEvent.detail.flow === 'STRIPE_CHECKOUT' && user) {
        console.log('[ACCOUNT_CREATION_BRIDGE] Stripe Checkout return detected, triggering reconciliation')
        await triggerReconciliation()
      }
    }

    const handleAppResume = async () => {
      console.log('[ACCOUNT_CREATION_RESUME] appStateChange active=true')

      try {
        const { getPendingStripeOperation } = await import('@/lib/external-return-handler')
        const pending = await getPendingStripeOperation()

        console.log('[ACCOUNT_CREATION_RESUME] Pending operation check:', {
          operation: pending.operation,
          businessId: pending.businessId?.substring(0, 8),
          userId: pending.userId?.substring(0, 8)
        })

        if (pending.operation === 'checkout' && user) {
          console.log('[ACCOUNT_CREATION_RESUME] Pending checkout detected on resume, triggering reconciliation')
          await triggerReconciliation()
        }
      } catch (error) {
        console.error('[ACCOUNT_CREATION_RESUME] Error checking pending operation on resume:', error)
      }

      // Check sessionStorage flag from native bridge as fallback
      try {
        const stripeReturnType = sessionStorage.getItem('stripe_return_type')
        const stripeReturnTimestamp = sessionStorage.getItem('stripe_return_timestamp')
        
        if (stripeReturnType === 'STRIPE_CHECKOUT' && user) {
          console.log('[ACCOUNT_CREATION_BRIDGE] sessionStorage flag detected on app resume:', stripeReturnType)
          // Clear the flag to prevent duplicate reconciliation
          sessionStorage.removeItem('stripe_return_type')
          sessionStorage.removeItem('stripe_return_timestamp')
          // Trigger reconciliation
          await triggerReconciliation()
        }
      } catch (e) {
        console.error('[ACCOUNT_CREATION_BRIDGE] sessionStorage check error:', e)
      }
    }

    const triggerReconciliation = async () => {
      console.log('[ACCOUNT_CREATION_RECONCILE] starting')

      try {
        // Increment trigger to force retry loop effect to re-run
        setAppResumeTrigger(prev => prev + 1)
        pollingStartedRef.current = true

        // Also refresh business to ensure fresh state
        await refreshBusiness(true)

        console.log('[ACCOUNT_CREATION_RECONCILE] reconciliation triggered via state update')
      } catch (error) {
        console.error('[ACCOUNT_CREATION_RECONCILE] error:', error)
      }
    }

    // Check sessionStorage immediately when listener attaches (in case event already fired)
    ;(async () => {
      try {
        const stripeReturnType = sessionStorage.getItem('stripe_return_type')
        if (stripeReturnType === 'STRIPE_CHECKOUT' && user) {
          console.log('[ACCOUNT_CREATION_BRIDGE] sessionStorage flag detected on listener attach:', stripeReturnType)
          sessionStorage.removeItem('stripe_return_type')
          sessionStorage.removeItem('stripe_return_timestamp')
          await triggerReconciliation()
        }
      } catch (e) {
        console.error('[ACCOUNT_CREATION_BRIDGE] sessionStorage check error on attach:', e)
      }
    })()

    // Listen for custom Stripe return event (primary signal)
    window.addEventListener('stripeReturn', handleStripeReturn)
    console.log('[ACCOUNT_CREATION_RESUME] stripeReturn event listener attached')

    // Also listen to appStateChange as fallback (secondary signal)
    const appStateListener = App.addListener('appStateChange', async ({ isActive }) => {
      if (isActive) {
        await handleAppResume()
      }
    })

    return () => {
      window.removeEventListener('stripeReturn', handleStripeReturn)
      console.log('[ACCOUNT_CREATION_RESUME] stripeReturn event listener removed')
      appStateListener.then(handle => handle.remove())
    }
  }, [user, refreshBusiness])

  // Check for pending checkout operation on mount and reconcile using checkout-status API
  // This handles the case where user returns from Stripe Checkout without URL params
  // (e.g., Android app resume where Stripe redirects to billing/success but user stays on complete-setup)
  useEffect(() => {
    const reconcilePendingCheckout = async () => {
      console.log('[ACCOUNT_CREATION_RECONCILE] starting', {
        user_present: !!user,
        user_id: user?.id?.substring(0, 8),
        business_present: !!business,
        business_id: business?.id?.substring(0, 8)
      })

      if (!user || !business) {
        console.log('[ACCOUNT_CREATION_RECONCILE] → SKIP: no user or business')
        return
      }

      try {
        const { getPendingStripeOperation, setPendingStripeOperation } = await import('@/lib/external-return-handler')
        const pending = await getPendingStripeOperation()

        console.log('[ACCOUNT_CREATION_RECONCILE] pending operation:', {
          operation: pending?.operation,
          business_id_match: pending?.businessId === business.id,
          user_id_match: pending?.userId === user.id
        })

        if (pending.operation === 'checkout' && pending.businessId === business.id && pending.userId === user.id) {
          console.log('[ACCOUNT_CREATION_RECONCILE] Pending checkout found, reconciling')

          // Reconcile using checkout-status API (not connect/refresh which is for Stripe Connect)
          const response = await fetch('/api/billing/checkout-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ business_id: business.id })
          })

          if (response.ok) {
            const data = await response.json()
            console.log('[ACCOUNT_CREATION_RECONCILE] Checkout status API result:', {
              subscriptionStatus: data.subscriptionStatus,
              provisioningStatus: data.provisioningStatus,
              onboardingStatus: data.onboardingStatus
            })

            const subscriptionActive = data.subscriptionStatus === 'trialing' || data.subscriptionStatus === 'active'
            const provisioningComplete = data.provisioningStatus === 'completed'

            if (subscriptionActive) {
              console.log('[ACCOUNT_CREATION_RECONCILE] Subscription active, refreshing business')
              await refreshBusiness(true)

              // Only clear pending operation if BOTH subscription is active AND provisioning is complete
              if (provisioningComplete) {
                console.log('[ACCOUNT_CREATION_RECONCILE] ✓ Subscription active AND provisioning complete, clearing pending operation')
                await setPendingStripeOperation(null)
                // The existing subscription check useEffect will handle navigation
              } else {
                console.log('[ACCOUNT_CREATION_RECONCILE] Subscription active but provisioning pending, KEEPING pending operation to continue polling')
                // Keep pending operation so retry loop continues to poll for provisioning completion
              }
            } else {
              // Subscription not yet active, keep retrying
              console.log('[ACCOUNT_CREATION_RECONCILE] Subscription not yet active, will retry')
            }
          } else {
            console.error('[ACCOUNT_CREATION_RECONCILE] Checkout status reconciliation failed:', response.status)
          }
        } else {
          console.log('[ACCOUNT_CREATION_RECONCILE] No pending checkout operation matching this user/business')
        }
      } catch (error) {
        console.error('[ACCOUNT_CREATION_RECONCILE] Error reconciling pending checkout:', error)
      }
    }

    reconcilePendingCheckout()
  }, [user, business, refreshBusiness])

  useEffect(() => {
    const routeFromFreshBusinessState = async () => {
      if (authLoading || !user) return

      const { data: freshBusiness, error: freshBusinessError } = await supabase
        .from('businesses')
        .select('id, name, business_phone_number, subscription_status, provisioning_status')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle()

      if (freshBusinessError) {
        console.error('[CompleteSetup] Failed to fetch fresh business state:', freshBusinessError)

        if (!businessLoading && business) {
          const hasName = Boolean(business.name && business.name.trim())
          const hasPhone = Boolean(business.business_phone_number && business.business_phone_number.trim())
          const subscriptionActive = business.subscription_status === 'trialing' || business.subscription_status === 'active'

          if (subscriptionActive) {
            const provisioningPending = business.provisioning_status === 'pending' || business.provisioning_status === 'provisioning'
            router.replace(provisioningPending ? '/dashboard?setup=1' : '/dashboard')
            return
          }

          if (hasName && hasPhone) {
            setIsResolvingCheckoutState(false)
          }
        }

        return
      }

      if (!freshBusiness) {
        console.log('[CompleteSetup] No fresh business found, redirecting to onboarding')
        router.replace('/onboarding')
        return
      }

      const hasName = Boolean(freshBusiness.name && freshBusiness.name.trim())
      const hasPhone = Boolean(freshBusiness.business_phone_number && freshBusiness.business_phone_number.trim())

      if (!hasName || !hasPhone) {
        console.log('[CompleteSetup] Business profile incomplete, redirecting to onboarding', { hasName, hasPhone })
        router.replace('/onboarding')
        return
      }

      const subscriptionActive = freshBusiness.subscription_status === 'trialing' || freshBusiness.subscription_status === 'active'
      const provisioningComplete = freshBusiness.provisioning_status === 'completed'

      if (subscriptionActive && provisioningComplete) {
        await refreshBusiness(true)

        // Track onboarding completion
        if (freshBusiness) {
          // Calculate onboarding duration (rough estimate from signup to now)
          const durationMs = Date.now() - new Date(freshBusiness.created_at || Date.now()).getTime()
          import('@/lib/analytics/analytics-service').then(({ analyticsService }) => {
            analyticsService.track('onboarding_completed', { durationMs }, freshBusiness.id).catch(error => {
              console.error('[Analytics] Failed to track onboarding_completed:', error)
            })
          })
        }

        router.replace('/dashboard')
        return
      }

      setIsResolvingCheckoutState(false)
    }

    routeFromFreshBusinessState()
  }, [authLoading, user, router, refreshBusiness, businessLoading, business])

  // Bounded retry for subscription verification after Stripe return
  // This handles the case where user returns from Stripe but webhook hasn't processed yet
  useEffect(() => {
    let isMounted = { current: true }
    let timeoutIds: number[] = []

    const checkSubscriptionWithRetry = async () => {
      // Check for pending operation to determine if we should retry on initial mount
      let hasPendingOperation = false
      if (user) {
        try {
          const { getPendingStripeOperation } = await import('@/lib/external-return-handler')
          const pending = await getPendingStripeOperation()
          hasPendingOperation = pending.operation === 'checkout' && pending.userId === user.id
          console.log('[COMPLETE_SETUP_RUNTIME] Pending operation check for retry:', hasPendingOperation)
        } catch (error) {
          console.error('[COMPLETE_SETUP_RUNTIME] Error checking pending operation:', error)
        }
      }

      // Skip if no user or no pending operation on initial mount
      // BUT allow retry if triggered by app resume (appResumeTrigger > 0)
      if (!user || (!hasPendingOperation && isInitialMount && appResumeTrigger === 0)) {
        console.log('[COMPLETE_SETUP_RUNTIME] → SKIP retry:', {
          reason: !user ? 'no_user' : 'no_pending_operation_on_initial_mount',
          hasPendingOperation,
          isInitialMount,
          appResumeTrigger
        })
        return
      }

      console.log('[COMPLETE_SETUP_RUNTIME] → Starting retry loop', {
        hasPendingOperation,
        isInitialMount,
        appResumeTrigger,
        pollingStarted: pollingStartedRef.current
      })

      let retryCount = 0
      const maxRetries = 10 // 10 retries * 3 seconds = 30 seconds total
      const retryInterval = 3000 // 3 seconds

      const checkSubscription = async () => {
        if (!isMounted.current) {
          console.log('[COMPLETE_SETUP_RUNTIME] Subscription check cancelled (component unmounted)')
          return
        }

        if (retryCount >= maxRetries) {
          console.log('[COMPLETE_SETUP_RUNTIME] Subscription check timeout after', maxRetries * retryInterval / 1000, 'seconds')
          if (isMounted.current) {
            setIsResolvingCheckoutState(false)
          }
          return
        }

        retryCount++
        console.log(`[ACCOUNT_CREATION_RECONCILE] Poll attempt ${retryCount}/${maxRetries}`)

        try {
          // CRITICAL: Use direct Supabase query, NOT BusinessContext
          // BusinessContext updates are asynchronous and may not reflect the latest state
          const { data: freshBusiness } = await supabase
            .from('businesses')
            .select('subscription_status, provisioning_status, onboarding_status, twilio_phone_number')
            .eq('user_id', user.id)
            .single()

          if (!isMounted.current) {
            console.log('[ACCOUNT_CREATION_RECONCILE] Subscription check result ignored (component unmounted)')
            return
          }

          console.log('[ACCOUNT_CREATION_RECONCILE] fetched business:', {
            attempt: retryCount,
            user_id: user.id.substring(0, 8),
            business_id: freshBusiness?.id?.substring(0, 8),
            subscription_status: freshBusiness?.subscription_status,
            provisioning_status: freshBusiness?.provisioning_status,
            onboarding_status: freshBusiness?.onboarding_status,
            has_twilio_phone: !!freshBusiness?.twilio_phone_number
          })

          const subscriptionActive = freshBusiness?.subscription_status === 'trialing' || freshBusiness?.subscription_status === 'active'
          const provisioningComplete = freshBusiness?.provisioning_status === 'completed'
          const onboardingComplete = freshBusiness?.onboarding_status === 'completed'

          const completionCondition = subscriptionActive && provisioningComplete && onboardingComplete

          console.log('[ACCOUNT_CREATION_RECONCILE] completion evaluation:', {
            subscriptionActive,
            provisioningComplete,
            onboardingComplete,
            completionCondition
          })

          if (completionCondition) {
            console.log('[ACCOUNT_CREATION_RECONCILE] ✓ COMPLETION DETECTED - navigating to dashboard')
            // Refresh context for other components, but navigate immediately
            await refreshBusiness(true)
            // Clear pending operation
            try {
              const { setPendingStripeOperation } = await import('@/lib/external-return-handler')
              await setPendingStripeOperation(null)
              console.log('[COMPLETE_SETUP_RUNTIME] ✓ Pending operation cleared')
            } catch (error) {
              console.error('[COMPLETE_SETUP_RUNTIME] Error clearing pending operation:', error)
            }
            if (isMounted.current) {
              router.replace('/dashboard')
            }
          } else if (subscriptionActive && !provisioningComplete) {
            console.log('[COMPLETE_SETUP_RUNTIME] → Subscription active but provisioning pending, continuing to poll')
            // Continue polling until provisioning completes
            const timeoutId = setTimeout(checkSubscription, retryInterval) as unknown as number
            timeoutIds.push(timeoutId)
          } else {
            console.log('[COMPLETE_SETUP_RUNTIME] → Subscription not yet active, continuing to poll')
            // Not yet active, retry
            const timeoutId = setTimeout(checkSubscription, retryInterval) as unknown as number
            timeoutIds.push(timeoutId)
          }
        } catch (error) {
          console.error('[COMPLETE_SETUP_RUNTIME] Subscription check error:', error)
          // On error, still retry to handle transient failures
          if (isMounted.current) {
            const timeoutId = setTimeout(checkSubscription, retryInterval) as unknown as number
            timeoutIds.push(timeoutId)
          }
        }
      }

      // Start bounded check only if subscription is not yet active OR provisioning is not yet complete
      const { data: initialBusiness } = await supabase
        .from('businesses')
        .select('subscription_status, provisioning_status, onboarding_status')
        .eq('user_id', user.id)
        .single()

      if (!isMounted.current) {
        console.log('[COMPLETE_SETUP_RUNTIME] Initial business check ignored (component unmounted)')
        return
      }

      console.log('[COMPLETE_SETUP_RUNTIME] Initial business state:', {
        user_id: user.id.substring(0, 8),
        business_id: initialBusiness?.id?.substring(0, 8),
        subscription_status: initialBusiness?.subscription_status,
        provisioning_status: initialBusiness?.provisioning_status,
        onboarding_status: initialBusiness?.onboarding_status
      })

      const initiallyActive = initialBusiness?.subscription_status === 'trialing' || initialBusiness?.subscription_status === 'active'
      const initiallyProvisioned = initialBusiness?.provisioning_status === 'completed'
      const initiallyOnboarded = initialBusiness?.onboarding_status === 'completed'

      if (!initiallyActive || !initiallyProvisioned || !initiallyOnboarded) {
        console.log('[COMPLETE_SETUP_RUNTIME] → Starting bounded retry', {
          reason: !initiallyActive ? 'subscription_not_active' : !initiallyProvisioned ? 'provisioning_not_complete' : 'onboarding_not_complete',
          initiallyActive,
          initiallyProvisioned,
          initiallyOnboarded
        })
        checkSubscription()
      } else {
        console.log('[COMPLETE_SETUP_RUNTIME] → Already complete, no retry needed')
        if (isMounted.current) {
          setIsResolvingCheckoutState(false)
        }
      }
    }

    // Check for pending Stripe operation before starting retry
    // Only retry if there's evidence user actually went through Stripe
    const checkPendingOperation = async () => {
      try {
        const { Preferences } = await import('@capacitor/preferences')
        const operationResult = await Preferences.get({ key: 'pending_stripe_operation' })
        const pendingOperation = operationResult.value

        if (pendingOperation === 'checkout') {
          console.log('[CompleteSetup] Pending checkout operation detected, starting retry')
          checkSubscriptionWithRetry()
        } else {
          console.log('[CompleteSetup] No pending checkout operation, skipping retry')
          if (isMounted.current) {
            setIsResolvingCheckoutState(false)
          }
        }
      } catch (error) {
        console.error('[CompleteSetup] Error checking pending operation:', error)
        // On error, still check subscription state to be safe
        checkSubscriptionWithRetry()
      }
    }

    checkPendingOperation()

    return () => {
      console.log('[CompleteSetup] Cleanup: cancelling subscription retry')
      isMounted.current = false
      timeoutIds.forEach(id => clearTimeout(id))
    }
  }, [isInitialMount, user, refreshBusiness, appResumeTrigger])

  // If business exists but profile is incomplete, redirect to onboarding
  useEffect(() => {
    if (!businessLoading && business && user) {
      const hasName = Boolean(business.name && business.name.trim())
      const hasPhone = Boolean(business.business_phone_number && business.business_phone_number.trim())
      
      if (!hasName || !hasPhone) {
        console.log('[CompleteSetup] Business profile incomplete, redirecting to onboarding', {
          hasName,
          hasPhone,
          businessId: business.id
        })
        router.replace('/onboarding')
      }
    }
  }, [businessLoading, business, user, router])

  const handleContinueToStripe = async () => {
    setIsRedirectingToStripe(true)
    setError(null)

    // Guard: Ensure business profile is complete before allowing Stripe checkout
    if (!business) {
      console.error('[CompleteSetup] No business found, redirecting to onboarding')
      router.replace('/onboarding')
      return
    }

    const hasName = Boolean(business.name && business.name.trim())
    const hasPhone = Boolean(business.business_phone_number && business.business_phone_number.trim())

    if (!hasName || !hasPhone) {
      console.error('[CompleteSetup] Business profile incomplete, redirecting to onboarding', {
        hasName,
        hasPhone,
        businessId: business.id
      })
      router.replace('/onboarding')
      return
    }

    try {
      const response = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkout_mode: 'trial',
          checkout_source: 'complete-setup',
          return_to_app: isNativeIOS(),
        }),
      })

      const checkoutData = await response.json()

      if (response.ok && checkoutData.url) {
        // Set pending operation so app resume can reconcile subscription status
        const { setPendingStripeOperation } = await import('@/lib/external-return-handler')
        await setPendingStripeOperation('checkout', business.id, user?.id)
        console.log('[CompleteSetup] Pending checkout operation set for business:', business.id, 'user:', user?.id)

        await openStripeCheckout(checkoutData.url)
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
        console.log('[CompleteSetup] Account deleted, signing out and clearing caches')
        
        // Sign out from Supabase client to clear local session state
        try {
          await supabase.auth.signOut()
          console.log('[CompleteSetup] Supabase sign out successful')
        } catch (signOutError) {
          console.error('[CompleteSetup] Supabase sign out error:', signOutError)
        }
        
        // Clear all ReplyFlow onboarding/business cached state so a fresh signup
        // in the same browser cannot inherit stale data.
        if (typeof window !== 'undefined') {
          clearAnonymousAppState()
        }
        
        // Redirect to homepage
        window.location.href = '/'
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

  if (authLoading || businessLoading || isResolvingCheckoutState) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 text-center">
        <div className="w-14 h-14 border-4 border-blue-600/30 border-t-blue-600 border-solid rounded-full animate-spin mb-6"></div>
        <h1 className="text-xl font-semibold text-white mb-2">
          {isInitialMount ? 'Finalizing your account...' : 'Verifying your subscription...'}
        </h1>
        <p className="text-sm text-slate-400">
          {isInitialMount ? 'Setting up ReplyFlow. This should only take a moment.' : 'Please wait while we confirm your subscription status.'}
        </p>
      </div>
    )
  }

  if (!user || !business) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="mb-4">
          <AppBackButton fallbackHref="/dashboard" label="Back" className="text-slate-400 hover:bg-slate-900 hover:text-white" />
        </div>
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
                <PasswordInput
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  disabled={isDeleting}
                  className="h-12 px-4 py-3 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-950"
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
