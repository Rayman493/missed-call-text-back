/**
 * Recurrence rule engine — pure date math over YYYY-MM-DD strings.
 *
 * ReplyFlow stores task/job dates and times as separate `date` + `time`
 * columns in *local business time*. Recurrence therefore operates purely
 * on calendar dates: an occurrence always inherits the template's local
 * time fields, so local clock time is structurally preserved across DST —
 * no UTC interval arithmetic is ever applied to wall-clock times.
 *
 * Monthly semantics: the series keeps an immutable `anchorDay` (day of
 * month of the first occurrence). Each month clamps to its last valid
 * day — Jan 31 -> Feb 28/29 -> Mar 31 — without cumulative drift.
 *
 * Yearly semantics: same clamp applied to Feb 29 -> Feb 28 on non-leap
 * years while the anchor (month + day) stays Feb 29.
 */

export type RecurrenceFrequency =
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'yearly'

export type RecurrenceEndType = 'never' | 'on_date' | 'after_occurrences'

export interface RecurrenceRuleInput {
  frequency: RecurrenceFrequency
  /** YYYY-MM-DD of the first occurrence. */
  anchorDate: string
  /**
   * Intended day-of-month (1-31) for monthly/yearly recurrence — preserved
   * separately from anchorDate so clamped months never drift. For
   * monthly/yearly rules this may legitimately differ from anchorDate's day
   * (e.g. a continuation series starting on a clamped Feb 28 keeps
   * anchorDay=31). For other frequencies it should equal anchorDate's day.
   */
  anchorDay: number
  endType: RecurrenceEndType
  /** Inclusive final occurrence date when endType === 'on_date'. */
  endDate?: string | null
  /** Total number of occurrences when endType === 'after_occurrences'. */
  maxOccurrences?: number | null
}

export const RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = [
  'daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly',
]

export const RECURRENCE_END_TYPES: RecurrenceEndType[] = [
  'never', 'on_date', 'after_occurrences',
]

// ---------------------------------------------------------------------------
// Date primitives — all arithmetic is done on the UTC calendar grid so that
// YYYY-MM-DD strings are never affected by host timezone or DST.
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidDateString(d: string | null | undefined): d is string {
  if (!d || !DATE_RE.test(d)) return false
  const [y, m, day] = d.split('-').map(Number)
  if (m < 1 || m > 12 || day < 1 || day > daysInMonth(y, m)) return false
  return true
}

