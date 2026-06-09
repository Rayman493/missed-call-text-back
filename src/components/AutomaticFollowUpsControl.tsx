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

interface AutomaticFollowUpsControlProps {
  followUpJobs: FollowUpJob[]
  leadId: string
  leadData?: any
  onUpdate?: () => void
}

export default function AutomaticFollowUpsControl({ followUpJobs, leadId, leadData, onUpdate }: AutomaticFollowUpsControlProps) {
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
      {/* Compact Status Row */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-muted-foreground">Automation Status</span>
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
          hasAnyActiveJobs
            ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-100 dark:border-green-800/30'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
        }`}>
          {hasAnyActiveJobs ? 'Active' : 'Inactive'}
        </span>
        <span className="text-xs text-muted-foreground">Customer Replied</span>
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
          customerReplied
            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800/30'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
        }`}>
          {customerReplied ? 'Yes' : 'No'}
        </span>
      </div>

      {/* Compact Follow-Up Jobs */}
      {followUpJobs.length > 0 && (
        <div className="space-y-2 mb-4">
          {followUpJobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 dark:bg-slate-800/30 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-foreground">
                  {job.step === 1 ? 'Auto Reply' : `Follow-Up ${job.step - 1}`}
                </span>
                <span className="text-xs text-muted-foreground">
                  {job.status === 'sent' ? `Sent ${formatRelativeTime(job.scheduled_for)}` :
                   job.status === 'pending' ? `Scheduled ${formatRelativeTime(job.scheduled_for)}` :
                   job.status === 'paused' ? 'Paused' :
                   job.cancelled_reason ? `Cancelled (${job.cancelled_reason.replace('_', ' ')})` : 'Cancelled'}
                </span>
              </div>
              {getStatusBadge(job.status)}
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
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
