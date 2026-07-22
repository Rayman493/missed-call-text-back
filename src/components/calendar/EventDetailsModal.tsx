'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Clock, MapPin, FileText, ExternalLink, Trash2, AlertTriangle, Save, Pencil, Link as LinkIcon, User, Briefcase, Send, CheckCircle2 } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import AppointmentSmsModal from '@/components/calendar/AppointmentSmsModal'

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
      if (!isOpen || !event?.id) return
      try {
        const res = await fetch(`/api/meetings/${encodeURIComponent(event.id)}`)
        if (!res.ok) return
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
      } catch {}
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="event-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="bg-card rounded-2xl border border-border/50 shadow-2xl shadow-black/10 dark:shadow-black/30 w-full max-w-md max-h-[90dvh] md:max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
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
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {/* Title */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500 font-medium mb-0.5">Title</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedSummary}
                    onChange={(e) => setEditedSummary(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                ) : (
                  <p className="text-sm text-slate-200">{event.summary}</p>
                )}
              </div>
            </div>

            {/* Date */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500 font-medium mb-0.5">Date</p>
                {isEditing ? (
                  <input
                    type="date"
                    value={editedStartDate}
                    onChange={(e) => setEditedStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                ) : (
                  <p className="text-sm text-slate-200">{formatDate(event.start.dateTime, event.start.date)}</p>
                )}
              </div>
            </div>

            {/* Time */}
            {!isAllDay && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Time</p>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <input
                        type="time"
                        value={editedStartTime}
                        onChange={(e) => setEditedStartTime(e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <span className="text-slate-400 self-center">to</span>
                      <input
                        type="time"
                        value={editedEndTime}
                        onChange={(e) => setEditedEndTime(e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-200">{formatTimeRange()}</p>
                  )}
                </div>
              </div>
            )}

            {/* All Day Toggle */}
            {isEditing && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <div className="flex-1">
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
              </div>
            )}

            {/* Duration */}
            {!isEditing && calculateDuration() && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Duration</p>
                  <p className="text-sm text-slate-200">{calculateDuration()}</p>
                </div>
              </div>
            )}

            {/* Location */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MapPin className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500 font-medium mb-0.5">Location</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editedLocation}
                    onChange={(e) => setEditedLocation(e.target.value)}
                    placeholder="Add location"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                ) : event.location ? (
                  <p className="text-sm text-slate-200 break-words">{event.location}</p>
                ) : (
                  <p className="text-sm text-slate-500 italic">No location</p>
                )}
              </div>
            </div>

            {/* Calendar Source */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium mb-0.5">Calendar</p>
                <p className="text-sm text-slate-200">{event.source === 'holiday' ? 'US Holidays' : 'Google Calendar'}</p>
              </div>
            </div>

            {/* Description */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileText className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500 font-medium mb-0.5">Description</p>
                {isEditing ? (
                  <textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    placeholder="Add description"
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  />
                ) : event.description ? (
                  <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{event.description}</p>
                ) : (
                  <p className="text-sm text-slate-500 italic">No description</p>
                )}
              </div>
            </div>

            {/* Customer (linked) */}
            {(lead?.id || job?.customer_name) && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <User className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Customer</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-200 truncate">{lead?.name || job?.customer_name || 'Customer'}</p>
                    {lead?.id && (
                      <button
                        onClick={(e) => { e.stopPropagation(); (onViewCustomer ? onViewCustomer(lead.id) : window.location.assign(`/dashboard/leads/${lead.id}`)) }}
                        className="flex-shrink-0 text-[11px] px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700"
                      >
                        View Customer
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Job (linked) */}
            {job?.id && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Briefcase className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Job</p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-200 truncate">{job.title || 'Job'}</p>
                    <button
                      onClick={(e) => { e.stopPropagation(); onViewJob?.(job.id) }}
                      className="flex-shrink-0 text-[11px] px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700"
                    >
                      View Job
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Meeting Notes (private) */}
            {!event.isHoliday && (
              <div className="pt-2">
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <FileText className="w-2.5 h-2.5 text-slate-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-500 font-medium mb-1">Meeting Notes</p>
                      {meetingStatus === 'completed' && completedAt ? (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-green-600/20 text-green-300">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Completed {new Date(completedAt).toLocaleString()}
                        </span>
                      ) : (() => {
                        const endRaw = event.end?.dateTime || event.end?.date
                        const isPastDue = endRaw ? new Date(endRaw).getTime() < Date.now() : false
                        return isPastDue ? (
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300">Past due</span>
                        ) : null
                      })()}
                    </div>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={5}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                      placeholder="Private notes for your team. Not sent to customer."
                    />
                    <div className="mt-2">
                      <button onClick={saveNotes} disabled={isNotesSaving} className="px-3 py-1.5 text-xs font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg disabled:opacity-50">
                        {isNotesSaving ? 'Saving...' : 'Save Notes'}
                      </button>
                    </div>
                    {meetingStatus !== 'completed' && (
                      <div className="mt-3">
                        {showCompleteConfirm ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Complete this meeting?</span>
                            <button onClick={() => setShowCompleteConfirm(false)} disabled={isCompleting} className="px-3 py-1.5 text-xs bg-muted text-foreground rounded-lg">Cancel</button>
                            <button onClick={markComplete} disabled={isCompleting} className="px-3 py-1.5 text-xs bg-green-600 hover:bg-green-700 text-white rounded-lg">{isCompleting ? 'Completing...' : 'Confirm Complete'}</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowCompleteConfirm(true)}
                            className="px-3 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] inline-flex items-center gap-2"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Meeting Complete</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* AI Meeting Summary & Transcript (Google Meet only) */}
            {(!event.isHoliday && (event.meetingUrl?.includes('meet.google.com') || transcriptStatus || aiSummary || aiSummaryStructured)) && (
              <div className="pt-2">
                {meetCapability === 'reauthorization_required' && (
                  <div className="mb-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                    <div className="font-medium mb-1">Reconnect Google to enable automatic meeting summaries.</div>
                    <div className="opacity-80 mb-2">Your existing calendar connection will continue working.</div>
                    <a href="/api/google/calendar/connect" className="inline-block px-3 py-1.5 text-xs rounded bg-muted hover:bg-muted/80 text-foreground border border-border/50">Reconnect Google</a>
                  </div>
                )}
                <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/60">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-slate-500 font-medium">AI Meeting Summary</p>
                    {meetCapability === 'available' && (
                      <button
                        disabled={isRetrying}
                        onClick={async () => {
                          if (!event?.id) return
                          setIsRetrying(true)
                          setError(null)
                          try {
                            const r = await fetch(`/api/meetings/${encodeURIComponent(event.id)}/retry-artifacts`, { method: 'POST' })
                            const j = await r.json().catch(() => ({}))
                            if (!r.ok || j?.success === false) {
                              onShowToast?.('Retry not allowed yet (cooldown).', 'warning')
                            } else {
                              if (j && typeof j.status === 'string') {
                                setTranscriptStatus((j.status === 'available' || j.status === 'processed' || j.status === 'pending' || j.status === 'permission_required' || j.status === 'failed') ? j.status : null)
                                setTranscriptError(null)
                              }
                              onShowToast?.('Processing started. Refresh to see updates.', 'info')
                              onRefresh?.()
                            }
                          } catch {
                            onShowToast?.('Retry failed.', 'error')
                          } finally {
                            setIsRetrying(false)
                          }
                        }}
                        className="text-[11px] px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground border border-border/50"
                      >{isRetrying ? 'Retrying…' : 'Retry'}</button>
                    )}
                  </div>
                  {(actualStart || actualEnd) && (
                    <p className="text-[11px] text-slate-400 mb-1">Actual meeting: {actualStart ? new Date(actualStart).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'} – {actualEnd ? new Date(actualEnd).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—'}</p>
                  )}
                  {transcriptStatus === 'pending' && (<p className="text-xs text-slate-400">Processing meeting transcript…</p>)}
                  {transcriptStatus === 'available' && (<p className="text-xs text-slate-400">Transcript retrieved. Preparing AI summary…</p>)}
                  {transcriptStatus === 'unavailable' && (<p className="text-xs text-slate-400">No Google Meet transcript was available for this meeting.</p>)}
                  {transcriptStatus === 'failed' && (<p className="text-xs text-slate-400">Meeting summary could not be processed.</p>)}
                  {aiSummaryStructured ? (
                    <div className="space-y-1.5 text-xs text-slate-300">
                      {aiSummaryStructured.overview && (<p><span className="text-slate-400">Overview:</span> {aiSummaryStructured.overview}</p>)}
                      {Array.isArray(aiSummaryStructured.customerNeeds) && aiSummaryStructured.customerNeeds.length > 0 && (
                        <div><p className="text-slate-400">Customer Needs</p><ul className="list-disc list-inside">{aiSummaryStructured.customerNeeds.map((x: string, i: number) => (<li key={i}>{x}</li>))}</ul></div>
                      )}
                      {Array.isArray(aiSummaryStructured.keyDiscussionPoints) && aiSummaryStructured.keyDiscussionPoints.length > 0 && (
                        <div><p className="text-slate-400">Key Discussion Points</p><ul className="list-disc list-inside">{aiSummaryStructured.keyDiscussionPoints.map((x: string, i: number) => (<li key={i}>{x}</li>))}</ul></div>
                      )}
                      {Array.isArray(aiSummaryStructured.decisions) && aiSummaryStructured.decisions.length > 0 && (
                        <div><p className="text-slate-400">Decisions</p><ul className="list-disc list-inside">{aiSummaryStructured.decisions.map((x: string, i: number) => (<li key={i}>{x}</li>))}</ul></div>
                      )}
                      {Array.isArray(aiSummaryStructured.pricingMentioned) && aiSummaryStructured.pricingMentioned.length > 0 && (
                        <div><p className="text-slate-400">Pricing Mentioned</p><ul className="list-disc list-inside">{aiSummaryStructured.pricingMentioned.map((x: string, i: number) => (<li key={i}>{x}</li>))}</ul></div>
                      )}
                      {Array.isArray(aiSummaryStructured.nextSteps) && aiSummaryStructured.nextSteps.length > 0 && (
                        <div><p className="text-slate-400">Next Steps</p><ul className="list-disc list-inside">{aiSummaryStructured.nextSteps.map((x: string, i: number) => (<li key={i}>{x}</li>))}</ul></div>
                      )}
                      {Array.isArray(aiSummaryStructured.followUpItems) && aiSummaryStructured.followUpItems.length > 0 && (
                        <div><p className="text-slate-400">Follow-Up Items</p><ul className="list-disc list-inside">{aiSummaryStructured.followUpItems.map((x: string, i: number) => (<li key={i}>{x}</li>))}</ul></div>
                      )}
                    </div>
                  ) : aiSummary ? (
                    <p className="text-xs text-slate-300 whitespace-pre-wrap">{aiSummary}</p>
                  ) : null}
                  <div className="mt-2">
                    <button onClick={() => setIsTranscriptOpen((o) => !o)} className="text-[11px] px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200">{isTranscriptOpen ? 'Hide Transcript' : 'View Transcript'}</button>
                  </div>
                  {isTranscriptOpen && (
                    <div className="mt-2 p-2 rounded bg-slate-900/50 border border-slate-700/50 max-h-48 overflow-y-auto">
                      {transcriptLoading ? (
                        <p className="text-slate-400 text-xs">Loading…</p>
                      ) : transcriptError ? (
                        <p className="text-red-400 text-xs">{transcriptError}</p>
                      ) : transcriptText ? (
                        <pre className="text-xs text-slate-200 whitespace-pre-wrap break-words">{transcriptText}</pre>
                      ) : (
                        <button
                          onClick={async () => {
                            if (!event?.id) return
                            setTranscriptLoading(true)
                            setTranscriptError(null)
                            try {
                              const r = await fetch(`/api/meetings/${encodeURIComponent(event.id)}/transcript`)
                              const j = await r.json().catch(() => ({}))
                              if (!r.ok || j?.success === false) {
                                const stat = (j && typeof j.status === 'string') ? j.status : null
                                if (stat === 'pending' || stat == null) {
                                  setTranscriptError('Processing… Please try again later.')
                                } else {
                                  setTranscriptError('Transcript unavailable.')
                                }
                              } else {
                                setTranscriptText(j?.transcript || '')
                              }
                            } catch {
                              setTranscriptError('Failed to load transcript')
                            } finally {
                              setTranscriptLoading(false)
                            }
                          }}
                          className="text-[11px] px-2 py-1 rounded bg-muted hover:bg-muted/80 text-foreground border border-border/50"
                        >Load Transcript</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/50 bg-card flex-shrink-0" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}>
          {/* Status moved to notes area to avoid duplication */}
          {error && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
          
          {showConfirm ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground mb-3">Delete this appointment?</p>
              <p className="text-xs text-muted-foreground mb-3">This will also remove it from Google Calendar.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteCancel}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Appointment</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : isEditing ? (
            <div className="space-y-2">
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
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {(event.meetingUrl || (!event.isHoliday && (lead?.id && (lead.caller_phone || job?.customer_phone)))) && (
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2`}>
                  {event.meetingUrl && (
                    <button
                      onClick={openMeetingLink}
                      className="w-full px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <LinkIcon className="w-4 h-4" />
                      <span>Join Meeting</span>
                    </button>
                  )}
                  {!event.isHoliday && (lead?.id && (lead.caller_phone || job?.customer_phone)) && (
                    <button
                      onClick={() => setIsSmsOpen(true)}
                      className="w-full px-4 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      <span>Send Details by Text</span>
                    </button>
                  )}
                </div>
              )}
              <div>
                <button
                  onClick={openGoogleCalendar}
                  className="w-full px-4 py-2 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 border border-border/50"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>Open in Google Calendar</span>
                </button>
              </div>
              {!event.isHoliday && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    onClick={handleEditClick}
                    className="px-3 py-1.5 text-xs font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-colors flex items-center gap-2"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={handleDeleteClick}
                    className="px-3 py-1.5 text-xs font-medium bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 rounded-lg transition-colors flex items-center gap-2 border border-red-500/30"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              )}
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
    </div>
  )
}

