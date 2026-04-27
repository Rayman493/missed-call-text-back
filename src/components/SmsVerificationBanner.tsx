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
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-6">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-100">
            Limited Delivery Mode (Verification in Progress)
          </h3>
          <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
            ReplyFlow is working, but some messages may not deliver until toll-free verification is complete. This is normal during setup.
          </p>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-amber-700 dark:text-amber-300 underline mt-2 hover:text-amber-900 dark:hover:text-amber-100"
          >
            {expanded ? 'Show less' : 'Learn more'}
          </button>
          {expanded && (
            <ul className="text-sm text-amber-800 dark:text-amber-200 mt-3 space-y-1 list-disc list-inside">
              <li>Messages may show as undelivered due to carrier filtering</li>
              <li>Once approved, delivery becomes reliable</li>
              <li>You can still test flows and view leads normally</li>
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
