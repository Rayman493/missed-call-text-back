'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Briefcase, Plus } from 'lucide-react'
import Modal from '@/components/ui/Modal'
import DatePicker from '@/components/ui/DatePicker'
import TimePicker from '@/components/ui/TimePicker'
import { getCustomerStatusStyle } from '@/lib/customer-status'
import SearchableCustomerSelect, { Customer } from '@/components/customers/SearchableCustomerSelect'
import AddCustomerModal from '@/components/AddCustomerModal'
import JobTimer from '@/components/jobs/JobTimer'
import { firstNonPlaceholder, normalizeEditableContext, getCustomerDisplayName } from '@/components/payments/customer-search-helpers'
import { getLeadAIIntake, getLeadRequestTitle } from '@/lib/ai-field-mapping'
import { useModalBackButton } from '@/hooks/useModalBackButton'
import { useBusiness } from '@/contexts/BusinessContext'
import { getDateInputValueInTimeZone } from '@/lib/business-date-utils'

export type JobStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled'

export interface JobPrefill {
  customer_name?: string
  customer_phone?: string
  service_address?: string
  title?: string
  notes?: string
  lead_id?: string
  conversation_id?: string
  scheduled_date?: string
  scheduled_time?: string
  requested_completion_label?: string
  callback_preference_label?: string
  prefillCustomer?: Customer | null // Full customer object for selector hydration
}

export interface Job {
  id: string
  title: string
  customer_name: string | null
  customer_phone: string | null
  service_address: string | null
  notes: string | null
  scheduled_date: string | null
  scheduled_time: string | null
  status: JobStatus
  lead_id: string | null
  conversation_id: string | null
  source: 'manual' | 'replyflow'
  payment_status: 'none' | 'requested' | 'paid'
  confirmation_sms_sent_at: string | null
  confirmation_sms_message_sid: string | null
  google_calendar_event_id: string | null
  calendar_sync_status: 'pending' | 'synced' | 'failed' | 'not_required' | null
  calendar_sync_error: string | null
  calendar_last_sync_attempt_at: string | null
  calendar_last_synced_at: string | null
  created_at: string
  updated_at: string
  time_summary?: {
    completed_ms: number
    has_active_timer: boolean
  }
}

interface JobComposerProps {
  isOpen: boolean
  onClose: () => void
  onSave: (job: Job) => void
  prefill?: JobPrefill
  editJob?: Job
  defaultDate?: Date | null
  initialFocus?: 'location'
  onShowToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
}

const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'scheduled', label: getCustomerStatusStyle('scheduled').label },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'completed', label: getCustomerStatusStyle('completed').label },
  { value: 'cancelled', label: getCustomerStatusStyle('lost').label },
]

