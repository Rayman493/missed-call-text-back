'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useRouter, useSearchParams } from 'next/navigation'
import SetupError from '@/components/SetupError'

const supabase = createBrowserClient()

function AuthContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') || 'signup'
  const emailParam = searchParams.get('email')
  
  const [isSignIn, setIsSignIn] = useState(mode === 'signin')
  const [email, setEmail] = useState(emailParam || '')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [existingAccount, setExistingAccount] = useState(false)
  const passwordRef = React.useRef<HTMLInputElement>(null)

  // Update mode when URL changes
  useEffect(() => {
    setIsSignIn(mode === 'signin')
  }, [mode])

  // Auto-focus password field when email is prefilled and in sign-in mode
  useEffect(() => {
    if (isSignIn && emailParam && passwordRef.current) {
      passwordRef.current.focus()
    }
  }, [isSignIn, emailParam])

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
        setError('An account with this email may already exist. Please sign in instead.')
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
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow p-8">
        <h1 className="text-2xl font-bold text-gray-100 mb-2">
          {isSignIn ? 'Sign In' : 'Sign Up'}
        </h1>
        
        {isSignIn && emailParam && (
          <p className="text-sm text-gray-400 mb-6">Welcome back — please sign in</p>
        )}
        
        {!isSignIn && (
          <p className="text-sm text-gray-400 mb-6">Create your account to get started</p>
        )}
        
        {error && (
          <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-300 mb-3">{error}</p>
            {existingAccount && (
              <button
                onClick={() => router.push(`/auth?mode=signin&email=${encodeURIComponent(email)}`)}
                className="text-sm text-blue-400 hover:text-blue-300 font-medium underline"
              >
                Sign in instead
              </button>
            )}
          </div>
        )}

        <form onSubmit={isSignIn ? handleSignIn : handleSignUp} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-gray-100"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
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
              className="w-full px-3 py-2 border border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-700 text-gray-100"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? (isSignIn ? 'Signing in...' : 'Signing up...') : (isSignIn ? 'Sign In' : 'Sign Up')}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-400">
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
  )
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 flex items-center justify-center p-8">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow p-8">
        <p className="text-gray-100">Loading...</p>
      </div>
    </div>}>
      <AuthContent />
    </Suspense>
  )
}
