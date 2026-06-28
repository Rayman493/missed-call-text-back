'use client'

import { useState } from 'react'
import { X, Calendar, Clock, MapPin, FileText, ExternalLink, Trash2, AlertTriangle } from 'lucide-react'
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
}

export default function EventDetailsModal({ isOpen, onClose, event, onDelete }: EventDetailsModalProps) {
  if (!isOpen || !event) return null

  const [isDeleting, setIsDeleting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    
    const formatted = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    
    console.log('[FORMATTER - EVENT DETAILS MODAL]:', {
      input: dateTime,
      inputType: typeof dateTime,
      parsedDate: d.toString(),
      toISOString: d.toISOString(),
      getHours: d.getHours(),
      getUTCHours: d.getUTCHours(),
      getTimezoneOffset: d.getTimezoneOffset(),
      formattedOutput: formatted
    })
    
    return formatted
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="event-title">
      <div className="bg-slate-900 rounded-xl border border-slate-700/60 shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Visually hidden title for accessibility */}
        <h2 id="event-title" className="sr-only">{event.summary}</h2>
        
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${event.isHoliday ? 'bg-emerald-500/10' : 'bg-blue-500/10'}`}>
              <Calendar className={`w-4 h-4 ${event.isHoliday ? 'text-emerald-400' : 'text-blue-400'}`} />
            </div>
            <h2 className="text-base font-semibold text-white tracking-tight truncate">{event.summary}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Event Details */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-4">
            {/* Date */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium mb-0.5">Date</p>
                <p className="text-sm text-slate-200">{formatDate(event.start.dateTime, event.start.date)}</p>
              </div>
            </div>

            {/* Time */}
            {event.start.dateTime && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Time</p>
                  <p className="text-sm text-slate-200">{formatTimeRange()}</p>
                </div>
              </div>
            )}

            {/* Duration */}
            {calculateDuration() && (
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
            {event.location && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MapPin className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Location</p>
                  <p className="text-sm text-slate-200 break-words">{event.location}</p>
                </div>
              </div>
            )}

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
            {event.description && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FileText className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Description</p>
                  <p className="text-sm text-slate-200 whitespace-pre-wrap break-words">{event.description}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-slate-700/60">
          {error && (
            <div className="mb-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{error}</p>
            </div>
          )}
          
          {showConfirm ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-300 mb-3">Are you sure you want to delete this event? This action cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={handleDeleteCancel}
                  disabled={isDeleting}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <span>Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={openGoogleCalendar}
                className="flex-1 px-4 py-2.5 text-sm font-medium bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 border border-slate-700/60"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open in Google Calendar</span>
              </button>
              {!event.isHoliday && (
                <button
                  onClick={handleDeleteClick}
                  className="flex-1 px-4 py-2.5 text-sm font-medium bg-red-600/10 hover:bg-red-600/20 text-red-400 hover:text-red-300 rounded-lg transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 border border-red-500/30"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
