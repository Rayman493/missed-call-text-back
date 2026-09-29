/**
 * Job ↔ Google Calendar synchronization.
 *
 * Job creation already syncs (jobs POST). This module keeps the linked event
 * consistent for the mutations that previously diverged:
 *
 *   - reschedule/edit of a synced standalone job  → PATCH its event
 *   - delete of a synced job                      → DELETE its event
 *   - recurring series (Google RRULE master)      → per-instance exception for
 *     occurrence edits/skips, RRULE truncation for "this and future" /
 *     "delete future", master delete for series delete, and a NEW master for
 *     a split continuation series.
 *
 * All operations are best-effort side effects: the jobs row is canonical.
 * Failures are surfaced to the caller and recorded on calendar_sync_status
 * so divergence is observable — they never silently claim success.
 *
 * Google instance ids: recurring instances are addressed as
 * `<masterId>_<YYYYMMDD>T<HHMMSS>Z` (the instance's original UTC start).
 * PATCHing an instance id creates/updates that occurrence's exception;
 * DELETing it cancels that occurrence (EXDATE-equivalent).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fromZonedTime } from 'date-fns-tz'
import { getGoogleAccessToken } from '@/lib/google/token'
import { googleEventMasterId } from '@/lib/google/calendar-event-id'
import { toGoogleRRules } from '@/lib/recurrence/rule'
import type { RecurrenceSeriesRow } from '@/lib/recurrence/service'

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const DEFAULT_TZ = 'America/New_York'

/** Snapshot key carrying the Google master id for a continuation series
 *  (template_id is null there). Stripped before materialization. */
export const SERIES_MASTER_KEY = '_google_master_id'

export interface JobLikeTimes {
  scheduled_date: string | null
  scheduled_time: string | null
  scheduled_end_time: string | null
}

export type SyncOutcome =
  | { synced: true }
  | { synced: false; skipped?: boolean; error?: string }

// ---------------------------------------------------------------------------
// Low-level Google calls (same retry/backoff convention as the calendar routes)
// ---------------------------------------------------------------------------

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options)
      if (response.ok || (response.status >= 400 && response.status < 500)) return response
      if (response.status >= 500 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
        continue
      }
      return response
    } catch (error) {
      lastError = error as Error
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
        continue
      }
    }
  }
  throw lastError || new Error('Max retries exceeded')
}

/** Access token + business timezone for job sync, or null when Google is not connected. */
export async function getJobSyncContext(
  businessId: string,
): Promise<{ accessToken: string; timezone: string } | null> {
  try {
    const { accessToken } = await getGoogleAccessToken(businessId)
    return { accessToken, timezone: DEFAULT_TZ }
  } catch {
    return null
  }
}

async function getBusinessTimezone(
  supabase: SupabaseClient,
  businessId: string,
): Promise<string> {
  const { data: biz } = await supabase
    .from('businesses')
    .select('business_hours_timezone')
    .eq('id', businessId)
    .maybeSingle()
  return biz?.business_hours_timezone || DEFAULT_TZ
}

// ---------------------------------------------------------------------------
// Event-id helpers
// ---------------------------------------------------------------------------

/** `<masterId>_<YYYYMMDD>T<HHMMSS>Z` for an occurrence's original start instant. */
export function googleInstanceId(
  masterId: string,
  occurrenceDate: string,
  localTime: string,
  timezone: string,
): string {
  const instant = fromZonedTime(`${occurrenceDate}T${localTime}:00`, timezone)
  const stamp = instant.toISOString().replace(/[-:]|\.\d{3}/g, '')
  return `${masterId}_${stamp}`
}

// ---------------------------------------------------------------------------
// Master-id resolution for a recurrence series
// ---------------------------------------------------------------------------

/**
 * The Google master event id backing a synced job series: the anchor row's
 * stored id for template-anchored series, or the namespaced snapshot key
 * recorded when a split continuation series got its own master.
 */
export async function getSeriesMasterEventId(
  supabase: SupabaseClient,
  businessId: string,
  series: RecurrenceSeriesRow,
): Promise<string | null> {
  if (series.template_id) {
    const { data: anchor } = await supabase
      .from('jobs')
      .select('google_calendar_event_id')
      .eq('id', series.template_id)
      .eq('business_id', businessId)
      .maybeSingle()
    if (anchor?.google_calendar_event_id) return anchor.google_calendar_event_id
  }
  const snapshotId = (series.template_snapshot as any)?.[SERIES_MASTER_KEY]
  return typeof snapshotId === 'string' && snapshotId ? snapshotId : null
}

