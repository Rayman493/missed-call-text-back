'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, Calendar, Clock, MapPin, FileText, AlertTriangle, Plus, Video, Users } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import Modal from '@/components/ui/Modal'
import DatePicker from '@/components/ui/DatePicker'
import TimePicker from '@/components/ui/TimePicker'
import LeadPickerModal from '@/components/jobs/LeadPickerModal'
import AddCustomerModal from '@/components/AddCustomerModal'
import { useModalBackButton } from '@/hooks/useModalBackButton'

const supabase = createBrowserClient()

interface NewAppointmentModalProps {
  isOpen: boolean
  onClose: () => void
  onRefresh?: (created?: { meetingUrl?: string | null; summary?: string | null; customerConfirmation?: { sent: boolean; error?: string | null } }) => void
  onSuccess?: () => void
  defaultDate?: Date
  context?: 'calendar' | 'customer' | 'meetings'
  preselectedLeadId?: string | null
  preselectedLeadDisplay?: string | null
  allowAddCustomer?: boolean
  requireCustomer?: boolean
  lockCustomer?: boolean
}

export default function NewAppointmentModal({ isOpen, onClose, onRefresh, onSuccess, defaultDate, context = 'calendar', preselectedLeadId = null, preselectedLeadDisplay = null, allowAddCustomer, requireCustomer, lockCustomer }: NewAppointmentModalProps) {
  const router = useRouter()
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

  // Derived behavior flags
  const addCustomerAllowed = (allowAddCustomer ?? (context === 'calendar'))
  const isCustomerLocked = (lockCustomer ?? (context === 'customer' && Boolean(preselectedLeadId)))
  const customerLabel = (requireCustomer ?? (context === 'meetings')) ? 'Customer (required)' : 'Customer (optional)'

  // Initialize form with default date
  useEffect(() => {
    if (defaultDate) {
      setDate(defaultDate.toISOString().split('T')[0])
    } else {
      setDate(new Date().toISOString().split('T')[0])
    }
  }, [defaultDate, isOpen])

  // Configure customer preselection and context behavior on open
  useEffect(() => {
    if (!isOpen) return
    // Initialize lead from preselected when provided
    if (preselectedLeadId) {
      setLeadId(preselectedLeadId)
      setLeadDisplay(preselectedLeadDisplay || 'Selected customer')
    } else if (context !== 'calendar') {
      // In customer/meetings context with no preselected, clear lead
      setLeadId(null)
      setLeadDisplay(null)
    }
  }, [isOpen, preselectedLeadId, preselectedLeadDisplay, context])

  // Default Appointment Type based on entry context exactly once per fresh open
  // Prevent overwriting user changes while the modal is already open
  const prevIsOpenRef = useRef(isOpen)
  useEffect(() => {
    const justOpened = !prevIsOpenRef.current && isOpen
    prevIsOpenRef.current = isOpen
    if (!justOpened) return
    setMeetingType(context === 'meetings' ? 'google_meet' : 'in_person')
  }, [isOpen, context])

  // Handle Android back button and browser back to close modal
  useModalBackButton({ isOpen, onClose: () => handleCancel('android_back') })

  // Log close reason for scroll lock diagnostics
  const handleCloseWithReason = (reason: string) => {
    console.log('[NEW_APPOINTMENT_MODAL] Closing modal', {
      reason,
      timestamp: Date.now(),
      pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown'
    })
    // Log scroll state snapshot on close
    if (typeof window !== 'undefined' && typeof (window as any).__logScrollStateSnapshot === 'function') {
      (window as any).__logScrollStateSnapshot(`new_appointment_close_${reason}`)
    }
    onClose()
  }

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

    // Meetings context or explicit requirement: must select a customer
    const mustHaveCustomer = requireCustomer ?? (context === 'meetings')
    if (mustHaveCustomer && !leadId) {
      setError('Please select a customer')
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
      let createdEvent: { meetingUrl?: string | null; summary?: string | null; customerConfirmation?: { sent: boolean; error?: string | null } } | undefined
      try {
        const data = await response.json()
        createdEvent = {
          meetingUrl: data?.event?.meetingUrl || null,
          summary: data?.event?.summary || null,
          customerConfirmation: data?.customerConfirmation
        }
      } catch {}
      setIsCreating(false)
      onRefresh?.(createdEvent)
      onSuccess?.()
      handleCloseWithReason('save')

      // Reset form
      setTitle('')
      setLocation('')
      setDescription('')
      setStartTime('')
      setEndTime('')
      setIsAllDay(false)
      // Preserve preselected in customer context; otherwise clear
      if (lockCustomer || context === 'customer') {
        setLeadId(preselectedLeadId || null)
        setLeadDisplay(preselectedLeadDisplay || (preselectedLeadId ? 'Selected customer' : null))
      } else {
        setLeadId(null)
        setLeadDisplay(null)
      }
      setMeetingType('in_person')
      setCustomMeetingUrl('')
    } catch (err) {
      setError('Failed to create appointment')
      setIsCreating(false)
    }
  }

  const handleCancel = (reason: string = 'cancel') => {
    console.log('[NEW_APPOINTMENT_MODAL] handleCancel called', { reason })
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
    handleCloseWithReason(reason)
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => handleCancel('x_button')}
        onBackdropClose={() => handleCancel('backdrop')}
        title="New Appointment"
        footer={
          <>
            {error && (
              <div className="mb-3">
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-red-400">{error}</p>
                    {error.includes('Google Calendar not connected') && (
                      <button
                        onClick={() => router.push('/dashboard/settings?tab=integrations')}
                        className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 active:scale-[0.98]"
                      >
                        Connect Google Calendar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-3 sm:gap-2">
              <button
                onClick={() => handleCancel('cancel_button')}
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
          </>
        }
      >
        <p className="text-xs text-muted-foreground/70 mb-4">Add something to your calendar without creating a customer job.</p>
        <div className="space-y-4 sm:space-y-4">
            {/* Customer */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <Users className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">{customerLabel}</label>
                {leadId ? (
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 rounded bg-muted text-foreground text-xs">{leadDisplay || 'Selected customer'}</div>
                    {!isCustomerLocked && (
                      <button
                        type="button"
                        onClick={() => { setLeadId(null); setLeadDisplay(null) }}
                        className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 rounded"
                      >Clear</button>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      type="button"
                      onClick={() => setIsLeadPickerOpen(true)}
                      aria-label="Select existing customer"
                      className="px-4 py-2.5 sm:px-3 sm:py-2 bg-muted border border-border rounded-lg text-xs text-foreground hover:bg-muted/80 w-full sm:w-auto text-left sm:text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                    >Select Existing</button>
                    {addCustomerAllowed && (
                      <button
                        type="button"
                        onClick={() => setIsAddCustomerOpen(true)}
                        aria-label="Add new customer"
                        className="px-4 py-2.5 sm:px-3 sm:py-2 bg-muted border border-border rounded-lg text-xs text-foreground hover:bg-muted/80 w-full sm:w-auto text-left sm:text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                      >+ Add New Customer</button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Appointment title"
                  autoCapitalize="sentences"
                  autoComplete="on"
                  spellCheck={true}
                  className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            {/* Date */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <Calendar className="w-2.5 h-2.5 text-muted-foreground" />
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
                <div className="w-5 h-5 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Clock className="w-2.5 h-2.5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Time *</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <TimePicker
                        value={startTime}
                        onChange={setStartTime}
                        placeholder="Start time"
                        required
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">Start</p>
                    </div>
                    <div className="flex-1">
                      <TimePicker
                        value={endTime}
                        onChange={setEndTime}
                        placeholder="Auto 1hr"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">End (optional)</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* All Day Toggle */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <Clock className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAllDay}
                    onChange={(e) => setIsAllDay(e.target.checked)}
                    className="w-4 h-4 rounded border-border bg-background text-blue-600 focus:ring-blue-500 focus:ring-offset-background"
                  />
                  <span className="text-sm text-foreground">All day event</span>
                </label>
              </div>
            </div>

            {/* Meeting Type */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <Video className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Appointment Type</label>
                <div role="radiogroup" aria-label="Appointment Type" className="flex flex-wrap gap-3 text-xs">
                  <label className="inline-flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/60 focus-within:ring-2 focus-within:ring-blue-500">
                    <input className="w-4 h-4" type="radio" name="meetingType" checked={meetingType==='in_person'} onChange={() => setMeetingType('in_person')} />
                    <span>In Person</span>
                  </label>
                  <label className="inline-flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/60 focus-within:ring-2 focus-within:ring-blue-500">
                    <input className="w-4 h-4" type="radio" name="meetingType" checked={meetingType==='google_meet'} onChange={() => setMeetingType('google_meet')} />
                    <span>Google Meet</span>
                  </label>
                  <label className="inline-flex items-center gap-2.5 cursor-pointer py-1.5 px-2 rounded-md hover:bg-muted/60 focus-within:ring-2 focus-within:ring-blue-500">
                    <input className="w-4 h-4" type="radio" name="meetingType" checked={meetingType==='custom'} onChange={() => setMeetingType('custom')} />
                    <span>Other / Custom Virtual</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Location */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <MapPin className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Location (optional)</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Add location"
                  autoCapitalize="sentences"
                  autoComplete="on"
                  spellCheck={true}
                  className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            {/* Custom Meeting URL (only when custom) */}
            {meetingType === 'custom' && (
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Video className="w-2.5 h-2.5 text-muted-foreground" />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Meeting link (optional)</label>
                  <input
                    type="url"
                    value={customMeetingUrl}
                    onChange={(e) => setCustomMeetingUrl(e.target.value)}
                    placeholder="https://zoom.us/... or https://teams.microsoft.com/..."
                    className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
            )}

            {/* Description */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <FileText className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">Notes (optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Add notes"
                  rows={3}
                  autoCapitalize="sentences"
                  autoComplete="on"
                  spellCheck={true}
                  className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                />
              </div>
            </div>
          </div>
      </Modal>

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
    {addCustomerAllowed && (
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
    )}
    </>
  )
}
