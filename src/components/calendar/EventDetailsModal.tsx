'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Clock, MapPin, FileText, ExternalLink, Trash2, AlertTriangle, Save, Pencil, Link as LinkIcon, User, Briefcase, Send, CheckCircle2, ClipboardList, MessageSquareText, CheckSquare } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import AppointmentSmsModal from '@/components/calendar/AppointmentSmsModal'
import ConfirmModal from '@/components/ui/ConfirmModal'

const supabase = createBrowserClient()

interface EventDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  event: {
    id: string
    summary: string
    description: string | null
    start: { dateTime?: string; date?: string }
    end: { dateTime?: string; date?: string }
    location: string | null
    htmlLink: string | null
    isHoliday?: boolean
    source?: 'primary' | 'holiday'
    meetingUrl?: string | null
    extendedProperties?: any
  }
  onDelete?: () => void
  onRefresh?: () => void
  job?: { id: string; title?: string | null; lead_id?: string | null; customer_name?: string | null; customer_phone?: string | null } | null
  lead?: { id: string; name?: string | null; caller_phone?: string | null } | null
  businessName?: string | null
  onViewCustomer?: (leadId: string) => void
  onViewJob?: (jobId: string) => void
  onShowToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
}

export default function EventDetailsModal({ isOpen, onClose, event, onDelete, onRefresh, job, lead, businessName, onViewCustomer, onViewJob, onShowToast }: EventDetailsModalProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSmsOpen, setIsSmsOpen] = useState(false)
  // Internal meeting metadata
  const [meetingStatus, setMeetingStatus] = useState<'upcoming' | 'completed' | null>(null)
  const [completedAt, setCompletedAt] = useState<string | null>(null)
  const [notes, setNotes] = useState<string>('')
  const [isNotesSaving, setIsNotesSaving] = useState(false)
  const [isNotesOpen, setIsNotesOpen] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false)
  // Meet artifacts & capability
  const [meetCapability, setMeetCapability] = useState<'available' | 'reauthorization_required' | null>(null)
  const [aiSummary, setAiSummary] = useState<string | null>(null)
  const [aiSummaryStructured, setAiSummaryStructured] = useState<any | null>(null)
  const [actualStart, setActualStart] = useState<string | null>(null)
  const [actualEnd, setActualEnd] = useState<string | null>(null)
  const [transcriptStatus, setTranscriptStatus] = useState<string | null>(null)
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false)
  const [transcriptLoading, setTranscriptLoading] = useState(false)
  const [transcriptError, setTranscriptError] = useState<string | null>(null)
  const [transcriptText, setTranscriptText] = useState<string | null>(null)
  const [isRetrying, setIsRetrying] = useState(false)
  useBodyScrollLock(isOpen)
  
  // Editable form state
  const [editedSummary, setEditedSummary] = useState(event.summary)
  const [editedDescription, setEditedDescription] = useState(event.description || '')
  const [editedLocation, setEditedLocation] = useState(event.location || '')
  const [editedStartDate, setEditedStartDate] = useState('')
  const [editedStartTime, setEditedStartTime] = useState('')
  const [editedEndTime, setEditedEndTime] = useState('')
  const [isAllDay, setIsAllDay] = useState(!!event.start.date)

  // Initialize form state when event changes
  useEffect(() => {
    if (event) {
      setEditedSummary(event.summary)
      setEditedDescription(event.description || '')
      setEditedLocation(event.location || '')
      setIsAllDay(!!event.start.date)
      
      if (event.start.dateTime) {
        const start = new Date(event.start.dateTime)
        setEditedStartDate(start.toISOString().split('T')[0])
        setEditedStartTime(start.toTimeString().slice(0, 5))
      } else if (event.start.date) {
        setEditedStartDate(event.start.date)
      }
      
      if (event.end.dateTime) {
        const end = new Date(event.end.dateTime)
        setEditedEndTime(end.toTimeString().slice(0, 5))
      }
    }
  }, [event])

  // Handle Escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      return () => document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen, onClose])

  // Load meeting metadata on open
  useEffect(() => {
    const load = async () => {
      if (!isOpen || !event?.id) {
        return
      }
      try {
        const res = await fetch(`/api/meetings/${encodeURIComponent(event.id)}`)
        if (!res.ok) {
          return
        }
        const data = await res.json().catch(() => ({} as any))
        const rec = data?.record
        if (rec) {
          setMeetingStatus(rec.status === 'completed' ? 'completed' : 'upcoming')
          setCompletedAt(rec.completed_at || null)
          setNotes(rec.notes || '')
          setAiSummary(rec.ai_summary || null)
          setAiSummaryStructured(rec.ai_summary_structured || null)
          setActualStart(rec.actual_start || null)
          setActualEnd(rec.actual_end || null)
          setTranscriptStatus(rec.transcript_status || null)
        } else {
          setMeetingStatus('upcoming')
          setCompletedAt(null)
        }
        const cap = data?.meetCapability === 'available' ? 'available' : (data?.meetCapability === 'reauthorization_required' ? 'reauthorization_required' : null)
        setMeetCapability(cap)
      } catch (e) {
        // Exception during transcript load
      }
    }
    load()
  }, [isOpen, event?.id])

  if (!isOpen || !event) return null

  const formatDate = (dateTime?: string, date?: string) => {
    if (date) {
      const d = new Date(date)
      return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    }
    if (!dateTime) return ''
    const d = new Date(dateTime)
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (dateTime?: string, date?: string) => {
    if (date) return 'All day'
    if (!dateTime) return ''
    const d = new Date(dateTime)
    
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const formatTimeRange = () => {
    if (event.start.date && event.end.date) {
      return 'All day'
    }
    if (event.start.dateTime && event.end.dateTime) {
      const startTime = formatTime(event.start.dateTime)
      const endTime = formatTime(event.end.dateTime)
      return `${startTime} – ${endTime}`
    }
    return ''
  }

  const calculateDuration = () => {
    if (event.start.date && event.end.date) {
      // All-day event
      const start = new Date(event.start.date)
      const end = new Date(event.end.date)
      const diffTime = Math.abs(end.getTime() - start.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      return `${diffDays} day${diffDays > 1 ? 's' : ''}`
    }
    if (event.start.dateTime && event.end.dateTime) {
      const start = new Date(event.start.dateTime)
      const end = new Date(event.end.dateTime)
      const diffTime = Math.abs(end.getTime() - start.getTime())
      const diffMinutes = Math.ceil(diffTime / (1000 * 60))
      const hours = Math.floor(diffMinutes / 60)
      const minutes = diffMinutes % 60
      if (hours === 0) return `${minutes} min`
      if (minutes === 0) return `${hours} hr`
      return `${hours} hr ${minutes} min`
    }
    return ''
  }

  const openGoogleCalendar = () => {
    if (event.htmlLink) {
      window.open(event.htmlLink, '_blank', 'noopener,noreferrer')
    }
  }
  const openMeetingLink = () => {
    if (event.meetingUrl) {
      window.open(event.meetingUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const saveNotes = async () => {
    if (!event?.id) return
    setIsNotesSaving(true)
    try {
      const res = await fetch(`/api/meetings/${encodeURIComponent(event.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, lead_id: lead?.id || undefined, job_id: job?.id || undefined })
      })
      if (!res.ok) throw new Error('Failed to save notes')
      onShowToast?.('Meeting notes saved.', 'success')
    } catch (e: any) {
      setError(e?.message || 'Failed to save notes')
    } finally {
      setIsNotesSaving(false)
    }
  }

  const markComplete = async () => {
    if (!event?.id) return
    setIsCompleting(true)
    try {
      const startStr = event.start?.dateTime || event.start?.date || ''
      const endStr = event.end?.dateTime || event.end?.date || ''
      const res = await fetch(`/api/meetings/${encodeURIComponent(event.id)}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lead_id: lead?.id || undefined, job_id: job?.id || undefined, title: event.summary, scheduled_start: startStr, scheduled_end: endStr })
      })
      if (!res.ok) throw new Error('Failed to mark meeting complete')
      const data = await res.json().catch(() => ({}))
      const rec = data?.record
      setMeetingStatus('completed')
      setCompletedAt(rec?.completed_at || new Date().toISOString())
      setShowCompleteConfirm(false)
      onShowToast?.('Meeting marked complete.', 'success')
      onRefresh?.()
    } catch (e: any) {
      setError(e?.message || 'Failed to mark meeting complete')
    } finally {
      setIsCompleting(false)
    }
  }

  // SMS Draft helpers
  const firstName = (lead?.name || job?.customer_name || '')?.split(' ')[0] || null
  const formatDateTimeForDraft = () => {
    const dateLabel = formatDate(event.start.dateTime, event.start.date)
    const timeLabel = event.start.date ? '' : formatTime(event.start.dateTime)
    return event.start.date ? dateLabel : `${dateLabel} at ${timeLabel}`
  }
  const generateSmsDraft = () => {
    const lines: string[] = []
    const customerName = firstName || lead?.name || job?.customer_name || 'there'
    const biz = businessName || 'your business'
    lines.push(`Hi ${customerName}, your appointment with ${biz} is scheduled for ${formatDateTimeForDraft()}.`)
    if (event.location) {
      lines.push('')
      lines.push(`Location: ${event.location}`)
    }
    if (event.meetingUrl) {
      lines.push('')
      lines.push('Join here:')
      lines.push(event.meetingUrl)
    }
    return lines.join('\n')
  }

  const handleDeleteClick = () => {
    setShowConfirm(true)
    setError(null)
  }

  const handleDeleteConfirm = async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setError('Not authenticated')
        setIsDeleting(false)
        return
      }

      const response = await fetch(`/api/google/calendar/events/${event.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to delete event' }))
        setError(errorData.error || 'Failed to delete event')
        setIsDeleting(false)
        setShowConfirm(false)
        return
      }

      // Success
      setShowConfirm(false)
      setIsDeleting(false)
      onDelete?.()
      onClose()
    } catch (err) {
      setError('Failed to delete event')
      setIsDeleting(false)
      setShowConfirm(false)
    }
  }

  const handleDeleteCancel = () => {
    setShowConfirm(false)
    setError(null)
  }

  const handleEditClick = () => {
    setIsEditing(true)
    setError(null)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    // Reset form to original values
    setEditedSummary(event.summary)
    setEditedDescription(event.description || '')
    setEditedLocation(event.location || '')
    setIsAllDay(!!event.start.date)
    
    if (event.start.dateTime) {
      const start = new Date(event.start.dateTime)
      setEditedStartDate(start.toISOString().split('T')[0])
      setEditedStartTime(start.toTimeString().slice(0, 5))
    } else if (event.start.date) {
      setEditedStartDate(event.start.date)
    }
    
    if (event.end.dateTime) {
      const end = new Date(event.end.dateTime)
      setEditedEndTime(end.toTimeString().slice(0, 5))
    }
    setError(null)
  }

  const handleSaveChanges = async () => {
    setIsSaving(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setError('Not authenticated')
        setIsSaving(false)
        return
      }

      // Build start/end objects for Google Calendar
      let start: any, end: any
      
      if (isAllDay) {
        start = { date: editedStartDate }
        // For all-day events, end date is exclusive (next day)
        const endDate = new Date(editedStartDate)
        endDate.setDate(endDate.getDate() + 1)
        end = { date: endDate.toISOString().split('T')[0] }
      } else {
        const startDateTime = new Date(`${editedStartDate}T${editedStartTime}`)
        const endDateTime = new Date(`${editedStartDate}T${editedEndTime}`)
        
        start = { dateTime: startDateTime.toISOString() }
        end = { dateTime: endDateTime.toISOString() }
      }

      const response = await fetch(`/api/google/calendar/events/${event.id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          summary: editedSummary,
          description: editedDescription || null,
          location: editedLocation || null,
          start,
          end
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to update event' }))
        setError(errorData.error || 'Failed to update event')
        setIsSaving(false)
        return
      }

      // Success
      setIsEditing(false)
      setIsSaving(false)
      onRefresh?.()
      onClose()
    } catch (err) {
      setError('Failed to update event')
      setIsSaving(false)
    }
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden px-4 pt-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200 md:items-center md:p-4" 
      style={{ paddingBottom: 'calc(var(--bottom-nav-height, 80px) + 16px)' }}
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="event-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="bg-card rounded-2xl border border-border/50 shadow-2xl shadow-black/10 dark:shadow-black/30 w-full max-w-md flex max-h-full flex-col overflow-hidden md:max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Visually hidden title for accessibility */}
        <h2 id="event-title" className="sr-only">{event.summary}</h2>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${event.isHoliday ? 'bg-emerald-500/10' : 'bg-primary/10'}`}>
              <Calendar className={`w-4 h-4 ${event.isHoliday ? 'text-emerald-400' : 'text-primary'}`} />
            </div>
            <h2 className="text-base font-semibold text-foreground tracking-tight truncate">{event.summary}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Event Details */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="space-y-3">
            {/* Title */}
            <div>
              {isEditing ? (
                <input
                  type="text"
                  value={editedSummary}
                  onChange={(e) => setEditedSummary(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              ) : (
                <h3 className="text-base font-semibold text-foreground">{event.summary}</h3>
              )}
            </div>

            {/* Compact metadata rows */}
            <div className="space-y-2">
              {/* Date & Time */}
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                {isEditing ? (
                  <div className="flex gap-2 flex-1">
                    <input
                      type="date"
                      value={editedStartDate}
                      onChange={(e) => setEditedStartDate(e.target.value)}
                      className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    {!isAllDay && (
                      <>
                        <input
                          type="time"
                          value={editedStartTime}
                          onChange={(e) => setEditedStartTime(e.target.value)}
                          className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <span className="text-slate-400 self-center">to</span>
                        <input
                          type="time"
                          value={editedEndTime}
                          onChange={(e) => setEditedEndTime(e.target.value)}
                          className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </>
                    )}
                  </div>
                ) : (
                  <span className="text-foreground">{formatDate(event.start.dateTime, event.start.date)}{!isAllDay && ` • ${formatTimeRange()}`}</span>
                )}
              </div>

              {/* All Day Toggle */}
              {isEditing && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isAllDay}
                      onChange={(e) => setIsAllDay(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                    />
                    <span className="text-sm text-slate-200">All day event</span>
                  </label>
                </div>
              )}

              {/* Duration (non-editing only) */}
              {!isEditing && calculateDuration() && (
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground">{calculateDuration()}</span>
                </div>
              )}

              {/* Location */}
              {event.location && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  {isEditing ? (
                    <input
                      type="text"
                      value={editedLocation}
                      onChange={(e) => setEditedLocation(e.target.value)}
                      placeholder="Add location"
                      className="flex-1 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  ) : (
                    <span className="text-foreground break-words">{event.location}</span>
                  )}
                </div>
              )}

              {/* Customer */}
              {(lead?.id || job?.customer_name) && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground">{lead?.name || job?.customer_name || 'Customer'}</span>
                  {lead?.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); (onViewCustomer ? onViewCustomer(lead.id) : window.location.assign(`/dashboard/leads/${lead.id}`)) }}
                      className="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 ml-auto"
                    >
                      View
                    </button>
                  )}
                </div>
              )}

              {/* Job */}
              {job?.id && (
                <div className="flex items-center gap-2 text-sm">
                  <Briefcase className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground">{job.title || 'Job'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewJob?.(job.id) }}
                    className="text-[10px] px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700 ml-auto"
                  >
                    View
                  </button>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center gap-2 text-sm">
                {meetingStatus === 'completed' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                ) : (
                  <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                )}
                <span className="text-foreground">{meetingStatus === 'completed' ? 'Completed' : 'Scheduled'}</span>
                {completedAt && meetingStatus === 'completed' && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {new Date(completedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>

            {/* Description - only show if has content or editing */}
            {(event.description || isEditing) && (
              <div className="pt-3 border-t border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">Description</span>
                </div>
                {isEditing ? (
                  <textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="Add description"
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  />
                ) : (
                  <p className="text-sm text-foreground whitespace-pre-wrap break-words">{event.description}</p>
                )}
              </div>
            )}

            {/* Meeting Notes - collapsible */}
            {!event.isHoliday && (
              <div className="pt-3 border-t border-border/50">
                <button
                  onClick={() => setIsNotesOpen(!isNotesOpen)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="text-xs font-medium text-muted-foreground">Meeting Notes</span>
                  <X className={`w-3 h-3 text-muted-foreground transition-transform ${isNotesOpen ? 'rotate-45' : ''}`} />
                </button>
                {isNotesOpen && (
                  <div className="mt-2">
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                      placeholder="Private notes for your team. Not sent to customer."
                    />
                    <div className="mt-2">
                      <button onClick={saveNotes} disabled={isNotesSaving} className="px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg disabled:opacity-50">
                        {isNotesSaving ? 'Saving...' : 'Save Notes'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* AI Meeting Summary - collapsible, show 1 sentence by default */}
            {(() => {
              const hasAiContent = event.meetingUrl?.includes('meet.google.com') || transcriptStatus || aiSummary || aiSummaryStructured
              return hasAiContent && !event.isHoliday
            })() && (
              <div className="pt-3 border-t border-border/50">
                <button
                  onClick={() => setIsTranscriptOpen(!isTranscriptOpen)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <span className="text-xs font-medium text-muted-foreground">AI Summary</span>
                  <X className={`w-3 h-3 text-muted-foreground transition-transform ${isTranscriptOpen ? 'rotate-45' : ''}`} />
                </button>
                {!isTranscriptOpen && aiSummaryStructured?.overview && (
                  <p className="text-sm text-foreground mt-2 line-clamp-1">{aiSummaryStructured.overview}</p>
                )}
                {!isTranscriptOpen && aiSummary && (
                  <p className="text-sm text-foreground mt-2 line-clamp-1">{aiSummary}</p>
                )}
                {isTranscriptOpen && (
                  <div className="mt-2">
                    {meetCapability === 'reauthorization_required' && (
                      <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                        <div className="font-medium mb-1">Reconnect Google to enable automatic meeting summaries.</div>
                        <div className="opacity-80 mb-2">Your existing calendar connection will continue working.</div>
                        <a href="/api/google/calendar/connect" className="inline-block px-3 py-1.5 text-xs rounded bg-muted hover:bg-muted/80 text-foreground border border-border/50">Reconnect Google</a>
                      </div>
                    )}
                    {/* Summary content */}
                    {aiSummaryStructured ? (
                      <div className="space-y-3 text-xs text-foreground">
                        {aiSummaryStructured.overview && (
                          <div>
                            <div className="font-semibold mb-1">Overview</div>
                            <p className="leading-relaxed">{aiSummaryStructured.overview}</p>
                          </div>
                        )}
                        {Array.isArray(aiSummaryStructured.customerNeeds) && aiSummaryStructured.customerNeeds.length > 0 && (
                          <div>
                            <div className="font-semibold mb-1">Customer Needs</div>
                            <ul className="list-disc list-inside space-y-1 pl-1.5 leading-relaxed">
                              {aiSummaryStructured.customerNeeds.map((x: string, i: number) => (<li key={i}>{x}</li>))}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(aiSummaryStructured.keyDiscussionPoints) && aiSummaryStructured.keyDiscussionPoints.length > 0 && (
                          <div>
                            <div className="font-semibold mb-1">Key Discussion Points</div>
                            <ul className="list-disc list-inside space-y-1 pl-1.5 leading-relaxed">
                              {aiSummaryStructured.keyDiscussionPoints.map((x: string, i: number) => (<li key={i}>{x}</li>))}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(aiSummaryStructured.followUpItems) && aiSummaryStructured.followUpItems.length > 0 && (
                          <div>
                            <div className="font-semibold mb-1">Follow-Up Items</div>
                            <ul className="list-disc list-inside space-y-1 pl-1.5 leading-relaxed">
                              {aiSummaryStructured.followUpItems.map((x: string, i: number) => (<li key={i}>{x}</li>))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ) : aiSummary ? (
                      <p className="text-xs text-foreground whitespace-pre-wrap">{aiSummary}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Summary will be available after the meeting.</p>
                    )}
                    {/* Transcript view button */}
                    {((transcriptStatus === 'available' || transcriptStatus === 'processed') || (transcriptText && transcriptText.trim().length > 0)) && (
                      <button
                        onClick={async () => {
                          if (!transcriptText && event?.id) {
                            setTranscriptLoading(true)
                            setTranscriptError(null)
                            try {
                              const r = await fetch(`/api/meetings/${encodeURIComponent(event.id)}/transcript`)
                              const j = await r.json().catch(() => ({}))
                              if (!r.ok || j?.success === false) {
                                setTranscriptError('Transcript unavailable.')
                              } else {
                                setTranscriptText(j?.transcript || '')
                              }
                            } catch (e) {
                              setTranscriptError('Failed to load transcript')
                            } finally {
                              setTranscriptLoading(false)
                            }
                          }
                        }}
                        className="text-[11px] px-2 py-1 rounded border border-border/50 bg-transparent hover:bg-muted text-foreground mt-3"
                      >
                        {transcriptText ? 'Hide Transcript' : 'View Transcript'}
                      </button>
                    )}
                    {transcriptText && (
                      <div className="mt-2 p-2 rounded bg-slate-900/50 border border-slate-700/50 max-h-48 overflow-y-auto">
                        <pre className="text-xs text-foreground whitespace-pre-wrap break-words">{transcriptText}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Meeting Complete Action */}
            {!event.isHoliday && meetingStatus !== 'completed' && (
              <div className="pt-3 border-t border-border/50">
                <button
                  onClick={() => setShowCompleteConfirm(true)}
                  className="w-full px-3 py-2 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Mark Complete</span>
                </button>
                {showCompleteConfirm && (
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => setShowCompleteConfirm(false)} disabled={isCompleting} className="flex-1 px-3 py-1.5 text-xs bg-muted text-foreground rounded-lg">Cancel</button>
                    <button onClick={markComplete} disabled={isCompleting} className="flex-1 px-3 py-1.5 text-xs bg-green-700 hover:bg-green-800 text-white rounded-lg">{isCompleting ? 'Completing...' : 'Confirm'}</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/50 bg-card flex-shrink-0">
          {error && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
          
          {isEditing ? (
            <div className="flex gap-2">
              <button
                onClick={handleCancelEdit}
                disabled={isSaving}
                className="flex-1 px-4 py-2 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={isSaving}
                className="flex-1 px-4 py-2 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Primary actions */}
              {(event.meetingUrl || (!event.isHoliday && (lead?.id && (lead.caller_phone || job?.customer_phone)))) && (
                <div className="grid grid-cols-2 gap-2">
                  {event.meetingUrl && (
                    <button
                      onClick={openMeetingLink}
                      className="px-3 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Join</span>
                    </button>
                  )}
                  {!event.isHoliday && (lead?.id && (lead.caller_phone || job?.customer_phone)) && (
                    <button
                      onClick={() => setIsSmsOpen(true)}
                      className="px-3 py-2 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <Send className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Text Details</span>
                    </button>
                  )}
                </div>
              )}

              {/* Secondary actions */}
              <div className="flex gap-2">
                <button
                  onClick={openGoogleCalendar}
                  className="flex-1 px-3 py-2 text-xs font-medium bg-slate-800/50 hover:bg-slate-800/70 text-slate-200 rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 border border-slate-700/50"
                >
                  <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Google Calendar</span>
                </button>
                {!event.isHoliday && (
                  <>
                    <button
                      onClick={handleEditClick}
                      className="px-3 py-2 text-xs font-medium text-slate-300 hover:text-slate-200 hover:bg-slate-800/50 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Pencil className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Edit</span>
                    </button>
                    <button
                      onClick={handleDeleteClick}
                      className="px-3 py-2 text-xs font-medium text-red-400 hover:text-red-300 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Delete</span>
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Appointment SMS Modal */}
      <AppointmentSmsModal
        isOpen={isSmsOpen}
        onClose={() => setIsSmsOpen(false)}
        leadId={lead?.id || ''}
        initialMessage={generateSmsDraft()}
        onSent={() => {
          onShowToast?.('Appointment details text sent.', 'success')
        }}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirm}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Delete Appointment"
        description="Are you sure you want to delete this appointment? This will also remove it from Google Calendar."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
        isLoading={isDeleting}
      />
    </div>
  )
}

