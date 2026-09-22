/**
 * Recurrence series service — DB operations for recurring tasks/jobs.
 *
 * Model:
 *  - The anchor row (the task/job the user created) is occurrence #1.
 *  - Future occurrences are virtual until touched; editing/completing/
 *    deleting a specific date writes a recurrence_exceptions row, and
 *    'materialized' exceptions point at a real cloned row so all existing
 *    per-entity features (time tracking, payments, notifications) work.
 *  - 'skipped' exceptions suppress a date without a row.
 *  - "This and future" splits the series: old series ends the day before,
 *    a new series anchored at the occurrence date carries the new template.
 *
 * All functions take a supabase client scoped to the caller (RLS enforces
 * business membership) or the service-role admin client for cron paths.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  expandOccurrences,
  nextOccurrenceOnOrAfter,
  recurrenceLabel,
  addDays,
  validateRule,
  type RecurrenceFrequency,
  type RecurrenceEndType,
  type RecurrenceRuleInput,
} from './rule'

export const VIRTUAL_ID_PREFIX = 'virtual:'

export { addDays }

export interface RecurrenceSeriesRow {
  id: string
  business_id: string
  entity_type: 'task' | 'job'
  template_id: string | null
  template_snapshot: Record<string, any>
  frequency: RecurrenceFrequency
  anchor_date: string
  anchor_day: number
  timezone: string
  end_type: RecurrenceEndType
  end_date: string | null
  max_occurrences: number | null
  active: boolean
}

export interface RecurrenceExceptionRow {
  id: string
  series_id: string
  occurrence_date: string
  kind: 'skipped' | 'materialized'
  materialized_id: string | null
}

export interface RecurrenceInput {
  frequency: RecurrenceFrequency
  end_type: RecurrenceEndType
  end_date?: string | null
  max_occurrences?: number | null
  /**
   * Intended day-of-month for monthly/yearly rules. Defaults to the day of
   * `anchorDate`; pass the ORIGINAL series' anchor_day for continuation
   * series so a split on a clamped month never re-anchors the recurrence day.
   */
  anchor_day?: number | null
}

export type EditScope = 'occurrence' | 'future' | 'series'

/** Expansion horizon for unbounded ('never') series when no explicit range end. */
export const EXPANSION_HORIZON_DAYS = 366

export function seriesToRule(s: RecurrenceSeriesRow): RecurrenceRuleInput {
  return {
    frequency: s.frequency,
    anchorDate: s.anchor_date,
    anchorDay: s.anchor_day,
    endType: s.end_type,
    endDate: s.end_date,
    maxOccurrences: s.max_occurrences,
  }
}

export function parseVirtualId(id: string): { seriesId: string; occurrenceDate: string } | null {
  if (!id.startsWith(VIRTUAL_ID_PREFIX)) return null
  const rest = id.slice(VIRTUAL_ID_PREFIX.length)
  const sep = rest.indexOf(':')
  if (sep === -1) return null
  const seriesId = rest.slice(0, sep)
  const occurrenceDate = rest.slice(sep + 1)
  if (!seriesId || !/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) return null
  return { seriesId, occurrenceDate }
}

export function makeVirtualId(seriesId: string, occurrenceDate: string): string {
  return `${VIRTUAL_ID_PREFIX}${seriesId}:${occurrenceDate}`
}

// ---------------------------------------------------------------------------
// Series creation
// ---------------------------------------------------------------------------

export async function createSeries(
  supabase: SupabaseClient,
  businessId: string,
  entityType: 'task' | 'job',
  templateId: string | null,
  templateSnapshot: Record<string, any>,
  anchorDate: string,
  timezone: string,
  recurrence: RecurrenceInput,
): Promise<{ series?: RecurrenceSeriesRow; error?: string }> {
  const anchorDay = recurrence.anchor_day ?? Number(anchorDate.split('-')[2])
  const rule: RecurrenceRuleInput = {
    frequency: recurrence.frequency,
    anchorDate,
    anchorDay,
    endType: recurrence.end_type,
    endDate: recurrence.end_date ?? null,
    maxOccurrences: recurrence.max_occurrences ?? null,
  }
  const valid = validateRule(rule)
  if (!valid.ok) return { error: valid.error }

  const { data, error } = await supabase
    .from('recurrence_series')
    .insert({
      business_id: businessId,
      entity_type: entityType,
      template_id: templateId,
      template_snapshot: templateSnapshot,
      frequency: recurrence.frequency,
      anchor_date: anchorDate,
      anchor_day: anchorDay,
      timezone,
      end_type: recurrence.end_type,
      end_date: recurrence.end_type === 'on_date' ? recurrence.end_date : null,
      max_occurrences: recurrence.end_type === 'after_occurrences' ? recurrence.max_occurrences : null,
    })
    .select()
    .single()

  if (error) return { error: error.message }
  return { series: data as RecurrenceSeriesRow }
}

