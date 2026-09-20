import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { calculateReminderNotifyAt } from '@/lib/reminder-notification-utils'
import {
  expandVirtualOccurrences,
  createSeries,
  recurrenceMetaForRow,
  addDays,
  EXPANSION_HORIZON_DAYS,
  type RecurrenceInput,
} from '@/lib/recurrence/service'

export async function GET(request: NextRequest) {
  try {
    const supabase = await await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check subscription access
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode });
    }

    const business = authResult.business;

    const url = new URL(request.url)
    const completed = url.searchParams.get('completed')
    const overdue = url.searchParams.get('overdue') === 'true'
    const today = url.searchParams.get('today') === 'true'
    const lead_id = url.searchParams.get('lead_id')

    let query = supabase
      .from('tasks')
      .select('*, leads!left(id, caller_phone, raw_metadata), jobs!left(id, title, customer_name)')
      .eq('business_id', business.id)
      .order('due_date', { ascending: true })
      .order('due_time', { ascending: true })
      .order('created_at', { ascending: false })

    if (lead_id) {
      query = query.eq('lead_id', lead_id)
    }

    if (completed !== null) {
      query = query.eq('completed', completed === 'true')
    }

    if (overdue) {
      const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
      query = query.lt('due_date', todayStr).eq('completed', false)
    }

    if (today) {
      const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in local timezone
      query = query.eq('due_date', todayStr).eq('completed', false)
    }

    const { data: tasks, error } = await query

    if (error) {
      console.error('[Tasks API] GET error:', error)
      return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
    }

    // Recurrence: expand virtual series occurrences into the requested window.
    // Real rows already cover: the anchor occurrence (the template row) and any
    // materialized exceptions. Virtuals fill the remaining matching dates.
    const todayStr = new Date().toLocaleDateString('en-CA')
    const rangeFrom = overdue ? '0001-01-01' : today ? todayStr : '0001-01-01'
    const rangeTo = overdue
      ? addDays(todayStr, -1)
      : today
        ? todayStr
        : addDays(todayStr, EXPANSION_HORIZON_DAYS)

    const { occurrences, seriesByTemplateId, seriesById } = await expandVirtualOccurrences(
      supabase, business.id!, 'task', rangeFrom, rangeTo,
    )

    const virtualTasks = occurrences
      .filter(({ series }) => {
        const snap = series.template_snapshot || {}
        if (lead_id && snap.lead_id !== lead_id) return false
        if (completed === 'true') return false // virtuals are never completed
        return true
      })
      .map(({ series, date, virtualId }) => ({
        ...(series.template_snapshot || {}),
        id: virtualId,
        business_id: business.id,
        due_date: date,
        completed: false,
        completed_at: null,
        reminder_notify_at: null,
        virtual: true,
        occurrence_date: date,
        ...recurrenceMetaForRow(series),
      }))

    const annotated = (tasks || []).map((t: any) => ({
      ...t,
      ...recurrenceMetaForRow(seriesByTemplateId.get(t.id) ?? (t.series_id ? seriesById.get(t.series_id) : undefined)),
    }))

    const merged = [...annotated, ...virtualTasks]
    merged.sort((a: any, b: any) => {
      const da = a.due_date || '', db = b.due_date || ''
      if (da !== db) return da < db ? -1 : 1
      const ta = a.due_time || '', tb = b.due_time || ''
      return ta < tb ? -1 : ta > tb ? 1 : 0
    })

    return NextResponse.json({ tasks: merged })
  } catch (error) {
    console.error('[Tasks API] GET unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check subscription access
    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode });
    }

    const business = authResult.business;

    const body = await request.json()
    const {
      title,
      notes,
      due_date,
      due_time,
      lead_id,
      job_id,
      reminder_offset_minutes,
      recurrence,
    } = body as {
      title?: string; notes?: string; due_date?: string; due_time?: string
      lead_id?: string; job_id?: string; reminder_offset_minutes?: number | null
      recurrence?: RecurrenceInput
    }

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

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

    // Validate reminder_offset_minutes if provided
    if (reminder_offset_minutes !== undefined && reminder_offset_minutes !== null) {
      const validOffsets = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080]
      if (!validOffsets.includes(reminder_offset_minutes)) {
        return NextResponse.json({ error: 'Invalid reminder_offset_minutes. Must be one of: 0, 5, 15, 30, 60, 120, 1440, 2880, 10080' }, { status: 400 })
      }
    }

    // Calculate reminder_notify_at if all required fields are present
    let reminder_notify_at: string | null = null
    let notificationWarning: string | null = null

    if (due_date && due_time && reminder_offset_minutes !== null && reminder_offset_minutes !== undefined) {
      const businessTimezone = business.business_hours_timezone || 'America/New_York'
      reminder_notify_at = calculateReminderNotifyAt({
        dueDate: due_date,
        dueTime: due_time,
        offsetMinutes: reminder_offset_minutes,
        timezone: businessTimezone
      })

      if (!reminder_notify_at) {
        notificationWarning = 'Reminder saved, but notification could not be scheduled'
      }
    }

    const { data: task, error } = await supabase
      .from('tasks')
      .insert({
        business_id: business.id,
        title: title.trim(),
        notes: notes?.trim() || null,
        due_date: due_date || null,
        due_time: due_time || null,
        lead_id: lead_id || null,
        job_id: job_id || null,
        completed: false,
        reminder_offset_minutes: reminder_offset_minutes || null,
        reminder_notify_at: reminder_notify_at,
      })
      .select()
      .single()

    if (error) {
      console.error('[Tasks API] POST error:', error)
      return NextResponse.json({ error: 'Failed to create reminder' }, { status: 500 })
    }

    // Recurrence: create a series anchored on this task (occurrence #1).
    let createdSeries = null
    if (recurrence && recurrence.frequency && due_date) {
      const snapshot = {
        title: task.title,
        notes: task.notes,
        due_time: task.due_time,
        lead_id: task.lead_id,
        job_id: task.job_id,
        completed: false,
        reminder_offset_minutes: task.reminder_offset_minutes,
      }
      const businessTimezone = business.business_hours_timezone || 'America/New_York'
      const { series, error: seriesError } = await createSeries(
        supabase, business.id!, 'task', task.id, snapshot, due_date, businessTimezone, recurrence,
      )
      if (seriesError) {
        // Roll back the task so we never leave a half-created series
        await supabase.from('tasks').delete().eq('id', task.id)
        console.error('[Tasks API] series creation failed:', seriesError)
        return NextResponse.json({ error: seriesError }, { status: 400 })
      }
      createdSeries = series
    }

    const response: any = { task: { ...task, ...recurrenceMetaForRow(createdSeries ?? undefined) } }
    if (createdSeries) response.series = createdSeries
    if (notificationWarning) {
      response.warning = notificationWarning
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    console.error('[Tasks API] POST unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
