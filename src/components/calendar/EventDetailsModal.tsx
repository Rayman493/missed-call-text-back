'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Clock, MapPin, FileText, ExternalLink, Trash2, AlertTriangle, Save, Pencil } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'

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
  }
  onDelete?: () => void
  onRefresh?: () => void
}

export default function EventDetailsModal({ isOpen, onClose, event, onDelete, onRefresh }: EventDetailsModalProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
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
      <div className="bg-card rounded-2xl border border-border/50 shadow-2xl shadow-black/10 dark:shadow-black/30 w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Visually hidden title for accessibility */}
        <h2 id="event-title" className="sr-only">{event.summary}</h2>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
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
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border/50">
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
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveChanges}
                  disabled={isSaving}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            <div className="flex gap-2">
              <button
                onClick={openGoogleCalendar}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 border border-border/50"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open in Google Calendar</span>
              </button>
              {!event.isHoliday && (
                <>
                  <button
                    onClick={handleEditClick}
                    className="flex-1 px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                  >
                    <Pencil className="w-4 h-4" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={handleDeleteClick}
                    className="px-4 py-2.5 text-sm font-medium bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 border border-red-500/30"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
