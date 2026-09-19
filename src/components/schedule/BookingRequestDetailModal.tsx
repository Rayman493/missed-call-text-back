'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BookingRequestEvent, BookingRequestStatus, BookingSlot } from '@/lib/booking/types'
import { CalendarDays, Check, ChevronDown, Clock, ExternalLink, MapPin, Phone, RefreshCw, X } from 'lucide-react'
import { showToast } from '@/lib/toast'
import { formatInTimeZone } from 'date-fns-tz'

interface BookingDetail {
  id: string
  status: BookingRequestStatus
  customer_name: string
  customer_phone: string
  customer_email: string | null
  customer_address: string | null
  service: string | null
  notes: string | null
  requested_start: string
  requested_end: string
  current_proposed_start: string | null
  current_proposed_end: string | null
  timezone: string
  lead_id: string | null
  appointment_id: string | null
  job_id: string | null
  events: BookingRequestEvent[]
}

type BusyAction = 'accept' | 'reject' | 'propose' | 'create_appointment' | 'create_job' | 'resend-proposal' | null

const STATUS_LABEL: Record<BookingRequestStatus, string> = {
  pending: 'New request',
  business_proposed: 'New time suggested',
  customer_reselected: 'Customer picked another time',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

const EVENT_LABEL: Partial<Record<BookingRequestEvent['event_type'], string>> = {
  created: 'Requested',
  time_selected: 'Customer picked another time',
  time_proposed: 'New time suggested',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Request expired',
  lead_linked: 'Customer created',
  appointment_created: 'Appointment created',
  job_created: 'Job created',
  sms_sent: 'Text sent to customer',
  sms_failed: 'Text failed to send',
}

function eventActorLabel(actor: BookingRequestEvent['actor']): string {
  if (actor === 'business') return ' (business)'
  if (actor === 'customer') return ' (customer)'
  return ''
}

export default function BookingRequestDetailModal({
  requestId,
  onClose,
  onRefresh,
}: {
  requestId: string
  onClose: () => void
  onRefresh?: () => void
}) {
  const router = useRouter()
  const [detail, setDetail] = useState<BookingDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<BusyAction>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [slots, setSlots] = useState<BookingSlot[] | null>(null)
  const [slotTz, setSlotTz] = useState<string>('UTC')
  const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null)
  const [showAllHistory, setShowAllHistory] = useState(false)
  const [smsError, setSmsError] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/booking/requests/${requestId}`, { cache: 'no-store' })
    if (!res.ok) {
      setLoading(false)
      return
    }
    setDetail(await res.json())
    setLoading(false)
  }, [requestId])

  useEffect(() => { load() }, [load])

  const refresh = useCallback(() => {
    onRefresh?.()
    load()
  }, [onRefresh, load])

  const runAction = useCallback(
    async (action: Exclude<BusyAction, null>, body?: Record<string, unknown>) => {
      setBusy(action)
      setActionError(null)
      setSmsError(false)
      try {
        const res = await fetch(`/api/booking/requests/${requestId}/action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...body }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setActionError(json.error || 'Something went wrong')
          if (json.code === 'slot_unavailable' || json.code === 'availability_unavailable') {
            refresh()
          }
          return
        }
        if (json.smsSent === false) {
          const isReject = action === 'reject'
          setActionError(
            isReject
              ? 'Request declined — the customer text could not be sent.'
              : 'Saved — the customer text could not be sent.'
          )
          // Only the proposal can be resent through the existing safe path —
          // confirmation/decline messages are not re-queued here.
          if (action === 'propose') setSmsError(true)
        } else if (action === 'accept' || action === 'propose') {
          showToast('Customer notified by text', 'success')
        } else if (action === 'resend-proposal') {
          showToast('Text resent to customer', 'success')
        } else if (action === 'create_appointment' || action === 'create_job') {
          showToast(action === 'create_appointment' ? 'Appointment created' : 'Job created', 'success')
        }
        setPicking(false)
        setSlots(null)
        setSelectedSlot(null)
        refresh()
      } finally {
        setBusy(null)
      }
    },
    [requestId, refresh]
  )

  const openPicker = useCallback(async () => {
    setPicking(true)
    setSlots(null)
    setSelectedSlot(null)
    setActionError(null)
    const res = await fetch(`/api/booking/requests/${requestId}/slots`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setActionError(
        json.error === 'availability_temporarily_unavailable'
          ? 'Availability is temporarily unavailable. Please try again.'
          : json.error || 'Could not load times'
      )
      setPicking(false)
      return
    }
    setSlotTz(json.timezone || 'UTC')
    setSlots(json.slots || [])
  }, [requestId])

  const slotsByDay = useMemo(() => {
    const map = new Map<string, BookingSlot[]>()
    for (const s of slots ?? []) {
      const key = s.start.slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()]
  }, [slots])

  const status: BookingRequestStatus | null = detail?.status ?? null
  const converted = !!(detail?.appointment_id || detail?.job_id)
  const actionable = status === 'pending' || status === 'customer_reselected' || status === 'business_proposed'
  const canAccept = status === 'pending' || status === 'customer_reselected'
  const agreedStart = detail?.current_proposed_start ?? detail?.requested_start
  const requestedDiffers =
    !!detail?.current_proposed_start && detail.current_proposed_start !== detail.requested_start

  const displayedEvents = useMemo(
    () => (showAllHistory ? detail?.events : detail?.events.slice(-3)) ?? [],
    [detail?.events, showAllHistory]
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl dark:bg-slate-900/95 dark:shadow-slate-900/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border/40 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {detail?.customer_name ?? 'Booking request'}
            </h2>
            {status && (
              <span
                className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  status === 'accepted'
                    ? converted
                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    : status === 'pending' || status === 'customer_reselected'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                      : status === 'business_proposed'
                        ? 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                        : 'bg-muted text-muted-foreground'
                }`}
              >
                {converted ? `Created as ${detail?.job_id ? 'Job' : 'Appointment'}` : STATUS_LABEL[status]}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {loading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : !detail ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Could not load this booking request.</p>
              <button
                type="button"
                onClick={load}
                className="mt-3 inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Try again
              </button>
            </div>
          ) : (
            <>
              <div className="space-y-1.5 text-sm text-foreground/90">
                <a href={`tel:${detail.customer_phone}`} className="flex items-center gap-2 hover:text-primary-600">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" /> {detail.customer_phone}
                </a>
                {detail.customer_email && <p className="pl-5 text-muted-foreground">{detail.customer_email}</p>}
                {detail.customer_address && (
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" /> {detail.customer_address}
                  </p>
                )}
                {detail.service && <p className="font-medium text-foreground">{detail.service}</p>}
                {detail.notes && <p className="rounded-lg bg-muted/60 p-2.5 text-[13px] text-muted-foreground">{detail.notes}</p>}
              </div>

              <div className="rounded-xl border border-border/40 bg-muted/30 p-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-foreground">
                  <CalendarDays className="h-4 w-4 text-primary-500" />
                  <span className="font-medium">
                    {formatInTimeZone(agreedStart!, detail.timezone, 'EEEE, MMM d')}
                  </span>
                  <span>
                    {formatInTimeZone(agreedStart!, detail.timezone, 'h:mm a')}
                    {' – '}
                    {formatInTimeZone(
                      detail.current_proposed_end ?? detail.requested_end,
                      detail.timezone,
                      'h:mm a'
                    )}
                  </span>
                </div>
                {requestedDiffers && (
                  <p className="mt-1 pl-6 text-xs text-muted-foreground">
                    Originally requested{' '}
                    {formatInTimeZone(detail.requested_start, detail.timezone, 'EEE, MMM d · h:mm a')}
                  </p>
                )}
                {status === 'business_proposed' && (
                  <p className="mt-1 pl-6 text-xs font-medium text-violet-600 dark:text-violet-300">Waiting for customer</p>
                )}
              </div>

              {actionError && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-900/30 dark:text-amber-200">
                  <p>{actionError}</p>
                  {smsError && (
                    <button
                      onClick={() => runAction('resend-proposal')}
                      disabled={busy !== null}
                      className="mt-2 text-xs font-medium underline hover:text-amber-900 disabled:opacity-50 dark:hover:text-amber-100"
                    >
                      {busy === 'resend-proposal' ? 'Resending…' : 'Resend text'}
                    </button>
                  )}
                </div>
              )}

              {actionable && !picking && (
                <div className="flex flex-wrap gap-2">
                  {canAccept && (
                    <button
                      disabled={busy !== null}
                      onClick={() => runAction('accept')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" /> {busy === 'accept' ? 'Accepting…' : 'Accept'}
                    </button>
                  )}
                  <button
                    disabled={busy !== null}
                    onClick={openPicker}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <Clock className="h-4 w-4" /> Suggest New Time
                  </button>
                  <button
                    disabled={busy !== null}
                    onClick={() => runAction('reject')}
                    className="rounded-lg border border-red-200 px-3.5 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-900/30"
                  >
                    {busy === 'reject' ? 'Declining…' : 'Reject'}
                  </button>
                </div>
              )}

              {picking && (
                <div className="space-y-3 rounded-xl border border-border p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-foreground">Suggest a new time</p>
                    <button onClick={() => setPicking(false)} className="text-xs text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                  {slots === null ? (
                    <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                      <RefreshCw className="h-4 w-4 animate-spin" /> Loading times…
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="py-3 text-sm text-muted-foreground">No times available in the booking window.</p>
                  ) : (
                    <div className="max-h-64 space-y-3 overflow-y-auto">
                      {slotsByDay.map(([day, daySlots]) => (
                        <div key={day}>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            {formatInTimeZone(daySlots[0].start, slotTz, 'EEEE, MMM d')}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {daySlots.map((s) => {
                              const selected = selectedSlot?.start === s.start
                              return (
                                <button
                                  key={s.start}
                                  onClick={() => setSelectedSlot(s)}
                                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                                    selected
                                      ? 'border-primary-600 bg-primary-600 text-white'
                                      : 'border-border text-foreground hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20'
                                  }`}
                                >
                                  {formatInTimeZone(s.start, slotTz, 'h:mm a')}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    disabled={!selectedSlot || busy !== null}
                    onClick={() => runAction('propose', { start: selectedSlot!.start, end: selectedSlot!.end })}
                    className="w-full rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                  >
                    {busy === 'propose' ? 'Sending…' : 'Send suggested time'}
                  </button>
                </div>
              )}

              {status === 'accepted' && !converted && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Create this booking as:</p>
                  <div className="flex gap-2">
                    <button
                      disabled={busy !== null}
                      onClick={() => runAction('create_appointment')}
                      className="flex-1 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {busy === 'create_appointment' ? 'Creating…' : 'Create Appointment'}
                    </button>
                    <button
                      disabled={busy !== null}
                      onClick={() => runAction('create_job')}
                      className="flex-1 rounded-lg border border-primary-600 px-3.5 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50 dark:hover:bg-primary-900/20"
                    >
                      {busy === 'create_job' ? 'Creating…' : 'Create Job'}
                    </button>
                  </div>
                </div>
              )}

              {converted && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-900/20">
                  <p className="mb-2 text-sm font-medium text-emerald-800 dark:text-emerald-200">
                    Created as {detail.appointment_id ? 'Appointment' : 'Job'}
                  </p>
                  <button
                    onClick={() => {
                      onClose()
                      router.push(
                        detail.appointment_id
                          ? '/dashboard/calendar?tab=appointments'
                          : detail.lead_id
                            ? `/dashboard/customers/${detail.lead_id}`
                            : '/dashboard/calendar?tab=jobs'
                      )
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-100 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-slate-800"
                  >
                    <ExternalLink className="h-4 w-4" />
                    {detail.appointment_id ? 'View Appointment' : 'View Job'}
                  </button>
                </div>
              )}

              {detail.events.length > 0 && (
                <div className="border-t border-border/40 pt-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">History</p>
                    {detail.events.length > 3 && (
                      <button
                        onClick={() => setShowAllHistory((x) => !x)}
                        className="inline-flex items-center gap-0.5 text-xs text-primary-600 hover:underline dark:text-primary-400"
                      >
                        {showAllHistory ? 'Show fewer' : 'Show all'}
                        <ChevronDown className={`h-3 w-3 transition-transform ${showAllHistory ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                  <ul className="space-y-1.5">
                    {displayedEvents.map((e) => (
                      <li key={e.id} className="flex items-baseline justify-between gap-3 text-[13px]">
                        <span className="text-foreground/90">
                          {EVENT_LABEL[e.event_type] ?? e.event_type}{eventActorLabel(e.actor)}
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatInTimeZone(e.created_at, detail.timezone, 'MMM d, h:mm a')}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
