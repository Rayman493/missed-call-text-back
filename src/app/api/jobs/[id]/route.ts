import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'

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

    const body = await request.json()
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
      .select('scheduled_date, scheduled_time, scheduled_end_time')
      .eq('id', id)
      .eq('business_id', businessId)
      .single()

    if (existingError || !existing) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
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
