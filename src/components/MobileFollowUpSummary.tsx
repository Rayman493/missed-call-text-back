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

  const upcomingJobs = followUpJobs.filter((job: any) => job.status === 'pending')
  const cancelledJobs = followUpJobs.filter((job: any) => job.status === 'cancelled')

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">
          {allCancelledAfterReply ? 'Follow-ups Paused' : 'Upcoming Follow-ups'}
        </h3>
      </div>
      
      {allCancelledAfterReply ? (
        <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-300">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          <span>Automatically paused after customer replied</span>
        </div>
      ) : (
        <div className="space-y-2">
          {upcomingJobs.length > 0 && (
            <div className="space-y-1">
              {upcomingJobs.slice(0, 3).map((job: any, index: number) => (
                <div key={job.id} className="flex items-center gap-3 text-sm">
                  <div className="flex-shrink-0 w-6 h-6 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center text-xs font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-700 dark:text-gray-300">
                      {job.scheduled_at ? formatRelativeTime(job.scheduled_at) : 'Scheduled'}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {job.step === 1 ? 'First follow-up' : job.step === 2 ? 'Second follow-up' : job.step ? `Follow-up #${job.step}` : 'Scheduled follow-up'}
                    </div>
                  </div>
                </div>
              ))}
              {upcomingJobs.length > 3 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 pl-9">
                  +{upcomingJobs.length - 3} more scheduled
                </div>
              )}
            </div>
          )}
          
          {cancelledJobs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>{cancelledJobs.length} cancelled</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
