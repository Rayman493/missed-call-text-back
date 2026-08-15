'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import SetupError from '@/components/SetupError'
import Footer from '@/components/Footer'
import PasswordInput from '@/components/PasswordInput'
import BrandIcon from '@/components/BrandIcon'
import RoutingDebugBanner from '@/components/RoutingDebugBanner'
import { mapAuthError, type AuthErrorDisplay } from '@/lib/auth-error-mapper'
import { isCapacitorNative, getCapacitorPlatform } from '@/capacitor/init'
import { openStripeCheckout } from '@/lib/stripe-checkout'
import { isNativeIOS as checkNativeIOS } from '@/lib/stripe-checkout'

// Footer with theme support for auth pages
function AuthFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-slate-950 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <p className="text-slate-400/70 text-xs sm:text-sm">
            © {currentYear} ReplyFlowHQ. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}

const supabase = createBrowserClient()

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams?.get('mode') || 'signup'
  const emailParam = searchParams?.get('email')
  const redirectParam = searchParams?.get('redirect') || '/dashboard'
  const returnToParam = searchParams?.get('returnTo')
  
  // Detect if this is a return from Stripe checkout
  const isCheckoutReturn = redirectParam?.includes('checkout=success')
  
  const [isSignIn, setIsSignIn] = useState(mode === 'signin')
  const [signupStep, setSignupStep] = useState(1) // 1 = account details, 2 = business info
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [serviceLocationType, setServiceLocationType] = useState<'onsite' | 'customer_comes_to_business' | 'remote' | ''>('')
  const [addressLine1, setAddressLine1] = useState('')
  const [addressLine2, setAddressLine2] = useState('')
  const [addressCity, setAddressCity] = useState('')
  const [addressState, setAddressState] = useState('')
  const [addressPostalCode, setAddressPostalCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorDisplay, setErrorDisplay] = useState<AuthErrorDisplay | null>(null)
  const [existingAccount, setExistingAccount] = useState(false)
  const [debugError, setDebugError] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const passwordRef = React.useRef<HTMLInputElement>(null)
  const emailRef = React.useRef<HTMLInputElement>(null)
  const isSubmittingRef = React.useRef(false)
  const [redirecting, setRedirecting] = useState(false)
  const [isCreatingCheckout, setIsCreatingCheckout] = useState(false)
  const isCreatingCheckoutRef = React.useRef(false)

  // Track if account was created in this session to prevent re-submission
  const accountCreatedRef = React.useRef(false)

  // Track if checkout failed after account creation to offer retry
  const [checkoutFailedAfterAccountCreation, setCheckoutFailedAfterAccountCreation] = useState(false)
  
  // Handle Stripe cancel message
  const checkoutCancelled = searchParams?.get('checkout') === 'cancelled'
  useEffect(() => {
    if (checkoutCancelled) {
      setError('Your free trial setup isn\'t complete yet. Complete Stripe Checkout to activate your ReplyFlow account.')
      // Force business data refresh to clear any stale cached subscription status
      if (typeof window !== 'undefined') {
        console.log('[Auth] Stripe cancel detected, clearing business cache')
        sessionStorage.removeItem('replyflow_business_verified')
      }
    }
  }, [checkoutCancelled])

  // Password requirements validation
  const [passwordRequirements, setPasswordRequirements] = useState({
    minLength: false,
    hasUppercase: false,
    hasLowercase: false,
    hasNumber: false,
  })

  // Check password requirements as user types
  useEffect(() => {
    setPasswordRequirements({
      minLength: password.length >= 8,
      hasUppercase: /[A-Z]/.test(password),
      hasLowercase: /[a-z]/.test(password),
      hasNumber: /[0-9]/.test(password),
    })
  }, [password])

  const allPasswordRequirementsMet = Object.values(passwordRequirements).every(Boolean)

  // Auto-focus email field on desktop only
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      emailRef.current?.focus()
    }
  }, [])

  // Update mode when URL changes
  useEffect(() => {
    setIsSignIn(mode === 'signin')
    // Clear error when switching modes
    if (mode === 'signin') {
      setError('')
      setErrorDisplay(null)
      setExistingAccount(false)
      setDebugError(null)
    }
  }, [mode])

  // Reset scroll position when signup step changes (mobile scroll bug fix)
  const prevSignupStepRef = React.useRef<number | null>(null)
  useEffect(() => {
    // Skip if this is the first render or if not in signup mode
    if (prevSignupStepRef.current === null || isSignIn) {
      prevSignupStepRef.current = signupStep
      return
    }

    // Only reset scroll if the step actually changed
    if (prevSignupStepRef.current !== signupStep) {
      // Reset window scroll to top with immediate behavior (not smooth)
      window.scrollTo({
        top: 0,
        behavior: 'auto'
      })
      console.log('[Auth] Reset scroll to top on step change:', prevSignupStepRef.current, '→', signupStep)
    }

    prevSignupStepRef.current = signupStep
  }, [signupStep, isSignIn])

  
  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[Auth] sign-in started')
    setLoading(true)
    setError('')
    setErrorDisplay(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      console.log('[Auth] sign-in succeeded')

      // Listen for SIGNED_IN event
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
        if (event === 'SIGNED_IN' && session) {
          // Session established
        }
      })

      // Wait for session to be persisted to localStorage (mobile delay)
      await new Promise(resolve => setTimeout(resolve, 500))

      // Verify session is actually persisted
      const { data: { session: persistedSession } } = await supabase.auth.getSession()

      if (!persistedSession) {
        const mappedError = mapAuthError({ message: 'Session not saved' })
        setErrorDisplay(mappedError)
        subscription.unsubscribe()
        return
      }

      subscription.unsubscribe()

      // Fetch business row from database using authenticated user.id
      const { data: business, error: businessError } = await supabase
        .from('businesses')
        .select('*')
        .eq('user_id', persistedSession.user.id)
        .single()

      // Clear stale localStorage keys
      if (typeof window !== 'undefined') {
        const keysToClear = ['onboarding_status', 'businessSetupPending', 'pendingOnboarding']
        keysToClear.forEach(key => {
          localStorage.removeItem(key)
        })
      }

      // Show redirecting state
      setRedirecting(true)
      setLoading(false)

      // Determine redirect target based on business query result
      let redirectTarget: string
      if (business) {
        // Business found - check if business profile is complete
        const hasName = Boolean(business.name && business.name.trim())
        const hasPhone = Boolean(business.business_phone_number && business.business_phone_number.trim())
        
        if (!hasName || !hasPhone) {
          // Business exists but profile incomplete - redirect to onboarding to complete profile
          console.log('[Auth] Business found but profile incomplete, redirecting to onboarding', { hasName, hasPhone })
          redirectTarget = '/onboarding'
        } else if (business.subscription_status === null) {
          // Business exists with complete profile but Stripe Checkout NOT completed - redirect to complete-setup page
          // This gives users an escape hatch to delete their account if they abandon checkout
          console.log('[Auth] Business found with complete profile but subscription_status is null - redirecting to complete-setup page')
          redirectTarget = '/complete-setup'
        } else {
          // Business found and Stripe Checkout completed - go to dashboard
          console.log('[Auth] Business found for user:', persistedSession.user.id, '- routing to dashboard')
          redirectTarget = returnToParam || redirectParam || '/dashboard'
        }
      } else if (businessError?.code === 'PGRST116') {
        // No business row confirmed - go to onboarding
        console.log('[Auth] No business row found for user:', persistedSession.user.id, '- routing to onboarding (orphan auth recovery)')
        redirectTarget = '/onboarding'
      } else {
        // Business query error or no business found - route to onboarding for recovery
        // This handles orphan auth users gracefully instead of sending them to a broken dashboard
        console.log('[Auth] Business query error or no business for user:', persistedSession.user.id, '- routing to onboarding for recovery', businessError)
        redirectTarget = '/onboarding'
      }

      await new Promise(resolve => setTimeout(resolve, 800))
      router.push(redirectTarget)
    } catch (err: any) {
      const mappedError = mapAuthError(err)
      setErrorDisplay(mappedError)
    } finally {
      setLoading(false)
    }
  }

  const handleSignUpStep1 = () => {
    // Validate Step 1 fields
    if (!email.trim()) {
      setError('Please enter your email.')
      return
    }

    if (!password) {
      setError('Please enter a password.')
      return
    }

    if (!allPasswordRequirementsMet) {
      setError('Please complete all password requirements.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    // Clear error and move to Step 2
    setError('')
    setSignupStep(2)
  }

  const handleSignUpStep2 = async () => {
    // Validate Step 2 fields
    if (!businessName.trim()) {
      setError('Please enter a business name.')
      return
    }

    if (!businessPhone.trim()) {
      setError('Please enter a business phone number.')
      return
    }

    // Require explicit service location selection for new businesses
    if (!serviceLocationType) {
      setError('Please choose how customers receive your services.')
      return
    }

    // Hard submit lock - prevent duplicate submissions
    if (isSubmitting || isSubmittingRef.current || accountCreatedRef.current) {
      console.log('[Auth] Submission in progress or account already created, ignoring')
      return
    }
    setIsSubmitting(true)
    isSubmittingRef.current = true
    setLoading(true)
    setError('')
    setExistingAccount(false)

    try {
      // Normalize phone number
      const normalizedPhone = businessPhone.replace(/\D/g, '')
      if (normalizedPhone.length < 10) {
        setError('Please enter a valid phone number.')
        setLoading(false)
        setIsSubmitting(false)
        isSubmittingRef.current = false
        return
      }

      // Validate address fields
      if (!addressLine1.trim() || !addressCity.trim() || !addressState.trim() || !addressPostalCode.trim()) {
        setError('Please fill in all required address fields.')
        setLoading(false)
        setIsSubmitting(false)
        isSubmittingRef.current = false
        return
      }

      // Validate state code
      if (addressState.length !== 2) {
        setError('State must be a 2-letter code (e.g., CA).')
        setLoading(false)
        setIsSubmitting(false)
        isSubmittingRef.current = false
        return
      }

      // Validate postal code format
      if (!/^\d{5}(-\d{4})?$/.test(addressPostalCode)) {
        setError('ZIP code must be in format 12345 or 12345-6789.')
        setLoading(false)
        setIsSubmitting(false)
        isSubmittingRef.current = false
        return
      }

      // Call the complete-signup endpoint
      const response = await fetch('/api/auth/complete-signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          businessName,
          businessPhone,
          service_location_type: serviceLocationType,
          businessAddress: {
            line1: addressLine1,
            line2: addressLine2,
            city: addressCity,
            state: addressState,
            postal_code: addressPostalCode,
            country: 'US'
          }
        }),
      })

      const data = await response.json()
      console.log('[Auth] Complete signup response:', data)

      if (!response.ok) {
        if (data.step === 'user_exists') {
          // If the user_exists error comes from a known successful local creation, ignore it
          // This can happen if the user double-taps after account creation succeeds
          if (accountCreatedRef.current) {
            console.log('[Auth] user_exists after known successful local creation - ignoring, continuing to checkout')
            // Continue to checkout since we know the account was just created
          } else {
            setExistingAccount(true)
            setError(data.error || 'This email already has an account.')
            setLoading(false)
            setIsSubmitting(false)
            isSubmittingRef.current = false
            return
          }
        } else {
          setError(data.error || 'Failed to create account')
          setLoading(false)
          setIsSubmitting(false)
          isSubmittingRef.current = false
          return
        }
      }

      // Hard guard: complete-signup must return business_id
      const businessIdFromCompleteSignup = data.business?.id
      if (!businessIdFromCompleteSignup) {
        console.error('[Auth] complete-signup did not return business_id:', data)
        setError('Account created but business setup incomplete. Please sign in to complete your profile.')
        setIsSignIn(true)
        setLoading(false)
        setIsSubmitting(false)
        isSubmittingRef.current = false
        return
      }

      console.log('[Auth] complete-signup returned business_id:', businessIdFromCompleteSignup)

      // Mark account as created to prevent re-submission
      accountCreatedRef.current = true

      // Account created successfully - now sign in the client
      console.log('[Auth] Account created, signing in client...')
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (signInError) {
        console.error('[Auth] Client sign-in failed after account creation:', signInError)
        setError('Account created! Please sign in to continue.')
        setIsSignIn(true)
        setLoading(false)
        setIsSubmitting(false)
        isSubmittingRef.current = false
        return
      }

      if (!signInData.session) {
        console.error('[Auth] Client sign-in returned no session')
        setError('Account created! Please sign in to continue.')
        setIsSignIn(true)
        setLoading(false)
        setIsSubmitting(false)
        isSubmittingRef.current = false
        return
      }

      console.log('[Auth] Client signed in successfully')

      // The business row was created atomically by /api/auth/complete-signup with all required fields
      // including service_location_type. No client-side update needed.
      console.log('[Auth] Starting checkout for business_id from complete-signup:', businessIdFromCompleteSignup)
      
      // Guard against duplicate checkout calls
      if (isCreatingCheckout || isCreatingCheckoutRef.current) {
        console.log('[Auth] Checkout already in progress, skipping duplicate call')
        setLoading(false)
        setIsSubmitting(false)
        isSubmittingRef.current = false
        return
      }
      
      setIsCreatingCheckout(true)
      isCreatingCheckoutRef.current = true
      
      try {
        // Determine if checkout originated from native iOS app for proper return handling
        const isNativeIOS = isCapacitorNative() && getCapacitorPlatform() === 'ios'

        const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            checkout_mode: 'trial',
            checkout_source: 'auth-signup',
            return_to_app: checkNativeIOS(),
            business_id: businessIdFromCompleteSignup, // Pass business ID from complete-signup
          }),
        })

        const checkoutData = await checkoutResponse.json()
        console.log('[Auth] Checkout session response:', checkoutData)

        if (!checkoutResponse.ok || !checkoutData.url) {
          console.error('[Auth] Failed to create checkout session:', checkoutData)
          
          // If checkout failed due to missing business, redirect to onboarding
          if (checkoutData.reason === 'no_business_row' && checkoutData.redirect) {
            console.log('[Auth] Redirecting to onboarding due to missing business row')
            setLoading(false)
            setIsSubmitting(false)
            isSubmittingRef.current = false
            setIsCreatingCheckout(false)
            isCreatingCheckoutRef.current = false
            router.replace(checkoutData.redirect)
            return
          }
          
          // Account created but checkout failed - offer retry option
          console.log('[Auth] Account created but checkout failed - user can retry')
          setError('Account created successfully. Click "Retry Checkout" to continue to Stripe.')
          setCheckoutFailedAfterAccountCreation(true)
          setLoading(false)
          // Keep isSubmitting and accountCreatedRef true to prevent re-submission
          // Reset checkout states to allow retry
          setIsCreatingCheckout(false)
          isCreatingCheckoutRef.current = false
          return
        }

        // Redirect to Stripe Checkout
        console.log('[Auth] Redirecting to Stripe Checkout...')
        setLoading(false)
        // Keep isSubmitting and accountCreatedRef true to prevent re-submission while checkout opens
        // Only reset checkout states
        setIsCreatingCheckout(false)
        isCreatingCheckoutRef.current = false

        await openStripeCheckout(checkoutData.url)
      } catch (checkoutError: any) {
        console.error('[Auth] Error creating checkout session:', checkoutError)
        // Account created but checkout failed - offer retry option
        console.log('[Auth] Account created but checkout failed due to error - user can retry')
        setError('Account created successfully. Click "Retry Checkout" to continue to Stripe.')
        setCheckoutFailedAfterAccountCreation(true)
        setLoading(false)
        // Keep isSubmitting and accountCreatedRef true to prevent re-submission
        // Reset checkout states to allow retry
        setIsCreatingCheckout(false)
        isCreatingCheckoutRef.current = false
      }
    } catch (err: any) {
      setError(err.message || 'Unable to create account. Please try again or contact support if the issue persists.')
      setLoading(false)
      setIsSubmitting(false)
      isSubmittingRef.current = false
      // Reset accountCreatedRef on actual error (not checkout failure)
      accountCreatedRef.current = false
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Route to appropriate step handler
    if (signupStep === 1) {
      handleSignUpStep1()
    } else {
      await handleSignUpStep2()
    }
  }

  const handleBackToStep1 = () => {
    setSignupStep(1)
    setError('')
  }

  const handleRetryCheckout = async () => {
    if (!accountCreatedRef.current) {
      console.error('[Auth] Retry checkout called without account creation')
      return
    }

    console.log('[Auth] Retrying checkout after account creation')
    setLoading(true)
    setError('')
    setCheckoutFailedAfterAccountCreation(false)

    try {
      // Determine if checkout originated from native iOS app for proper return handling
      const isNativeIOS = isCapacitorNative() && getCapacitorPlatform() === 'ios'

      const checkoutResponse = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkout_mode: 'trial',
          checkout_source: 'auth-signup',
          return_to_app: checkNativeIOS,
        }),
      })

      const checkoutData = await checkoutResponse.json()
      console.log('[Auth] Checkout session response:', checkoutData)

      if (!checkoutResponse.ok || !checkoutData.url) {
        console.error('[Auth] Failed to create checkout session on retry:', checkoutData)
        setError('Failed to create checkout session. Please try again or contact support.')
        setCheckoutFailedAfterAccountCreation(true)
        setLoading(false)
        return
      }

      // Redirect to Stripe Checkout
      console.log('[Auth] Redirecting to Stripe Checkout...')
      setLoading(false)
      setCheckoutFailedAfterAccountCreation(false)

      await openStripeCheckout(checkoutData.url)
    } catch (checkoutError: any) {
      console.error('[Auth] Error retrying checkout session:', checkoutError)
      setError('Failed to create checkout session. Please try again or contact support.')
      setCheckoutFailedAfterAccountCreation(true)
      setLoading(false)
    }
  }

  const handleBackToHomepage = () => {
    // No cookie needed since homepage auto-redirect is disabled
    router.push('/')
  }

  const toggleMode = () => {
    const newMode = isSignIn ? 'signup' : 'signin'
    router.push(`/auth?mode=${newMode}`)
  }

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 sm:py-8">
        {/* Back to Homepage Link (web only) */}
        {!isCapacitorNative() && (
          <div className="w-full max-w-md sm:max-w-[480px] mb-4">
            <button
              onClick={handleBackToHomepage}
              className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-300 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Homepage
            </button>
          </div>
        )}
        
        <div className="w-full max-w-md sm:max-w-[480px] bg-gradient-to-b from-slate-900 to-slate-900/95 border border-slate-700/50 rounded-2xl shadow-xl shadow-blue-900/5 p-5 sm:p-6 md:p-8 backdrop-blur-sm">
          {/* Progress indicator for signup mode */}
          {!isSignIn && !isCheckoutReturn && (
            <div className="mb-4">
              {/* Progress bars row */}
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <div className={`h-1 rounded-full ${signupStep >= 1 ? 'bg-blue-600' : 'bg-slate-600'}`}></div>
                </div>
                <div className="flex-1">
                  <div className={`h-1 rounded-full ${signupStep >= 2 ? 'bg-blue-600' : 'bg-slate-600'}`}></div>
                </div>
              </div>
              {/* Labels row */}
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-xs text-slate-400">Step 1 of 2: Create Your Account</p>
                </div>
                <div className="flex-1">
                  {signupStep === 2 ? (
                    <p className="text-xs text-slate-400">Step 2 of 2: Business Information</p>
                  ) : (
                    <div className="h-4"></div>
                  )}
                </div>
              </div>
            </div>
          )}
          
          <div className="text-center mb-5 sm:mb-6">
            <div className="inline-flex items-center justify-center mb-3 sm:mb-4">
              <BrandIcon size={64} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 mb-2">
              {isCheckoutReturn ? 'Sign In' : (isSignIn ? 'Sign In' : (signupStep === 1 ? 'Create Your Account' : 'Business Information'))}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400">
              {isCheckoutReturn ? 'Sign in to finish your trial setup' : (isSignIn ? 'Sign in to your account' : (signupStep === 1 ? 'Create your login details' : 'Tell us about your business'))}
            </p>
          </div>
          
          {isSignIn && emailParam && !isCheckoutReturn && (
            <p className="text-sm text-slate-400 mb-4 sm:mb-6">Welcome back — please sign in</p>
          )}
          
          {isCheckoutReturn && (
            <p className="text-sm text-slate-400 mb-4 sm:mb-6">Complete your trial setup by signing in</p>
          )}
          
          {!isSignIn && !isCheckoutReturn && (
            <p className="text-sm text-slate-400 mb-4 sm:mb-6">Create your account to get started</p>
          )}
          
          {errorDisplay && (
            <div 
              className="bg-red-950/30 border border-red-900/50 rounded-lg p-3 mb-4"
              role="alert"
              aria-live="polite"
            >
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-200 mb-0.5">
                    {errorDisplay.heading}
                  </p>
                  <p className="text-xs text-red-300/80">
                    {errorDisplay.body}
                  </p>
                </div>
              </div>
            </div>
          )}

          {checkoutFailedAfterAccountCreation && (
            <div
              className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-3 mb-4"
              role="alert"
              aria-live="polite"
            >
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-200 mb-0.5">
                    Account Created Successfully
                  </p>
                  <p className="text-xs text-amber-300/80 mb-2">
                    {error || 'Your account has been created. Click below to continue to Stripe Checkout.'}
                  </p>
                  <button
                    onClick={handleRetryCheckout}
                    disabled={loading}
                    className="text-xs bg-blue-600 text-white py-1.5 px-3 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Retry Checkout
                  </button>
                </div>
              </div>
            </div>
          )}

          {existingAccount && (
            <div 
              className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-3 mb-4"
              role="alert"
              aria-live="polite"
            >
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-amber-200 mb-0.5">
                    Account Already Exists
                  </p>
                  <p className="text-xs text-amber-300/80 mb-2">
                    An account with this email address already exists. Please sign in to continue or use a different email address.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setError('')
                        setErrorDisplay(null)
                        setExistingAccount(false)
                        router.push(`/auth?mode=signin&email=${encodeURIComponent(email)}`)
                      }}
                      className="text-xs bg-blue-600 text-white py-1.5 px-3 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors font-medium"
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => {
                        setExistingAccount(false)
                        setError('')
                        setErrorDisplay(null)
                      }}
                      className="text-xs text-amber-300/70 hover:text-amber-200 underline"
                    >
                      Use a different email
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={isSignIn ? handleSignIn : handleSignUp} className="space-y-4">
            {/* Step 1: Account Details */}
            {!isSignIn && signupStep === 1 && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setErrorDisplay(null)
                    }}
                    required
                    autoComplete="email"
                    name="email"
                    className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <PasswordInput
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setErrorDisplay(null)
                    }}
                    required
                    autoComplete="new-password"
                    className="h-12 px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                  />
                  
                  <div className="mt-3 space-y-2">
                    <p className="text-xs sm:text-sm text-slate-400 font-medium">Password must contain:</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div className={`flex items-center gap-2 text-xs sm:text-sm ${passwordRequirements.minLength ? 'text-green-400' : 'text-slate-500'}`}>
                        {passwordRequirements.minLength ? (
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0"></div>
                        )}
                        <span>At least 8 characters</span>
                      </div>
                      <div className={`flex items-center gap-2 text-xs sm:text-sm ${passwordRequirements.hasUppercase ? 'text-green-400' : 'text-slate-500'}`}>
                        {passwordRequirements.hasUppercase ? (
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0"></div>
                        )}
                        <span>1 uppercase letter</span>
                      </div>
                      <div className={`flex items-center gap-2 text-xs sm:text-sm ${passwordRequirements.hasLowercase ? 'text-green-400' : 'text-slate-500'}`}>
                        {passwordRequirements.hasLowercase ? (
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0"></div>
                        )}
                        <span>1 lowercase letter</span>
                      </div>
                      <div className={`flex items-center gap-2 text-xs sm:text-sm ${passwordRequirements.hasNumber ? 'text-green-400' : 'text-slate-500'}`}>
                        {passwordRequirements.hasNumber ? (
                          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <div className="w-3.5 h-3.5 rounded-full border border-slate-600 flex-shrink-0"></div>
                        )}
                        <span>1 number</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                    Confirm Password
                  </label>
                  <PasswordInput
                    id="confirmPassword"
                    name="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="h-12 px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                  />
                  {confirmPassword && (
                    <div className={`mt-2 text-xs ${password === confirmPassword ? 'text-green-400' : 'text-red-400'}`}>
                      {password === confirmPassword ? '✓ Passwords match' : 'Passwords do not match'}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Step 2: Business Information */}
            {!isSignIn && signupStep === 2 && (
              <>
                <div>
                  <label htmlFor="businessName" className="block text-sm font-medium text-slate-300 mb-2">
                    Business Name
                  </label>
                  <input
                    id="businessName"
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    required
                    autoComplete="organization"
                    name="businessName"
                    className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                    placeholder="Your Business Name"
                  />
                </div>

                <div>
                  <label htmlFor="businessPhone" className="block text-sm font-medium text-slate-300 mb-2">
                    Business Phone Number
                  </label>
                  <input
                    id="businessPhone"
                    type="tel"
                    value={businessPhone}
                    onChange={(e) => setBusinessPhone(e.target.value)}
                    required
                    autoComplete="tel"
                    name="businessPhone"
                    className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                    placeholder="(555) 123-4567"
                  />
                  <p className="text-xs text-slate-500 mt-2">This is the number you want ReplyFlow to text back when calls are missed</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Where do you provide your services?
                  </label>
                  <p className="text-xs text-slate-500 mb-3">
                    ReplyFlow uses this to tailor the questions AI Voice asks callers.
                  </p>
                  <div className="grid grid-cols-1 gap-2">
                    {[
                      { value: 'onsite', title: 'On-site service', desc: 'You travel to the customer or job location.' },
                      { value: 'customer_comes_to_business', title: 'Customers come to me', desc: 'Customers visit your business location.' },
                      { value: 'remote', title: 'Remote only', desc: 'Your services are provided remotely.' }
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setServiceLocationType(opt.value as any)}
                        className={`text-left p-3 rounded-xl border transition w-full ${
                          (serviceLocationType || '') === opt.value
                            ? 'border-blue-500 bg-blue-50/5'
                            : 'border-slate-600/80 hover:border-slate-500/80'
                        }`}
                      >
                        <div className="text-sm font-medium text-slate-100">{opt.title}</div>
                        <div className="text-xs text-slate-400 mt-0.5">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-700/50 pt-4 mt-4">
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Business Address
                  </label>
                  <p className="text-xs text-slate-500 mb-3">
                    This helps configure payments and your business profile.
                  </p>

                  <div className="space-y-3">
                    <div>
                      <label htmlFor="addressLine1" className="block text-xs font-medium text-slate-400 mb-1">
                        Street Address <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="addressLine1"
                        type="text"
                        value={addressLine1}
                        onChange={(e) => setAddressLine1(e.target.value)}
                        required
                        autoComplete="street-address"
                        name="addressLine1"
                        className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                        placeholder="123 Main Street"
                      />
                    </div>

                    <div>
                      <label htmlFor="addressLine2" className="block text-xs font-medium text-slate-400 mb-1">
                        Suite, Unit, etc. <span className="text-slate-500">(optional)</span>
                      </label>
                      <input
                        id="addressLine2"
                        type="text"
                        value={addressLine2}
                        onChange={(e) => setAddressLine2(e.target.value)}
                        autoComplete="address-line2"
                        name="addressLine2"
                        className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                        placeholder="Apt 4B"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="addressCity" className="block text-xs font-medium text-slate-400 mb-1">
                          City <span className="text-red-400">*</span>
                        </label>
                        <input
                          id="addressCity"
                          type="text"
                          value={addressCity}
                          onChange={(e) => setAddressCity(e.target.value)}
                          required
                          autoComplete="address-level2"
                          name="addressCity"
                          className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                          placeholder="San Francisco"
                        />
                      </div>

                      <div>
                        <label htmlFor="addressState" className="block text-xs font-medium text-slate-400 mb-1">
                          State <span className="text-red-400">*</span>
                        </label>
                        <input
                          id="addressState"
                          type="text"
                          value={addressState}
                          onChange={(e) => setAddressState(e.target.value.toUpperCase())}
                          required
                          maxLength={2}
                          autoComplete="address-level1"
                          name="addressState"
                          className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                          placeholder="CA"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="addressPostalCode" className="block text-xs font-medium text-slate-400 mb-1">
                        ZIP Code <span className="text-red-400">*</span>
                      </label>
                      <input
                        id="addressPostalCode"
                        type="text"
                        value={addressPostalCode}
                        onChange={(e) => setAddressPostalCode(e.target.value)}
                        required
                        autoComplete="postal-code"
                        name="addressPostalCode"
                        className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                        placeholder="94102"
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleBackToStep1}
                  className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
                >
                  ← Back to account details
                </button>
              </>
            )}

            {/* Sign-in fields */}
            {isSignIn && (
              <>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    ref={emailRef}
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setErrorDisplay(null)
                    }}
                    required
                    autoComplete="email"
                    name="email"
                    className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                    placeholder="you@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                    Password
                  </label>
                  <PasswordInput
                    id="password"
                    name="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setErrorDisplay(null)
                    }}
                    required
                    autoComplete="current-password"
                    className="h-12 px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                  />
                </div>
              </>
            )}

            {isSignIn && (
              <div className="text-right">
                <Link
                  href="/forgot-password"
                  className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || isSubmitting || redirecting || accountCreatedRef.current}
              className="w-full h-12 bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all hover:-translate-y-[1px] font-semibold flex items-center justify-center gap-2"
            >
              {redirecting ? (
                <>
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                  <span>Redirecting to dashboard...</span>
                </>
              ) : loading || isSubmitting ? (
                isSignIn ? 'Signing In...' : (signupStep === 1 ? 'Continuing...' : 'Creating Account...')
              ) : (
                isSignIn ? 'Sign In' : (signupStep === 1 ? 'Continue' : 'Continue to Free Trial')
              )}
            </button>
          </form>

          {/* Trust / Reassurance Bullets */}
          <div className="mt-5 sm:mt-6 pt-4 sm:pt-6 border-t border-slate-700/50">
            <div className="space-y-2 sm:space-y-2.5">
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>14-day free trial</span>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>No contracts</span>
              </div>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-slate-400">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Keep your existing business number</span>
              </div>
            </div>
            
            {/* Trust Microcopy */}
            <p className="mt-4 text-center text-[11px] sm:text-xs text-slate-500/70">
              Built for service businesses that never want to miss another lead.
            </p>
          </div>

          <p className="mt-5 sm:mt-6 text-center text-sm text-slate-400">
            {isSignIn ? "New to ReplyFlow? " : "Already have an account? "}
            <button
              onClick={toggleMode}
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              {isSignIn ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
      <RoutingDebugBanner />
      <AuthFooter />
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-lg shadow-lg p-6 sm:p-8">
          <p className="text-slate-100">Loading...</p>
        </div>
      </div>
      <AuthFooter />
    </div>}>
      <AuthContent />
    </Suspense>
  )
}
