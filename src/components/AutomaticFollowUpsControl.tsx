'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { formatRelativeTime } from '@/lib/utils'
import { Clock, Pause, Play, Calendar, X, Check, AlertCircle, Send, Settings, MessageSquare, User, Activity, ExternalLink } from 'lucide-react'

interface FollowUpJob {
  id: string
  step: number
  scheduled_for: string
  message: string
  status: 'pending' | 'paused' | 'sent' | 'cancelled'
  cancelled_reason?: string
}

interface FollowUpSettings {
  enabled: boolean
  followUps: FollowUpConfig[]
}

interface FollowUpConfig {
  step: number
  enabled: boolean
  delayDays: number
  delayUnit: 'minutes' | 'hours' | 'days'
  message: string
}

interface AutomaticFollowUpsControlProps {
  followUpJobs: FollowUpJob[]
  leadId: string
  leadData?: any
  followUpSettings?: FollowUpSettings
  onUpdate?: () => void
}

export default function AutomaticFollowUpsControl({ followUpJobs, leadId, leadData, followUpSettings, onUpdate }: AutomaticFollowUpsControlProps) {
  const [loading, setLoading] = useState(false)

  const allCancelledAfterReply = followUpJobs.every(
    (job) => job.status === 'cancelled' && job.cancelled_reason === 'customer_replied'
  )

  const upcomingJobs = followUpJobs.filter((job) => job.status === 'pending')
  const pausedJobs = followUpJobs.filter((job) => job.status === 'paused')
  const sentJobs = followUpJobs.filter((job) => job.status === 'sent')
  const cancelledJobs = followUpJobs.filter((job) => job.status === 'cancelled')

  const allPaused = pausedJobs.length > 0 && upcomingJobs.length === 0
  const hasAnyActiveJobs = upcomingJobs.length > 0 || pausedJobs.length > 0

  // Check if auto reply was sent (step 1 job with status 'sent')
  const autoReplySent = followUpJobs.some((job) => job.step === 1 && job.status === 'sent')

  // Check if customer replied (direct check for inbound messages)
  const customerReplied = leadData?.messages?.some(
    (message: any) => message.direction === 'inbound'
  ) ?? false

  // Determine automation status based on business settings first, then job status
  const getAutomationStatus = () => {
    // Check business-level configuration first
    if (!followUpSettings || !followUpSettings.followUps || followUpSettings.followUps.length === 0) {
      return { label: 'Not Configured', variant: 'neutral' as const }
    }

    // Check if automation is disabled at business level
    if (!followUpSettings.enabled) {
      return { label: 'Disabled', variant: 'neutral' as const }
    }

    // Check if at least one follow-up is enabled
    const hasEnabledFollowUps = followUpSettings.followUps.some(fu => fu.enabled)
    if (!hasEnabledFollowUps) {
      return { label: 'Disabled', variant: 'neutral' as const }
    }

    // Business is configured and enabled, now check job-specific status
    if (followUpJobs.length === 0) {
      return { label: 'Configured', variant: 'success' as const }
    }

    if (allCancelledAfterReply) {
      return { label: 'Customer Replied', variant: 'success' as const }
    }

    if (hasAnyActiveJobs) {
      return { label: 'Active', variant: 'success' as const }
    }

    if (autoReplySent) {
      return { label: 'SMS Sent', variant: 'success' as const }
    }

    if (cancelledJobs.length === followUpJobs.length) {
      return { label: 'Cancelled', variant: 'neutral' as const }
    }

    if (sentJobs.length > 0) {
      return { label: 'Complete', variant: 'success' as const }
    }

    return { label: 'Inactive', variant: 'neutral' as const }
  }

  const automationStatus = getAutomationStatus()

  const handleSendFollowUp = async (jobId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/follow-ups/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        onUpdate?.()
      } else {
        const error = await response.json()
        alert(`Failed to send follow-up: ${error.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error sending follow-up:', error)
      alert('Failed to send follow-up. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handlePauseAll = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/follow-ups/pause-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        onUpdate?.()
      }
    } catch (error) {
      console.error('Error pausing follow-ups:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResumeAll = async () => {
    setLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/follow-ups/resume-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        onUpdate?.()
      }
    } catch (error) {
      console.error('Error resuming follow-ups:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return (
          <span className="px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs rounded-full font-medium border border-green-100 dark:border-green-800/30">
            Sent
          </span>
        )
      case 'pending':
        return (
          <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs rounded-full font-medium border border-blue-100 dark:border-blue-800/30">
            Scheduled
          </span>
        )
      case 'paused':
        return (
          <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-xs rounded-full font-medium border border-amber-100 dark:border-amber-800/30">
            Paused
          </span>
        )
      case 'cancelled':
        return (
          <span className="px-2 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-xs rounded-full font-medium border border-red-100 dark:border-red-800/30">
            Canceled
          </span>
        )
      default:
        return null
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      {/* Follow-Up Status Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">Follow-Up Status</h3>
          {automationStatus.variant === 'success' && (
            <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
        </div>
        <p className={`text-xs font-medium mt-1 ${automationStatus.variant === 'success' ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'}`}>
          {automationStatus.label}
        </p>
      </div>

      {/* Next Follow-Up */}
      {upcomingJobs.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase tracking-wide">Next Follow-Up</p>
          <p className="text-sm font-medium text-foreground">
            {formatRelativeTime(upcomingJobs[0].scheduled_for)}
          </p>
        </div>
      )}

      {/* Remaining Count */}
      {followUpJobs.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] text-muted-foreground font-medium mb-1 uppercase tracking-wide">Remaining</p>
          <p className="text-sm font-medium text-foreground">
            {upcomingJobs.length}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border">
        {hasAnyActiveJobs && (
          <button
            onClick={allPaused ? handleResumeAll : handlePauseAll}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              bg-background border-border text-foreground hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
          >
            {allPaused ? (
              <>
                <Play className="w-3 h-3" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-3 h-3" />
                Pause
              </>
            )}
          </button>
        )}

        {upcomingJobs.length > 0 && (
          <button
            onClick={() => handleSendFollowUp(upcomingJobs[0].id)}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Send className="w-3 h-3" />
            Send Now
          </button>
        )}

        <Link
          href="/dashboard/settings/follow-ups"
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border text-foreground hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
        >
          <Settings className="w-3 h-3" />
          Configure
        </Link>
      </div>
    </div>
  )
}
