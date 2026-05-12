import React from 'react'
import { formatRelativeTime } from '@/lib/utils'

interface MobileFollowUpSummaryProps {
  followUpJobs: any[]
}

export default function MobileFollowUpSummary({ followUpJobs }: MobileFollowUpSummaryProps) {
  if (followUpJobs.length === 0) return null

  const allCancelledAfterReply = followUpJobs.every(
    (job: any) => job.status === 'cancelled' && job.cancelled_reason === 'customer_replied'
  )

  return (
    <div className="mt-3 px-3 py-2 bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center gap-2">
      {allCancelledAfterReply ? (
        <>
          <svg className="h-4 w-4 text-green-500 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            Follow-ups paused after customer replied
          </span>
        </>
      ) : (
        <span className="text-sm text-slate-600 dark:text-slate-400">
          {followUpJobs.length} follow-up{followUpJobs.length > 1 ? 's' : ''} scheduled
        </span>
      )}
    </div>
  )
}