export default function JobComposer({
  isOpen,
  onClose,
  onSave,
  prefill,
  editJob,
  defaultDate,
  initialFocus,
  onShowToast,
}: JobComposerProps) {
  const [title, setTitle] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [serviceAddress, setServiceAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [scheduledDate, setScheduledDate] = useState('')
  const [scheduledTime, setScheduledTime] = useState('')
  const [status, setStatus] = useState<JobStatus>('scheduled')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const saveInFlightRef = useRef(false)

  // Customer selector state
  const [leadId, setLeadId] = useState<string | null>(null)
  const [leadDisplay, setLeadDisplay] = useState<string | null>(null)

  // Inline Add Customer modal state
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false)
  const [newlyCreatedCustomer, setNewlyCreatedCustomer] = useState<Customer | null>(null)

  const locationInputRef = useRef<HTMLInputElement>(null)

  const { business } = useBusiness()
  const timezone = business?.business_hours_timezone

  useModalBackButton({ isOpen, onClose })

  // Handle customer selection - populate form fields from customer data.
  // Service Address, Job Title, and Notes are only prefilled when the user has
  // not already entered a value, so explicit user input is never overwritten by
  // customer metadata. Customer Name and Phone are identity fields and are
  // always refreshed from the selected customer.
  const handleCustomerSelect = (customer: Customer | null) => {
    if (customer) {
      setLeadDisplay(getCustomerDisplayName(customer) || 'Customer')
      // Extract canonical AI intake fields from raw_metadata
      const intake = getLeadAIIntake(customer)
      const metadata = customer.raw_metadata || {}
      setCustomerName(firstNonPlaceholder(intake.customerName, metadata.customerName, metadata.callerName, customer.name) || '')
      setCustomerPhone(firstNonPlaceholder(intake.customerPhone, metadata.customerPhone, customer.caller_phone) || '')
      // Only prefill Service Address if the user hasn't already typed one
      setServiceAddress(prev => {
        if (prev && prev.trim()) return prev
        return normalizeEditableContext(intake.serviceAddress || metadata.serviceAddress) || ''
      })
      // Only prefill Job Title if the user hasn't already typed one
      // Uses canonical request title (filters out conversational filler)
      setTitle(prev => {
        if (prev && prev.trim()) return prev
        const canonicalTitle = getLeadRequestTitle(customer)
        return canonicalTitle || ''
      })
      // Only prefill Notes if the user hasn't already typed any
      // Uses canonical additional details (not callback time or desired completion)
      setNotes(prev => {
        if (prev && prev.trim()) return prev
        return normalizeEditableContext(intake.additionalDetails) || ''
      })
    } else {
      setLeadDisplay(null)
      setCustomerName('')
      setCustomerPhone('')
      setServiceAddress('')
      // Do not clear title/notes on customer deselect — user may have typed them
    }
  }

  // Handle successful customer creation from inline Add Customer modal
  const handleLeadCreated = (leadId: string, leadData?: any) => {
    // Build a Customer object from the returned lead data
    const newCustomer: Customer = {
      id: leadId,
      name: leadData?.raw_metadata?.customerName || leadData?.raw_metadata?.callerName || leadData?.name || null,
      caller_phone: leadData?.caller_phone || leadData?.raw_metadata?.customerPhone || null,
      raw_metadata: leadData?.raw_metadata || null,
    }
    // Hydrate the selector with the new customer so it appears immediately
    setNewlyCreatedCustomer(newCustomer)
    // Auto-select the new customer
    setLeadId(leadId)
    handleCustomerSelect(newCustomer)
  }

  // Autofocus location input when initialFocus is 'location'
  useEffect(() => {
    if (isOpen && initialFocus === 'location' && locationInputRef.current) {
      // Small delay to ensure the modal is fully rendered
      setTimeout(() => {
        locationInputRef.current?.focus()
        locationInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [isOpen, initialFocus])

  useEffect(() => {
    if (!isOpen) return
    setError('')

    if (editJob) {
      setTitle(editJob.title)
      setCustomerName(editJob.customer_name || '')
      setCustomerPhone(editJob.customer_phone || '')
      setServiceAddress(editJob.service_address || '')
      setNotes(editJob.notes || '')
      setScheduledDate(editJob.scheduled_date || '')
      setScheduledTime(editJob.scheduled_time?.slice(0, 5) || '')
      setStatus(editJob.status)
      setLeadId(editJob.lead_id || null)
      setLeadDisplay(editJob.customer_name || editJob.service_address || 'Customer')
    } else {
      setTitle(prefill?.title || '')
      setCustomerName(prefill?.customer_name || '')
      setCustomerPhone(prefill?.customer_phone || '')
      setServiceAddress(prefill?.service_address || '')
      setNotes(prefill?.notes || '')
      setScheduledDate(prefill?.scheduled_date || (defaultDate ? getDateInputValueInTimeZone(defaultDate, timezone) : ''))
      setScheduledTime(prefill?.scheduled_time || '')
      setStatus('scheduled')
      setLeadId(prefill?.lead_id || null)
      setLeadDisplay(prefill?.customer_name || prefill?.service_address || null)
    }
  }, [isOpen, editJob, prefill, defaultDate])

  if (!isOpen) return null

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Job title is required')
      return
    }
    
    // Require lead_id for new jobs (not edits)
    if (!editJob && !leadId) {
      setError('Please select a customer to create this job')
      return
    }
    
    if (saveInFlightRef.current) return
    saveInFlightRef.current = true
    setError('')
    setIsSaving(true)
    try {
      const body: Record<string, any> = {
        title: title.trim(),
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        service_address: serviceAddress.trim() || null,
        notes: notes.trim() || null,
        scheduled_date: scheduledDate || null,
        scheduled_time: scheduledTime || null,
        status,
        source: leadId ? 'replyflow' : 'manual',
        lead_id: leadId || editJob?.lead_id || null,
        conversation_id: prefill?.conversation_id || editJob?.conversation_id || null,
      }

      const url = editJob ? `/api/jobs/${editJob.id}` : '/api/jobs'
      const method = editJob ? 'PATCH' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to save job')
      }

      const data = await response.json()
      onSave(data.job)
      onShowToast?.(editJob ? 'Job updated' : 'Job created', 'success')
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save job')
    } finally {
      setIsSaving(false)
      saveInFlightRef.current = false
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={editJob ? 'Edit Job' : 'New Job'}
        footer={
          <>
            <button
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2.5 text-sm font-medium bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg transition-all duration-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>{editJob ? 'Save Changes' : 'Create Job'}</span>
                </>
              )}
            </button>
          </>
        }
      >
        <div className="space-y-4">
            {/* Source badge for ReplyFlow-linked jobs */}
            {(prefill?.lead_id || editJob?.lead_id) && (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">
                  Created from a ReplyFlow customer
                </span>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                Job Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Tree removal, Roof repair, AC installation"
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60"
              />
            </div>

            {/* Customer */}
            <div>
              <SearchableCustomerSelect
                value={leadId}
                onChange={setLeadId}
                onCustomerSelect={handleCustomerSelect}
                label="Customer"
                required={!editJob}
                allowClear={!editJob}
                placeholder="Search or select a customer..."
                prefillCustomer={newlyCreatedCustomer || prefill?.prefillCustomer}
                onAddCustomerClick={!editJob ? () => setIsAddCustomerOpen(true) : undefined}
              />
            </div>

            {/* Customer Phone (read-only when linked customer selected; name shown in picker) */}
            {leadId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    readOnly
                    className="w-full px-4 py-2.5 sm:px-3 sm:py-2 text-sm bg-muted border border-border rounded-lg text-foreground"
                  />
                </div>
              </div>
            )}

            {/* Service Address */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                Service Address
              </label>
              <input
                type="text"
                ref={locationInputRef}
                value={serviceAddress}
                onChange={e => setServiceAddress(e.target.value)}
                placeholder="123 Main St, City, State"
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60"
              />
            </div>

            {/* Customer Preference Context */}
            {(prefill?.requested_completion_label || prefill?.callback_preference_label) && (
              <div className="bg-muted/30 dark:bg-slate-800/60 rounded-lg border border-border/40 dark:border-border/30 p-3">
                <p className="text-[10px] font-medium text-slate-600 dark:text-slate-400 mb-2 uppercase tracking-wider">
                  Customer preference
                </p>
                {prefill?.requested_completion_label && (
                  <div className="mb-1.5 last:mb-0">
                    <p className="text-[10px] text-slate-500 dark:text-slate-500 mb-0.5">Requested completion</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{prefill.requested_completion_label}</p>
                  </div>
                )}
                {prefill?.callback_preference_label && (
                  <div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-500 mb-0.5">Preferred callback</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300">{prefill.callback_preference_label}</p>
                  </div>
                )}
              </div>
            )}

            {/* Date + Time */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DatePicker
                value={scheduledDate}
                onChange={setScheduledDate}
                label="Date"
              />
              <TimePicker
                value={scheduledTime}
                onChange={setScheduledTime}
                label="Time"
              />
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              Optional. Add a date and time to place this job on your schedule.
            </p>

            {/* Status */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                Status
              </label>
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-200 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                      status === opt.value
                        ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                        : 'bg-background text-foreground border-border hover:border-border/80 hover:bg-muted/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional notes about this job..."
                className="w-full max-h-40 overflow-y-auto overscroll-contain px-4 py-2.5 sm:px-3 sm:py-2 bg-muted/30 dark:bg-slate-900/55 border border-border/50 dark:border-slate-700/60 rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/60 resize-y"
                style={{ WebkitOverflowScrolling: 'touch' }}
              />
            </div>

            {/* Time Tracking — only in edit mode (requires persisted job.id) */}
            {editJob && (
              <JobTimer jobId={editJob.id} />
            )}

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
        </div>
      </Modal>

      {/* Inline Add Customer modal — reuses canonical AddCustomerModal */}
      <AddCustomerModal
        isOpen={isAddCustomerOpen}
        onClose={() => setIsAddCustomerOpen(false)}
        onLeadCreated={handleLeadCreated}
      />
    </>
  )
}