export function daysInMonth(year: number, month: number): number {
  // month is 1-based; Date.UTC(y, m, 0) gives the last day of month m.
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function parse(d: string): { y: number; m: number; day: number } {
  const [y, m, day] = d.split('-').map(Number)
  return { y, m, day }
}

export function formatDate(y: number, m: number, day: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function addDays(d: string, n: number): string {
  const { y, m, day } = parse(d)
  const t = new Date(Date.UTC(y, m - 1, day) + n * 86400000)
  return formatDate(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

export function diffDays(a: string, b: string): number {
  const pa = parse(a); const pb = parse(b)
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.day) - Date.UTC(pa.y, pa.m - 1, pa.day)) / 86400000
  )
}

/** 0 = Sunday … 6 = Saturday */
export function weekdayOf(d: string): number {
  const { y, m, day } = parse(d)
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay()
}

function clampDay(y: number, m: number, day: number): string {
  return formatDate(y, m, Math.min(day, daysInMonth(y, m)))
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface RecurrenceValidationResult {
  ok: boolean
  error?: string
}

export function validateRule(rule: RecurrenceRuleInput): RecurrenceValidationResult {
  if (!RECURRENCE_FREQUENCIES.includes(rule.frequency)) {
    return { ok: false, error: 'Invalid recurrence frequency' }
  }
  if (!RECURRENCE_END_TYPES.includes(rule.endType)) {
    return { ok: false, error: 'Invalid recurrence end type' }
  }
  if (!isValidDateString(rule.anchorDate)) {
    return { ok: false, error: 'Invalid recurrence anchor date' }
  }
  if (!Number.isInteger(rule.anchorDay) || rule.anchorDay < 1 || rule.anchorDay > 31) {
    return { ok: false, error: 'Invalid recurrence anchor day' }
  }
  const { day } = parse(rule.anchorDate)
  // anchorDay is the *intended* day-of-month. It may differ from anchorDate's
  // day for monthly/yearly rules (a continuation series that begins on a
  // clamped date still recurs on the original day). For frequencies where
  // anchorDay is unused, a mismatch indicates a caller bug.
  if (rule.anchorDay !== day && rule.frequency !== 'monthly' && rule.frequency !== 'yearly') {
    return { ok: false, error: 'Anchor day does not match anchor date' }
  }
  if (rule.endType === 'on_date') {
    if (!isValidDateString(rule.endDate)) {
      return { ok: false, error: 'Invalid recurrence end date' }
    }
    if (rule.endDate! < rule.anchorDate) {
      return { ok: false, error: 'End date cannot be before the first occurrence' }
    }
  }
  if (rule.endType === 'after_occurrences') {
    const n = rule.maxOccurrences
    if (!Number.isInteger(n) || n! < 1 || n! > 10000) {
      return { ok: false, error: 'Invalid occurrence count' }
    }
  }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

/** Hard cap on generated occurrences per expansion call (pathological-range guard). */
const MAX_EXPANDED = 2000

function withinEnd(rule: RecurrenceRuleInput, date: string, index: number): boolean {
  if (rule.endType === 'on_date' && rule.endDate && date > rule.endDate) return false
  if (rule.endType === 'after_occurrences' && index >= (rule.maxOccurrences ?? 0)) return false
  return true
}

function* iterateCandidates(rule: RecurrenceRuleInput): Generator<string> {
  const { y, m } = parse(rule.anchorDate)
  switch (rule.frequency) {
    case 'daily':
    case 'weekdays': {
      for (let d = rule.anchorDate; ; d = addDays(d, 1)) {
        if (rule.frequency === 'daily') { yield d; continue }
        const wd = weekdayOf(d)
        if (wd >= 1 && wd <= 5) yield d
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'weekly': {
      const step = rule.frequency === 'weekly' ? 7 : 14
      for (let d = rule.anchorDate; ; d = addDays(d, step)) yield d
    }
    // eslint-disable-next-line no-fallthrough
    case 'biweekly': {
      for (let d = rule.anchorDate; ; d = addDays(d, 14)) yield d
    }
    // eslint-disable-next-line no-fallthrough
    case 'monthly': {
      let y0 = y, m0 = m
      for (;;) {
        yield clampDay(y0, m0, rule.anchorDay)
        m0 += 1
        if (m0 > 12) { m0 = 1; y0 += 1 }
      }
    }
    // eslint-disable-next-line no-fallthrough
    case 'yearly': {
      for (let yy = y; ; yy += 1) {
        yield clampDay(yy, m, rule.anchorDay)
      }
    }
  }
}

/**
 * All occurrence dates in [from, to] (inclusive), honouring the end rule.
 * Returns at most MAX_EXPANDED entries.
 */
export function expandOccurrences(
  rule: RecurrenceRuleInput,
  from: string,
  to: string,
): string[] {
  if (to < rule.anchorDate || to < from) return []
  const out: string[] = []
  let index = 0 // occurrence ordinal counting from the anchor
  for (const d of iterateCandidates(rule)) {
    if (!withinEnd(rule, d, index)) break
    if (d > to) break
    if (d >= from) out.push(d)
    index += 1
    if (index > MAX_EXPANDED) break
  }
  return out
}

/** The first occurrence on or after `date`, or null when the series has ended. */
export function nextOccurrenceOnOrAfter(
  rule: RecurrenceRuleInput,
  date: string,
): string | null {
  let index = 0
  for (const d of iterateCandidates(rule)) {
    if (!withinEnd(rule, d, index)) return null
    if (d >= date) return d
    index += 1
    if (index > MAX_EXPANDED) return null
  }
  return null
}

/** Human-readable label, e.g. "Repeats weekly". */
export function recurrenceLabel(rule: Pick<RecurrenceRuleInput, 'frequency'>): string {
  switch (rule.frequency) {
    case 'daily': return 'Repeats daily'
    case 'weekdays': return 'Repeats weekdays'
    case 'weekly': return 'Repeats weekly'
    case 'biweekly': return 'Repeats every 2 weeks'
    case 'monthly': return 'Repeats monthly'
    case 'yearly': return 'Repeats yearly'
  }
}

/**
 * Build RFC-5545 RRULE strings for Google Calendar.
 *
 * Returns an ARRAY of RRULE strings — Google treats `recurrence: [...]` as a
 * union of rules on ONE master event, and dedupes instances sharing a start
 * instant, so overlapping rules never produce duplicates.
 *
 * Monthly clamp semantics (ReplyFlow clamps to the last valid day) are
 * represented exactly, without per-month events:
 *  - day ≤ 28:  FREQ=MONTHLY;BYMONTHDAY=d
 *  - day 29/30: BYMONTHDAY=d (long months) + a second rule for February's last
 *               day (BYMONTH=2;BYMONTHDAY=-1). In leap years both rules can
 *               yield Feb 29 — Google dedupes the identical instance.
 *  - day 31:    BYMONTHDAY=31 + BYMONTHDAY=-1 restricted to months lacking a
 *               31st (2,4,6,9,11) — same clamp as ReplyFlow.
 */
export function toGoogleRRules(rule: RecurrenceRuleInput): string[] {
  const parts: string[] = []
  const extraParts: string[] | null = (() => {
    if (rule.frequency !== 'monthly' || rule.anchorDay <= 28) return null
    if (rule.anchorDay <= 30) return ['FREQ=MONTHLY', 'BYMONTH=2', 'BYMONTHDAY=-1']
    return ['FREQ=MONTHLY', 'BYMONTH=2,4,6,9,11', 'BYMONTHDAY=-1']
  })()

  switch (rule.frequency) {
    case 'daily': parts.push('FREQ=DAILY'); break
    case 'weekdays': parts.push('FREQ=WEEKLY', 'BYDAY=MO,TU,WE,TH,FR'); break
    case 'weekly': parts.push('FREQ=WEEKLY'); break
    case 'biweekly': parts.push('FREQ=WEEKLY', 'INTERVAL=2'); break
    case 'monthly':
      parts.push('FREQ=MONTHLY', `BYMONTHDAY=${rule.anchorDay}`)
      break
    case 'yearly': parts.push('FREQ=YEARLY'); break
  }

  let endPart = ''
  if (rule.endType === 'on_date' && rule.endDate) {
    endPart = `;UNTIL=${rule.endDate.replace(/-/g, '')}T235959Z`
  } else if (rule.endType === 'after_occurrences' && rule.maxOccurrences) {
    endPart = `;COUNT=${rule.maxOccurrences}`
  }

  const rules = [`RRULE:${parts.join(';')}${endPart}`]
  if (extraParts) rules.push(`RRULE:${extraParts.join(';')}${endPart}`)
  return rules
}

/** Single-rule convenience for non-monthly callers/tests. */
export function toGoogleRRule(rule: RecurrenceRuleInput): string {
  return toGoogleRRules(rule)[0]
}
