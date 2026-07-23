import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

async function getBusinessId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string) {
  const { data, error } = await supabase
    .from('businesses')
    .select('id')
    .eq('user_id', userId)
    .single()
  return error ? null : data?.id
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const businessId = await getBusinessId(supabase, user.id)
    if (!businessId) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

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
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const businessId = await getBusinessId(supabase, user.id)
    if (!businessId) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

    const body = await request.json()
    const allowedFields = [
      'title', 'customer_name', 'customer_phone', 'service_address',
      'notes', 'scheduled_date', 'scheduled_time', 'status', 'payment_status',
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field]
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
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

    console.log('[job_updated]', { jobId: job.id, fields: Object.keys(updates) })
    return NextResponse.json({ job })
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

    const { error } = await supabase
      .from('jobs')
      .delete()
      .eq('id', id)
      .eq('business_id', businessId)

    if (error) {
      console.error('[Jobs API] DELETE error:', error)
      return NextResponse.json({ error: 'Failed to delete job' }, { status: 500 })
    }

    console.log('[job_deleted]', { jobId: id })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Jobs API] DELETE unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
