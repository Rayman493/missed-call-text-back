'use client'

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@/lib/supabase/browser'
import LoadingSpinner from '@/components/LoadingSpinner'
import { showToast } from '@/lib/toast'
import { bookingPagePath, bookingPageUrl } from '@/lib/booking/url'
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

export interface OnlineBookingSectionHandle {
  isDirty: boolean
  save: () => Promise<{ ok: boolean; error?: string }>
  discard: () => void
}

export default forwardRef<OnlineBookingSectionHandle, { onDirtyChange?: (dirty: boolean) => void }>(
  function OnlineBookingSection({ onDirtyChange }, ref) {
  const supabase = createBrowserClient()

  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
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

  // Persisted baseline snapshot used for dirty-state. Keeps Save disabled until
  // a meaningful change has been made, and re-disables it after successful save.
  const [baseline, setBaseline] = useState<string | null>(null)

  const deriveHours = useCallback(() => {
    if (useBusinessHours) return []
    return DAY_ORDER
      .filter(d => week[d].open)
      .map(d => ({ day_of_week: d, start_time: week[d].start, end_time: week[d].end }))
  }, [useBusinessHours, week])

  const makeSnapshot = useCallback((
    opts: {
      enabled: boolean
      timezone: string
      duration: number
      minNotice: number
      windowDays: number
      useBusinessHours: boolean
      hours: { day_of_week: number; start_time: string; end_time: string }[]
    }
  ) => JSON.stringify({
    enabled: opts.enabled,
    timezone: opts.timezone,
    duration: opts.duration,
    minNotice: opts.minNotice,
    windowDays: opts.windowDays,
    useBusinessHours: opts.useBusinessHours,
    hours: opts.hours.map(h => `${h.day_of_week}:${h.start_time}-${h.end_time}`),
  }), [])

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
      const hasBusinessHours = Boolean(data.businessHours?.start && data.businessHours?.end)
      // When no business hours are configured, the use-business-hours flag can
      // never produce availability — fall back to the custom week editor so the
      // business can define bookable hours instead of silently having none.
      const effectiveUseBusinessHours = hasBusinessHours
        ? data.settings.use_business_hours !== false
        : false
      setUseBusinessHours(effectiveUseBusinessHours)
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
        // Derive baseline from loaded hours since state update is not yet flushed.
        setBaseline(makeSnapshot({
          enabled: Boolean(data.settings.enabled),
          timezone: data.settings.timezone ?? 'America/New_York',
          duration: data.settings.default_duration_minutes ?? 60,
          minNotice: data.settings.min_notice_minutes ?? 240,
          windowDays: data.settings.booking_window_days ?? 30,
          // Custom hours exist → the UI is rendered in manual-hours mode.
          useBusinessHours: false,
          hours: data.hours.map(row => ({ day_of_week: row.day_of_week, start_time: String(row.start_time).slice(0, 5), end_time: String(row.end_time).slice(0, 5) })),
        }))
      } else {
        // When the business previously chose manual hours but has none saved
        // (or business hours are unavailable), the UI still shows the default
        // Mon–Fri draft. Baseline must match that visible draft so Save stays
        // disabled until a real change.
        const fallbackDraft = defaultWeek()
        const fallbackHours = !effectiveUseBusinessHours
          ? DAY_ORDER
              .filter(d => fallbackDraft[d].open)
              .map(d => ({ day_of_week: d, start_time: fallbackDraft[d].start, end_time: fallbackDraft[d].end }))
          : []
        setBaseline(makeSnapshot({
          enabled: Boolean(data.settings.enabled),
          timezone: data.settings.timezone ?? 'America/New_York',
          duration: data.settings.default_duration_minutes ?? 60,
          minNotice: data.settings.min_notice_minutes ?? 240,
          windowDays: data.settings.booking_window_days ?? 30,
          useBusinessHours: effectiveUseBusinessHours,
          hours: fallbackHours,
        }))
      }
    } catch {
      setLoadError('Could not load booking settings')
    } finally {
      setLoading(false)
    }
  }, [authFetch, makeSnapshot])

  useEffect(() => { load() }, [load])

  const currentSnapshot = useMemo(
    () => makeSnapshot({ enabled, timezone, duration, minNotice, windowDays, useBusinessHours, hours: deriveHours() }),
    [enabled, timezone, duration, minNotice, windowDays, useBusinessHours, deriveHours, makeSnapshot]
  )
  const dirty = baseline !== null && currentSnapshot !== baseline

  // Effective usable hours in the current draft — used to warn when Booking is
  // enabled but the public page cannot produce any slots.
  const hasUsableHours = useBusinessHours
    ? Boolean(businessHours?.start && businessHours?.end)
    : deriveHours().length > 0

  const handleSave = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!dirty) return { ok: true }
    if (saving) return { ok: false, error: 'Save already in progress' }
    setSaving(true)
    try {
      const hours = deriveHours()
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
        const message = data?.error ?? 'Could not save settings'
        return { ok: false, error: message }
      }
      const savedSlug = data.settings?.public_slug ?? slug
      setSlug(savedSlug)
      setBaseline(currentSnapshot)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Could not save settings' }
    } finally {
      setSaving(false)
    }
  }, [dirty, saving, authFetch, deriveHours, currentSnapshot, enabled, timezone, duration, minNotice, windowDays, useBusinessHours, slug])

  const handleDiscard = useCallback(() => {
    load()
  }, [load])

  useImperativeHandle(ref, () => ({
    isDirty: dirty,
    save: handleSave,
    discard: handleDiscard,
  }), [dirty, handleSave, handleDiscard])

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  const handleCopyLink = async () => {
    if (!slug || !bookingLink) return
    try {
      await navigator.clipboard.writeText(bookingLink)
      showToast('Booking link copied', 'success')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      showToast('Could not copy link', 'error')
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

  const fullUrl = slug ? bookingPagePath(slug) : null
  const bookingLink = typeof window !== 'undefined' && slug ? bookingPageUrl(slug, window.location.origin) : null
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
          <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 dark:border-blue-900/40 dark:bg-blue-900/15">
            <p className="text-sm font-semibold text-foreground">Your booking link</p>
            {fullUrl ? (
              <>
                <p className="mt-1 truncate text-sm font-medium text-blue-700 dark:text-blue-300">
                  {bookingLink}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-foreground shadow-sm hover:bg-slate-50 disabled:opacity-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                  <Link
                    href={fullUrl}
                    target="_blank"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white/60 px-3 py-2 text-xs font-medium text-foreground hover:bg-white dark:border-blue-900/50 dark:bg-slate-900/60 dark:hover:bg-slate-800"
                  >
                    Preview
                  </Link>
                </div>
              </>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                A link will be created when you save with Online Booking enabled.
              </p>
            )}
          </div>

          {/* Duration / notice / window */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted-foreground">Booking length</span>
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

          {/* No usable hours warning */}
          {!hasUsableHours && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                Add booking hours before customers can request a time.
              </p>
              <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80">
                Customers currently see no availability on your booking page.
              </p>
            </div>
          )}

          {/* Weekly hours */}
          <div className="border border-border/30 rounded-lg p-3 sm:p-4">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Booking hours</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  When customers can request times · {timezone.replace(/_/g, ' ')}
                </p>
              </div>
            </div>

            {businessHours?.start && businessHours?.end && (
              <label className="mb-3 flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={useBusinessHours}
                  onChange={e => setUseBusinessHours(e.target.checked)}
                  className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-border"
                />
                <span className="min-w-0">
                  Use my business hours (Mon–Fri {businessHours.start}–{businessHours.end})
                </span>
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
                  <div key={d} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <label className="flex items-center gap-2 text-sm text-foreground sm:w-28 sm:flex-shrink-0">
                      <input
                        type="checkbox"
                        checked={week[d].open}
                        onChange={e =>
                          setWeek(prev => ({ ...prev, [d]: { ...prev[d], open: e.target.checked } }))
                        }
                        className="h-4 w-4 flex-shrink-0 rounded border-border"
                      />
                      {DAY_NAMES[d]}
                    </label>
                    {week[d].open ? (
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pl-6 sm:pl-0 sm:flex sm:items-center">
                        <input type="time" value={week[d].start}
                          onChange={e => setWeek(prev => ({ ...prev, [d]: { ...prev[d], start: e.target.value } }))}
                          className={`${inputCls} w-full min-w-0 sm:w-auto`} />
                        <span className="text-xs text-muted-foreground">to</span>
                        <input type="time" value={week[d].end}
                          onChange={e => setWeek(prev => ({ ...prev, [d]: { ...prev[d], end: e.target.value } }))}
                          className={`${inputCls} w-full min-w-0 sm:w-auto`} />
                      </div>
                    ) : (
                      <span className="pl-6 text-xs text-muted-foreground sm:pl-0">Closed</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Exceptions */}
          <div className="border border-border/30 rounded-lg p-3 sm:p-4">
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
              <label className="block w-full sm:w-auto">
                <span className="mb-1 block text-xs text-muted-foreground">From</span>
                <input type="date" value={exStart} onChange={e => setExStart(e.target.value)} className={`${inputCls} w-full sm:w-auto`} />
              </label>
              <label className="block w-full sm:w-auto">
                <span className="mb-1 block text-xs text-muted-foreground">To</span>
                <input type="date" value={exEnd} onChange={e => setExEnd(e.target.value)} className={`${inputCls} w-full sm:w-auto`} />
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
    </div>
  )
}
)
