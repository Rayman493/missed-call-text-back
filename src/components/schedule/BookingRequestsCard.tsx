'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, ChevronRight, Copy, RefreshCw, Settings } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
import { useBusiness } from '@/contexts/BusinessContext'
import { showToast } from '@/lib/toast'
import { bookingPageUrl } from '@/lib/booking/url'
import type { BookingRequestStatus } from '@/lib/booking/types'
import BookingRequestDetailModal from './BookingRequestDetailModal'

interface BookingRequestRow {
  id: string
  status: BookingRequestStatus
  customer_name: string
  customer_phone: string | null
  service: string | null
  requested_start: string
  requested_end: string
  current_proposed_start: string | null
  current_proposed_end: string | null
  timezone: string
  lead_id: string | null
  appointment_id: string | null
  job_id: string | null
  created_at: string
}

const STATUS_LABEL: Record<BookingRequestStatus, string> = {
  pending: 'Pending',
  business_proposed: 'Waiting for customer',
  customer_reselected: 'New time picked',
  accepted: 'Accepted',
  declined: 'Declined',
  cancelled: 'Cancelled',
  expired: 'Expired',
}

const STATUS_PILL: Record<BookingRequestStatus | '_converted', string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  business_proposed: 'bg-blue-100 text-blue-800 dark:bg-amber-900/40 dark:text-blue-300',
  customer_reselected: 'bg-blue-100 text-blue-800 dark:bg-amber-900/40 dark:text-blue-300',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  expired: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  _converted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
}

function convertedLabel(r: BookingRequestRow): string {
  const parts: string[] = []
  if (r.appointment_id) parts.push('Appointment')
  if (r.job_id) parts.push('Job')
  return parts.join(' + ') || STATUS_LABEL[r.status]
}

const BOOKING_SETTINGS_LINK = '/dashboard/settings?section=online-booking'

/**
 * Schedule → Overview booking requests surface.
 * Shows recent booking requests + pending count; clicking a row opens the
 * detail/manage modal (accept, suggest, reject, create appointment/job).
 * Also surfaces the public booking link and a quick route back to settings.
 */
export default function BookingRequestsCard() {
  const supabase = useMemo(() => createBrowserClient(), [])
  const { business } = useBusiness()
  const [requests, setRequests] = useState<BookingRequestRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookingEnabled, setBookingEnabled] = useState(false)
  const [bookingUrl, setBookingUrl] = useState<string | null>(null)
  const realtimeRef = useRef<any>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recoveryAttemptsRef = useRef(0)
  const channelStatusRef = useRef<string>('idle')
  const [realtimeGeneration, setRealtimeGeneration] = useState(0)

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    // Silent refresh keeps the list (and any open detail modal) mounted —
    // no loading flash while realtime/conversion updates reconcile.
    if (!opts?.silent) setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/booking/requests?limit=5', {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        cache: 'no-store',
      })
      if (!res.ok) {
        setError('Could not load booking requests')
        return
      }
      const data = await res.json()
      setRequests(data.requests ?? [])
      setCounts(data.counts ?? {})
      setBookingEnabled(Boolean(data.bookingEnabled))
      setBookingUrl(data.bookingUrl ?? null)
    } catch {
      setError('Could not load booking requests')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const silentLoad = useCallback(() => load({ silent: true }), [load])

  useEffect(() => { load() }, [load])

  // Realtime reconciliation: when any booking_request row for this business
  // changes, silently refresh the list so status/time updates feel instant.
  // The binding is intentionally UNFILTERED — server-side postgres_changes
  // filters on this project previously yielded SUBSCRIBED-but-zero-events —
  // with a client-side business guard and RLS as the security boundary.
  useEffect(() => {
    if (!business?.id) return
    if (realtimeRef.current) supabase.removeChannel(realtimeRef.current)

    let cancelled = false
    channelStatusRef.current = 'subscribing'
    const businessId = business.id
    const channel = supabase
      .channel(`booking-requests-list:${businessId}:${realtimeGeneration}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'booking_requests' },
        (payload: any) => {
          const row = (payload?.new ?? payload?.old) as { business_id?: string } | undefined
          if (row?.business_id !== businessId) return
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(() => silentLoad(), 300)
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
          setTimeout(() => {
            if (cancelled || realtimeRef.current !== channel) return
            silentLoad()
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
  }, [business?.id, silentLoad, supabase, realtimeGeneration])

  // Foreground reconcile: focus/visibility/online → one silent refresh, and
  // re-arm a dead channel via a bounded recreation window. No polling.
  useEffect(() => {
    const reconcile = () => {
      silentLoad()
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
  }, [silentLoad])

  const handleCopyLink = async () => {
    if (!bookingUrl || typeof window === 'undefined') return
    try {
      const url = bookingPageUrl(bookingUrl.replace('/book/', ''), window.location.origin)
      await navigator.clipboard.writeText(url)
      showToast('Booking link copied', 'success')
    } catch {
      showToast('Could not copy link', 'error')
    }
  }

  const pendingCount = counts.pending ?? 0
  const hasRequests = requests.length > 0

  const skeletonRows = (
    <ul className="mt-3 mb-3 space-y-2">
      {[...Array(3)].map((_, i) => (
        <li key={i} className="rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-muted" />
        </li>
      ))}
    </ul>
  )

  return (
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl section-border shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <CalendarPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground">Booking Requests</h3>
        </div>
        {!loading && pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            {pendingCount} pending
          </span>
        )}
      </div>

      {loading ? (
        skeletonRows
      ) : error ? (
        <div className="my-3 flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      ) : hasRequests ? (
        <ul className="mt-3 mb-3 space-y-2">
          {requests.map(r => {
            const converted = !!r.appointment_id || !!r.job_id
            const start = new Date(r.current_proposed_start ?? r.requested_start)
            const end = new Date(r.current_proposed_end ?? r.requested_end)
            const day = new Intl.DateTimeFormat('en-US', {
              timeZone: r.timezone, weekday: 'short', month: 'short', day: 'numeric',
            }).format(start)
            const t = new Intl.DateTimeFormat('en-US', {
              timeZone: r.timezone, hour: 'numeric', minute: '2-digit',
            })
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(r.id)}
                  className="group flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/40 bg-muted/20 px-3 py-2.5 text-left transition-colors hover:border-primary-300 hover:bg-primary-50/60 active:bg-primary-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 dark:hover:bg-primary-900/20 dark:active:bg-primary-900/30"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {r.customer_name}
                      {r.service && <span className="font-normal text-muted-foreground"> · {r.service}</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{`${day}, ${t.format(start)} – ${t.format(end)}`}</p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[converted ? '_converted' : r.status]}`}>
                      {converted ? convertedLabel(r) : STATUS_LABEL[r.status]}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/70 transition-colors group-hover:text-primary-500" />
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mt-3 mb-3 text-sm text-muted-foreground">No booking requests yet.</p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/30">
        {bookingEnabled && bookingUrl ? (
          <>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
            >
              <Copy className="h-3.5 w-3.5" /> Copy booking link
            </button>
            <Link
              href={BOOKING_SETTINGS_LINK}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              <Settings className="h-3.5 w-3.5" /> Booking settings
            </Link>
          </>
        ) : (
          !loading && (
            <Link
              href={BOOKING_SETTINGS_LINK}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Set up booking link
            </Link>
          )
        )}
      </div>

      {openId && (
        <BookingRequestDetailModal
          requestId={openId}
          businessId={business?.id ?? null}
          onClose={() => setOpenId(null)}
          onRefresh={silentLoad}
        />
      )}
    </div>
  )
}
