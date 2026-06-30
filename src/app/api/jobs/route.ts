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
    const status = url.searchParams.get('status')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')

    let query = supabase
      .from('jobs')
      .select('*')
      .eq('business_id', business.id)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })

    if (status) query = query.eq('status', status)
    if (from) query = query.gte('scheduled_date', from)
    if (to) query = query.lte('scheduled_date', to)

    const { data: jobs, error } = await query

    if (error) {
      console.error('[Jobs API] GET error:', error)
      return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 })
    }

    return NextResponse.json({ jobs: jobs || [] })
  } catch (error) {
    console.error('[Jobs API] GET unexpected error:', error)
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
      customer_name,
      customer_phone,
      service_address,
      notes,
      scheduled_date,
      scheduled_time,
      status = 'scheduled',
      lead_id,
      conversation_id,
      source = 'manual',
    } = body

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    const { data: job, error } = await supabase
      .from('jobs')
      .insert({
        business_id: business.id,
        title: title.trim(),
        customer_name: customer_name?.trim() || null,
        customer_phone: customer_phone?.trim() || null,
        service_address: service_address?.trim() || null,
        notes: notes?.trim() || null,
        scheduled_date: scheduled_date || null,
        scheduled_time: scheduled_time || null,
        status,
        lead_id: lead_id || null,
        conversation_id: conversation_id || null,
        source,
        payment_status: 'none',
      })
      .select()
      .single()

    if (error) {
      console.error('[Jobs API] POST error:', error)
      return NextResponse.json({ error: 'Failed to create job' }, { status: 500 })
    }

    console.log('[job_created]', { jobId: job.id, source, businessId: business.id })
    return NextResponse.json({ job }, { status: 201 })
  } catch (error) {
    console.error('[Jobs API] POST unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
