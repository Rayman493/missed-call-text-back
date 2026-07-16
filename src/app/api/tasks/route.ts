import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
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

    const url = new URL(request.url)
    const completed = url.searchParams.get('completed')
    const overdue = url.searchParams.get('overdue') === 'true'
    const today = url.searchParams.get('today') === 'true'

    let query = supabase
      .from('tasks')
      .select('*, leads!left(id, caller_phone, raw_metadata)')
      .eq('business_id', business.id)
      .order('due_date', { ascending: true })
      .order('due_time', { ascending: true })
      .order('created_at', { ascending: false })

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

    return NextResponse.json({ tasks: tasks || [] })
  } catch (error) {
    console.error('[Tasks API] GET unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
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

    const body = await request.json()
    const {
      title,
      notes,
      due_date,
      due_time,
      lead_id,
      job_id,
    } = body

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
      })
      .select()
      .single()

    if (error) {
      console.error('[Tasks API] POST error:', error)
      return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
    }

    return NextResponse.json({ task }, { status: 201 })
  } catch (error) {
    console.error('[Tasks API] POST unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
