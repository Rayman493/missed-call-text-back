'use client'

import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

interface HomepageCTAProps {
  variant?: 'hero' | 'bottom'
  showSecondaryButton?: boolean
  secondaryButtonHref?: string
  secondaryButtonText?: string
}

export default function HomepageCTA({
  variant = 'hero',
  showSecondaryButton = false,
  secondaryButtonHref = '#interactive-demo',
  secondaryButtonText = 'See How It Works'
}: HomepageCTAProps) {
  const { user, loading } = useAuth()
  const isLoggedIn = !!user && !loading

  // Show loading skeleton while auth state is resolving
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 sm:gap-4">
        <div className="h-14 sm:h-16 w-full sm:w-auto sm:min-w-[280px] bg-slate-200 dark:bg-slate-700 rounded-xl animate-pulse" />
        {variant === 'hero' && (
          <div className="h-5 w-64 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
        )}
      </div>
    )
  }

  if (variant === 'hero') {
    return (
      <div className="flex flex-col items-center gap-2 sm:gap-2.5 mt-8 sm:mt-10">
        {isLoggedIn ? (
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center h-14 sm:h-16 px-8 sm:px-10 w-full sm:w-auto sm:min-w-[280px] bg-blue-600 text-white font-bold text-base sm:text-lg rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Go to Dashboard
          </Link>
        ) : (
          <Link
            href="/auth?mode=signup"
            className="inline-flex items-center justify-center h-14 sm:h-16 px-8 sm:px-10 w-full sm:w-auto sm:min-w-[280px] bg-blue-600 text-white font-bold text-base sm:text-lg rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Start Your 14-Day Free Trial
          </Link>
        )}
        <div className="text-base text-slate-400 dark:text-slate-300">
          14-day free trial • $59/month after • Cancel anytime
        </div>
      </div>
    )
  }

  // Bottom CTA variant
  return (
    <div className="flex flex-col items-center gap-3 sm:gap-4">
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3 md:gap-4">
        <Link
          href={isLoggedIn ? "/dashboard" : "/auth?mode=signup"}
          className="h-11 sm:h-12 px-5 sm:px-7 bg-blue-600 text-white font-semibold rounded-xl shadow-lg hover:bg-blue-700 hover:shadow-xl transition-all duration-200 inline-flex items-center justify-center text-sm sm:text-base"
        >
          {isLoggedIn ? "Go to Dashboard" : "Start Your 14-Day Free Trial"}
        </Link>
        {showSecondaryButton && (
          <a
            href={secondaryButtonHref}
            className="h-11 sm:h-12 px-5 sm:px-7 bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-semibold rounded-xl shadow-lg hover:bg-slate-50 dark:hover:bg-slate-700 hover:shadow-xl transition-all duration-200 inline-flex items-center justify-center text-sm sm:text-base border border-blue-200 dark:border-blue-800"
          >
            {secondaryButtonText}
          </a>
        )}
      </div>

      <div className="text-sm text-slate-400 dark:text-slate-300">
        14-day free trial • $59/month after • Cancel anytime
      </div>
    </div>
  )
}
