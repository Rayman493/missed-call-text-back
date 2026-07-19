'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@/lib/supabase/browser'
import Footer from '@/components/Footer'
import BrandIcon from '@/components/BrandIcon'
import { isCapacitorNative } from '@/capacitor/init'

const supabase = createBrowserClient()

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
      const redirectTo = `${appUrl.replace(/\/$/, '')}/reset-password`
      console.log('[ForgotPassword] Sending reset email with redirectTo:', redirectTo)
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo,
      })

      if (error) {
        // Don't reveal specific errors to user for security
        console.error('Password reset error:', error)
        setSuccess(true)
      } else {
        setSuccess(true)
      }
    } catch (err) {
      console.error('Password reset error:', err)
      setSuccess(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Main content */}
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
              Reset your password
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              Enter your email address and we'll send you a link to reset your password.
            </p>
          </div>

          {/* Form */}
          {!success ? (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-900/20 border border-red-800/50 rounded-lg p-4">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full px-4 py-3 border border-slate-600/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 bg-slate-800/50 text-slate-100 placeholder:text-slate-500/80 transition-all hover:border-slate-500/80"
                  placeholder="you@example.com"
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
                    Sending reset link...
                  </>
                ) : (
                  'Send reset link'
                )}
              </button>
            </form>
          ) : (
            /* Success state */
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              
              <div>
                <h3 className="text-xl font-semibold text-white mb-2">
                  Check your email
                </h3>
                <p className="text-slate-400">
                  If an account exists for this email, we sent password reset instructions.
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href="/auth"
                  className="block w-full h-12 bg-blue-600 text-white py-2 px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-md hover:shadow-lg transition-all hover:-translate-y-[1px] font-semibold text-center"
                >
                  Back to sign in
                </Link>
                
                <button
                  onClick={() => {
                    setSuccess(false)
                    setEmail('')
                  }}
                  className="block w-full h-12 bg-slate-700 text-white py-2 px-4 rounded-xl hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500/30 shadow-md hover:shadow-lg transition-all hover:-translate-y-[1px] font-semibold"
                >
                  Try another email
                </button>
              </div>
            </div>
          )}

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
