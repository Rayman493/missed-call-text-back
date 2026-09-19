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

  const [service, setService] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [submit, setSubmit] = useState<SubmitState>({ phase: 'idle' })

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

  // Group slots by day in the business timezone.
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
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone, hour: 'numeric', minute: '2-digit',
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
    'w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100'
  const labelClass = 'block text-sm font-medium text-slate-700 mb-1.5'

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-lg px-4 py-8 sm:py-12">
        {/* Business identity */}
        <div className="mb-8 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={businessName} className="mx-auto mb-3 h-14 w-14 rounded-xl object-cover" />
          ) : (
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white">
              {businessName.charAt(0).toUpperCase()}
            </div>
          )}
          <h1 className="text-2xl font-semibold text-slate-900">{businessName}</h1>
          <p className="mt-1 text-slate-600">Request a time that works for you</p>
        </div>

        <div className="space-y-6">
          {/* What do you need */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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

          {/* Time selection */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-medium text-slate-700">Pick a time</h2>
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
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Try again
                </button>
              </div>
            )}

            {slots !== null && !slotsError && slots.length === 0 && (
              <div className="py-8 text-center">
                <p className="text-sm font-medium text-slate-700">No times available right now</p>
                <p className="mt-1 text-sm text-slate-500">
                  Please check back later or contact {businessName} directly.
                </p>
              </div>
            )}

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
          </section>

          {/* Contact details */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
            className="w-full rounded-xl bg-blue-600 py-4 text-base font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
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
