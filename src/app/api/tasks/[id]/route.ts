import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { calculateReminderNotifyAt } from '@/lib/reminder-notification-utils'
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await resolveBusinessForUser(supabase, user.id, 'id, business_hours_timezone')
    const business = access?.business ?? null

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Recurrence: a virtual occurrence id materializes into a real row first,
    // then the normal update path applies to that row.
    let id = rawId
    const virtual = parseVirtualId(rawId)
    if (virtual) {
      const series = await getSeriesById(supabase, business.id, virtual.seriesId)
      if (!series) {
        return NextResponse.json({ error: 'This recurring reminder no longer exists' }, { status: 404 })
      }
      const { row, error: matError } = await materializeOccurrence(
        supabase, business.id, series, virtual.occurrenceDate, 'tasks', 'due_date',
      )
      if (matError || !row) {
        return NextResponse.json({ error: 'Failed to update this occurrence' }, { status: 500 })
      }
      id = row.id
    }

    // Verify task belongs to business
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, business_id, series_id')
      .eq('id', id)
      .single()

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.business_id !== business.id) {
      return NextResponse.json({ error: 'Task does not belong to your business' }, { status: 403 })
    }

    // Fetch full task state including reminder fields
    const { data: fullTask, error: fullTaskError } = await supabase
      .from('tasks')
      .select('id, due_date, due_time, reminder_offset_minutes, reminder_notify_at, series_id')
      .eq('id', id)
      .single()

    if (fullTaskError || !fullTask) {
      return NextResponse.json({ error: 'Failed to fetch task state' }, { status: 500 })
    }

    const body = await request.json()
    const {
      title,
      notes,
      due_date,
      due_time,
      completed,
      lead_id,
      job_id,
      reminder_offset_minutes,
      scope,
      occurrence_date,
      recurrence,
    } = body

    // Verify lead belongs to business if provided
    if (lead_id) {
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('id, business_id, deleted_at')
        .eq('id', lead_id)
        .single()

      if (leadError || !lead) {
        return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
      }

      if (lead.business_id !== business.id) {
        return NextResponse.json({ error: 'Lead does not belong to your business' }, { status: 403 })
      }

      if (lead.deleted_at) {
        return NextResponse.json({ error: 'Lead has been deleted' }, { status: 400 })
      }
    }

    // Verify job belongs to business if provided
    if (job_id) {
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('id, business_id')
        .eq('id', job_id)
        .single()

      if (jobError || !job) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 })
      }

      if (job.business_id !== business.id) {
        return NextResponse.json({ error: 'Job does not belong to your business' }, { status: 403 })
      }
    }

    const updateData: any = {}
    if (title !== undefined) updateData.title = title.trim()
    if (notes !== undefined) updateData.notes = notes?.trim() || null
    if (due_date !== undefined) updateData.due_date = due_date || null
    if (due_time !== undefined) updateData.due_time = due_time || null
    if (completed !== undefined) {
      updateData.completed = completed
      updateData.completed_at = completed ? new Date().toISOString() : null
      // Clear notification schedule when completed
      if (completed) {
        updateData.reminder_notify_at = null
      }
    }
    if (lead_id !== undefined) updateData.lead_id = lead_id || null
    if (job_id !== undefined) updateData.job_id = job_id || null

    // Handle reminder_offset_minutes
    if (reminder_offset_minutes !== undefined) {
      if (reminder_offset_minutes === null) {
        updateData.reminder_offset_minutes = null
        updateData.reminder_notify_at = null
      } else {
        const validOffsets = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080]
        if (!validOffsets.includes(reminder_offset_minutes)) {
          return NextResponse.json({ error: 'Invalid reminder_offset_minutes. Must be one of: 0, 5, 15, 30, 60, 120, 1440, 2880, 10080' }, { status: 400 })
        }
        updateData.reminder_offset_minutes = reminder_offset_minutes
      }
    }

    // Recalculate reminder_notify_at if any of due_date, due_time, or reminder_offset_minutes changed
    const effectiveDueDate = due_date !== undefined ? due_date : fullTask.due_date
    const effectiveDueTime = due_time !== undefined ? due_time : fullTask.due_time
    const effectiveOffset = reminder_offset_minutes !== undefined ? reminder_offset_minutes : fullTask.reminder_offset_minutes

    if (due_date !== undefined || due_time !== undefined || reminder_offset_minutes !== undefined) {
      if (effectiveDueDate && effectiveDueTime && effectiveOffset !== null && effectiveOffset !== undefined) {
        const businessTimezone = business.business_hours_timezone || 'America/New_York'
        const newNotifyAt = calculateReminderNotifyAt({
          dueDate: effectiveDueDate,
          dueTime: effectiveDueTime,
          offsetMinutes: effectiveOffset,
          timezone: businessTimezone
        })

        if (newNotifyAt) {
          updateData.reminder_notify_at = newNotifyAt
        } else {
          updateData.reminder_notify_at = null
        }
      } else {
        // Missing required fields, clear schedule
        updateData.reminder_notify_at = null
      }
    }

    // Recurrence scopes. `series` is found via the row's series_id (materialized
    // occurrences) or as the template row's owning series (anchor occurrence).
    const editScope = scope === 'future' || scope === 'series' ? scope : 'occurrence'
    const series = task.series_id
      ? await getSeriesById(supabase, business.id, task.series_id)
      : await getSeriesForTemplate(supabase, business.id, 'task', id)

    const snapshotPatch: Record<string, any> = {}
    for (const f of ['title', 'notes', 'due_time', 'lead_id', 'job_id', 'reminder_offset_minutes'] as const) {
      if (f in body) snapshotPatch[f] = (body as any)[f]
    }

    if (editScope === 'future') {
      if (!series) {
        return NextResponse.json({ error: 'This reminder is not part of a recurring series' }, { status: 400 })
      }
      const occDate = occurrence_date || fullTask.due_date
      if (!occDate) {
        return NextResponse.json({ error: 'occurrence_date is required for this edit scope' }, { status: 400 })
      }
      const { newSeries, error: splitError } = await splitSeriesAt(
        supabase, business.id, series, occDate, 'tasks', 'due_date', snapshotPatch,
      )
      if (splitError) {
        return NextResponse.json({ error: 'Failed to update future occurrences' }, { status: 500 })
      }
      return NextResponse.json({ ok: true, series: newSeries })
    }

    const { data: updatedTask, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[Tasks API] PATCH error:', error)
      return NextResponse.json({ error: 'Failed to update reminder' }, { status: 500 })
    }

    // Entire-series edit: merge the field patch into the template snapshot and
    // optionally update the recurrence rule itself.
    if (editScope === 'series' && series) {
      const seriesUpdate: Record<string, any> = {
        template_snapshot: { ...(series.template_snapshot || {}), ...snapshotPatch },
      }
      if (due_date !== undefined && due_date) {
        seriesUpdate.anchor_date = due_date
        seriesUpdate.anchor_day = Number(due_date.split('-')[2])
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
    if (!series && recurrence?.frequency && updatedTask.due_date) {
      const businessTimezone = business.business_hours_timezone || 'America/New_York'
      const snapshot = {
        title: updatedTask.title,
        notes: updatedTask.notes,
        due_time: updatedTask.due_time,
        lead_id: updatedTask.lead_id,
        job_id: updatedTask.job_id,
        completed: false,
        reminder_offset_minutes: updatedTask.reminder_offset_minutes,
      }
      const { series: ns, error: seriesError } = await createSeriesOnce(
        supabase, business.id!, 'task', id, snapshot, updatedTask.due_date, businessTimezone, recurrence,
      )
      if (seriesError) {
        console.error('[Tasks API] conversion series creation failed:', seriesError)
        // The row update above already persisted — report an honest partial
        // save, include the updated row so the client can reconcile, and
        // stay retryable (createSeriesOnce is idempotent).
        return NextResponse.json({
          error: 'Your changes were saved, but the repeat schedule could not be applied. Tap Save again to retry.',
          recurrenceFailed: true,
          task: updatedTask,
        }, { status: 400 })
      }
      createdSeries = ns ?? null
    }

    return NextResponse.json({
      task: { ...updatedTask, ...recurrenceMetaForRow(createdSeries ?? series ?? undefined) },
      ...(createdSeries ? { series: createdSeries } : {}),
    })
  } catch (error) {
    console.error('[Tasks API] PATCH unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: rawId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const access = await resolveBusinessForUser(supabase, user.id, 'id, business_hours_timezone')
    const business = access?.business ?? null

    if (!business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const scope = new URL(request.url).searchParams.get('scope') || 'occurrence'
    const occurrenceDate = new URL(request.url).searchParams.get('occurrence_date')
    const todayStr = new Date().toLocaleDateString('en-CA')

    // Recurrence: deleting a virtual occurrence just marks the date skipped.
    const virtual = parseVirtualId(rawId)
    if (virtual) {
      const series = await getSeriesById(supabase, business.id, virtual.seriesId)
      if (!series) {
        return NextResponse.json({ error: 'This recurring reminder no longer exists' }, { status: 404 })
      }
      if (scope === 'series') {
        const { error } = await deleteSeries(supabase, business.id, series, 'tasks', todayStr)
        if (error) return NextResponse.json({ error: 'Failed to delete series' }, { status: 500 })
        return NextResponse.json({ success: true })
      }
      if (scope === 'future') {
        const { error } = await endSeriesBefore(supabase, business.id, series, virtual.occurrenceDate, 'tasks')
        if (error) return NextResponse.json({ error: 'Failed to delete future occurrences' }, { status: 500 })
        return NextResponse.json({ success: true })
      }
      const { error } = await skipOccurrence(supabase, business.id, series.id, virtual.occurrenceDate)
      if (error) return NextResponse.json({ error: 'Failed to delete occurrence' }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    const id = rawId

    // Verify task belongs to business
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, business_id, series_id, due_date')
      .eq('id', id)
      .single()

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.business_id !== business.id) {
      return NextResponse.json({ error: 'Task does not belong to your business' }, { status: 403 })
    }

    // Series-aware scopes for real rows (template anchor or materialized row).
    const series = task.series_id
      ? await getSeriesById(supabase, business.id, task.series_id)
      : await getSeriesForTemplate(supabase, business.id, 'task', id)

    if (scope === 'series' && series) {
      const { error: seriesError } = await deleteSeries(supabase, business.id, series, 'tasks', todayStr)
      if (seriesError) return NextResponse.json({ error: 'Failed to delete series' }, { status: 500 })
      // Remove the row the user was looking at (template anchor or materialized).
      await supabase.from('tasks').delete().eq('id', id)
      return NextResponse.json({ success: true })
    }

    if (scope === 'future' && series) {
      const occDate = occurrenceDate || task.due_date || todayStr
      const { error: endError } = await endSeriesBefore(supabase, business.id, series, occDate, 'tasks')
      if (endError) return NextResponse.json({ error: 'Failed to delete future occurrences' }, { status: 500 })
      if (task.series_id) await supabase.from('tasks').delete().eq('id', id)
      return NextResponse.json({ success: true })
    }

    // Default: delete this one row. If it is the series anchor, mark the date
    // skipped so the (now row-less) anchor date stays suppressed.
    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[Tasks API] DELETE error:', error)
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
    }

    if (series && !task.series_id && task.due_date === series.anchor_date) {
      await skipOccurrence(supabase, business.id, series.id, task.due_date)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Tasks API] DELETE unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