// ---------------------------------------------------------------------------
// Event payload construction (mirrors jobs POST event shape)
// ---------------------------------------------------------------------------

function timedEndTime(scheduled_time: string, scheduled_end_time: string | null): string {
  if (scheduled_end_time) return scheduled_end_time
  const [h, m] = scheduled_time.split(':').map(Number)
  return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function jobEventTimes(job: JobLikeTimes, timezone: string): {
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
} | null {
  if (!job.scheduled_date || !job.scheduled_time) return null
  const end = timedEndTime(job.scheduled_time, job.scheduled_end_time)
  return {
    start: { dateTime: `${job.scheduled_date}T${job.scheduled_time}:00`, timeZone: timezone },
    end: { dateTime: `${job.scheduled_date}T${end}:00`, timeZone: timezone },
  }
}

// ---------------------------------------------------------------------------
// Primitive operations
// ---------------------------------------------------------------------------

export async function patchGoogleEvent(
  accessToken: string,
  eventId: string,
  body: Record<string, any>,
): Promise<{ ok: boolean; gone: boolean; status: number }> {
  try {
    const res = await fetchWithRetry(`${GCAL_BASE}/${encodeURIComponent(eventId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status }
  } catch (error) {
    console.error('[JOB SYNC] event PATCH threw:', error)
    return { ok: false, gone: false, status: 0 }
  }
}

/** Google 404/410 = already gone — the desired end state. */
export async function deleteGoogleEvent(
  accessToken: string,
  eventId: string,
): Promise<{ ok: boolean; alreadyGone: boolean; status: number }> {
  try {
    const res = await fetchWithRetry(`${GCAL_BASE}/${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    return {
      ok: res.ok || res.status === 404 || res.status === 410,
      alreadyGone: res.status === 404 || res.status === 410,
      status: res.status,
    }
  } catch (error) {
    console.error('[JOB SYNC] event DELETE threw:', error)
    return { ok: false, alreadyGone: false, status: 0 }
  }
}

export async function createGoogleEvent(
  accessToken: string,
  body: Record<string, any>,
): Promise<{ ok: boolean; eventId: string | null; status: number }> {
  try {
    const res = await fetchWithRetry(GCAL_BASE, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { ok: false, eventId: null, status: res.status }
    const ev = await res.json()
    return { ok: true, eventId: ev.id ?? null, status: res.status }
  } catch (error) {
    console.error('[JOB SYNC] event POST threw:', error)
    return { ok: false, eventId: null, status: 0 }
  }
}

/**
 * Truncate a recurring master so occurrences on/after `beforeDateKey` stop
 * rendering — same UNTIL rewrite as the appointment DELETE scope=future path.
 */
export async function truncateRecurringMaster(
  accessToken: string,
  masterId: string,
  beforeDateKey: string,
): Promise<{ ok: boolean; gone: boolean }> {
  try {
    const masterRes = await fetchWithRetry(`${GCAL_BASE}/${encodeURIComponent(masterId)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (masterRes.status === 404 || masterRes.status === 410) return { ok: true, gone: true }
    if (!masterRes.ok) return { ok: false, gone: false }
    const master = await masterRes.json()
    if (!Array.isArray(master.recurrence) || master.recurrence.length === 0) {
      return { ok: false, gone: false }
    }
    const dayBefore = new Date(`${beforeDateKey}T12:00:00Z`)
    dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
    const until = `${dayBefore.toISOString().slice(0, 10).replace(/-/g, '')}T235959Z`
    const newRecurrence = master.recurrence.map((r: string) => {
      if (!r.startsWith('RRULE:')) return r
      return `${r.replace(/;UNTIL=[^;]+|;COUNT=\d+/g, '')};UNTIL=${until}`
    })
    const patchRes = await fetchWithRetry(`${GCAL_BASE}/${encodeURIComponent(masterId)}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ recurrence: newRecurrence }),
    })
    return { ok: patchRes.ok, gone: false }
  } catch (error) {
    console.error('[JOB SYNC] master truncation threw:', error)
    return { ok: false, gone: false }
  }
}

// ---------------------------------------------------------------------------
// Row-level sync status bookkeeping (existing calendar_sync_* columns)
// ---------------------------------------------------------------------------

export async function markJobSyncStatus(
  supabase: SupabaseClient,
  jobId: string,
  status: 'pending' | 'synced' | 'failed',
  errorMessage?: string | null,
): Promise<void> {
  try {
    await supabase
      .from('jobs')
      .update({
        calendar_sync_status: status,
        calendar_sync_error: status === 'failed' ? (errorMessage ?? 'unknown').slice(0, 500) : null,
        calendar_last_sync_attempt_at: new Date().toISOString(),
        ...(status === 'synced' ? { calendar_last_synced_at: new Date().toISOString() } : {}),
      })
      .eq('id', jobId)
  } catch (error) {
    console.error('[JOB SYNC] status update failed:', error)
  }
}

// ---------------------------------------------------------------------------
// Orchestration — called from the jobs [id] route after local mutations commit
// ---------------------------------------------------------------------------

/**
 * Sync a persisted job update to its linked Google event.
 *
 *   - standalone synced job  → PATCH the stored event id
 *   - anchor row of a synced series, occurrence scope → PATCH the occurrence
 *     INSTANCE (master keeps expanding the rest of the series)
 *   - materialized occurrence of a synced series   → PATCH its instance; if
 *     that instance is gone, create a standalone event and link the row
 *   - series scope                                → PATCH the master (times +
 *     summary + RRULE when the rule changed)
 *
 * Returns a SyncOutcome; callers record calendar_sync_status on the row.
 */
export async function syncJobUpdateToGoogle(
  supabase: SupabaseClient,
  businessId: string,
  job: {
    id: string
    title: string | null
    customer_name?: string | null
    service_address: string | null
    scheduled_date: string | null
    scheduled_time: string | null
    scheduled_end_time: string | null
    google_calendar_event_id: string | null
  },
  opts: {
    editScope: 'occurrence' | 'future' | 'series'
    series?: RecurrenceSeriesRow | null
    /** Original occurrence date for materialized/virtual edits. */
    occurrenceDate?: string | null
    /** New RRULE input when the recurrence rule itself changed (series scope). */
    recurrence?: { frequency: string; end_type?: string; end_date?: string | null; max_occurrences?: number | null } | null
  },
): Promise<SyncOutcome> {
  // Nothing linked to Google — skip even the token lookup so unsynced jobs
  // never trigger a Google call.
  if (!opts.series && !job.google_calendar_event_id) return { synced: false, skipped: true }
  const ctx = await getJobSyncContext(businessId)
  if (!ctx) return { synced: false, skipped: true }
  const { accessToken } = ctx
  const timezone = opts.series?.timezone || (await getBusinessTimezone(supabase, businessId))

  // ---- Series-scope edit: patch the master event in place -----------------
  if (opts.editScope === 'series' && opts.series) {
    const masterId = await getSeriesMasterEventId(supabase, businessId, opts.series)
    if (!masterId) return { synced: false, skipped: true }
    const times = jobEventTimes(job, timezone)
    const body: Record<string, any> = {
      ...(job.title ? { summary: job.title } : {}),
      ...(job.service_address !== undefined ? { location: job.service_address || '' } : {}),
      ...(times ? { start: times.start, end: times.end } : {}),
    }
    if (opts.recurrence?.frequency) {
      const anchorDate = job.scheduled_date || opts.series.anchor_date
      body.recurrence = toGoogleRRules({
        frequency: opts.recurrence.frequency as any,
        anchorDate,
        anchorDay: opts.series.anchor_day,
        endType: (opts.recurrence.end_type as any) || 'never',
        endDate: opts.recurrence.end_type === 'on_date' ? opts.recurrence.end_date : null,
        maxOccurrences: opts.recurrence.end_type === 'after_occurrences' ? opts.recurrence.max_occurrences : null,
      })
    }
    const res = await patchGoogleEvent(accessToken, masterId, body)
    if (res.ok) return { synced: true }
    return { synced: false, error: res.gone ? 'linked calendar event no longer exists' : `Google Calendar API returned ${res.status}` }
  }

  // ---- Occurrence-level edits on a synced series --------------------------
  if (opts.series) {
    const isAnchorRow = opts.series.template_id === job.id
    const masterId = await getSeriesMasterEventId(supabase, businessId, opts.series)
    if (!masterId) return { synced: false, skipped: true }
    const times = jobEventTimes(job, timezone)
    const body: Record<string, any> = {
      ...(job.title ? { summary: job.title } : {}),
      ...(job.service_address !== undefined ? { location: job.service_address || '' } : {}),
      ...(times ? { start: times.start, end: times.end } : {}),
    }

    // A materialized row that already carries an exception/standalone id is
    // patched in place — the stored id stays valid when the exception moves.
    let instanceId = job.google_calendar_event_id && !isAnchorRow
      ? job.google_calendar_event_id
      : null

    if (!instanceId) {
      // Original start of the edited occurrence: the caller passes the
      // pre-edit/virtual occurrence date; materialized rows without a link
      // resolve their date from the exception record.
      let occDate = opts.occurrenceDate ?? null
      if (!occDate && !isAnchorRow) {
        const { data: ex } = await supabase
          .from('recurrence_exceptions')
          .select('occurrence_date')
          .eq('series_id', opts.series.id)
          .eq('materialized_id', job.id)
          .maybeSingle()
        occDate = ex?.occurrence_date ?? null
      }
      const snapTime =
        (opts.series.template_snapshot as any)?.scheduled_time || job.scheduled_time
      if (!occDate || !snapTime) return { synced: false, skipped: true }
      instanceId = googleInstanceId(masterId, occDate, snapTime, timezone)
    }

    const res = await patchGoogleEvent(accessToken, instanceId, body)
    if (res.ok) {
      // A materialized row now owns this instance — link it so future
      // edits/deletes hit the exception, not the master. The ANCHOR row keeps
      // the master id: it is the series' canonical Google link.
      if (!isAnchorRow && job.id && job.google_calendar_event_id !== instanceId) {
        await supabase
          .from('jobs')
          .update({ google_calendar_event_id: instanceId })
          .eq('id', job.id)
          .eq('business_id', businessId)
      }
      return { synced: true }
    }
    if (res.gone) {
      // Instance absent from the master expansion — fall back to a standalone
      // event so the edited occurrence still exists on Google.
      if (times) {
        const created = await createGoogleEvent(accessToken, {
          summary: job.title || 'Job',
          location: job.service_address || undefined,
          start: times.start,
          end: times.end,
          extendedProperties: { private: { replyflow_created: 'true', replyflow_job_id: job.id } },
        })
        if (created.ok && created.eventId) {
          if (!isAnchorRow) {
            await supabase
              .from('jobs')
              .update({ google_calendar_event_id: created.eventId })
              .eq('id', job.id)
              .eq('business_id', businessId)
          }
          return { synced: true }
        }
      }
      return { synced: false, error: 'linked calendar occurrence no longer exists' }
    }
    return { synced: false, error: `Google Calendar API returned ${res.status}` }
  }

  // ---- Standalone synced job ---------------------------------------------
  if (!job.google_calendar_event_id) return { synced: false, skipped: true }
  const times = jobEventTimes(job, timezone)
  const res = await patchGoogleEvent(accessToken, job.google_calendar_event_id, {
    ...(job.title ? { summary: job.title } : {}),
    ...(job.service_address !== undefined ? { location: job.service_address || '' } : {}),
    ...(times ? { start: times.start, end: times.end } : {}),
  })
  if (res.ok) return { synced: true }
  return { synced: false, error: res.gone ? 'linked calendar event no longer exists' : `Google Calendar API returned ${res.status}` }
}

/**
 * After a "this and future" split: truncate the OLD master at the split
 * boundary and create a NEW recurring master for the continuation series,
 * recorded under template_snapshot[SERIES_MASTER_KEY].
 */
export async function syncSeriesSplitToGoogle(
  supabase: SupabaseClient,
  businessId: string,
  oldSeries: RecurrenceSeriesRow,
  newSeries: RecurrenceSeriesRow | undefined,
  splitDate: string,
): Promise<SyncOutcome> {
  const ctx = await getJobSyncContext(businessId)
  if (!ctx) return { synced: false, skipped: true }
  const { accessToken } = ctx
  const timezone = oldSeries.timezone || DEFAULT_TZ

  const oldMasterId = await getSeriesMasterEventId(supabase, businessId, oldSeries)
  if (oldMasterId) {
    const trunc = await truncateRecurringMaster(accessToken, oldMasterId, splitDate)
    if (!trunc.ok && !trunc.gone) {
      return { synced: false, error: 'Failed to truncate the existing recurring event' }
    }
  }

  if (!newSeries) return { synced: true }

  const snap: any = newSeries.template_snapshot || {}
  const times = jobEventTimes(
    {
      scheduled_date: splitDate,
      scheduled_time: snap.scheduled_time,
      scheduled_end_time: snap.scheduled_end_time,
    },
    timezone,
  )
  if (!times) return { synced: false, error: 'Continuation series has no scheduled time to sync' }

  const created = await createGoogleEvent(accessToken, {
    summary: snap.title || 'Job',
    description: snap.notes || '',
    location: snap.service_address || undefined,
    start: times.start,
    end: times.end,
    recurrence: toGoogleRRules({
      frequency: newSeries.frequency,
      anchorDate: newSeries.anchor_date,
      anchorDay: newSeries.anchor_day,
      endType: newSeries.end_type,
      endDate: newSeries.end_date,
      maxOccurrences: newSeries.max_occurrences,
    }),
    extendedProperties: { private: { replyflow_created: 'true' } },
  })
  if (!created.ok || !created.eventId) {
    return { synced: false, error: `Google Calendar API returned ${created.status}` }
  }

  // Persist the new master id on the continuation series snapshot so later
  // skip/split/delete operations can find it.
  const { error: snapError } = await supabase
    .from('recurrence_series')
    .update({ template_snapshot: { ...snap, [SERIES_MASTER_KEY]: created.eventId } })
    .eq('id', newSeries.id)
    .eq('business_id', businessId)
  if (snapError) {
    console.error('[JOB SYNC] could not persist continuation master id:', snapError)
    return { synced: false, error: 'Synced event created but could not be linked to the new series' }
  }
  return { synced: true }
}

/**
 * Sync a job/occurrence/series deletion to Google.
 *
 *   - row delete (standalone or materialized occurrence) → DELETE stored id
 *   - anchor row of a synced series (occurrence scope)    → DELETE its instance
 *   - virtual occurrence skip                           → DELETE its instance
 *   - scope=future                                       → truncate the master
 *   - scope=series                                       → DELETE the master
 */
export async function syncJobDeleteToGoogle(
  supabase: SupabaseClient,
  businessId: string,
  opts: {
    scope: 'occurrence' | 'future' | 'series'
    series?: RecurrenceSeriesRow | null
    /** Deleting this real row (standalone job, anchor, or materialized clone). */
    jobRow?: { id: string; google_calendar_event_id: string | null; scheduled_time?: string | null } | null
    /** Occurrence date for virtual-skip / anchor-instance deletes. */
    occurrenceDate?: string | null
  },
): Promise<SyncOutcome> {
  const ctx = await getJobSyncContext(businessId)
  if (!ctx) return { synced: false, skipped: true }
  const { accessToken } = ctx

  const series = opts.series ?? null
  const masterId = series ? await getSeriesMasterEventId(supabase, businessId, series) : null

  if (opts.scope === 'series') {
    if (masterId) {
      const res = await deleteGoogleEvent(accessToken, masterId)
      if (!res.ok) return { synced: false, error: `Google Calendar API returned ${res.status}` }
    }
    // The deleted row may also carry a standalone/exception id distinct from master.
    const rowId = opts.jobRow?.google_calendar_event_id
    if (rowId && rowId !== masterId) {
      await deleteGoogleEvent(accessToken, rowId)
    }
    return { synced: true }
  }

  if (opts.scope === 'future') {
    if (!masterId || !opts.occurrenceDate) return { synced: false, skipped: true }
    const res = await truncateRecurringMaster(accessToken, masterId, opts.occurrenceDate)
    if (!res.ok && !res.gone) return { synced: false, error: 'Failed to truncate the recurring event' }
    return { synced: true }
  }

  // ---- occurrence scope ----------------------------------------------------
  const timezone = series?.timezone || DEFAULT_TZ
  const rowId = opts.jobRow?.google_calendar_event_id ?? null
  const isAnchorRow = !!series && !!opts.jobRow && series.template_id === opts.jobRow.id

  if (isAnchorRow && masterId) {
    // Deleting occurrence #1 must not kill the series — cancel just that instance.
    const snapTime = (series.template_snapshot as any)?.scheduled_time || opts.jobRow?.scheduled_time
    if (!opts.occurrenceDate || !snapTime) return { synced: false, skipped: true }
    const instanceId = googleInstanceId(masterId, opts.occurrenceDate, snapTime, timezone)
    const res = await deleteGoogleEvent(accessToken, instanceId)
    return res.ok ? { synced: true } : { synced: false, error: `Google Calendar API returned ${res.status}` }
  }

  if (rowId) {
    // Materialized-occurrence exceptions store the instance id; standalone jobs
    // store their own event id — both delete by the stored value.
    const res = await deleteGoogleEvent(accessToken, rowId)
    return res.ok ? { synced: true } : { synced: false, error: `Google Calendar API returned ${res.status}` }
  }

  // Virtual occurrence skip: no row id — cancel the expanded instance instead.
  if (masterId && opts.occurrenceDate) {
    const snapTime = (series!.template_snapshot as any)?.scheduled_time
    if (!snapTime) return { synced: false, skipped: true }
    const instanceId = googleInstanceId(masterId, opts.occurrenceDate, snapTime, timezone)
    const res = await deleteGoogleEvent(accessToken, instanceId)
    return res.ok ? { synced: true } : { synced: false, error: `Google Calendar API returned ${res.status}` }
  }

  return { synced: false, skipped: true }
}