/**
 * Idempotent createSeries for one-time → recurring conversion.
 *
 * recurrence_series has no unique constraint on template_id, so two
 * concurrent conversions of the same row could both insert. After inserting,
 * re-list all active series for the template: if another request won, this
 * request deactivates the duplicate it just created and adopts the winner —
 * so both callers converge on a single series. Winner is the earliest
 * created row (id tiebreak), which every concurrent caller computes
 * identically.
 */
export async function createSeriesOnce(
  supabase: SupabaseClient,
  businessId: string,
  entityType: 'task' | 'job',
  templateId: string,
  templateSnapshot: Record<string, any>,
  anchorDate: string,
  timezone: string,
  recurrence: RecurrenceInput,
): Promise<{ series?: RecurrenceSeriesRow; error?: string }> {
  const existing = await getSeriesForTemplate(supabase, businessId, entityType, templateId)
  if (existing) return { series: existing }

  const { series: created, error } = await createSeries(
    supabase, businessId, entityType, templateId, templateSnapshot, anchorDate, timezone, recurrence,
  )
  if (error || !created) return { error: error || 'Failed to create series' }

  const { data: all, error: listError } = await supabase
    .from('recurrence_series')
    .select('id, created_at')
    .eq('business_id', businessId)
    .eq('entity_type', entityType)
    .eq('template_id', templateId)
    .eq('active', true)

  if (listError) {
    // Cannot verify uniqueness — deactivate the row we just inserted rather
    // than risk leaving a silent duplicate; the caller can retry.
    await supabase.from('recurrence_series').update({ active: false }).eq('id', created.id)
    return { error: 'Could not verify the repeat schedule. Please try again.' }
  }

  const winner = (all || []).sort((a, b) =>
    a.created_at === b.created_at ? a.id.localeCompare(b.id) : a.created_at.localeCompare(b.created_at),
  )[0]

  if (winner && winner.id !== created.id) {
    // A concurrent conversion beat us — retire our duplicate and adopt theirs.
    await supabase.from('recurrence_series').update({ active: false }).eq('id', created.id)
    const adopted = await getSeriesById(supabase, businessId, winner.id)
    if (adopted) return { series: adopted }
    return { error: 'Could not verify the repeat schedule. Please try again.' }
  }

  return { series: created }
}

// ---------------------------------------------------------------------------
// Range expansion — merges virtual occurrences into a real-row result set
// ---------------------------------------------------------------------------

export interface VirtualOccurrence {
  virtual: true
  id: string // virtual:<series>:<date>
  series_id: string
  occurrence_date: string
  recurrence_label: string
}

/**
 * Fetch active series + exceptions for a business and produce virtual
 * occurrences inside [from, to]. `existingDates`/`materializedIds` are the
 * real rows already present so virtuals never duplicate them.
 */
