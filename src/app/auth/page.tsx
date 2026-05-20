'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import SetupError from '@/components/SetupError'
import Footer from '@/components/Footer'
import PasswordInput from '@/components/PasswordInput'
import BrandIcon from '@/components/BrandIcon'

// Footer with theme support for auth pages
function AuthFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-slate-900 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <p className="text-slate-600/70 dark:text-slate-400/70 text-xs sm:text-sm">
            © {currentYear} ReplyFlowHQ. All rights reserved.
          </p>
          <div className="flex items-center gap-4 sm:gap-6 mt-4 md:mt-0">
            <a
              href="/privacy"
              className="text-slate-500/60 dark:text-slate-400/60 hover:text-slate-700/80 dark:hover:text-slate-300/80 text-xs sm:text-sm transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              className="text-slate-500/60 dark:text-slate-400/60 hover:text-slate-700/80 dark:hover:text-slate-300/80 text-xs sm:text-sm transition-colors"
            >
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

const supabase = createBrowserClient()

// Helper function to ensure business row exists after auth/signup
// This is called after successful signin/signup to ensure business exists before Stripe checkout
async function ensureBusinessExists() {
  try {
    console.log('[Auth] Checking if business exists...')
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      console.log('[Auth] No user found, skipping business creation')
      return
    }

    // Check if business already exists
    const { data: existingBusiness } = await supabase
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingBusiness) {
      console.log('[Auth] Business already exists:', existingBusiness.id)
      return
    }

    console.log('[Auth] Business not found, creating business row...')
    
    // Call the get-or-create API to ensure business exists
    const response = await fetch('/api/business/get-or-create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    })

    if (response.ok) {
      const data = await response.json()
      console.log('[Auth] Business created successfully:', data.business?.id)
    } else {
      console.error('[Auth] Failed to create business:', await response.text())
    }
  } catch (error) {
    console.error('[Auth] Error ensuring business exists:', error)
    // Don't throw - this is non-blocking and the server-side API will handle it
  }
}

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams?.get('mode') || 'signup'
  const emailParam = searchParams?.get('email')
  const redirectParam = searchParams?.get('redirect') || '/dashboard'
  
  console.log('[SIGNIN PAGE] ===== RENDER =====', {
    pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
    search: searchParams?.toString(),
    mode,
    emailParam,
    redirectParam,
    fullUrl: typeof window !== 'undefined' ? window.location.href : 'unknown'
  })
  
  const [isSignIn, setIsSignIn] = useState(mode === 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [existingAccount, setExistingAccount] = useState(false)
  const [debugError, setDebugError] = useState<any>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const passwordRef = React.useRef<HTMLInputElement>(null)
  const emailRef = React.useRef<HTMLInputElement>(null)
  const isSubmittingRef = React.useRef(false)
  const [redirecting, setRedirecting] = useState(false)

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
      setExistingAccount(false)
      setDebugError(null)
    }
  }, [mode])

  
  // Show setup error if env vars are missing
  if (!supabase) {
    return <SetupError />
  }

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      console.log('[AUTH CREATE CALLED]', {
        source: 'handleSignIn',
        trigger: 'submit',
        email,
      })
      console.log('[Auth] Starting sign in process')
      console.log('[Auth] Email:', email)
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      console.log('[Auth] Sign in API call completed')
      console.log('[Auth] Full response:', JSON.stringify(data, null, 2))
      console.log('[Auth] User exists:', !!data.user)
      console.log('[Auth] User ID:', data.user?.id)
      console.log('[Auth] Session exists:', !!data.session)
      console.log('[Auth] Session user ID:', data.session?.user?.id)
      console.log('[Auth] Session access token exists:', !!data.session?.access_token)
      console.log('[Auth] Error:', error)

      if (error) throw error

      console.log('[Auth] Sign in successful, session exists:', !!data.session)
      console.log('[Auth] User ID:', data.user?.id)
      
      // Listen for SIGNED_IN event
      console.log('[Auth] Setting up SIGNED_IN event listener')
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
        console.log('[Auth] Auth state change:', event)
        console.log('[Auth] Session after event:', !!session)
        if (event === 'SIGNED_IN' && session) {
          console.log('[Auth] SIGNED_IN event received with session')
          console.log('[Auth] User ID:', session.user?.id)
        }
      })

      // Wait for session to be persisted to localStorage (mobile delay)
      console.log('[Auth] Waiting for session persistence...')
      await new Promise(resolve => setTimeout(resolve, 500))

      // Verify session is actually persisted
      const { data: { session: persistedSession }, error: sessionError } = await supabase.auth.getSession()
      console.log('[Auth] Session persistence check:', {
        sessionExists: !!persistedSession,
        userId: persistedSession?.user?.id,
        accessTokenExists: !!persistedSession?.access_token,
        sessionError: sessionError?.message
      })

      if (!persistedSession) {
        console.error('[Auth] Session not persisted after sign in')
        setError('Sign in successful but session not saved. Please try again.')
        subscription.unsubscribe()
        return
      }

      // Check for auth-related localStorage keys
      const localStorageKeys: string[] = []
      if (typeof window !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.includes('supabase') || key.includes('auth') || key.includes('sb-'))) {
            localStorageKeys.push(key)
          }
        }
      }
      console.log('[Auth] Auth-related localStorage keys:', localStorageKeys)

      subscription.unsubscribe()
      
      // Show redirecting state
      setRedirecting(true)
      setLoading(false)
      
      console.log('[Auth] Session persisted successfully, redirecting to:', redirectParam)
      
      // Ensure business row exists after successful signin (fire-and-forget, non-blocking)
      // This ensures business exists before user tries to start trial
      ensureBusinessExists().catch(err => {
        console.error('[Auth] Business creation check failed (non-blocking):', err)
      })
      
      await new Promise(resolve => setTimeout(resolve, 800))
      router.push(redirectParam)
    } catch (err: any) {
      setError(err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()

    console.log('[SIGNUP] submit clicked')
    console.log('[SIGNUP] isSubmitting:', isSubmitting)
    console.log('[SIGNUP] isSubmittingRef.current:', isSubmittingRef.current)
    console.trace('[SIGNUP] submit invoked from')

    // IMPORTANT: For MVP/testing mode, email confirmation should be disabled in Supabase
    // Supabase Dashboard → Authentication → Providers → Email → Confirm email = OFF
    // This allows signup to immediately create a session without requiring email confirmation
    // If email confirmation is enabled, users will see: "Please check your email to confirm your account before continuing."

    // Hard submit lock - prevent double-submit
    if (isSubmitting || isSubmittingRef.current) {
      console.log('[SIGNUP] Submit already in progress, blocking duplicate submit')
      return
    }
    setIsSubmitting(true)
    isSubmittingRef.current = true
    setLoading(true)
    setError('')
    setExistingAccount(false)

    try {
      console.log('[SIGNUP] signUp starting')
      console.log('[AUTH CREATE CALLED]', {
        source: 'handleSignUp',
        trigger: 'submit',
        email,
      })
      console.log('[Auth] Starting sign up process')
      console.log('[Auth] Email:', email)
      
      // Step 1: Attempt sign up
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        }
      })

      console.log('[Auth] Sign up API call completed')
      console.log('[SIGNUP LOG] signUp error:', error?.message || 'none')
      console.log('[SIGNUP LOG] signUp user exists:', !!data.user)
      console.log('[SIGNUP LOG] signUp session exists:', !!data.session)
      console.log('[SIGNUP RESULT]', {
        hasUser: !!data.user,
        hasSession: !!data.session,
        emailConfirmed: !!data.user?.email_confirmed_at,
      })
      console.log('[Auth] Full response:', JSON.stringify(data, null, 2))
      console.log('[Auth] User created:', !!data.user)
      console.log('[Auth] User ID:', data.user?.id)
      console.log('[Auth] User email:', data.user?.email)
      console.log('[Auth] User email_confirmed_at:', data.user?.email_confirmed_at)
      console.log('[Auth] User confirmation_sent_at:', data.user?.confirmation_sent_at)
      console.log('[Auth] User identities length:', data.user?.identities?.length)
      console.log('[Auth] Session created:', !!data.session)
      console.log('[Auth] Session user ID:', data.session?.user?.id)
      console.log('[Auth] Session access token exists:', !!data.session?.access_token)
      console.log('[Auth] Error:', error)

      if (error) {
        console.log('[SIGNUP] signUp error:', error)
        console.error('[Auth] Sign up API returned error:', error.message)
        console.error('[Auth] Error status:', error.status)
        console.error('[Auth] Error code/name:', error.name || error.code || 'unknown')
        
        const errorMessage = error.message || 'Failed to sign up'
        const errorCode = error.name || error.code || ''
        
        // Only show "account already exists" for specific duplicate auth errors
        const isDuplicateError = 
          errorCode === 'UserAlreadyExists' ||
          errorCode === 'DuplicateUser' ||
          errorMessage.toLowerCase().includes('user already registered') ||
          errorMessage.toLowerCase().includes('already exists') ||
          errorMessage.toLowerCase().includes('duplicate email')
        
        if (isDuplicateError) {
          console.log('[Auth] Duplicate auth error detected')
          setExistingAccount(true)
          setError('Account already exists. Please sign in.')
        } else {
          console.log('[Auth] Non-duplicate auth error, showing real message')
          setError(errorMessage)
        }
        
        // Store debug info for display
        setDebugError({
          message: errorMessage,
          status: error.status,
          code: errorCode,
          hasUser: !!data.user,
          hasSession: !!data.session,
        })
        
        setLoading(false)
        setIsSubmitting(false)
        isSubmittingRef.current = false
        return
      }

      console.log('[SIGNUP] signUp completed successfully')
      // Success path 1: Email confirmation is required (user exists but no session)
      if (data.user && !data.session) {
        console.log('[Auth] Email confirmation required - user created but no session')
        console.log('[Auth] User email_confirmed_at:', data.user?.email_confirmed_at)
        
        // Explicit handling for unconfirmed users - do NOT continue without session
        if (!data.user?.email_confirmed_at) {
          console.log('[Auth] Email not confirmed, showing confirmation message')
          setError('Please check your email to confirm your account before continuing.')
          setIsSignIn(true)
          setDebugError({
            message: 'Email confirmation required',
            status: '200',
            code: 'EmailNotConfirmed',
            hasUser: true,
            hasSession: false,
          })
          setLoading(false)
          isSubmittingRef.current = false
          return
        }
        
        console.log('[Auth] This indicates email confirmation is enabled in Supabase')
        console.log('[Auth] Attempting auto sign-in to bypass email confirmation for MVP')
        
        // Auto sign-in to bypass email confirmation for MVP
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        console.log('[SIGNUP LOG] signInWithPassword error:', signInError?.message || 'none')
        console.log('[Auth] Auto sign-in result:', {
          success: !signInError,
          sessionExists: !!signInData.session,
          userId: signInData.session?.user?.id,
          error: signInError?.message
        })

        if (signInError || !signInData.session) {
          console.error('[Auth] Auto sign-in failed')
          const signInErrorMessage = signInError?.message || 'Unknown error'
          console.error('[Auth] Auto sign-in error:', signInErrorMessage)
          
          // Only redirect to sign-in if error clearly indicates email confirmation is required
          if (signInErrorMessage.toLowerCase().includes('email not confirmed') ||
              signInErrorMessage.toLowerCase().includes('confirm your email') ||
              signInErrorMessage.toLowerCase().includes('email confirmation')) {
            console.log('[Auth] Email confirmation required, redirecting to sign-in')
            setError('Account created! Please check your email to confirm, then sign in.')
            setIsSignIn(true)
            setDebugError({
              message: signInErrorMessage,
              status: signInError?.status,
              code: signInError?.name || signInError?.code || 'EmailConfirmationRequired',
              hasUser: true,
              hasSession: false,
            })
            setLoading(false)
            isSubmittingRef.current = false
            router.push(`/auth/signin?email=${encodeURIComponent(email)}`)
            return
          }
          
          // For any other error, show the error but don't redirect
          setError(`Account created but could not establish session: ${signInErrorMessage}. Please try signing in.`)
          setIsSignIn(true)
          setDebugError({
            message: signInErrorMessage,
            status: signInError?.status,
            code: signInError?.name || signInError?.code || 'SessionCreationFailed',
            hasUser: true,
            hasSession: false,
          })
          setLoading(false)
          isSubmittingRef.current = false
          return
        }

        console.log('[Auth] Auto sign-in succeeded, using this session')
        // Continue with the signInData.session
      }

      // Success path 3: Verify session exists before proceeding
      console.log('[Auth] Verifying session exists before redirect...')
      const { data: { session: verifiedSession } } = await supabase.auth.getSession()
      console.log('[SIGNUP LOG] final getSession session exists:', !!verifiedSession)
      console.log('[Auth] Verified session exists:', !!verifiedSession)
      console.log('[Auth] Verified session user ID:', verifiedSession?.user?.id)
      
      if (!verifiedSession) {
        console.error('[Auth] No session after signup and auto sign-in attempt')
        setError('Account created but session could not be established. Please sign in.')
        setIsSignIn(true)
        setLoading(false)
        isSubmittingRef.current = false
        return
      }

      console.log('[Auth] Session established, redirecting to dashboard')
      console.log('[SIGNUP LOG] final redirect target: /dashboard')
      console.log('[REDIRECT]', {
        from: window.location.pathname,
        to: '/dashboard',
        reason: 'Signup successful with verified session',
        hasSession: true,
        component: 'Auth',
        userId: verifiedSession?.user?.id,
        email: verifiedSession?.user?.email,
        emailConfirmed: !!verifiedSession?.user?.email_confirmed_at
      })
      
      // Log final session state for debugging
      console.log('[SIGNUP FINAL SESSION STATE]', {
        sessionExists: !!verifiedSession,
        userId: verifiedSession?.user?.id,
        email: verifiedSession?.user?.email,
        accessTokenExists: !!verifiedSession?.access_token,
        refreshTokenExists: !!verifiedSession?.refresh_token,
        expiresAt: verifiedSession?.expires_at,
        emailConfirmedAt: verifiedSession?.user?.email_confirmed_at
      })
      
      // Log localStorage state
      const localStorageKeys: string[] = []
      if (typeof window !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && (key.includes('supabase') || key.includes('auth') || key.includes('sb-'))) {
            localStorageKeys.push(key)
          }
        }
      }
      console.log('[SIGNUP AUTH STORAGE] localStorage keys:', localStorageKeys)
      
      setLoading(false)
      isSubmittingRef.current = false
      
      // Show redirecting state
      setRedirecting(true)
      
      // Ensure business row exists after successful signup (fire-and-forget, non-blocking)
      // This ensures business exists before user tries to start trial
      ensureBusinessExists().catch(err => {
        console.error('[Auth] Business creation check failed (non-blocking):', err)
      })
      
      await new Promise(resolve => setTimeout(resolve, 800))
      router.replace('/dashboard')
    } catch (err: any) {
      console.error('[Auth] Unexpected sign up error:', err)
      console.log('[SIGNUP] signUp error in catch block:', err)
      setError(err.message || 'Failed to sign up')
    } finally {
      // Only set loading false if not already set in success/error paths
      if (loading) {
        setLoading(false)
      }
      setIsSubmitting(false)
      isSubmittingRef.current = false
      console.log('[SIGNUP] submit lock released')
    }
  }

  const toggleMode = () => {
    const newMode = isSignIn ? 'signup' : 'signin'
    router.push(`/auth?mode=${newMode}`)
  }

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 sm:py-8">
        {/* Back to Homepage Link */}
        <div className="w-full max-w-md sm:max-w-[480px] mb-4">
          <Link 
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-300 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Homepage
          </Link>
        </div>
        
        <div className="w-full max-w-md sm:max-w-[480px] bg-gradient-to-b from-slate-900 to-slate-900/95 dark:from-slate-900 dark:to-slate-900/95 border border-slate-700/50 dark:border-slate-700/50 rounded-2xl shadow-xl shadow-blue-900/5 p-5 sm:p-6 md:p-8 backdrop-blur-sm">
          <div className="text-center mb-5 sm:mb-6">
            <div className="inline-flex items-center justify-center mb-3 sm:mb-4">
              <BrandIcon size={64} />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 dark:text-slate-100 mb-2">
              {isSignIn ? 'Sign In' : 'Sign Up'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 dark:text-slate-400">
              Automatically text back missed calls.
            </p>
          </div>
          
          {isSignIn && emailParam && (
            <p className="text-sm text-slate-400 dark:text-slate-400 mb-4 sm:mb-6">Welcome back — please sign in</p>
          )}
          
          {!isSignIn && (
            <p className="text-sm text-slate-400 dark:text-slate-400 mb-4 sm:mb-6">Create your account to get started</p>
          )}
          
          {error && (
            <div className="bg-red-900/20 dark:bg-red-900/20 border border-red-800 dark:border-red-800 rounded-2xl p-4 mb-6">
              <p className="text-sm text-red-300 dark:text-red-300 mb-2">{error}</p>
              {debugError && (
                <div className="text-xs text-red-400/70 dark:text-red-400/70 font-mono bg-red-950/30 dark:bg-red-950/30 rounded p-2">
                  <div>Debug: {debugError.message}</div>
                  <div>Status: {debugError.status}</div>
                  <div>Code: {debugError.code}</div>
                  <div>HasUser: {debugError.hasUser ? 'YES' : 'NO'}</div>
                  <div>HasSession: {debugError.hasSession ? 'YES' : 'NO'}</div>
                </div>
              )}
              {existingAccount && !isSignIn && (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setError('')
                      setExistingAccount(false)
                      router.push(`/auth?mode=signin&email=${encodeURIComponent(email)}`)
                    }}
                    className="w-full h-12 bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm hover:shadow-md transition-all hover:-translate-y-[1px] font-semibold"
                  >
                    Sign In
                  </button>
                  <button
                    onClick={() => {
                      setExistingAccount(false)
                      setError('')
                    }}
                    className="w-full text-sm text-slate-400 dark:text-slate-400 hover:text-slate-300 dark:hover:text-slate-300 underline"
                  >
                    Use a different email
                  </button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={isSignIn ? handleSignIn : handleSignUp} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
                Email
              </label>
              <input
                id="email"
                ref={emailRef}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                name="email"
                className="w-full px-4 py-3 border border-slate-600/80 dark:border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 dark:bg-slate-800/50 text-slate-100 dark:text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-300 dark:text-slate-300 mb-2">
                Password
              </label>
              <PasswordInput
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={isSignIn ? "current-password" : "new-password"}
                className="w-full px-4 py-3 border border-slate-600/80 dark:border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 dark:bg-slate-800/50 text-slate-100 dark:text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
              />
            </div>

            <button
              type="submit"
              disabled={loading || isSubmitting || redirecting}
              className="w-full h-12 bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all hover:-translate-y-[1px] font-semibold"
            >
              {redirecting ? (
                <>
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent inline-block mr-2"></div>
                  Redirecting to dashboard...
                </>
              ) : loading || isSubmitting ? (isSignIn ? 'Signing In...' : 'Creating Account...') : (isSignIn ? 'Sign In' : 'Sign Up')}
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

          <p className="mt-5 sm:mt-6 text-center text-sm text-slate-400 dark:text-slate-400">
            {isSignIn ? "New to ReplyFlow? " : "Already have an account? "}
            <button
              onClick={toggleMode}
              className="text-blue-400 dark:text-blue-400 hover:text-blue-300 dark:hover:text-blue-300 font-medium"
            >
              {isSignIn ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
      <AuthFooter />
    </div>
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-950 dark:bg-slate-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-slate-900 dark:bg-slate-900 border border-slate-700 dark:border-slate-700 rounded-lg shadow-lg p-6 sm:p-8">
          <p className="text-slate-100 dark:text-slate-100">Loading...</p>
        </div>
      </div>
      <AuthFooter />
    </div>}>
      <AuthContent />
    </Suspense>
  )
}
