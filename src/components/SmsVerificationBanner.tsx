'use client'

import { useState } from 'react'
import { Business } from '@/lib/types'

interface SmsVerificationBannerProps {
  business: Business | null
}

export default function SmsVerificationBanner({ business }: SmsVerificationBannerProps) {
  const [expanded, setExpanded] = useState(false)

  if (!business) return null

  // Show banner for numbers that are not fully active/verified
  const isActive = 
    business.messaging_status === 'active' || 
    business.a2p_status === 'verified' || 
    business.a2p_status === 'approved'

  if (isActive) return null

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-2 sm:p-3 mb-2 sm:mb-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <span className="text-lg sm:text-xl">🚧</span>
        </div>
        <div className="ml-2 flex-1">
          <h3 className="text-xs font-semibold text-blue-900 dark:text-blue-100">
            Setup in progress (1–2 days)
          </h3>
          <p className="text-xs text-blue-800 dark:text-blue-200 mt-0.5">
            Your text replies are active, but some carriers may delay messages until verification completes.
          </p>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-700 dark:text-blue-300 underline mt-1 hover:text-blue-900 dark:hover:text-blue-100"
          >
            {expanded ? 'Show less' : 'Learn more'}
          </button>
          {expanded && (
            <ul className="text-xs text-blue-800 dark:text-blue-200 mt-1.5 space-y-0.5 list-disc list-inside">
              <li>Messages may show as undelivered during verification</li>
              <li>Once approved, delivery becomes reliable</li>
              <li>You can still test and view leads normally</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
