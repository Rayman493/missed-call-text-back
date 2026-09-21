'use client'

import React from 'react'
import Link from 'next/link'
import Footer from '@/components/Footer'
import BrandIcon from '@/components/BrandIcon'
import { isCapacitorNative } from '@/capacitor/init'

/**
 * Public account-deletion completion page.
 *
 * Intentionally outside the dashboard layout and every guard: after a
 * successful /api/account/delete, the owner is navigated here BEFORE auth
 * teardown runs, so SIGNED_OUT/business-clear side effects can never strand
 * the user on a protected page. Requires no auth, business, or session.
 * Distinct from the removed-member access-loss screen — this is the
 * owner deletion completion state.
 */
export default function AccountDeletedPage() {
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

            <h1 className="text-2xl font-bold text-white mb-2">
              Account successfully deleted
            </h1>
            <p className="text-slate-400">
              Your ReplyFlow account and business data have been deleted.
            </p>
            <p className="text-slate-500 text-sm mt-2 mb-8">
              We've also sent you a confirmation.
            </p>
          </div>

          <Link
            href="/auth?mode=signin"
            className="flex items-center justify-center w-full h-12 bg-blue-600 text-white px-4 rounded-xl hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 shadow-md hover:shadow-lg transition-all hover:-translate-y-[1px] font-semibold"
          >
            Back to sign in
          </Link>
        </div>
      </div>
      <Footer />
    </div>
  )
}
