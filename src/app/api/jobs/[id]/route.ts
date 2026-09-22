import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { resolveBusinessForUser } from '@/lib/team-access'
import {
  parseVirtualId,
  getSeriesById,
  getSeriesForTemplate,
  materializeOccurrence,
  skipOccurrence,
  splitSeriesAt,
  endSeriesBefore,
  deleteSeries,
  createSeriesOnce,
  recurrenceMetaForRow,
} from '@/lib/recurrence/service'

async function getBusinessId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  const access = await resolveBusinessForUser(supabase, userId, 'id')
  return access?.business?.id ?? null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check subscription access
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode });
    }

    const businessId = authResult.business.id!

    const { data: job, error } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()

    if (error || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    return NextResponse.json({ job })
  } catch (error) {
    console.error('[Jobs API] GET[id] error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Check subscription access
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode });
    }

    const businessId = authResult.business.id!

    // Recurrence: a virtual occurrence id materializes into a real row first,
    // then the normal update path applies to that row.
    let id = rawId
    const virtual = parseVirtualId(rawId)
    let virtualSeries = null as any
    if (virtual) {
      virtualSeries = await getSeriesById(supabase, businessId, virtual.seriesId)
      if (!virtualSeries) {
        return NextResponse.json({ error: 'This recurring job no longer exists' }, { status: 404 })
      }
      const { row, error: matError } = await materializeOccurrence(
        supabase, businessId, virtualSeries, virtual.occurrenceDate, 'jobs', 'scheduled_date',
      )
      if (matError || !row) {
        return NextResponse.json({ error: 'Failed to update this occurrence' }, { status: 500 })
      }
      id = row.id
    }

    const body = await request.json()
    const { scope, occurrence_date, recurrence } = body
    const allowedFields = [
      'title', 'customer_name', 'customer_phone', 'service_address',
      'notes', 'scheduled_date', 'scheduled_time', 'scheduled_end_time', 'status', 'payment_status',
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Fetch the persisted job so we can validate effective start+end when only
    // one of the two is being changed in this PATCH request. This is a single
    // extra read; the subsequent update below is the authoritative write.
    const { data: existing, error: existingError } = await supabase
      .from('jobs')
      .select('scheduled_date, scheduled_time, scheduled_end_time, series_id')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    // Recurrence scopes
    const editScope = scope === 'future' || scope === 'series' ? scope : 'occurrence'
    const series = existing.series_id
      ? await getSeriesById(supabase, businessId, existing.series_id)
      : (virtualSeries || await getSeriesForTemplate(supabase, businessId, 'job', id))

    if (editScope === 'future') {
      if (!series) {
        return NextResponse.json({ error: 'This job is not part of a recurring series' }, { status: 400 })
      }
      const occDate = occurrence_date || existing.scheduled_date
      if (!occDate) {
        return NextResponse.json({ error: 'occurrence_date is required for this edit scope' }, { status: 400 })
      }
      const snapshotPatch: Record<string, any> = {}
      for (const f of ['title', 'customer_name', 'customer_phone', 'service_address', 'notes', 'scheduled_time', 'scheduled_end_time'] as const) {
        if (f in body) snapshotPatch[f] = (body as any)[f]
      }
      const { newSeries, error: splitError } = await splitSeriesAt(
        supabase, businessId, series, occDate, 'jobs', 'scheduled_date', snapshotPatch,
      )
      if (splitError) {
        return NextResponse.json({ error: 'Failed to update future occurrences' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, series: newSeries })
    }

    // Validate scheduled_end_time format (only when a non-null value is supplied)
    if ('scheduled_end_time' in updates && updates.scheduled_end_time) {
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(updates.scheduled_end_time)) {
        return NextResponse.json({ error: 'End time must be in HH:MM or HH:MM:SS format' }, { status: 400 })
      }
    }
    // Validate scheduled_time format (only when a non-null value is supplied)
    if ('scheduled_time' in updates && updates.scheduled_time) {
      if (!/^\d{2}:\d{2}(:\d{2})?$/.test(updates.scheduled_time)) {
        return NextResponse.json({ error: 'Start time must be in HH:MM or HH:MM:SS format' }, { status: 400 })
      }
    }

    // Compute effective values: incoming overrides persisted.
    // A field present in `updates` with value null means "clear it", so the
    // effective value for cross-validation is null in that case.
    const effectiveDate =
      'scheduled_date' in updates ? updates.scheduled_date : existing.scheduled_date
    const effectiveStart =
      'scheduled_time' in updates ? updates.scheduled_time : existing.scheduled_time
    const effectiveEnd =
      'scheduled_end_time' in updates ? updates.scheduled_end_time : existing.scheduled_end_time

    // Same-day end > start constraint: only enforce when both effective values
    // are non-null AND a same-day date is present. Nullable clearing is safe
    // (effectiveEnd === null skips the check).
    if (effectiveDate && effectiveStart && effectiveEnd) {
      const [sh, sm] = effectiveStart.split(':').map(Number)
      const [eh, em] = effectiveEnd.split(':').map(Number)
      if (eh < sh || (eh === sh && em <= sm)) {
        return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
      }
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .update(updates)
      .eq('id', id)
      .eq('business_id', businessId)
      .select()
      .single()

    if (error || !job) {
      console.error('[Jobs API] PATCH error:', error)
      return NextResponse.json({ error: 'Failed to update job' }, { status: 500 })
    }

    // Entire-series edit: merge the field patch into the template snapshot and
    // optionally update the recurrence rule itself.
    if (editScope === 'series' && series) {
      const snapshotPatch: Record<string, any> = {}
      for (const f of ['title', 'customer_name', 'customer_phone', 'service_address', 'notes', 'scheduled_time', 'scheduled_end_time'] as const) {
        if (f in body) snapshotPatch[f] = (body as any)[f]
      }
      const seriesUpdate: Record<string, any> = {
        template_snapshot: { ...(series.template_snapshot || {}), ...snapshotPatch },
      }
      if ('scheduled_date' in updates && updates.scheduled_date) {
        seriesUpdate.anchor_date = updates.scheduled_date
        seriesUpdate.anchor_day = Number(updates.scheduled_date.split('-')[2])
      }
      if (recurrence && recurrence.frequency) {
        seriesUpdate.frequency = recurrence.frequency
        seriesUpdate.end_type = recurrence.end_type
        seriesUpdate.end_date = recurrence.end_type === 'on_date' ? recurrence.end_date : null
        seriesUpdate.max_occurrences = recurrence.end_type === 'after_occurrences' ? recurrence.max_occurrences : null
      }
      await supabase.from('recurrence_series').update(seriesUpdate).eq('id', series.id)
    }

    // One-time → recurring conversion: the existing row becomes the series
    // template/anchor occurrence — its date, identity and associations are
    // preserved; expansion never duplicates the anchor date. Re-check for an
    // existing template series so a repeated Save can't create a second one.
    let createdSeries = null
    if (!series && recurrence?.frequency && job.scheduled_date) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('business_hours_timezone')
        .eq('id', businessId)
        .single()
      const businessTimezone = biz?.business_hours_timezone || 'America/New_York'
      const snapshot = {
        title: job.title,
        customer_name: job.customer_name,
        customer_phone: job.customer_phone,
        service_address: job.service_address,
        notes: job.notes,
        scheduled_time: job.scheduled_time,
        scheduled_end_time: job.scheduled_end_time,
        status: 'scheduled',
        lead_id: job.lead_id,
        conversation_id: job.conversation_id,
        source: job.source,
        payment_status: 'none',
      }
      const { series: ns, error: seriesError } = await createSeriesOnce(
        supabase, businessId, 'job', id, snapshot, job.scheduled_date, businessTimezone, recurrence,
      )
      if (seriesError) {
        console.error('[Jobs API] conversion series creation failed:', seriesError)
        // The row update above already persisted — report an honest partial
        // save, include the updated row so the client can reconcile, and
        // stay retryable (createSeriesOnce is idempotent).
        return NextResponse.json({
          error: 'Your changes were saved, but the repeat schedule could not be applied. Tap Save again to retry.',
          recurrenceFailed: true,
          job,
        }, { status: 400 })
      }
      createdSeries = ns ?? null
    }

    console.log('[job_updated]', { jobId: job.id, fields: Object.keys(updates) })
    return NextResponse.json({
      job: { ...job, ...recurrenceMetaForRow(createdSeries ?? series ?? undefined) },
      ...(createdSeries ? { series: createdSeries } : {}),
    })
  } catch (error) {
    console.error('[Jobs API] PATCH unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const businessId = await getBusinessId(supabase, user.id)
    if (!businessId) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    const scope = new URL(request.url).searchParams.get('scope') || 'occurrence'
    const occurrenceDate = new URL(request.url).searchParams.get('occurrence_date')
    const todayStr = new Date().toLocaleDateString('en-CA')

    // Recurrence: deleting a virtual occurrence just marks the date skipped.
    const virtual = parseVirtualId(id)
    if (virtual) {
      const series = await getSeriesById(supabase, businessId, virtual.seriesId)
      if (!series) {
        return NextResponse.json({ error: 'This recurring job no longer exists' }, { status: 404 })
      }
      if (scope === 'series') {
        const { error } = await deleteSeries(supabase, businessId, series, 'jobs', todayStr)
        if (error) return NextResponse.json({ error: 'Failed to delete series' }, { status: 500 })
        return NextResponse.json({ success: true })
      }
      if (scope === 'future') {
        const { error } = await endSeriesBefore(supabase, businessId, series, virtual.occurrenceDate, 'jobs')
        if (error) return NextResponse.json({ error: 'Failed to delete future occurrences' }, { status: 500 })
        return NextResponse.json({ success: true })
      }
      const { error } = await skipOccurrence(supabase, businessId, series.id, virtual.occurrenceDate)
      if (error) return NextResponse.json({ error: 'Failed to delete occurrence' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // Series-aware scopes for real rows.
    const { data: jobRow } = await supabase
      .from('jobs')
      .select('id, series_id, scheduled_date')
      .eq('id', id)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!jobRow) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const series = jobRow.series_id
      ? await getSeriesById(supabase, businessId, jobRow.series_id)
      : await getSeriesForTemplate(supabase, businessId, 'job', id)

    if (scope === 'series' && series) {
      const { error: seriesError } = await deleteSeries(supabase, businessId, series, 'jobs', todayStr)
      if (seriesError) return NextResponse.json({ error: 'Failed to delete series' }, { status: 500 })
      await supabase.from('jobs').delete().eq('id', id)
      console.log('[job_deleted]', { jobId: id, scope: 'series' })
      return NextResponse.json({ success: true })
    }

    if (scope === 'future' && series) {
      const occDate = occurrenceDate || jobRow.scheduled_date || todayStr
      const { error: endError } = await endSeriesBefore(supabase, businessId, series, occDate, 'jobs')
      if (endError) return NextResponse.json({ error: 'Failed to delete future occurrences' }, { status: 500 })
      if (jobRow.series_id) await supabase.from('jobs').delete().eq('id', id)
      console.log('[job_deleted]', { jobId: id, scope: 'future' })
      return NextResponse.json({ success: true })
    }

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)

    if (error) {
      console.error('[Jobs API] DELETE error:', error)
      return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 })
    }

    // If the deleted row was the series anchor, mark the date skipped.
    if (series && !jobRow.series_id && jobRow.scheduled_date === series.anchor_date) {
      await skipOccurrence(supabase, businessId, series.id, jobRow.scheduled_date)
    }

    console.log('[job_deleted]', { jobId: id })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Jobs API] DELETE unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
