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
    <div className="mt-2.5 sm:mt-3">
      {/* Compact Mobile Version */}
      <div className="sm:hidden">
        <div className="bg-gray-50 dark:bg-gray-800/30 rounded-lg p-2 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-600 rounded-full flex items-center justify-center">
              <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                {allCancelledAfterReply 
                  ? 'Follow-ups stopped after customer replied' 
                  : `${followUpJobs.length} follow-up${followUpJobs.length > 1 ? 's' : ''} scheduled`
                }
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Desktop Version */}
      <div className="hidden sm:block bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 p-3 sm:p-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2.5 sm:mb-3">
          Scheduled Follow-ups ({followUpJobs.length})
        </h3>
        
        {/* Check if all follow-ups were cancelled due to customer reply */}
        {allCancelledAfterReply ? (
          <div className="text-center py-4">
            <div className="text-2xl mb-2">✅</div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Follow-up messages were automatically stopped after customer replied
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {followUpJobs.map((job: any) => {
              const isPending = job.status === 'pending'
              const isSent = job.status === 'sent'
              const isCancelled = job.status === 'cancelled'
              const isFailed = job.status === 'failed'
              
              // Human-friendly status descriptions
              const getStatusDescription = () => {
                if (isPending && job.scheduled_at) {
                  const scheduledTime = new Date(job.scheduled_at)
                  const now = new Date()
                  const tomorrow = new Date(now)
                  tomorrow.setDate(tomorrow.getDate() + 1)
                  
                  if (scheduledTime.toDateString() === tomorrow.toDateString()) {
                    return `Will send tomorrow morning`
                  } else if (scheduledTime > now) {
                    return `Will send ${formatRelativeTime(job.scheduled_at)}`
                  } else {
                    return 'Scheduled to send soon'
                  }
                }
                
                if (isSent) return 'Sent successfully'
                if (isCancelled) {
                  if (job.cancelled_reason === 'customer_replied') {
                    return 'Stopped after customer replied'
                  }
                  return 'No longer needed'
                }
                if (isFailed) return 'Unable to send'
                return 'Scheduled'
              }
              
              return (
                <div
                  key={job.id}
                  className={`p-4 rounded-lg border ${
                    isPending ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800' :
                    isSent ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' :
                    isCancelled ? 'bg-gray-50 dark:bg-gray-900/10 border-gray-200 dark:border-gray-700' :
                    'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                  }`}
                >
                  {/* Message Preview */}
                  <div className="mb-3">
                    <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed">
                      {job.message_body}
                    </p>
                  </div>
                  
                  {/* Status Line */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs ${
                      isPending ? 'text-blue-600 dark:text-blue-400' :
                      isSent ? 'text-green-600 dark:text-green-400' :
                      isCancelled ? 'text-gray-500 dark:text-gray-400' :
                      'text-red-600 dark:text-red-400'
                    }`}>
                      {getStatusDescription()}
                    </span>
                    
                    {(isSent || job.scheduled_at) && (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {isSent ? `Sent ${formatRelativeTime(job.sent_at)}` : `Scheduled ${formatRelativeTime(job.scheduled_at)}`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
