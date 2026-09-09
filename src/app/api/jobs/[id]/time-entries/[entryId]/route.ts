import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'

// PATCH /api/jobs/[id]/time-entries/[entryId] — edit a completed entry's start/end
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  try {
    const { id: jobId, entryId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode })
    }

    const businessId = authResult.business.id!

    // Verify job belongs to this business
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const body = await request.json()
    const updates: Record<string, any> = {}

    if ('started_at' in body && body.started_at) {
      const startedAt = new Date(body.started_at)
      if (isNaN(startedAt.getTime())) return NextResponse.json({ error: 'Invalid started_at' }, { status: 400 })
      updates.started_at = startedAt.toISOString()
    }
    if ('ended_at' in body) {
      if (body.ended_at === null) {
        // Allow reopening an entry (clearing ended_at) — but check active timer conflict
        const { data: activeConflict } = await supabase
          .from('job_time_entries')
          .select('id')
          .eq('business_id', businessId)
          .is('ended_at', null)
          .neq('id', entryId)
          .maybeSingle()
        if (activeConflict) {
          return NextResponse.json({ error: 'Another timer is already active', code: 'timer_already_active' }, { status: 409 })
        }
        updates.ended_at = null
      } else if (body.ended_at) {
        const endedAt = new Date(body.ended_at)
        if (isNaN(endedAt.getTime())) return NextResponse.json({ error: 'Invalid ended_at' }, { status: 400 })
        updates.ended_at = endedAt.toISOString()
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Fetch current entry to validate end > start
    const { data: existing } = await supabase
      .from('job_time_entries')
      .select('started_at, ended_at')
      .eq('id', entryId)
      .eq('job_id', jobId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (!existing) return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })

    const finalStartedAt = updates.started_at || existing.started_at
    const finalEndedAt = updates.ended_at !== undefined ? updates.ended_at : existing.ended_at

    if (finalEndedAt && new Date(finalEndedAt) <= new Date(finalStartedAt)) {
      return NextResponse.json({ error: 'End time must be after start time' }, { status: 400 })
    }

    // Reasonable timestamp check (not more than 365 days in the future)
    const now = new Date()
    if (new Date(finalStartedAt) > new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)) {
      return NextResponse.json({ error: 'Start time is too far in the future' }, { status: 400 })
    }

    const { data: entry, error } = await supabase
      .from('job_time_entries')
      .update(updates)
      .eq('id', entryId)
      .eq('job_id', jobId)
      .eq('business_id', businessId)
      .select('id, job_id, started_at, ended_at')
      .single()

    if (error || !entry) {
      console.error('[Time Entries API] PATCH error:', error)
      return NextResponse.json({ error: 'Failed to update time entry' }, { status: 500 })
    }

    return NextResponse.json({ entry })
  } catch (error) {
    console.error('[Time Entries API] PATCH unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/jobs/[id]/time-entries/[entryId] — delete a completed entry
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  try {
    const { id: jobId, entryId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode })
    }

    const businessId = authResult.business.id!

    // Verify job belongs to this business
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .eq('business_id', businessId)
      .maybeSingle()
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const { error } = await supabase
      .from('job_time_entries')
      .delete()
      .eq('id', entryId)
      .eq('job_id', jobId)
      .eq('business_id', businessId)

    if (error) {
      console.error('[Time Entries API] DELETE error:', error)
      return NextResponse.json({ error: 'Failed to delete time entry' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Time Entries API] DELETE unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
