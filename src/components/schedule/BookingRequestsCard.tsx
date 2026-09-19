'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarPlus } from 'lucide-react'
import { createBrowserClient } from '@/lib/supabase/browser'
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
  business_proposed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  customer_reselected: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  declined: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  expired: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  _converted: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
}

/**
 * Schedule → Overview booking requests surface.
 * Shows recent booking requests + pending count; clicking a row opens the
 * detail/manage modal (accept, suggest, reject, create appointment/job).
 */
export default function BookingRequestsCard() {
  const supabase = useMemo(() => createBrowserClient(), [])
  const [requests, setRequests] = useState<BookingRequestRow[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/booking/requests?limit=5', {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        cache: 'no-store',
      })
      if (!res.ok) return
      const data = await res.json()
      setRequests(data.requests ?? [])
      setCounts(data.counts ?? {})
    } catch {
      // Non-fatal — the card simply stays hidden if the API is unreachable.
    }
  }, [supabase])

  useEffect(() => { load() }, [load])

  // Nothing to show yet — keep Overview clean until booking activity exists.
  if (!requests || requests.length === 0) return null

  const pendingCount = counts.pending ?? 0
  const timeFmt = (row: BookingRequestRow) => {
    const start = new Date(row.current_proposed_start ?? row.requested_start)
    const end = new Date(row.current_proposed_end ?? row.requested_end)
    const day = new Intl.DateTimeFormat('en-US', {
      timeZone: row.timezone, weekday: 'short', month: 'short', day: 'numeric',
    }).format(start)
    const t = new Intl.DateTimeFormat('en-US', {
      timeZone: row.timezone, hour: 'numeric', minute: '2-digit',
    })
    return `${day}, ${t.format(start)} – ${t.format(end)}`
  }

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

      <ul className="divide-y divide-border/30">
        {requests.map(r => {
          const converted = !!r.appointment_id || !!r.job_id
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="flex w-full items-center justify-between gap-3 py-2.5 text-left transition-colors hover:text-primary-600"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {r.customer_name}
                    {r.service && <span className="font-normal text-muted-foreground"> · {r.service}</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{timeFmt(r)}</p>
                </div>
                <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[converted ? '_converted' : r.status]}`}>
                  {converted ? (r.job_id ? 'Job' : 'Appointment') : STATUS_LABEL[r.status]}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

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
