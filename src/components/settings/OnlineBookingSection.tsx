'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/browser'
import LoadingSpinner from '@/components/LoadingSpinner'
import type { BookingException, BookingHoursRow, BookingSettings } from '@/lib/booking/types'

interface SettingsPayload {
  settings: Partial<BookingSettings> & { public_slug?: string | null }
  hours: BookingHoursRow[]
  exceptions: BookingException[]
  businessName: string
  businessHours: { start: string | null; end: string | null; timezone: string | null }
  bookingUrl: string | null
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Monday-first display

interface DayDraft {
  open: boolean
  start: string
  end: string
}

const defaultWeek = (): Record<number, DayDraft> =>
  Object.fromEntries(DAY_ORDER.map(d => [d, { open: d >= 1 && d <= 5, start: '08:00', end: '17:00' }]))

export default function OnlineBookingSection() {
  const supabase = createBrowserClient()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedTick, setSavedTick] = useState(false)
  const [copied, setCopied] = useState(false)

  const [enabled, setEnabled] = useState(false)
  const [slug, setSlug] = useState<string | null>(null)
  const [timezone, setTimezone] = useState('America/New_York')
  const [duration, setDuration] = useState(60)
  const [minNotice, setMinNotice] = useState(240)
  const [windowDays, setWindowDays] = useState(30)
  const [useBusinessHours, setUseBusinessHours] = useState(true)
  const [businessHours, setBusinessHours] = useState<{ start: string | null; end: string | null } | null>(null)
  const [week, setWeek] = useState<Record<number, DayDraft>>(defaultWeek)
  const [exceptions, setExceptions] = useState<BookingException[]>([])

  const [exStart, setExStart] = useState('')
  const [exEnd, setExEnd] = useState('')
  const [exLabel, setExLabel] = useState('')
  const [exSaving, setExSaving] = useState(false)

