'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import Footer from '@/components/Footer'
import BrandIcon from '@/components/BrandIcon'
import PasswordInput from '@/components/PasswordInput'
import { isCapacitorNative } from '@/capacitor/init'

const supabase = createBrowserClient()

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null)
  const [hasValidRecoverySession, setHasValidRecoverySession] = useState(false)
  const router = useRouter()

  // Check for valid reset session on mount and listen for auth state changes
  useEffect(() => {
    let mounted = true
    let timeoutId: NodeJS.Timeout

    const checkSession = async () => {
      try {
        // First check current session
        const { data, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError) {
          if (mounted) {
            console.error('Session check error:', sessionError)
            setIsValidSession(false)
          }
          return
        }

        // Check if this is a password recovery session from hash
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const accessToken = hashParams.get('access_token')
        const refreshToken = hashParams.get('refresh_token')
        const type = hashParams.get('type')

        if (type === 'recovery' && accessToken) {
          // This is a recovery link, set up the session
          const { error: setError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          })

          if (setError) {
            if (mounted) {
              console.error('Session setup error:', setError)
              setIsValidSession(false)
            }
            return
          }

          if (mounted) {
            setIsValidSession(true)
            setHasValidRecoverySession(true) // Lock the session once valid
          }
        } else if (data.session) {
          // User is already signed in, allow password reset
          if (mounted) {
            setIsValidSession(true)
            setHasValidRecoverySession(true) // Lock the session once valid
          }
        } else {
          // No valid session found
          if (mounted && !hasValidRecoverySession) {
            // Only set invalid if we haven't already locked a valid session
            setIsValidSession(false)
          }
        }
      } catch (err) {
        if (mounted) {
          console.error('Session check error:', err)
          setIsValidSession(false)
        }
      }
    }

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: any, session: any) => {
      if (!mounted) return

      // If we already have a valid recovery session, don't flip back to invalid
      if (hasValidRecoverySession) {
        return
      }

      if (event === 'PASSWORD_RECOVERY') {
        // Password recovery event
        setIsValidSession(true)
        setHasValidRecoverySession(true) // Lock the session once valid
      } else if (event === 'SIGNED_IN' && session) {
        // User signed in, check if this is from a recovery link
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const type = hashParams.get('type')
        
        if (type === 'recovery') {
          setIsValidSession(true)
          setHasValidRecoverySession(true) // Lock the session once valid
        }
      } else if (event === 'SIGNED_OUT') {
        // Only allow sign out to flip to invalid if we haven't locked a recovery session
        if (!hasValidRecoverySession) {
          setIsValidSession(false)
        }
      }
    })

    // Initial check
    checkSession()

    // Set a timeout to prevent infinite loading
    timeoutId = setTimeout(() => {
      if (mounted && isValidSession === null && !hasValidRecoverySession) {
        // Only set invalid if we haven't already locked a valid session
        setIsValidSession(false)
      }
    }, 5000)

    return () => {
      mounted = false
      subscription.unsubscribe()
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [])

  const validatePassword = (pwd: string): string | null => {
    if (!pwd) return 'Password is required'
    if (pwd.length < 8) return 'Password must be at least 8 characters long'
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Validate passwords
    const passwordError = validatePassword(password)
    if (passwordError) {
      setError(passwordError)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      // Get current session before attempting to update password
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      console.log('handleSubmit - hasSession:', !!session)
      
      if (sessionError) {
        console.error('Session check error:', sessionError)
        setError('Unable to verify your session. Please try again.')
        return
      }

      if (!session) {
        console.log('handleSubmit - no session found')
        setError('Your reset session expired. Please request a new reset link.')
        return
      }

      // Update the user's password
      const { data: updateData, error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      console.log('handleSubmit - updateUser success:', !updateError)
      
      if (updateError) {
        console.error('Password update error:', updateError)
        
        // Show appropriate error message based on the actual error
        let errorMessage = 'Unable to update password. Please try again.'
        
        if (updateError.message.includes('weak')) {
          errorMessage = 'Password is too weak. Please choose a stronger password.'
        } else if (updateError.message.includes('same') || updateError.message.includes('old')) {
          errorMessage = 'New password must be different from your current password.'
        } else if (updateError.message.includes('length')) {
          errorMessage = 'Password must be at least 8 characters long.'
        } else if (updateError.message.includes('Invalid session')) {
          errorMessage = 'Your reset session expired. Please request a new reset link.'
        }
        
        setError(errorMessage)
        return
      }

      console.log('handleSubmit - password updated successfully')
      
      // Success - show success message and redirect
      setSuccess(true)
      
      // Optionally sign out user after password update
      setTimeout(async () => {
        try {
          await supabase.auth.signOut()
        } catch (signOutError) {
          console.error('Sign out error:', signOutError)
        }
        
        // Redirect to login after 1-2 seconds
        setTimeout(() => {
          router.push('/auth?mode=signin')
        }, 1000)
      }, 1500)
      
    } catch (err) {
      console.error('Password reset unexpected error:', err)
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Loading state while checking session
  if (isValidSession === null) {
    return (
      <div className="min-h-screen bg-slate-900 dark:bg-slate-900 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="w-8 h-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mx-auto mb-4"></div>
            <p className="text-slate-400">Validating reset link...</p>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  // Invalid session state
  if (!isValidSession && !hasValidRecoverySession) {
    return (
      <div className="min-h-screen bg-slate-900 dark:bg-slate-900 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8 text-center">
            <div>
              {!isCapacitorNative() ? (
                <Link href="/" className="inline-flex items-center gap-2 justify-center mb-8">
                  <BrandIcon size={32} />
                  <span className="text-2xl font-bold text-white">
                    <span className="text-white">ReplyFlow</span>
                    <span className="text-blue-400">HQ</span>
                  </span>
                </Link>
              ) : (
                <div className="inline-flex items-center gap-2 justify-center mb-8">
                  <BrandIcon size={32} />
                  <span className="text-2xl font-bold text-white">
                    <span className="text-white">ReplyFlow</span>
                    <span className="text-blue-400">HQ</span>
                  </span>
                </div>
              )}
              
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-2">
                Invalid reset link
              </h2>
              <p className="text-slate-400 mb-8">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
            </div>

            <div className="space-y-3">
              <Link
                href="/forgot-password"
                className="block w-full h-12 bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-md hover:shadow-lg transition-all hover:-translate-y-[1px] font-semibold text-center"
              >
                Request new reset link
              </Link>
              
              <Link
                href="/auth?mode=signin"
                className="block w-full h-12 bg-slate-700 text-white py-2 px-4 rounded-xl hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500/30 shadow-md hover:shadow-lg transition-all hover:-translate-y-[1px] font-semibold text-center"
              >
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-slate-900 dark:bg-slate-900 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8 text-center">
            <div>
              {!isCapacitorNative() ? (
                <Link href="/" className="inline-flex items-center gap-2 justify-center mb-8">
                  <BrandIcon size={32} />
                  <span className="text-2xl font-bold text-white">
                    <span className="text-white">ReplyFlow</span>
                    <span className="text-blue-400">HQ</span>
                  </span>
                </Link>
              ) : (
                <div className="inline-flex items-center gap-2 justify-center mb-8">
                  <BrandIcon size={32} />
                  <span className="text-2xl font-bold text-white">
                    <span className="text-white">ReplyFlow</span>
                    <span className="text-blue-400">HQ</span>
                  </span>
                </div>
              )}
              
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-2">
                Your password has been updated
              </h2>
              <p className="text-slate-400 mb-8">
                Redirecting you to sign in with your new password...
              </p>
            </div>

            <Link
              href="/auth?mode=signin"
              className="block w-full h-12 bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-md hover:shadow-lg transition-all hover:-translate-y-[1px] font-semibold text-center"
            >
              Sign in with new password
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    )
  }

  // Main reset form - show if session is valid OR we have a locked recovery session
  if (isValidSession || hasValidRecoverySession) {
    return (
      <div className="min-h-screen bg-slate-900 dark:bg-slate-900 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8">
            {/* Header */}
            <div className="text-center">
              {!isCapacitorNative() ? (
                <Link href="/" className="inline-flex items-center gap-2 justify-center mb-8">
                  <BrandIcon size={32} />
                  <span className="text-2xl font-bold text-white">
                    <span className="text-white">ReplyFlow</span>
                    <span className="text-blue-400">HQ</span>
                  </span>
                </Link>
              ) : (
                <div className="inline-flex items-center gap-2 justify-center mb-8">
                  <BrandIcon size={32} />
                  <span className="text-2xl font-bold text-white">
                    <span className="text-white">ReplyFlow</span>
                    <span className="text-blue-400">HQ</span>
                  </span>
                </div>
              )}
              
              <h2 className="text-3xl font-bold text-white">
                Set new password
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                Enter your new password below.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                  New password
                </label>
                <PasswordInput
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                  placeholder="Enter your new password"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Must be at least 8 characters long
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-300 mb-2">
                  Confirm new password
                </label>
                <PasswordInput
                  id="confirmPassword"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                  placeholder="Confirm your new password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all hover:-translate-y-[1px] font-semibold"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent inline-block mr-2"></div>
                    Updating password...
                  </>
                ) : (
                  'Update password'
                )}
              </button>
            </form>

            {/* Back link */}
            <div className="text-center">
              <Link
                href="/auth?mode=signin"
                className="text-sm text-slate-400 hover:text-slate-300 transition-colors"
              >
                ← Back to sign in
              </Link>
            </div>
          </div>
        </div>

        {/* Footer */}
        <Footer />
      </div>
    )
  }

  // Fallback - should not reach here, but just in case
  return (
    <div className="min-h-screen bg-slate-900 dark:bg-slate-900 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="w-8 h-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-400">Loading...</p>
        </div>
      </div>
      <Footer />
    </div>
  )
}
