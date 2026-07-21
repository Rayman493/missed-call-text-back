'use client'

import { useState, useEffect } from 'react'
import { X, Calendar, Clock, MapPin, FileText, AlertTriangle, Plus, Video, Users } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import DatePicker from '@/components/ui/DatePicker'
import TimePicker from '@/components/ui/TimePicker'
import LeadPickerModal from '@/components/jobs/LeadPickerModal'
import AddCustomerModal from '@/components/AddCustomerModal'

const supabase = createBrowserClient()

interface NewAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  onRefresh?: () => void
  defaultDate?: Date
}

export default function NewAppointmentModal({ isOpen, onClose, onRefresh, defaultDate }: NewAppointmentModalProps) {
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Form state
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [isAllDay, setIsAllDay] = useState(false)
  // Customer linking (optional)
  const [leadId, setLeadId] = useState<string | null>(null)
  const [leadDisplay, setLeadDisplay] = useState<string | null>(null)
  const [isLeadPickerOpen, setIsLeadPickerOpen] = useState(false)
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false)

  // Meeting type
  const [meetingType, setMeetingType] = useState<'in_person' | 'google_meet' | 'custom'>('in_person')
  const [customMeetingUrl, setCustomMeetingUrl] = useState('')

  // Initialize form with default date
  useEffect(() => {
    if (defaultDate) {
      setDate(defaultDate.toISOString().split('T')[0])
    } else {
      setDate(new Date().toISOString().split('T')[0])
    }
  }, [defaultDate, isOpen])

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

  // Lock background scroll while open
  useBodyScrollLock(isOpen)

  // Intercept Android Back / browser Back to close modal first
  useEffect(() => {
    if (!isOpen) return

    try {
      window.history.pushState({ rfNewAppointment: true }, '')
    } catch {}

    const onPopState = () => onClose()
    window.addEventListener('popstate', onPopState)

    let capListener: { remove: () => void } | undefined
    ;(async () => {
      try {
        const mod = await import('@capacitor/app')
        const { App } = mod as any
        capListener = await App.addListener('backButton', () => onClose())
      } catch {}
    })()

    return () => {
      window.removeEventListener('popstate', onPopState)
      capListener?.remove?.()
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleCreate = async () => {
    // Validation
    if (!title.trim()) {
      setError('Title is required')
      return
    }
    if (!date) {
      setError('Date is required')
      return
    }
    if (!isAllDay && !startTime) {
      setError('Start time is required for timed events')
      return
    }

    // Validate end time is after start time if both provided
    if (!isAllDay && startTime && endTime) {
      const [startHours, startMinutes] = startTime.split(':').map(Number)
      const [endHours, endMinutes] = endTime.split(':').map(Number)
      const startTotalMinutes = startHours * 60 + startMinutes
      const endTotalMinutes = endHours * 60 + endMinutes
      if (endTotalMinutes <= startTotalMinutes) {
        setError('End time must be after start time')
        return
      }
    }

    setIsCreating(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      if (!token) {
        setError('Not authenticated')
        setIsCreating(false)
        return
      }

      // Calculate end time if not provided (default 1 hour)
      let finalEndTime = endTime
      if (!isAllDay && !endTime && startTime) {
        const [hours, minutes] = startTime.split(':').map(Number)
        const startDate = new Date()
        startDate.setHours(hours, minutes, 0, 0)
        const endDate = new Date(startDate.getTime() + 60 * 60 * 1000) // Add 1 hour
        finalEndTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`
      }

      const response = await fetch('/api/google/calendar/create-event', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: title.trim(),
          date,
          endDate: date, // Single day event
          startTime: isAllDay ? undefined : startTime,
          endTime: isAllDay ? undefined : finalEndTime,
          allDay: isAllDay,
          description: description.trim() || undefined,
          location: location.trim() || undefined,
          eventType: 'standalone',
          meeting_type: meetingType === 'in_person' ? undefined : meetingType === 'google_meet' ? 'google_meet' : 'custom',
          custom_meeting_url: meetingType === 'custom' && customMeetingUrl.trim() ? customMeetingUrl.trim() : undefined,
          lead_id: leadId || undefined,
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to create appointment' }))
        setError(errorData.error || 'Failed to create appointment')
        setIsCreating(false)
        return
      }

      // Success
      setIsCreating(false)
      onRefresh?.()
      onClose()
      
      // Reset form
      setTitle('')
      setLocation('')
      setDescription('')
      setStartTime('')
      setEndTime('')
      setIsAllDay(false)
      setLeadId(null)
      setLeadDisplay(null)
      setMeetingType('in_person')
      setCustomMeetingUrl('')
    } catch (err) {
      setError('Failed to create appointment')
      setIsCreating(false)
    }
  }

  const handleCancel = () => {
    setError(null)
    // Reset form on cancel to avoid stale state on reopen
    setTitle('')
    setLocation('')
    setDescription('')
    setStartTime('')
    setEndTime('')
    setIsAllDay(false)
    setLeadId(null)
    setLeadDisplay(null)
    setMeetingType('in_person')
    setCustomMeetingUrl('')
    onClose()
  }

  return (
    <>
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="appointment-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleCancel()
        }
      }}
    >
      <div className="bg-card rounded-2xl border border-border/50 shadow-2xl shadow-black/10 dark:shadow-black/30 w-full max-w-md max-h-[calc(100dvh-2rem)] md:max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
              <Plus className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h2 id="appointment-title" className="text-base font-semibold text-foreground tracking-tight">New Appointment</h2>
              <p className="text-xs text-slate-400 dark:text-slate-500">Add something to your calendar without creating a customer job.</p>
            </div>
          </div>
          <button
            onClick={handleCancel}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <div data-scroll-lock-allow className="flex-1 min-h-0 overflow-y-auto px-5 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="space-y-4">
            {/* Customer (optional) */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Users className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 font-medium mb-1.5 block">Customer (optional)</label>
                {leadId ? (
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 rounded bg-slate-800 text-slate-200 text-xs">{leadDisplay || 'Selected customer'}</div>
                    <button
                      type="button"
                      onClick={() => { setLeadId(null); setLeadDisplay(null) }}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >Clear</button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsLeadPickerOpen(true)}
                      className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white hover:bg-slate-700"
                    >Select Existing</button>
                    <button
                      type="button"
                      onClick={() => setIsAddCustomerOpen(true)}
                      className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white hover:bg-slate-700"
                    >+ Add New Customer</button>
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 font-medium mb-1.5 block">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Appointment title"
                  autoCapitalize="sentences"
                  autoComplete="on"
                  spellCheck={true}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            {/* Date */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <DatePicker
                  value={date}
                  onChange={setDate}
                  placeholder="Select date"
                  required
                />
              </div>
            </div>

            {/* Time */}
            {!isAllDay && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 font-medium mb-1.5 block">Time *</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <TimePicker
                        value={startTime}
                        onChange={setStartTime}
                        placeholder="Start time"
                        required
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Start</p>
                    </div>
                    <div className="flex-1">
                      <TimePicker
                        value={endTime}
                        onChange={setEndTime}
                        placeholder="Auto 1hr"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">End (optional)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* All Day Toggle */}
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

            {/* Meeting Type */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Video className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 font-medium mb-1.5 block">Appointment Type</label>
                <div className="flex flex-wrap gap-3 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="meetingType" checked={meetingType==='in_person'} onChange={() => setMeetingType('in_person')} />
                    In Person
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="meetingType" checked={meetingType==='google_meet'} onChange={() => setMeetingType('google_meet')} />
                    Google Meet
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="meetingType" checked={meetingType==='custom'} onChange={() => setMeetingType('custom')} />
                    Other / Custom Virtual
                  </label>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <MapPin className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 font-medium mb-1.5 block">Location (optional)</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Add location"
                  autoCapitalize="sentences"
                  autoComplete="on"
                  spellCheck={true}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            {/* Custom Meeting URL (only when custom) */}
            {meetingType === 'custom' && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Video className="w-2.5 h-2.5 text-slate-400" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-slate-500 font-medium mb-1.5 block">Meeting link (optional)</label>
                  <input
                    type="url"
                    value={customMeetingUrl}
                    onChange={(e) => setCustomMeetingUrl(e.target.value)}
                    placeholder="https://zoom.us/... or https://teams.microsoft.com/..."
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
            )}

            {/* Description */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileText className="w-2.5 h-2.5 text-slate-400" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-slate-500 font-medium mb-1.5 block">Notes (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add notes"
                  rows={3}
                  autoCapitalize="sentences"
                  autoComplete="on"
                  spellCheck={true}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                />
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
          
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              disabled={isCreating}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating}
              className="flex-1 px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isCreating ? (
                <>
                  <div className="w-3 h-3 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Create Appointment</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>

    {/* Customer selectors */}
    <LeadPickerModal
      isOpen={isLeadPickerOpen}
      onClose={() => setIsLeadPickerOpen(false)}
      onSelect={(prefill) => {
        setIsLeadPickerOpen(false)
        if (prefill.lead_id) {
          setLeadId(prefill.lead_id)
          setLeadDisplay(prefill.customer_name || prefill.service_address || 'Customer')
        }
      }}
      title="Select Customer"
      subtitle="Search your customers"
    />
    <AddCustomerModal
      isOpen={isAddCustomerOpen}
      onClose={() => setIsAddCustomerOpen(false)}
      returnTo="calendar"
      onLeadCreated={(newLeadId) => {
        setIsAddCustomerOpen(false)
        if (newLeadId) {
          setLeadId(newLeadId)
          setLeadDisplay('New Customer')
        }
      }}
    />
    </>
  )
}