export async function expandVirtualOccurrences(
  supabase: SupabaseClient,
  businessId: string,
  entityType: 'task' | 'job',
  from: string,
  to: string,
): Promise<{
  occurrences: Array<{ series: RecurrenceSeriesRow; date: string; virtualId: string }>
  seriesByTemplateId: Map<string, RecurrenceSeriesRow>
  seriesById: Map<string, RecurrenceSeriesRow>
  error?: string
}> {
  const { data: seriesRows, error } = await supabase
    .from('recurrence_series')
    .select('*')
    .eq('business_id', businessId)
    .eq('entity_type', entityType)
    .eq('active', true)
    .lte('anchor_date', to)

  const seriesById = new Map<string, RecurrenceSeriesRow>()
  const seriesByTemplateId = new Map<string, RecurrenceSeriesRow>()
  if (error) return { occurrences: [], seriesByTemplateId, seriesById, error: error.message }

  const series = (seriesRows || []) as RecurrenceSeriesRow[]
  for (const s of series) {
    seriesById.set(s.id, s)
    if (s.template_id) seriesByTemplateId.set(s.template_id, s)
  }
  if (series.length === 0) return { occurrences: [], seriesByTemplateId, seriesById }

  const { data: exceptionRows, error: exError } = await supabase
    .from('recurrence_exceptions')
    .select('id, series_id, occurrence_date, kind, materialized_id')
    .in('series_id', series.map((s) => s.id))
    .gte('occurrence_date', from)
    .lte('occurrence_date', to)

  if (exError) return { occurrences: [], seriesByTemplateId, seriesById, error: exError.message }

  const exceptionBySeriesDate = new Map<string, RecurrenceExceptionRow>()
  for (const e of (exceptionRows || []) as RecurrenceExceptionRow[]) {
    exceptionBySeriesDate.set(`${e.series_id}:${e.occurrence_date}`, e)
  }

  const occurrences: Array<{ series: RecurrenceSeriesRow; date: string; virtualId: string }> = []
  for (const s of series) {
    const dates = expandOccurrences(seriesToRule(s), from, to)
    for (const d of dates) {
      const ex = exceptionBySeriesDate.get(`${s.id}:${d}`)
      if (ex) continue // skipped or already materialized as a real row
      // The anchor occurrence is the real template row — never virtualize it.
      if (s.template_id && d === s.anchor_date) continue
      occurrences.push({ series: s, date: d, virtualId: makeVirtualId(s.id, d) })
    }
  }
  return { occurrences, seriesByTemplateId, seriesById }
}

/** Decorate a real row with recurrence metadata when it is a series template. */
export function recurrenceMetaForRow(
  series: RecurrenceSeriesRow | undefined,
): { series_id: string; recurrence_label: string; recurrence: { frequency: string } } | Record<string, never> {
  if (!series) return {}
  return {
    series_id: series.id,
    recurrence_label: recurrenceLabel(series),
    recurrence: { frequency: series.frequency },
  }
}

// ---------------------------------------------------------------------------
// Occurrence operations
// ---------------------------------------------------------------------------

/** Insert a 'skipped' exception for a date (idempotent). */
export async function skipOccurrence(
  supabase: SupabaseClient,
  businessId: string,
  seriesId: string,
  occurrenceDate: string,
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('recurrence_exceptions')
    .upsert(
      { business_id: businessId, series_id: seriesId, occurrence_date: occurrenceDate, kind: 'skipped', materialized_id: null },
      { onConflict: 'series_id,occurrence_date' },
    )
  return { error: error?.message }
}

/**
 * Materialize a real row for a virtual occurrence. Inserts a clone of the
 * template snapshot with `dateField` = occurrence date and records the
 * 'materialized' exception. Returns the new row.
 */
export async function materializeOccurrence(
  supabase: SupabaseClient,
  businessId: string,
  series: RecurrenceSeriesRow,
  occurrenceDate: string,
  table: 'tasks' | 'jobs',
  dateField: 'due_date' | 'scheduled_date',
  extraFields: Record<string, any> = {},
): Promise<{ row?: any; error?: string }> {
  // If already materialized, return the existing row.
  const { data: existing } = await supabase
    .from('recurrence_exceptions')
    .select('materialized_id')
    .eq('series_id', series.id)
    .eq('occurrence_date', occurrenceDate)
    .maybeSingle()
  if (existing?.materialized_id) {
    const { data: row } = await supabase.from(table).select('*').eq('id', existing.materialized_id).maybeSingle()
    if (row) return { row }
  }

  const insert: Record<string, any> = {
    ...series.template_snapshot,
    ...extraFields,
    business_id: businessId,
    series_id: series.id,
    [dateField]: occurrenceDate,
  }
  delete insert.id
  delete insert.created_at
  delete insert.updated_at

  const { data: row, error } = await supabase.from(table).insert(insert).select().single()
  if (error) return { error: error.message }

  const { error: exError } = await supabase
    .from('recurrence_exceptions')
    .upsert(
      { business_id: businessId, series_id: series.id, occurrence_date: occurrenceDate, kind: 'materialized', materialized_id: row.id },
      { onConflict: 'series_id,occurrence_date' },
    )
  if (exError) {
    // Best-effort cleanup of the orphan clone
    await supabase.from(table).delete().eq('id', row.id)
    return { error: exError.message }
  }
  return { row }
}

