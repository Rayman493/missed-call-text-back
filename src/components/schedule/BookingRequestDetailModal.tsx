'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BookingRequestEvent, BookingRequestStatus, BookingSlot } from '@/lib/booking/types'
import { CalendarDays, Check, ChevronDown, Clock, ExternalLink, MapPin, Phone, RefreshCw, User } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { formatInTimeZone } from 'date-fns-tz'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBusiness } from '@/contexts/BusinessContext'
import { suppressNextHistoryBackCleanup } from '@/lib/modalBackButton'
import Modal from '@/components/ui/Modal'

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

type BusyAction = 'accept' | 'reject' | 'propose' | 'create-appointment' | 'create-job' | 'resend-proposal' | null

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
  businessId,
  onClose,
  onRefresh,
}: {
  requestId: string
  businessId: string | null
  onClose: () => void
  onRefresh?: () => void
}) {
  const router = useRouter()
  const navigateFromModal = useCallback((href: string) => {
    suppressNextHistoryBackCleanup()
    router.push(href)
    onClose()
  }, [router, onClose])
  const supabase = useMemo(() => createBrowserClient(), [])
  const { business } = useBusiness()
  const effectiveBusinessId = businessId ?? business?.id ?? null
  const realtimeRef = useRef<any>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recoveryAttemptsRef = useRef(0)
  const channelStatusRef = useRef<string>('idle')
  const [realtimeGeneration, setRealtimeGeneration] = useState(0)
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

  const authHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`
    return headers
  }, [supabase])

  const load = useCallback(async () => {
    const headers = await authHeaders()
    const res = await fetch(`/api/booking/requests/${requestId}`, {
      headers,
      cache: 'no-store',
    })
    if (!res.ok) {
      setLoading(false)
      return
    }
    setDetail(await res.json())
    setLoading(false)
  }, [requestId, authHeaders])

  useEffect(() => { load() }, [load])

  // Realtime reconciliation for this specific request. When the customer
  // accepts, rejects, or otherwise updates the row, the modal refreshes
  // automatically without requiring the business to close/reopen it.
  // The postgres_changes binding is intentionally UNFILTERED: server-side
  // filters on this project previously produced SUBSCRIBED-but-zero-events,
  // so filtering happens client-side on the payload while RLS remains the
  // security boundary.
  useEffect(() => {
    if (!effectiveBusinessId || !requestId) return
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current)

    let cancelled = false
    channelStatusRef.current = 'subscribing'
    const channel = supabase
      .channel(`booking-request-detail:${effectiveBusinessId}:${requestId}:${realtimeGeneration}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_requests' },
        (payload: any) => {
          const row = (payload?.new ?? payload?.old) as { id?: string; business_id?: string } | undefined
          if (row?.id !== requestId || row?.business_id !== effectiveBusinessId) return
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => {
            load()
            onRefresh?.()
          }, 300)
        }
      )

    ;(async () => {
      // Resolve realtime auth before joining — an unauthenticated websocket
      // reports SUBSCRIBED but RLS blocks all postgres_changes events because
      // auth.uid() is NULL with the anon key.
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) await (supabase as any).realtime.setAuth(session.access_token)
      } catch { /* best effort — foreground reconcile still covers gaps */ }
      if (cancelled) return

      channel.subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          channelStatusRef.current = 'subscribed'
          recoveryAttemptsRef.current = 0
        } else if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
          channelStatusRef.current = 'error'
          // Bounded recovery: refetch to close the gap, then recreate the
          // channel via the generation bump (effect cleanup removes this one).
          setTimeout(() => {
            if (cancelled || realtimeRef.current !== channel) return
            load()
            onRefresh?.()
            if (recoveryAttemptsRef.current < 3) {
              recoveryAttemptsRef.current += 1
              setRealtimeGeneration((g) => g + 1)
            }
          }, 2000)
        }
      })
    })()

    realtimeRef.current = channel

    return () => {
      cancelled = true
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (realtimeRef.current) supabase.removeChannel(realtimeRef.current)
      realtimeRef.current = null
    }
  }, [effectiveBusinessId, requestId, load, onRefresh, supabase, realtimeGeneration])

  // Foreground reconcile: on focus/visibility/online, silently refetch and
  // re-arm a dead channel (one bounded recreation window — no polling).
  useEffect(() => {
    const reconcile = () => {
      load()
      onRefresh?.()
      if (channelStatusRef.current !== 'subscribed' && channelStatusRef.current !== 'subscribing') {
        recoveryAttemptsRef.current = 0
        setRealtimeGeneration((g) => g + 1)
      }
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') reconcile() }
    window.addEventListener('focus', reconcile)
    window.addEventListener('online', reconcile)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', reconcile)
      window.removeEventListener('online', reconcile)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [load, onRefresh])

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
        const headers = await authHeaders()
        const res = await fetch(`/api/booking/requests/${requestId}/action`, {
          method: 'POST',
          headers,
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
        } else if (action === 'create-appointment' || action === 'create-job') {
          showToast(action === 'create-appointment' ? 'Appointment created' : 'Job created', 'success')
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
    const headers = await authHeaders()
    const res = await fetch(`/api/booking/requests/${requestId}/slots`, { headers })
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
  const hasAppointment = !!detail?.appointment_id
  const hasJob = !!detail?.job_id
  const converted = hasAppointment || hasJob
  const actionable = status === 'pending' || status === 'customer_reselected' || status === 'business_proposed'
  const canAccept = status === 'pending' || status === 'customer_reselected'
  const agreedStart = detail?.current_proposed_start ?? detail?.requested_start
  const agreedEnd = detail?.current_proposed_end ?? detail?.requested_end
  const requestedDiffers =
    !!detail?.current_proposed_start && detail.current_proposed_start !== detail.requested_start

  const displayedEvents = useMemo(
    () => (showAllHistory ? detail?.events : detail?.events.slice(-3)) ?? [],
    [detail?.events, showAllHistory]
  )

  return (
    <Modal isOpen onClose={onClose} title={detail?.customer_name ?? 'Booking request'}>
      <div className="space-y-4">
        {status && (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${
              status === 'accepted'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                : status === 'pending' || status === 'customer_reselected'
                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                  : status === 'business_proposed'
                    ? 'bg-violet-50 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300'
                    : 'bg-muted text-muted-foreground'
            }`}
          >
            {STATUS_LABEL[status]}
          </span>
        )}
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
            <section>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Customer</p>
              <div className="rounded-xl border border-border/40 bg-card p-3">
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Phone</p>
                      <a href={`tel:${detail.customer_phone}`} className="font-medium text-foreground hover:text-primary-600">
                        {formatPhoneNumber(detail.customer_phone)}
                      </a>
                    </div>
                  </div>
                  {detail.customer_email && (
                    <div className="flex items-start gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">@</span>
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Email</p>
                        <p className="font-medium text-foreground">{detail.customer_email}</p>
                      </div>
                    </div>
                  )}
                  {detail.customer_address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Address</p>
                        <p className="font-medium text-foreground">{detail.customer_address}</p>
                      </div>
                    </div>
                  )}
                </div>
                {detail.lead_id && (
                  <button
                    type="button"
                    onClick={() => navigateFromModal(`/dashboard/leads/${detail.lead_id}`)}
                    className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted sm:w-auto"
                  >
                    <User className="h-4 w-4" /> View Customer
                  </button>
                )}
              </div>
            </section>

            {(detail.service || detail.notes) && (
              <section>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Request</p>
                <div className="rounded-xl border border-border/40 bg-card p-3 text-sm">
                  {detail.service && (
                    <div className="mb-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Service</p>
                      <p className="font-medium text-foreground">{detail.service}</p>
                    </div>
                  )}
                  {detail.notes && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Notes</p>
                      <p className="rounded-lg bg-muted/50 p-2 text-[13px] text-muted-foreground">{detail.notes}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            <section>
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Time</p>
              <div className="rounded-xl border border-border/40 bg-card p-3 text-sm">
                <div className="flex items-start gap-2 text-foreground">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary-500" />
                  <div>
                    <p className="font-medium">
                      {formatInTimeZone(agreedStart!, detail.timezone, 'EEEE, MMM d')}
                    </p>
                    <p className="text-muted-foreground">
                      {formatInTimeZone(agreedStart!, detail.timezone, 'h:mm a')} – {formatInTimeZone(agreedEnd!, detail.timezone, 'h:mm a')}
                    </p>
                    {requestedDiffers && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Originally requested{' '}
                        {formatInTimeZone(detail.requested_start, detail.timezone, 'EEE, MMM d · h:mm a')}
                      </p>
                    )}
                    {status === 'business_proposed' && (
                      <p className="mt-1 text-xs font-medium text-violet-600 dark:text-violet-300">Waiting for customer</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

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
              <section>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  {canAccept && (
                    <button
                      disabled={busy !== null}
                      onClick={() => runAction('accept')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" /> {busy === 'accept' ? 'Accepting…' : 'Accept'}
                    </button>
                  )}
                  <button
                    disabled={busy !== null}
                    onClick={openPicker}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3.5 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
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
              </section>
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
                  <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
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
                                type="button"
                                aria-pressed={selected}
                                onClick={() => setSelectedSlot(s)}
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                  selected
                                    ? 'border-primary-600 bg-primary-600 text-white ring-2 ring-primary-600/20'
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
                {selectedSlot && (
                  <div className="rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 text-sm text-primary-900 dark:border-primary-900/40 dark:bg-primary-900/20 dark:text-primary-100">
                    <span className="font-medium">Selected:</span>{' '}
                    {formatInTimeZone(selectedSlot.start, slotTz, 'EEEE, MMM d · h:mm a')} –{' '}
                    {formatInTimeZone(selectedSlot.end, slotTz, 'h:mm a')}
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

            {status === 'accepted' && (!hasAppointment || !hasJob) && (
              <section>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Create this booking as</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {!hasAppointment && (
                    <button
                      disabled={busy !== null}
                      onClick={() => runAction('create-appointment')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary-600 bg-primary-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                    >
                      {busy === 'create-appointment' ? 'Creating…' : 'Create Appointment'}
                    </button>
                  )}
                  {!hasJob && (
                    <button
                      disabled={busy !== null}
                      onClick={() => runAction('create-job')}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-primary-600 px-3.5 py-2 text-sm font-medium text-primary-600 hover:bg-primary-50 disabled:opacity-50 dark:hover:bg-primary-900/20"
                    >
                      {busy === 'create-job' ? 'Creating…' : 'Create Job'}
                    </button>
                  )}
                </div>
              </section>
            )}

            {converted && (
              <section>
                <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Created records</p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/50 dark:bg-emerald-900/20">
                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    {hasAppointment && (
                      <button
                        type="button"
                        onClick={() => navigateFromModal('/dashboard/calendar?tab=appointments')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-100 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-slate-800"
                      >
                        <ExternalLink className="h-4 w-4" /> View Appointment
                      </button>
                    )}
                    {hasJob && (
                      <button
                        type="button"
                        onClick={() => navigateFromModal('/dashboard/calendar?tab=jobs')}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-100 dark:bg-slate-900 dark:text-emerald-300 dark:hover:bg-slate-800"
                      >
                        <ExternalLink className="h-4 w-4" /> View Job
                      </button>
                    )}
                  </div>
                </div>
              </section>
            )}

            {detail.events.length > 0 && (
              <section className="border-t border-border/40 pt-3">
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
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
