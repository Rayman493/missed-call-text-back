import React from 'react'
import { formatRelativeTime } from '@/lib/utils'

interface MobileFollowUpSummaryProps {
  followUpJobs: any[]
}

export default function MobileFollowUpSummary({ followUpJobs }: MobileFollowUpSummaryProps) {
  const allCancelledAfterReply = followUpJobs.every(
    (job: any) => job.status === 'cancelled' && job.cancelled_reason === 'customer_replied'
  )

  const upcomingJobs = followUpJobs.filter((job: any) => job.status === 'pending')
  const cancelledJobs = followUpJobs.filter((job: any) => job.status === 'cancelled')

  return (
    <div className="bg-white dark:bg-card/80 backdrop-blur border border-slate-100 dark:border-border/40 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all duration-300">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center shadow-sm">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-foreground">
          {followUpJobs.length === 0 
            ? 'Automatic Check-ins' 
            : allCancelledAfterReply 
            ? 'Automatic Check-ins Paused' 
            : 'Upcoming Automatic Check-ins'
          }
        </h3>
        {allCancelledAfterReply && (
          <span className="ml-auto px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs rounded-full font-medium border border-green-100 dark:border-green-800/30">
            Customer replied
          </span>
        )}
      </div>
      
      {followUpJobs.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-5 h-5 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-slate-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span>No future automatic check-ins scheduled.</span>
        </div>
      ) : allCancelledAfterReply ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <div className="w-5 h-5 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-3 h-3 text-green-600 dark:text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <span>Automatically paused after customer replied</span>
        </div>
      ) : (
        <div className="space-y-2.5">
          {upcomingJobs.length > 0 && (
            <div className="space-y-2">
              {upcomingJobs.slice(0, 3).map((job: any, index: number) => (
                <div key={job.id} className="flex items-center gap-3 text-sm">
                  <div className="flex-shrink-0 w-7 h-7 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg flex items-center justify-center text-xs font-semibold border border-blue-100 dark:border-blue-800/30">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground font-medium truncate">
                      {job.scheduled_for ? formatRelativeTime(job.scheduled_for) : 'Scheduled'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {job.step === 1 ? 'First check-in' : job.step === 2 ? 'Second check-in' : job.step ? `Check-in #${job.step}` : 'Scheduled check-in'}
                    </div>
                  </div>
                </div>
              ))}
              {upcomingJobs.length > 3 && (
                <div className="text-xs text-muted-foreground pl-10 font-medium">
                  +{upcomingJobs.length - 3} more scheduled
                </div>
              )}
            </div>
          )}
          
          {cancelledJobs.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-border/40">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span className="font-medium">{cancelledJobs.length} cancelled</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
