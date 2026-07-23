import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

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
      .select('id')
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

    const body = await request.json()
    const {
      title,
      notes,
      due_date,
      due_time,
      completed,
      lead_id,
      job_id,
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
    }
    if (lead_id !== undefined) updateData.lead_id = lead_id || null
    if (job_id !== undefined) updateData.job_id = job_id || null

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
      .select('id')
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
