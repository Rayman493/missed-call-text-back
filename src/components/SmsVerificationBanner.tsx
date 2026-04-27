'use client'

import { useState } from 'react'
import { Business } from '@/lib/types'

interface SmsVerificationBannerProps {
  business: Business | null
}

export default function SmsVerificationBanner({ business }: SmsVerificationBannerProps) {
  const [expanded, setExpanded] = useState(false)

  if (!business) return null

  // Show banner only for toll-free numbers that are not verified/approved
  const shouldShow = 
    business.sms_type === 'toll_free' && 
    business.a2p_status !== 'verified' && 
    business.a2p_status !== 'approved'

  if (!shouldShow) return null

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <span className="text-2xl">🚧</span>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
            Setup in progress (1–2 days)
          </h3>
          <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
            Your auto-text is active, but carriers may delay some messages until verification completes.
          </p>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-blue-700 dark:text-blue-300 underline mt-2 hover:text-blue-900 dark:hover:text-blue-100"
          >
            {expanded ? 'Show less' : 'Learn more'}
          </button>
          {expanded && (
            <ul className="text-sm text-blue-800 dark:text-blue-200 mt-3 space-y-1 list-disc list-inside">
              <li>Messages may show as undelivered during verification</li>
              <li>Once approved, delivery becomes reliable</li>
              <li>You can still test flows and view leads normally</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
