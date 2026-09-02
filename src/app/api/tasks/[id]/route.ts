import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { calculateReminderNotifyAt } from '@/lib/reminder-notification-utils'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, business_hours_timezone')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Verify task belongs to business
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, business_id')
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
      .select('id, due_date, due_time, reminder_offset_minutes, reminder_notify_at')
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

    const { data: updatedTask, error } = await supabase
      .from('tasks')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[Tasks API] PATCH error:', error)
      return NextResponse.json({ error: 'Failed to update task' }, { status: 500 })
    }

    return NextResponse.json({ task: updatedTask })
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
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, business_hours_timezone')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Verify task belongs to business
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, business_id')
      .eq('id', id)
      .single()

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.business_id !== business.id) {
      return NextResponse.json({ error: 'Task does not belong to your business' }, { status: 403 })
    }

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[Tasks API] DELETE error:', error)
      return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Tasks API] DELETE unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
