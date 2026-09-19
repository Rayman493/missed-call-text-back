'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

interface ReselectSectionProps {
  slug: string
  token: string
  timezone: string
  durationMinutes: number | null
}

interface Slot {
  start: string
  end: string
}

/**
 * Same-request time reselection — the ONLY path for an existing requester to
 * change their time. Reuses the same continuation token and updates the same
 * booking request; the customer never re-enters identity details and never
 * creates a second request.
 */
export default function ReselectSection({ slug, token, timezone, durationMinutes }: ReselectSectionProps) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Slot | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const loadSlots = async () => {
    setSlotsError(null)
    try {
      // token → the request's own hold is excluded from its own picker.
      const res = await fetch(
        `/api/booking/public/${slug}/availability?token=${encodeURIComponent(token)}`,
        { cache: 'no-store' }
      )
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setSlotsError(
          data?.error === 'availability_temporarily_unavailable'
            ? 'Availability is temporarily unavailable. Please try again shortly.'
            : 'Could not load available times.'
        )
        setSlots([])
        return
      }
      const data = await res.json()
      setSlots(Array.isArray(data.slots) ? data.slots : [])
    } catch {
      setSlotsError('Could not load available times. Check your connection and try again.')
      setSlots([])
    }
  }

  useEffect(() => {
    if (expanded && slots === null && !slotsError) loadSlots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded])

  const dayGroups = useMemo(() => {
    if (!slots) return []
    const dayFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric',
    })
    const keyFmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    })
    const groups = new Map<string, { label: string; slots: Slot[] }>()
    for (const slot of slots) {
      const date = new Date(slot.start)
      const key = keyFmt.format(date)
      if (!groups.has(key)) groups.set(key, { label: dayFmt.format(date), slots: [] })
      groups.get(key)!.slots.push(slot)
    }
    return [...groups.values()]
  }, [slots, timezone])

  const timeFmt = useMemo(
    () => new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }),
    [timezone]
  )

  const handleConfirm = async () => {
    if (!selected || submitting) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      const res = await fetch(`/api/booking/requests/by-token/${encodeURIComponent(token)}/reselect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, start: selected.start, end: selected.end }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        if (res.status === 409) {
          setSelected(null)
          loadSlots() // the picked time is gone — refresh
        }
        setSubmitError(
          data?.error === 'availability_temporarily_unavailable' || res.status === 503
            ? 'Availability is temporarily unavailable. Please try again shortly.'
            : data?.error ?? 'Could not update your request. Please try again.'
        )
        return
      }
      // Same request updated — reload the server-rendered status view.
      router.refresh()
    } catch {
      setSubmitError('Could not update your request. Check your connection and try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-blue-400 hover:text-blue-700"
      >
        Choose another time
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Choose another time</h2>
        <button
          type="button"
          onClick={() => { setExpanded(false); setSelected(null); setSubmitError(null) }}
          className="text-xs font-medium text-slate-500 hover:text-slate-700"
        >
          Keep current time
        </button>
      </div>
      {durationMinutes && (
        <p className="-mt-2 mb-4 text-xs text-slate-500">
          {durationMinutes}-minute visits · times shown in {timezone.replace(/_/g, ' ')}
        </p>
      )}

      {slots === null && !slotsError && (
        <div className="py-6 text-center text-sm text-slate-500">Loading available times…</div>
      )}

      {slotsError && (
        <div className="py-4 text-center">
          <p className="mb-3 text-sm text-slate-600">{slotsError}</p>
          <button
            type="button"
            onClick={loadSlots}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Try again
          </button>
        </div>
      )}

      {slots !== null && !slotsError && slots.length === 0 && (
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-slate-700">No other times available right now</p>
          <p className="mt-1 text-sm text-slate-500">Please check back later or contact the business directly.</p>
        </div>
      )}

      <div className="max-h-80 overflow-y-auto">
        {dayGroups.map(group => (
          <div key={group.label} className="mb-4 last:mb-0">
            <p className="mb-2 text-sm font-semibold text-slate-800">{group.label}</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {group.slots.map(slot => {
                const isSelected = selected?.start === slot.start
                return (
                  <button
                    key={slot.start}
                    type="button"
                    onClick={() => setSelected(slot)}
                    className={`rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors ${
                      isSelected
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700'
                    }`}
                  >
                    {timeFmt.format(new Date(slot.start))}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {submitError && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      {selected && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting}
          className="mt-4 w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? 'Updating request…' : `Request ${timeFmt.format(new Date(selected.start))} instead`}
        </button>
      )}
    </div>
  )
}
