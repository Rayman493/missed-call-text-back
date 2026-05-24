'use client'

import React from 'react'
import Link from 'next/link'

interface CompletedMonitoringCardProps {
  missedCallCount?: number
  lastActivity?: string
}

export default function CompletedMonitoringCard({ 
  missedCallCount = 0, 
  lastActivity 
}: CompletedMonitoringCardProps) {
  return (
    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/50 rounded-xl p-4 sm:p-5">
      {/* Header with live status */}
      <div className="flex items-center gap-3 mb-3">
        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-green-700 dark:text-green-300">Live</span>
        </div>
        
        {/* Title */}
        <h3 className="text-lg font-semibold text-foreground">
          ✅ ReplyFlow is Live
        </h3>
      </div>

      {/* Description */}
      <p className="text-sm text-muted-foreground mb-3">
        ReplyFlow is actively monitoring missed calls for your business.
      </p>

      {/* Optional status line */}
      {(missedCallCount > 0 || lastActivity) && (
        <p className="text-xs text-muted-foreground mb-4">
          {missedCallCount > 0 
            ? `${missedCallCount} missed call${missedCallCount === 1 ? '' : 's'} successfully processed`
            : lastActivity 
            ? `Last activity: ${lastActivity}`
            : null
          }
        </p>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <Link
          href="/dashboard/test-setup"
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Run Test
        </Link>
        
        <button
          onClick={() => window.location.href = '/setup/phone-forwarding'}
          className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Review Forwarding Setup
        </button>
      </div>
    </div>
  )
}
