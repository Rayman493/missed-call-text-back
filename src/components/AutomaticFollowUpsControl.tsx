'use client'

import React, { useState } from 'react'
import { formatRelativeTime } from '@/lib/utils'
import { Clock, Edit3, Pause, Play, Calendar, X, Check, AlertCircle, Send, Settings, MessageSquare, User, Activity } from 'lucide-react'

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
  const [loading, setLoading] = useState(false)
  const [showEditSequence, setShowEditSequence] = useState(false)
  const [editingSequence, setEditingSequence] = useState(followUpJobs.map(job => ({ ...job, enabled: job.status !== 'cancelled' })))

  const allCancelledAfterReply = followUpJobs.every(
    (job) => job.status === 'cancelled' && job.cancelled_reason === 'customer_replied'
  )

  const upcomingJobs = followUpJobs.filter((job) => job.status === 'pending')
  const pausedJobs = followUpJobs.filter((job) => job.status === 'paused')
  const sentJobs = followUpJobs.filter((job) => job.status === 'sent')
  const cancelledJobs = followUpJobs.filter((job) => job.status === 'cancelled')

  const allPaused = pausedJobs.length > 0 && upcomingJobs.length === 0
  const hasAnyActiveJobs = upcomingJobs.length > 0 || pausedJobs.length > 0

  const handleSendFollowUp = async (jobId: string) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/leads/${leadId}/follow-ups/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })
      
      if (response.ok) {
        onUpdate?.()
      }
    } catch (error) {
      console.error('Error sending follow-up:', error)
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
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-all duration-300">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-sm">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Lead Automation</h3>
              <p className="text-sm text-muted-foreground">
                Control what ReplyFlow is doing with this lead
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-6">
        {/* Lead Status Summary */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
          <h4 className="text-sm font-semibold text-foreground mb-3">Lead Status Summary</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-xs text-muted-foreground">Lead Status</div>
                <div className="text-sm font-medium text-foreground">
                  {allCancelledAfterReply ? 'Customer Replied' : allPaused ? 'Paused' : upcomingJobs.length > 0 ? 'Awaiting Reply' : 'Completed'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-xs text-muted-foreground">Automation</div>
                <div className="text-sm font-medium text-foreground">
                  {hasAnyActiveJobs ? 'Active' : 'Inactive'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-xs text-muted-foreground">Next Follow-Up</div>
                <div className="text-sm font-medium text-foreground">
                  {upcomingJobs.length > 0 ? formatRelativeTime(upcomingJobs[0].scheduled_for) : 'None scheduled'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <div>
                <div className="text-xs text-muted-foreground">Last Activity</div>
                <div className="text-sm font-medium text-foreground">
                  {followUpJobs.length > 0 ? formatRelativeTime(followUpJobs[followUpJobs.length - 1].scheduled_for) : 'No activity'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Follow-Up Status */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Follow-Up Status</h4>
          <div className="space-y-2">
            {followUpJobs.map((job, index) => (
              <div key={job.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/30 rounded-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    job.status === 'sent' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' :
                    job.status === 'pending' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                    job.status === 'paused' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                    'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-300'
                  }`}>
                    {job.status === 'sent' ? '✓' : job.status === 'pending' ? '⏳' : job.status === 'paused' ? '⏸' : '✗'}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {job.step === 1 ? 'Initial Text' : `Follow-Up #${job.step - 1}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {job.status === 'sent' ? `Sent ${formatRelativeTime(job.scheduled_for)}` :
                       job.status === 'pending' ? `Scheduled ${formatRelativeTime(job.scheduled_for)}` :
                       job.status === 'paused' ? 'Paused' : 'Cancelled'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div>
          <h4 className="text-sm font-semibold text-foreground mb-3">Actions</h4>
          <div className="flex flex-wrap gap-2">
            {hasAnyActiveJobs && (
              <button
                onClick={allPaused ? handleResumeAll : handlePauseAll}
                disabled={loading}
                className="px-3 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                  bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300
                  hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2"
              >
                {allPaused ? (
                  <>
                    <Play className="w-4 h-4" />
                    Resume Follow-Ups
                  </>
                ) : (
                  <>
                    <Pause className="w-4 h-4" />
                    Pause Follow-Ups
                  </>
                )}
              </button>
            )}
            
            {upcomingJobs.length > 0 && (
              <button
                onClick={() => handleSendFollowUp(upcomingJobs[0].id)}
                disabled={loading}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                Send Follow-Up Now
              </button>
            )}
            
            <button
              onClick={() => setShowEditSequence(true)}
              className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <Edit3 className="w-4 h-4" />
              Edit Sequence
            </button>
          </div>
        </div>

        {/* Edit Sequence Modal */}
        {showEditSequence && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowEditSequence(false)} />
            
            {/* Modal */}
            <div className="absolute inset-x-4 top-1/2 -translate-y-1/2 max-w-2xl max-h-[80vh] overflow-hidden bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-foreground">Edit Follow-Up Sequence</h3>
                <button
                  onClick={() => setShowEditSequence(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              {/* Content */}
              <div className="p-4 overflow-y-auto max-h-[60vh]">
                <div className="space-y-4">
                  {followUpJobs.map((job, index) => (
                    <div key={job.id} className="border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-foreground">
                          {job.step === 1 ? 'Initial Text' : `Follow-Up #${job.step - 1}`}
                        </h4>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editingSequence[index]?.enabled !== false}
                            onChange={(e) => {
                              const newSequence = [...editingSequence]
                              newSequence[index] = { ...newSequence[index], enabled: e.target.checked }
                              setEditingSequence(newSequence)
                            }}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span>Enable</span>
                        </label>
                      </div>
                      
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">Delay (hours)</label>
                          <input
                            type="number"
                            min="1"
                            placeholder="24"
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-foreground"
                            defaultValue={job.step === 1 ? 0 : (job.step - 1) * 24}
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">Message</label>
                          <textarea
                            rows={3}
                            placeholder="Enter follow-up message..."
                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-foreground resize-none"
                            defaultValue={job.message}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Footer */}
              <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => setShowEditSequence(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    // Save sequence changes for this lead only
                    setShowEditSequence(false)
                    onUpdate?.()
                  }}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
