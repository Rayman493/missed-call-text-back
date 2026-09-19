'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, Copy, RefreshCw, Settings } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
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

const BOOKING_SETTINGS_LINK = '/dashboard/settings?section=online-booking'

/**
 * Schedule → Overview booking requests surface.
 * Shows recent booking requests + pending count; clicking a row opens the
 * detail/manage modal (accept, suggest, reject, create appointment/job).
 * Also surfaces the public booking link and a quick route back to settings.
 */
export default function BookingRequestsCard() {
  const supabase = useMemo(() => createBrowserClient(), [])
  const [requests, setRequests] = useState<BookingRequestRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [openId, setOpenId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookingEnabled, setBookingEnabled] = useState(false)
  const [bookingUrl, setBookingUrl] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
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

  useEffect(() => { load() }, [load])

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

  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl section-border shadow-sm p-4 mb-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" /> Loading booking requests…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl section-border shadow-sm p-4 mb-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    )
  }

  const pendingCount = counts.pending ?? 0
  const hasRequests = requests.length > 0

  return (
    <div className="bg-white dark:bg-slate-900/60 backdrop-blur-sm rounded-xl section-border shadow-sm p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarPlus className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h3 className="text-sm font-semibold text-foreground">Booking Requests</h3>
        </div>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
            {pendingCount} pending
          </span>
        )}
      </div>

      {hasRequests ? (
        <ul className="divide-y divide-border/30 mb-3">
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
                  className="flex w-full items-center justify-between gap-3 rounded-lg py-2.5 px-2 -mx-2 text-left transition-colors hover:bg-muted/60 hover:text-primary-600"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {r.customer_name}
                      {r.service && <span className="font-normal text-muted-foreground"> · {r.service}</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{`${day}, ${t.format(start)} – ${t.format(end)}`}</p>
                  </div>
                  <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[converted ? '_converted' : r.status]}`}>
                    {converted ? (r.job_id ? 'Job' : 'Appointment') : STATUS_LABEL[r.status]}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">No booking requests yet.</p>
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
          <Link
            href={BOOKING_SETTINGS_LINK}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Set up booking link
          </Link>
        )}
      </div>

      {openId && (
        <BookingRequestDetailModal
          requestId={openId}
          onClose={() => setOpenId(null)}
          onRefresh={load}
        />
      )}
    </div>
  )
}
