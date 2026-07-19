'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isCapacitorNative } from '@/capacitor/init'

export default function CheckoutRecoveryPage() {
  const router = useRouter()

  const handleContinue = () => {
    router.push('/signin?redirect=/dashboard?checkout=success')
  }

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-4 sm:py-8">
        {/* Back to Homepage Link (web only) */}
        {!isCapacitorNative() && (
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
        )}
        
        <div className="w-full max-w-md sm:max-w-[480px] bg-gradient-to-b from-slate-900 to-slate-900/95 dark:from-slate-900 dark:to-slate-900/95 border border-slate-700/50 dark:border-slate-700/50 rounded-2xl shadow-xl shadow-blue-900/5 p-6 sm:p-8 md:p-10 backdrop-blur-sm">
          <div className="text-center">
            {/* Success Icon */}
            <div className="inline-flex items-center justify-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500/20 to-emerald-500/20 dark:from-green-500/20 dark:to-emerald-500/20 rounded-full flex items-center justify-center">
                <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 dark:from-green-500 dark:to-emerald-600 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Headline */}
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-100 dark:text-slate-100 mb-3">
              Your free trial is active
            </h1>

            {/* Subheadline */}
            <p className="text-base sm:text-lg text-slate-300 dark:text-slate-300 mb-6 leading-relaxed">
              To continue setup, sign in to your ReplyFlow dashboard.
            </p>

            {/* Optional Reassurance */}
            <p className="text-sm text-slate-400 dark:text-slate-400 mb-8">
              Your account and phone setup are secure and ready to continue.
            </p>

            {/* Primary CTA */}
            <button
              onClick={handleContinue}
              className="w-full h-12 bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-600 dark:to-blue-700 text-white py-3 px-6 rounded-xl hover:from-blue-700 hover:to-blue-800 dark:hover:from-blue-700 dark:hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:ring-offset-2 focus:ring-offset-slate-900 shadow-lg shadow-blue-600/30 hover:shadow-xl hover:shadow-blue-600/40 transition-all hover:-translate-y-[1px] font-semibold text-base sm:text-lg"
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