  const authFetch = useCallback(async (input: string, init?: RequestInit) => {
    const { data: { session } } = await supabase.auth.getSession()
    return fetch(input, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${session?.access_token ?? ''}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      },
    })
  }, [supabase])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await authFetch('/api/booking/settings')
      if (!res.ok) {
        setLoadError('Could not load booking settings')
        return
      }
      const data: SettingsPayload = await res.json()
      setEnabled(Boolean(data.settings.enabled))
      setSlug(data.settings.public_slug ?? null)
      setTimezone(data.settings.timezone ?? 'America/New_York')
      setDuration(data.settings.default_duration_minutes ?? 60)
      setMinNotice(data.settings.min_notice_minutes ?? 240)
      setWindowDays(data.settings.booking_window_days ?? 30)
      setUseBusinessHours(data.settings.use_business_hours !== false)
      setBusinessHours(data.businessHours)
      setExceptions(data.exceptions)

      if (data.hours.length > 0) {
        const draft = defaultWeek()
        for (const d of DAY_ORDER) draft[d].open = false
        for (const row of data.hours) {
          draft[row.day_of_week] = {
            open: true,
            start: String(row.start_time).slice(0, 5),
            end: String(row.end_time).slice(0, 5),
          }
        }
        setWeek(draft)
        setUseBusinessHours(false)
      }
    } catch {
      setLoadError('Could not load booking settings')
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    setSavedTick(false)
    try {
      const hours = useBusinessHours
        ? []
        : DAY_ORDER
            .filter(d => week[d].open)
            .map(d => ({ day_of_week: d, start_time: week[d].start, end_time: week[d].end }))
      const res = await authFetch('/api/booking/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          settings: {
            enabled,
            timezone,
            default_duration_minutes: duration,
            min_notice_minutes: minNotice,
            booking_window_days: windowDays,
            use_business_hours: useBusinessHours,
          },
          hours,
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setSaveError(data?.error ?? 'Could not save settings')
        return
      }
      setSlug(data.settings?.public_slug ?? slug)
      setSavedTick(true)
      setTimeout(() => setSavedTick(false), 3000)
    } catch {
      setSaveError('Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyLink = async () => {
    if (!slug) return
    const url = `${window.location.origin}/book/${slug}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard unavailable — select-based copy could go here if needed
    }
  }

  const handleAddException = async () => {
    if (!exStart) return
    setExSaving(true)
    try {
      // Single-day or multi-day block: start-of-day → end-of-day in business tz.
      const startIso = new Date(`${exStart}T00:00:00`).toISOString()
      const endIso = new Date(`${exEnd || exStart}T23:59:59`).toISOString()
      const res = await authFetch('/api/booking/exceptions', {
        method: 'POST',
        body: JSON.stringify({ startAt: startIso, endAt: endIso, allDay: true, label: exLabel || null }),
      })
      if (res.ok) {
        setExStart(''); setExEnd(''); setExLabel('')
        load()
      }
    } finally {
      setExSaving(false)
    }
  }

  const handleDeleteException = async (id: string) => {
    const res = await authFetch(`/api/booking/exceptions?id=${id}`, { method: 'DELETE' })
    if (res.ok) setExceptions(prev => prev.filter(e => e.id !== id))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10">
        <LoadingSpinner size="sm" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-muted-foreground mb-3">{loadError}</p>
        <button onClick={load} className="text-sm font-medium text-blue-600 hover:text-blue-700">
          Try again
        </button>
      </div>
    )
  }

  const fullUrl = slug ? `/book/${slug}` : null
  const fmtException = (e: BookingException) => {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, weekday: 'short', month: 'short', day: 'numeric',
      ...(e.all_day ? {} : { hour: 'numeric', minute: '2-digit' }),
    })
    return `${f.format(new Date(e.start_at))} – ${f.format(new Date(e.end_at))}`
  }

  const inputCls =
    'rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-foreground focus:border-blue-500 focus:outline-none'

  return (
    <div className="space-y-6">
      {/* Enable toggle */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Enable Online Booking</h3>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Customers request a time from your public link. Requests show up in
            Schedule → Overview — nothing is booked until you accept it.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled(v => !v)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
            enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {enabled && (
        <>
          {/* Public link */}
          <div className="border border-border/30 rounded-lg p-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">Your booking link</p>
            {fullUrl ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <code className="flex-1 truncate rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">
                  {fullUrl}
                </code>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50"
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <Link
                    href={fullUrl}
                    target="_blank"
                    className="rounded-lg border border-border/50 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted/50"
                  >
                    Preview
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                A link will be created when you save with Online Booking enabled.
              </p>
            )}
          </div>

          {/* Duration / notice / window */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Appointment length</span>
              <select value={duration} onChange={e => setDuration(Number(e.target.value))} className={`${inputCls} w-full`}>
                {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Minimum notice</span>
              <select value={minNotice} onChange={e => setMinNotice(Number(e.target.value))} className={`${inputCls} w-full`}>
                <option value={0}>None</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
                <option value={240}>4 hours</option>
                <option value={480}>8 hours</option>
                <option value={1440}>1 day</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">How far ahead</span>
              <select value={windowDays} onChange={e => setWindowDays(Number(e.target.value))} className={`${inputCls} w-full`}>
                <option value={14}>2 weeks</option>
                <option value={30}>1 month</option>
                <option value={60}>2 months</option>
                <option value={90}>3 months</option>
              </select>
            </label>
          </div>

          {/* Weekly hours */}
          <div className="border border-border/30 rounded-lg p-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Booking hours</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  When customers can request times · {timezone.replace(/_/g, ' ')}
                </p>
              </div>
            </div>

            {businessHours?.start && businessHours?.end && (
              <label className="mb-3 flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={useBusinessHours}
                  onChange={e => setUseBusinessHours(e.target.checked)}
                  className="h-4 w-4 rounded border-border"
                />
                Use my business hours (Mon–Fri {businessHours.start}–{businessHours.end})
              </label>
            )}
            {!businessHours?.start && (
              <p className="mb-3 text-xs text-muted-foreground">
                Set the days and times customers can pick.
              </p>
            )}

            {!useBusinessHours && (
              <div className="space-y-2">
                {DAY_ORDER.map(d => (
                  <div key={d} className="flex items-center gap-3">
                    <label className="flex w-28 items-center gap-2 text-sm text-foreground">
                      <input
                        type="checkbox"
                        checked={week[d].open}
                        onChange={e =>
                          setWeek(prev => ({ ...prev, [d]: { ...prev[d], open: e.target.checked } }))
                        }
                        className="h-4 w-4 rounded border-border"
                      />
                      {DAY_NAMES[d]}
                    </label>
                    {week[d].open ? (
                      <div className="flex items-center gap-2">
                        <input type="time" value={week[d].start}
                          onChange={e => setWeek(prev => ({ ...prev, [d]: { ...prev[d], start: e.target.value } }))}
                          className={inputCls} />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input type="time" value={week[d].end}
                          onChange={e => setWeek(prev => ({ ...prev, [d]: { ...prev[d], end: e.target.value } }))}
                          className={inputCls} />
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">Closed</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exceptions */}
          <div className="border border-border/30 rounded-lg p-4">
            <p className="text-sm font-semibold text-foreground">Blocked dates</p>
            <p className="mt-0.5 mb-3 text-xs text-muted-foreground">
              Vacations, days off, personal time — customers just see no availability.
            </p>

            {exceptions.length > 0 && (
              <ul className="mb-3 divide-y divide-border/30">
                {exceptions.map(e => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-foreground">{fmtException(e)}</p>
                      {e.label && <p className="truncate text-xs text-muted-foreground">{e.label}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteException(e.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-700"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-col sm:flex-row sm:items-end gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">From</span>
                <input type="date" value={exStart} onChange={e => setExStart(e.target.value)} className={inputCls} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-muted-foreground">To</span>
                <input type="date" value={exEnd} onChange={e => setExEnd(e.target.value)} className={inputCls} />
              </label>
              <label className="block flex-1">
                <span className="mb-1 block text-xs text-muted-foreground">Note (private)</span>
                <input type="text" value={exLabel} onChange={e => setExLabel(e.target.value)}
                  maxLength={200} placeholder="e.g. Vacation" className={`${inputCls} w-full`} />
              </label>
              <button
                type="button"
                onClick={handleAddException}
                disabled={!exStart || exSaving}
                className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-slate-300"
              >
                {exSaving ? 'Adding…' : 'Block dates'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Save row */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save booking settings'}
        </button>
        {savedTick && <span className="text-xs font-medium text-green-600">Saved</span>}
        {saveError && <span className="text-xs font-medium text-red-600">{saveError}</span>}
      </div>
    </div>
  )
}
