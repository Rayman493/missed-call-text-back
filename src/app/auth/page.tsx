'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useRouter, useSearchParams } from 'next/navigation'
import SetupError from '@/components/SetupError'
import Footer from '@/components/Footer'

// Footer with theme support for auth pages
function AuthFooter() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="bg-slate-900 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <p className="text-slate-600 dark:text-slate-400 text-base">
            © {currentYear} ReplyFlowHQ. All rights reserved.
          </p>
          <div className="flex items-center gap-6 mt-4 md:mt-0">
            <a
              href="/privacy"
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 text-base transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 text-base transition-colors"
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

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams?.get('mode') || 'signup'
  const emailParam = searchParams?.get('email')
  
  const [isSignIn, setIsSignIn] = useState(mode === 'signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [existingAccount, setExistingAccount] = useState(false)
  const passwordRef = React.useRef<HTMLInputElement>(null)

  // Update mode when URL changes
  useEffect(() => {
    setIsSignIn(mode === 'signin')
    // Clear error when switching modes
    if (mode === 'signin') {
      setError('')
      setExistingAccount(false)
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
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      // Redirect to dashboard after successful sign in
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Failed to sign in')
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setExistingAccount(false)

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      if (error) throw error

      // Check if user exists but has empty identities (indicates existing account)
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        setExistingAccount(true)
        setError('Looks like you already have an account. Try signing in.')
        return
      }

      // Redirect to onboarding after successful signup
      router.push('/onboarding')
    } catch (err: any) {
      // Check for existing user error
      const errorMessage = err.message || 'Failed to sign up'
      if (errorMessage.toLowerCase().includes('user already registered') || 
          errorMessage.toLowerCase().includes('already exists')) {
        setExistingAccount(true)
        setError('Account already exists. Please sign in.')
      } else {
        setError(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = () => {
    const newMode = isSignIn ? 'signup' : 'signin'
    router.push(`/auth?mode=${newMode}`)
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">RF</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
              {isSignIn ? 'Sign In' : 'Sign Up'}
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              ReplyFlow - Conversational Missed-Call Response
            </p>
          </div>
          
          {isSignIn && emailParam && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Welcome back — please sign in</p>
          )}
          
          {!isSignIn && (
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">Create your account to get started</p>
          )}
          
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 mb-6">
              <p className="text-sm text-red-600 dark:text-red-300 mb-4">{error}</p>
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
                    className="w-full text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-300 underline"
                  >
                    Use a different email
                  </button>
                </div>
              )}
            </div>
          )}

          <form onSubmit={isSignIn ? handleSignIn : handleSignUp} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                name="email"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Password
              </label>
              <input
                ref={passwordRef}
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={isSignIn ? "current-password" : "new-password"}
                name="password"
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 shadow-sm hover:shadow-md transition-all hover:-translate-y-[1px] font-semibold"
            >
              {loading ? (isSignIn ? 'Signing in...' : 'Signing up...') : (isSignIn ? 'Sign In' : 'Sign Up')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
            {isSignIn ? "New to ReplyFlow? " : "Already have an account? "}
            <button
              onClick={toggleMode}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
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
    <Suspense fallback={<div className="min-h-screen bg-white dark:bg-slate-950 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-lg p-6 sm:p-8">
          <p className="text-slate-900 dark:text-white">Loading...</p>
        </div>
      </div>
      <AuthFooter />
    </div>}>
      <AuthContent />
    </Suspense>
  )
}
