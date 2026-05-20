'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

export default function RecoverSessionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isRedirecting, setIsRedirecting] = useState(false)

  useEffect(() => {
    console.log('[Session Recovery] Recovery page loaded')
    
    // Check if this is a genuine checkout recovery scenario
    const checkoutStatus = searchParams?.get('checkout')
    const redirectPath = searchParams?.get('redirect') || '/dashboard'
    
    if (checkoutStatus !== 'success') {
      console.log('[Session Recovery] Not a checkout recovery scenario, redirecting to signin')
      router.push('/auth/signin')
      return
    }
  }, [searchParams, router])

  const handleContinue = () => {
    setIsRedirecting(true)
    console.log('[Redirect Decision]', {
      reason: 'recovery_cta_clicked',
      from: '/auth/recover-session',
      to: '/auth/signin?redirect=/dashboard?checkout=success',
      checkoutSuccess: true
    })
    router.push('/auth/signin?redirect=/dashboard?checkout=success')
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-background dark:via-slate-900/30 dark:to-background flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-card rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700/50 p-8 sm:p-10">
          {/* Success Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground text-center mb-3">
            Your free trial is active
          </h1>

          {/* Body */}
          <p className="text-muted-foreground text-center mb-6">
            To continue setup, sign in to your ReplyFlow dashboard.
          </p>

          {/* Supporting text */}
          <div className="bg-slate-50 dark:bg-slate-900/20 rounded-xl p-4 mb-8 border border-slate-200 dark:border-slate-700/50">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Your trial, ReplyFlow number, and setup progress have been saved.
              </p>
            </div>
          </div>

          {/* CTA Button */}
          <button
            onClick={handleContinue}
            disabled={isRedirecting}
            className="w-full inline-flex items-center justify-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-base font-semibold rounded-xl shadow-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRedirecting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Loading...
              </>
            ) : (
              'Continue to Dashboard'
            )}
          </button>

          {/* Help link */}
          <p className="text-center text-sm text-muted-foreground mt-6">
            Need help?{' '}
            <Link href="mailto:support@replyflowhq.com" className="text-blue-600 dark:text-blue-400 hover:underline">
              Contact support
            </Link>
          </p>
        </div>

        {/* Security note */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          This is a security measure to protect your account.
        </p>
      </div>
    </div>
  )
}