// ---------------------------------------------------------------------------
// Series-level operations
// ---------------------------------------------------------------------------

/**
 * "This and future": end the current series the day before `occurrenceDate`
 * and create a continuation series anchored at `occurrenceDate` with the
 * given template patch applied. Returns the new series (or null when the
 * old series is simply ended because it would have no occurrences left).
 */
export async function splitSeriesAt(
  supabase: SupabaseClient,
  businessId: string,
  series: RecurrenceSeriesRow,
  occurrenceDate: string,
  table: 'tasks' | 'jobs',
  dateField: 'due_date' | 'scheduled_date',
  templatePatch: Record<string, any>,
): Promise<{ newSeries?: RecurrenceSeriesRow; error?: string }> {
  const dayBefore = addDays(occurrenceDate, -1)

  if (dayBefore < series.anchor_date) {
    // Occurrence is the anchor itself — replacing whole series semantics.
    // Deactivate the old series and create a fresh one.
    const { error: deactivateError } = await supabase
      .from('recurrence_series')
      .update({ active: false })
      .eq('id', series.id)
    if (deactivateError) return { error: deactivateError.message }
  } else {
    const { error: endError } = await supabase
      .from('recurrence_series')
      .update({ end_type: 'on_date', end_date: dayBefore, max_occurrences: null })
      .eq('id', series.id)
    if (endError) return { error: endError.message }
  }

  // Remove the old series' materialized rows on/after the split date — the new
  // series renders those dates itself, so leaving them would duplicate.
  const { data: futureExceptions } = await supabase
    .from('recurrence_exceptions')
    .select('materialized_id')
    .eq('series_id', series.id)
    .eq('kind', 'materialized')
    .gte('occurrence_date', occurrenceDate)
  const orphanIds = (futureExceptions || []).map((e: any) => e.materialized_id).filter(Boolean)
  if (orphanIds.length > 0) {
    await supabase.from(table).delete().in('id', orphanIds)
    await supabase.from('recurrence_exceptions').delete().in('materialized_id', orphanIds)
  }

  const newSnapshot = { ...series.template_snapshot, ...templatePatch, [dateField]: occurrenceDate }
  const { series: newSeries, error } = await createSeries(
    supabase,
    businessId,
    series.entity_type,
    null, // continuation series has no anchor row; its first occurrence materializes on demand
    newSnapshot,
    occurrenceDate,
    series.timezone,
    {
      frequency: series.frequency,
      end_type: series.end_type,
      end_date: series.end_date,
      max_occurrences: null,
      // Preserve the original intended day-of-month — splitting on a clamped
      // date (e.g. Feb 28 of a day-31 series) must not re-anchor to 28.
      anchor_day: series.anchor_day,
    },
  )
  if (error) return { error }
  return { newSeries }
}

/**
 * "Delete this and future": end the series the day before `occurrenceDate`.
 * If the occurrence is at/before the anchor, deactivates the series entirely.
 * Materialized future rows (>= occurrenceDate) are deleted so they disappear
 * from the schedule; past materialized rows remain as historical records.
 */
