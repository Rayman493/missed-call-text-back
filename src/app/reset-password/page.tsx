'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import Footer from '@/components/Footer'
import BrandIcon from '@/components/BrandIcon'
import PasswordInput from '@/components/PasswordInput'

const supabase = createBrowserClient()

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [isValidSession, setIsValidSession] = useState<boolean | null>(null)
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
          }
        } else if (data.session) {
          // User is already signed in, allow password reset
          if (mounted) {
            setIsValidSession(true)
          }
        } else {
          // No valid session found
          if (mounted) {
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

      if (event === 'PASSWORD_RECOVERY') {
        // Password recovery event
        setIsValidSession(true)
      } else if (event === 'SIGNED_IN' && session) {
        // User signed in, check if this is from a recovery link
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const type = hashParams.get('type')
        
        if (type === 'recovery') {
          setIsValidSession(true)
        }
      } else if (event === 'SIGNED_OUT') {
        setIsValidSession(false)
      }
    })

    // Initial check
    checkSession()

    // Set a timeout to prevent infinite loading
    timeoutId = setTimeout(() => {
      if (mounted && isValidSession === null) {
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
      // Extract tokens from URL hash
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (!accessToken) {
        setError('Invalid or expired reset link')
        return
      }

      // Set the session using the tokens from the reset link
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken || '',
      })

      if (sessionError) {
        console.error('Session setup error:', sessionError)
        setError('Invalid or expired reset link')
        return
      }

      // Update the user's password
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      })

      if (updateError) {
        console.error('Password update error:', updateError)
        setError('Failed to update password. Please try again.')
        return
      }

      setSuccess(true)
    } catch (err) {
      console.error('Password reset error:', err)
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
  if (!isValidSession) {
    return (
      <div className="min-h-screen bg-slate-900 dark:bg-slate-900 flex flex-col">
        <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
          <div className="max-w-md w-full space-y-8 text-center">
            <div>
              <Link href="/" className="inline-flex items-center gap-2 justify-center mb-8">
                <BrandIcon size={32} />
                <span className="text-2xl font-bold text-white">
                  <span className="text-white">ReplyFlow</span>
                  <span className="text-blue-400">HQ</span>
                </span>
              </Link>
              
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
                href="/auth"
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
              <Link href="/" className="inline-flex items-center gap-2 justify-center mb-8">
                <BrandIcon size={32} />
                <span className="text-2xl font-bold text-white">
                  <span className="text-white">ReplyFlow</span>
                  <span className="text-blue-400">HQ</span>
                </span>
              </Link>
              
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold text-white mb-2">
                Password reset successful
              </h2>
              <p className="text-slate-400 mb-8">
                Your password has been updated successfully. You can now sign in with your new password.
              </p>
            </div>

            <Link
              href="/auth"
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

  // Main reset form
  return (
    <div className="min-h-screen bg-slate-900 dark:bg-slate-900 flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          {/* Header */}
          <div className="text-center">
            <Link href="/" className="inline-flex items-center gap-2 justify-center mb-8">
              <BrandIcon size={32} />
              <span className="text-2xl font-bold text-white">
                <span className="text-white">ReplyFlow</span>
                <span className="text-blue-400">HQ</span>
              </span>
            </Link>
            
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
              href="/auth"
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
