'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Briefcase, User, Phone, MapPin, FileText, Calendar, Clock, Plus } from 'lucide-react'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { getCustomerStatusStyle } from '@/lib/customer-status'
import LeadPickerModal from '@/components/jobs/LeadPickerModal'
import AddCustomerModal from '@/components/AddCustomerModal'

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
  { value: 'in_progress', label: getCustomerStatusStyle('active').label },
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

  // Customer selector state
  const [leadId, setLeadId] = useState<string | null>(null)
  const [leadDisplay, setLeadDisplay] = useState<string | null>(null)
  const [isLeadPickerOpen, setIsLeadPickerOpen] = useState(false)
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false)

  const locationInputRef = useRef<HTMLInputElement>(null)

  useBodyScrollLock(isOpen)

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
      setScheduledDate(prefill?.scheduled_date || (defaultDate ? defaultDate.toISOString().split('T')[0] : ''))
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
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-[60] flex sm:items-center sm:justify-center justify-end bg-black/40 backdrop-blur-md animate-in fade-in duration-200"
        style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}
        role="dialog"
        aria-modal="true"
        onClick={onClose}
        data-scroll-lock-allow
      >
        <div className="bg-card rounded-t-xl sm:rounded-xl border border-border/30 shadow-xl shadow-black/8 dark:shadow-black/20 w-full max-w-lg max-h-[calc(85dvh-var(--bottom-nav-height,80px)-32px-env(safe-area-inset-top))] sm:max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 sm:duration-200 mx-auto sm:my-4"
             data-scroll-lock-allow>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 sm:px-4 sm:py-3 border-b border-border/30 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10">
                <Briefcase className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-foreground tracking-tight">
                  {editJob ? 'Edit Job' : 'New Job'}
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-md transition-colors"
              aria-label="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 sm:px-4 sm:py-3 overscroll-contain space-y-4" data-scroll-lock-allow style={{ WebkitOverflowScrolling: 'touch' }}>
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
                className="w-full px-4 py-2.5 sm:px-3 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>

            {/* Customer */}
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-2.5 h-2.5 text-muted-foreground" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                  Customer <span className="text-red-500">*</span>
                </label>
                {leadId ? (
                  <div className="flex items-center gap-2">
                    <div className="px-2 py-1 rounded bg-muted text-foreground text-xs">{leadDisplay || 'Selected customer'}</div>
                    {!editJob && (
                      <button
                        type="button"
                        onClick={() => { setLeadId(null); setLeadDisplay(null); setCustomerName(''); setCustomerPhone(''); setServiceAddress(''); }}
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
                    <button
                      type="button"
                      onClick={() => setIsAddCustomerOpen(true)}
                      aria-label="Add new customer"
                      className="px-4 py-2.5 sm:px-3 sm:py-2 bg-muted border border-border rounded-lg text-xs text-foreground hover:bg-muted/80 w-full sm:w-auto text-left sm:text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      Add New Customer
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Customer Name + Phone (read-only when customer selected) */}
            {leadId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                    Customer Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={customerName}
                      readOnly
                      className="w-full pl-8 pr-3 py-2.5 sm:py-2 text-sm bg-muted border border-border rounded-lg text-foreground"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                    Phone
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="tel"
                      value={customerPhone}
                      readOnly
                      className="w-full pl-8 pr-3 py-2.5 sm:py-2 text-sm bg-muted border border-border rounded-lg text-foreground"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Service Address */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                Service Address
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  ref={locationInputRef}
                  value={serviceAddress}
                  onChange={e => setServiceAddress(e.target.value)}
                  placeholder="123 Main St, City, State"
                  className="w-full pl-8 pr-3 py-2.5 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            {/* Customer Preference Context */}
            {(prefill?.requested_completion_label || prefill?.callback_preference_label) && (
              <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
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
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                  Date
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="date"
                    value={scheduledDate}
                    onChange={e => setScheduledDate(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                  Time
                </label>
                <div className="relative">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="time"
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                    className="w-full pl-8 pr-3 py-2.5 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              Optional. Add a date and time to place this job on your schedule.
            </p>

            {/* Status */}
            <div>
              <label className="text-xs text-muted-foreground font-medium mb-1.5 block">
                Status
              </label>
              <div className="flex gap-2 flex-wrap">
                {STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setStatus(opt.value)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
                      status === opt.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted text-foreground border-border hover:bg-muted/80'
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
              <div className="relative">
                <FileText className="absolute left-3 top-3 w-3.5 h-3.5 text-muted-foreground" />
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Any additional notes about this job..."
                  data-scroll-lock-allow
                  className="w-full max-h-40 overflow-y-auto overscroll-contain pl-8 pr-3 py-2.5 sm:py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-y"
                  style={{ WebkitOverflowScrolling: 'touch' }}
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-5 py-4 sm:px-4 sm:py-3 border-t border-border/30 bg-card shrink-0" style={{ paddingBottom: 'max(16px, calc(16px + env(safe-area-inset-bottom)))' }}>
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
            setCustomerName(prefill.customer_name || '')
            setCustomerPhone(prefill.customer_phone || '')
            setServiceAddress(prefill.service_address || '')
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