export async function endSeriesBefore(
  supabase: SupabaseClient,
  businessId: string,
  series: RecurrenceSeriesRow,
  occurrenceDate: string,
  table: 'tasks' | 'jobs',
): Promise<{ error?: string }> {
  const dayBefore = addDays(occurrenceDate, -1)

  // Delete materialized occurrences on/after the cut date (future work only).
  const { data: futureExceptions } = await supabase
    .from('recurrence_exceptions')
    .select('materialized_id')
    .eq('series_id', series.id)
    .eq('kind', 'materialized')
    .gte('occurrence_date', occurrenceDate)

  const materializedIds = (futureExceptions || [])
    .map((e: any) => e.materialized_id)
    .filter(Boolean)

  if (materializedIds.length > 0) {
    const { error: delError } = await supabase.from(table).delete().in('id', materializedIds)
    if (delError) return { error: delError.message }
    await supabase.from('recurrence_exceptions').delete().in('materialized_id', materializedIds)
  }

  if (dayBefore < series.anchor_date) {
    const { error } = await supabase
      .from('recurrence_series')
      .update({ active: false })
      .eq('id', series.id)
    return { error: error?.message }
  }

  const { error } = await supabase
    .from('recurrence_series')
    .update({ end_type: 'on_date', end_date: dayBefore, max_occurrences: null })
    .eq('id', series.id)
  return { error: error?.message }
}

/** Entire-series delete: deactivate the series; past materialized rows stay
 *  as ordinary historical records; future materialized rows are removed. */
export async function deleteSeries(
  supabase: SupabaseClient,
  businessId: string,
  series: RecurrenceSeriesRow,
  table: 'tasks' | 'jobs',
  todayStr: string,
): Promise<{ error?: string }> {
  const { data: futureExceptions } = await supabase
    .from('recurrence_exceptions')
    .select('materialized_id')
    .eq('series_id', series.id)
    .eq('kind', 'materialized')
    .gte('occurrence_date', todayStr)

  const ids = (futureExceptions || []).map((e: any) => e.materialized_id).filter(Boolean)
  if (ids.length > 0) {
    await supabase.from(table).delete().in('id', ids)
  }
  const { error } = await supabase
    .from('recurrence_series')
    .update({ active: false })
    .eq('id', series.id)
  return { error: error?.message }
}

/**
 * Next pending reminder-notification instant for a recurring task series.
 *
 * The template row's reminder_notify_at always points at the next
 * un-notified occurrence. After a notification fires, the cron re-arms the
 * template with the notify instant of the first occurrence whose notify
 * time is still in the future — skipped exception dates never notify.
 * Returns null when the series has ended or no pending occurrence exists.
 */
export async function nextPendingNotifyAt(
  supabase: SupabaseClient,
  series: RecurrenceSeriesRow,
  notifyFor: (dueDate: string) => string | null,
  nowIso: string,
): Promise<string | null> {
  const rule = seriesToRule(series)

  const { data: exceptionRows } = await supabase
    .from('recurrence_exceptions')
    .select('occurrence_date')
    .eq('series_id', series.id)
    .eq('kind', 'skipped')
  const skipped = new Set((exceptionRows || []).map((e: any) => e.occurrence_date))

  // Single windowed expansion covering now plus the widest possible gap
  // (yearly ≈ 366 days) — bounded by the rule engine's cap.
  const todayStr = nowIso.slice(0, 10)
  const windowEnd = addDays(todayStr, 400)
  const candidates = expandOccurrences(rule, series.anchor_date, windowEnd)
  for (const date of candidates) {
    if (skipped.has(date)) continue
    const notifyAt = notifyFor(date)
    if (!notifyAt) return null // template has no reminder configured
    if (notifyAt > nowIso) return notifyAt
  }
  return null
}

/** Look up the series for a template row (entity id), if any. */
export async function getSeriesForTemplate(
  supabase: SupabaseClient,
  businessId: string,
  entityType: 'task' | 'job',
  templateId: string,
): Promise<RecurrenceSeriesRow | null> {
  const { data } = await supabase
    .from('recurrence_series')
    .select('*')
    .eq('business_id', businessId)
    .eq('entity_type', entityType)
    .eq('template_id', templateId)
    .eq('active', true)
    .maybeSingle()
  return (data as RecurrenceSeriesRow) || null
}

/** Look up a series by id scoped to a business. */
export async function getSeriesById(
  supabase: SupabaseClient,
  businessId: string,
  seriesId: string,
): Promise<RecurrenceSeriesRow | null> {
  const { data } = await supabase
    .from('recurrence_series')
    .select('*')
    .eq('id', seriesId)
    .eq('business_id', businessId)
    .eq('active', true)
    .maybeSingle()
  return (data as RecurrenceSeriesRow) || null
}
