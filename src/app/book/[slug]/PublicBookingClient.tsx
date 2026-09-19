'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface PublicBookingClientProps {
  slug: string
  businessName: string
  logoUrl: string | null
  timezone: string
  durationMinutes: number
}

interface Slot {
  start: string
  end: string
}

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'error'; message: string; slotConflict: boolean }

export default function PublicBookingClient({
  slug,
  businessName,
  logoUrl,
  timezone,
  durationMinutes,
}: PublicBookingClientProps) {
  const router = useRouter()

  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slotsError, setSlotsError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Slot | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [viewMonth, setViewMonth] = useState<{ year: number; month: number } | null>(null)

  const [service, setService] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [submit, setSubmit] = useState<SubmitState>({ phase: 'idle' })
  const [logoError, setLogoError] = useState(false)

  // One clientRequestId per mounted form → server-side idempotent submit.
  const clientRequestId = useRef<string>('')
  useEffect(() => {
    clientRequestId.current = crypto.randomUUID()
  }, [])

  const loadSlots = async () => {
    setSlotsError(null)
    try {
      const res = await fetch(`/api/booking/public/${slug}/availability`, { cache: 'no-store' })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setSlotsError(data?.error ?? 'Could not load availability')
        setSlots([])
        return
      }
      const data = await res.json()
      setSlots(Array.isArray(data.slots) ? data.slots : [])
    } catch {
      setSlotsError('Could not load availability. Check your connection and try again.')
      setSlots([])
    }
  }

  useEffect(() => {
    loadSlots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  // Group slots by local date in the business timezone → drives the calendar.
  // en-CA formats as YYYY-MM-DD which is a sortable map key.
  const dateKeyFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      }),
    [timezone]
  )

  const slotsByDate = useMemo(() => {
    const map = new Map<string, Slot[]>()
    if (!slots) return map
    for (const slot of slots) {
      const key = dateKeyFmt.format(new Date(slot.start))
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(slot)
    }
    return map
  }, [slots, dateKeyFmt])

  const dateLabelFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric',
      }),
    [timezone]
  )

  // Display label for the currently-selected day, taken from that day's first
  // slot so it is guaranteed to be in the business timezone.
  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return null
    const daySlots = slotsByDate.get(selectedDate)
    if (!daySlots?.length) return null
    return dateLabelFmt.format(new Date(daySlots[0].start))
  }, [selectedDate, slotsByDate, dateLabelFmt])

  // Business-local "today" — month navigation can't go before this month.
  const currentMonth = useMemo(() => {
    const [y, m] = dateKeyFmt.format(new Date()).split('-').map(Number)
    return { year: y, month: m }
  }, [dateKeyFmt])

  // Furthest month reachable within the booking horizon — derived from the
  // last returned slot so no internals are exposed to the customer.
  const lastMonth = useMemo(() => {
    const keys = [...slotsByDate.keys()].sort()
    const last = keys[keys.length - 1]
    if (!last) return currentMonth
    const [y, m] = last.split('-').map(Number)
    return { year: y, month: m }
  }, [slotsByDate, currentMonth])

  // Initialize the calendar on the month of the first available day.
  useEffect(() => {
    if (viewMonth || slotsByDate.size === 0) return
    const firstKey = [...slotsByDate.keys()].sort()[0]
    const [y, m] = firstKey.split('-').map(Number)
    setViewMonth({ year: y, month: m })
  }, [slotsByDate, viewMonth])

  const monthLabel = useMemo(() => {
    if (!viewMonth) return ''
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
      .format(new Date(viewMonth.year, viewMonth.month - 1, 1))
  }, [viewMonth])

  const canGoPrev = viewMonth !== null &&
    (viewMonth.year > currentMonth.year ||
      (viewMonth.year === currentMonth.year && viewMonth.month > currentMonth.month))
  const canGoNext = viewMonth !== null &&
    (viewMonth.year < lastMonth.year ||
      (viewMonth.year === lastMonth.year && viewMonth.month < lastMonth.month))

  const shiftMonth = (delta: number) => {
    setViewMonth(prev => {
      if (!prev) return prev
      const d = new Date(prev.year, prev.month - 1 + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() + 1 }
    })
  }

  // Calendar grid cells for the viewed month. Cells are business-local wall
  // dates, so the key is a direct yyyy-mm-dd — no timezone conversion needed.
  const calendarCells = useMemo(() => {
    if (!viewMonth) return []
    const first = new Date(viewMonth.year, viewMonth.month - 1, 1)
    const daysInMonth = new Date(viewMonth.year, viewMonth.month, 0).getDate()
    const cells: ({ key: string; day: number } | null)[] = []
    for (let i = 0; i < first.getDay(); i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${viewMonth.year}-${String(viewMonth.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      cells.push({ key, day: d })
    }
    return cells
  }, [viewMonth])

  const handleSelectDate = (key: string) => {
    setSelectedDate(key)
    // Changing the day invalidates a slot picked on another day.
    if (selected && dateKeyFmt.format(new Date(selected.start)) !== key) {
      setSelected(null)
    }
  }

  const selectedDaySlots = selectedDate ? slotsByDate.get(selectedDate) ?? [] : []

  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true,
      }),
    [timezone]
  )

  const canSubmit =
    name.trim().length > 0 &&
    phone.trim().length >= 7 &&
    selected !== null &&
    submit.phase !== 'submitting'

  const handleSubmit = async () => {
    if (!canSubmit || !selected) return
    setSubmit({ phase: 'submitting' })
    try {
      const res = await fetch(`/api/booking/public/${slug}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: name,
          phone,
          email: email || null,
          address: address || null,
          service: service || null,
          notes: notes || null,
          start: selected.start,
          end: selected.end,
          clientRequestId: clientRequestId.current,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const slotConflict = res.status === 409
        if (slotConflict) {
          setSelected(null)
          loadSlots() // refresh — the chosen time is gone
        }
        setSubmit({
          phase: 'error',
          message: data?.error ?? 'Could not send your request. Please try again.',
          slotConflict,
        })
        return
      }
      router.push(`/book/${slug}/request/${data.token}`)
    } catch {
      setSubmit({
        phase: 'error',
        message: 'Could not send your request. Check your connection and try again.',
        slotConflict: false,
      })
    }
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 shadow-sm transition-colors focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 autofill:shadow-[inset_0_0_0_1000px_white] autofill:focus:shadow-[inset_0_0_0_1000px_white] autofill:[-webkit-text-fill-color:theme(colors.slate.900)]'
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'
  const cardClass = 'rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-[0_1px_2px_rgba(15,23,42,0.05)]'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-8 sm:py-12">
        {/* Business identity */}
        <div className="mb-8 text-center">
          {logoUrl && !logoError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={businessName}
              onError={() => setLogoError(true)}
              className="mx-auto mb-3 h-16 w-auto max-w-[200px] object-contain"
            />
          ) : (
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-blue-600 text-2xl font-bold text-white">
              {businessName.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-semibold text-slate-900">{businessName}</h1>
          <p className="mt-1 text-slate-600">Request a time that works for you</p>
        </div>

        <div className="space-y-6">
          {/* What do you need */}
          <section className={cardClass}>
            <label htmlFor="service" className={labelClass}>
              What do you need?
            </label>
            <input
              id="service"
              type="text"
              value={service}
              onChange={e => setService(e.target.value)}
              placeholder="e.g. Plumbing repair, haircut, consultation"
              maxLength={300}
              className={inputClass}
            />
          </section>

          {/* Time selection — calendar-first */}
          <section className={cardClass}>
            <h2 className="mb-1 text-sm font-medium text-slate-700">Pick a day and time</h2>
            <p className="mb-4 text-xs text-slate-500">
              {durationMinutes}-minute visits · times shown in {timezone.replace(/_/g, ' ')}
            </p>

            {slots === null && !slotsError && (
              <div className="py-8 text-center text-sm text-slate-500">Loading available times…</div>
            )}

            {slotsError && (
              <div className="py-6 text-center">
                <p className="mb-3 text-sm text-slate-600">{slotsError}</p>
                <button
                  type="button"
                  onClick={loadSlots}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Try again
                </button>
              </div>
            )}

            {slots !== null && !slotsError && slotsByDate.size === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm font-medium text-slate-700">No times available right now</p>
                <p className="mt-1 text-sm text-slate-500">
                  Please check back later or contact {businessName} directly.
                </p>
              </div>
            )}

            {slotsByDate.size > 0 && viewMonth && (
              <>
                {/* Month calendar */}
                <div className="rounded-xl border border-slate-200/80 p-3 sm:p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800">{monthLabel}</p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => shiftMonth(-1)}
                        disabled={!canGoPrev}
                        aria-label="Previous month"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        onClick={() => shiftMonth(1)}
                        disabled={!canGoNext}
                        aria-label="Next month"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        ›
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                      <div key={d} className="py-1 text-center text-[11px] font-medium text-slate-400">
                        {d}
                      </div>
                    ))}
                    {calendarCells.map((cell, i) => {
                      if (!cell) return <div key={`blank-${i}`} />
                      const hasSlots = slotsByDate.has(cell.key)
                      const isSelectedDay = selectedDate === cell.key
                      return (
                        <button
                          key={cell.key}
                          type="button"
                          disabled={!hasSlots}
                          onClick={() => handleSelectDate(cell.key)}
                          aria-label={isSelectedDay ? `${cell.key}, selected` : cell.key}
                          aria-pressed={isSelectedDay}
                          className={`flex h-9 items-center justify-center rounded-lg text-sm transition-colors ${
                            isSelectedDay
                              ? 'bg-blue-600 font-semibold text-white'
                              : hasSlots
                                ? 'font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700'
                                : 'cursor-not-allowed text-slate-300'
                          }`}
                        >
                          {cell.day}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Times for the selected day */}
                {selectedDate && selectedDaySlots.length > 0 && selectedDateLabel && (
                  <div className="mt-4">
                    <p className="mb-2 text-sm font-semibold text-slate-800">{selectedDateLabel}</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {selectedDaySlots.map(slot => {
                        const isSelected = selected?.start === slot.start
                        return (
                          <button
                            key={slot.start}
                            type="button"
                            onClick={() => setSelected(slot)}
                            aria-pressed={isSelected}
                            className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                              isSelected
                                ? 'border-blue-600 bg-blue-600 text-white'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-blue-400 hover:text-blue-700'
                            }`}
                          >
                            {timeFmt.format(new Date(slot.start))}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {!selectedDate && (
                  <p className="mt-3 text-center text-xs text-slate-500">
                    Select a highlighted day to see times.
                  </p>
                )}
              </>
            )}
          </section>

          {/* Contact details */}
          <section className={cardClass}>
            <h2 className="mb-4 text-sm font-medium text-slate-700">Your details</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className={labelClass}>Name *</label>
                <input id="name" type="text" autoComplete="name" value={name}
                  onChange={e => setName(e.target.value)} maxLength={120}
                  placeholder="Your name" className={inputClass} />
              </div>
              <div>
                <label htmlFor="phone" className={labelClass}>Phone *</label>
                <input id="phone" type="tel" autoComplete="tel" value={phone}
                  onChange={e => setPhone(e.target.value)} maxLength={40}
                  placeholder="(555) 123-4567" className={inputClass} />
              </div>
              <div>
                <label htmlFor="email" className={labelClass}>Email</label>
                <input id="email" type="email" autoComplete="email" value={email}
                  onChange={e => setEmail(e.target.value)} maxLength={254}
                  placeholder="you@example.com" className={inputClass} />
              </div>
              <div>
                <label htmlFor="address" className={labelClass}>Address</label>
                <input id="address" type="text" autoComplete="street-address" value={address}
                  onChange={e => setAddress(e.target.value)} maxLength={300}
                  placeholder="Where should we go?" className={inputClass} />
              </div>
              <div>
                <label htmlFor="notes" className={labelClass}>Anything we should know?</label>
                <textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)}
                  maxLength={2000} rows={3} placeholder="Details, questions, or special requests"
                  className={`${inputClass} resize-none`} />
              </div>
            </div>
          </section>

          {/* Submit */}
          {submit.phase === 'error' && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {submit.message}
              {submit.slotConflict && (
                <span className="block mt-1 text-red-600">Please pick another time above.</span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-xl bg-blue-600 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {submit.phase === 'submitting'
              ? 'Sending request…'
              : selected
                ? `Request ${timeFmt.format(new Date(selected.start))}`
                : 'Request a time'}
          </button>

          <p className="pb-4 text-center text-xs text-slate-500">
            {businessName} will confirm your time or suggest another one. This is a request, not a confirmed appointment.
          </p>
        </div>
      </div>
    </div>
  )
}
