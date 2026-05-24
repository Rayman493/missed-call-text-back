'use client'

import React, { useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import { Clock, Edit3, Pause, Play, Calendar, X, Check, AlertCircle } from 'lucide-react'

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
  onUpdate?: () => void
}

export default function AutomaticFollowUpsControl({ followUpJobs, leadId, onUpdate }: AutomaticFollowUpsControlProps) {
  const [editingJob, setEditingJob] = useState<string | null>(null)
  const [editingMessage, setEditingMessage] = useState('')
  const [reschedulingJob, setReschedulingJob] = useState<string | null>(null)
  const [newScheduleTime, setNewScheduleTime] = useState('')
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

  const handleEditMessage = async (jobId: string, newMessage: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/follow-ups/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage })
      })
      
      if (response.ok) {
        setEditingJob(null)
        setEditingMessage('')
        onUpdate?.()
      }
    } catch (error) {
      console.error('Failed to update message:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleReschedule = async (jobId: string, newTime: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/follow-ups/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduled_for: newTime })
      })
      
      if (response.ok) {
        setReschedulingJob(null)
        setNewScheduleTime('')
        onUpdate?.()
      }
    } catch (error) {
      console.error('Failed to reschedule:', error)
    } finally {
      setLoading(false)
    }
  }

  const handlePauseJob = async (jobId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/follow-ups/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'paused' })
      })
      
      if (response.ok) {
        onUpdate?.()
      }
    } catch (error) {
      console.error('Failed to pause job:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleResumeJob = async (jobId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/follow-ups/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'pending' })
      })
      
      if (response.ok) {
        onUpdate?.()
      }
    } catch (error) {
      console.error('Failed to resume job:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this follow-up?')) return
    
    setLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/follow-ups/${jobId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled', cancelled_reason: 'user_cancelled' })
      })
      
      if (response.ok) {
        onUpdate?.()
      }
    } catch (error) {
      console.error('Failed to cancel job:', error)
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
      console.error('Failed to pause all:', error)
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
      console.error('Failed to resume all:', error)
    } finally {
      setLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
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
      case 'sent':
        return (
          <span className="px-2 py-0.5 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs rounded-full font-medium border border-green-100 dark:border-green-800/30">
            Sent
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
    <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm hover:shadow-md transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-lg flex items-center justify-center shadow-sm">
            <Clock className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">Automatic Follow-ups</h3>
            <p className="text-xs text-muted-foreground">
              ReplyFlow will automatically check in with this lead unless you pause or edit the sequence.
            </p>
          </div>
        </div>
        
        {/* Sequence-level controls */}
        {hasAnyActiveJobs && (
          <button
            onClick={allPaused ? handleResumeAll : handlePauseAll}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300
              hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            {allPaused ? (
              <>
                <Play className="w-3 h-3 mr-1" />
                Resume Follow-ups
              </>
            ) : (
              <>
                <Pause className="w-3 h-3 mr-1" />
                Pause All Follow-ups
              </>
            )}
          </button>
        )}
      </div>

      {/* Paused state message */}
      {allPaused && (
        <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <Pause className="w-4 h-4" />
            <span>Automatic follow-ups are paused for this lead.</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {followUpJobs.length === 0 && (
        <div className="text-center py-6">
          <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-3">
            <Clock className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            No automatic follow-ups are scheduled for this lead.
          </p>
          <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
            Schedule Follow-up
          </button>
        </div>
      )}

      {/* Follow-up jobs list */}
      {followUpJobs.length > 0 && (
        <div className="space-y-3">
          {/* Upcoming/Paused jobs */}
          {[...upcomingJobs, ...pausedJobs].map((job) => (
            <div key={job.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded flex items-center justify-center text-xs font-semibold">
                    {job.step}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Follow-up {job.step}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {job.scheduled_for ? formatRelativeTime(job.scheduled_for) : 'Not scheduled'}
                    </div>
                  </div>
                </div>
                {getStatusBadge(job.status)}
              </div>

              {/* Message preview */}
              <div className="mb-3">
                {editingJob === job.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingMessage}
                      onChange={(e) => setEditingMessage(e.target.value)}
                      className="w-full p-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-foreground resize-none"
                      rows={2}
                      placeholder="Enter follow-up message..."
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEditMessage(job.id, editingMessage)}
                        disabled={loading || !editingMessage.trim()}
                        className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditingJob(null)
                          setEditingMessage('')
                        }}
                        className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-600 dark:text-slate-400 italic">
                    "{job.message}"
                  </div>
                )}
              </div>

              {/* Reschedule */}
              {reschedulingJob === job.id && (
                <div className="mb-3 p-2 bg-slate-50 dark:bg-slate-700 rounded-lg">
                  <input
                    type="datetime-local"
                    value={newScheduleTime}
                    onChange={(e) => setNewScheduleTime(e.target.value)}
                    className="w-full p-2 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-600 text-foreground"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleReschedule(job.id, newScheduleTime)}
                      disabled={loading || !newScheduleTime}
                      className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      Reschedule
                    </button>
                    <button
                      onClick={() => {
                        setReschedulingJob(null)
                        setNewScheduleTime('')
                      }}
                      className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                {job.status === 'pending' || job.status === 'paused' ? (
                  <>
                    <button
                      onClick={() => {
                        setEditingJob(job.id)
                        setEditingMessage(job.message)
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded transition-colors"
                    >
                      <Edit3 className="w-3 h-3 mr-1" />
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        setReschedulingJob(job.id)
                        setNewScheduleTime(job.scheduled_for ? new Date(job.scheduled_for).toISOString().slice(0, 16) : '')
                      }}
                      className="px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded transition-colors"
                    >
                      <Calendar className="w-3 h-3 mr-1" />
                      Reschedule
                    </button>
                    {job.status === 'pending' ? (
                      <button
                        onClick={() => handlePauseJob(job.id)}
                        disabled={loading}
                        className="px-2 py-1 text-xs bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded transition-colors disabled:opacity-50"
                      >
                        <Pause className="w-3 h-3 mr-1" />
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={() => handleResumeJob(job.id)}
                        disabled={loading}
                        className="px-2 py-1 text-xs bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-300 rounded transition-colors disabled:opacity-50"
                      >
                        <Play className="w-3 h-3 mr-1" />
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => handleCancelJob(job.id)}
                      disabled={loading}
                      className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 rounded transition-colors disabled:opacity-50"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Cancel
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          ))}

          {/* Sent jobs */}
          {sentJobs.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-600 pt-3">
              <div className="text-xs text-muted-foreground mb-2">Completed</div>
              {sentJobs.slice(0, 2).map((job) => (
                <div key={job.id} className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                  <Check className="w-3 h-3 text-green-500" />
                  <span>Follow-up {job.step} sent</span>
                </div>
              ))}
              {sentJobs.length > 2 && (
                <div className="text-xs text-muted-foreground">
                  +{sentJobs.length - 2} more completed
                </div>
              )}
            </div>
          )}

          {/* Cancelled jobs */}
          {cancelledJobs.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-600 pt-3">
              <div className="text-xs text-muted-foreground mb-2">Cancelled</div>
              {cancelledJobs.slice(0, 2).map((job) => (
                <div key={job.id} className="flex items-center gap-2 text-sm text-muted-foreground py-1">
                  <X className="w-3 h-3 text-red-500" />
                  <span>Follow-up {job.step} cancelled</span>
                </div>
              ))}
              {cancelledJobs.length > 2 && (
                <div className="text-xs text-muted-foreground">
                  +{cancelledJobs.length - 2} more cancelled
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
