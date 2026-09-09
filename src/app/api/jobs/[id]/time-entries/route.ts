import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'

// GET /api/jobs/[id]/time-entries — list all time entries for a job
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: jobId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode })
    }

    const businessId = authResult.business.id!

    // Verify job belongs to this business
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id')
      .eq('id', jobId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (jobError || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const { data: entries, error } = await supabase
      .from('job_time_entries')
      .select('*')
      .eq('job_id', jobId)
      .eq('business_id', businessId)
      .order('started_at', { ascending: false })

    if (error) {
      console.error('[Time Entries API] GET error:', error)
      return NextResponse.json({ error: 'Failed to fetch time entries' }, { status: 500 })
    }

    return NextResponse.json({ entries: entries || [] })
  } catch (error) {
    console.error('[Time Entries API] GET unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/jobs/[id]/time-entries — start timer (create active entry)
// Body: { action: 'start' } | { action: 'stop' }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: jobId } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error, code: authResult.code }, { status: authResult.statusCode })
    }

    const businessId = authResult.business.id!

    // Verify job belongs to this business
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, title')
      .eq('id', jobId)
      .eq('business_id', businessId)
      .maybeSingle()

    if (jobError || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

    const body = await request.json()
    const action = body?.action

    if (action === 'start') {
      // Check for any existing active timer for this business (one active timer total)
      const { data: activeEntries } = await supabase
        .from('job_time_entries')
        .select('id, job_id, started_at, jobs!inner(id, title)')
        .eq('business_id', businessId)
        .is('ended_at', null)
        .maybeSingle()

      if (activeEntries) {
        // If the active timer is for THIS job, return it (idempotent)
        if (activeEntries.job_id === jobId) {
          return NextResponse.json({ entry: { id: activeEntries.id, job_id: activeEntries.job_id, started_at: activeEntries.started_at, ended_at: null } })
        }
        // Active timer is for a DIFFERENT job — return informational conflict
        const otherJob = (activeEntries as any).jobs
        return NextResponse.json({
          error: 'Another timer is already running',
          activeJob: { id: activeEntries.job_id, title: otherJob?.title || 'another job' },
          code: 'timer_already_active',
        }, { status: 409 })
      }

      // Create new active entry
      const { data: entry, error: insertError } = await supabase
        .from('job_time_entries')
        .insert({
          business_id: businessId,
          job_id: jobId,
          started_at: new Date().toISOString(),
          ended_at: null,
        })
        .select('id, job_id, started_at, ended_at')
        .single()

      if (insertError || !entry) {
        // Race condition: another concurrent Start inserted first.
        // The unique partial index (business_id WHERE ended_at IS NULL) rejects us.
        // PostgreSQL unique-violation code is 23505.
        if (insertError?.code === '23505') {
          // Re-fetch the now-existing active entry to resolve idempotently
          const { data: racedActive } = await supabase
            .from('job_time_entries')
            .select('id, job_id, started_at, jobs!inner(id, title)')
            .eq('business_id', businessId)
            .is('ended_at', null)
            .maybeSingle()

          if (racedActive) {
            // Same-job race → return the existing active entry (idempotent)
            if (racedActive.job_id === jobId) {
              return NextResponse.json({ entry: { id: racedActive.id, job_id: racedActive.job_id, started_at: racedActive.started_at, ended_at: null } })
            }
            // Different-job race → return canonical 409
            const otherJob = (racedActive as any).jobs
            return NextResponse.json({
              error: 'Another timer is already running',
              activeJob: { id: racedActive.job_id, title: otherJob?.title || 'another job' },
              code: 'timer_already_active',
            }, { status: 409 })
          }
          // Fallback if re-fetch finds nothing (shouldn't happen)
          return NextResponse.json({ error: 'Failed to start timer' }, { status: 500 })
        }
        // Non-race insert error — never expose raw DB error text
        console.error('[Time Entries API] Start error:', insertError)
        return NextResponse.json({ error: 'Failed to start timer' }, { status: 500 })
      }

      return NextResponse.json({ entry })
    }

    if (action === 'stop') {
      // Find the active entry for this job
      const { data: activeEntry } = await supabase
        .from('job_time_entries')
        .select('id, started_at')
        .eq('job_id', jobId)
        .eq('business_id', businessId)
        .is('ended_at', null)
        .maybeSingle()

      if (!activeEntry) {
        return NextResponse.json({ error: 'No active timer for this job' }, { status: 404 })
      }

      const endedAt = new Date().toISOString()
      const { data: entry, error: updateError } = await supabase
        .from('job_time_entries')
        .update({ ended_at: endedAt })
        .eq('id', activeEntry.id)
        .eq('business_id', businessId)
        .select('id, job_id, started_at, ended_at')
        .single()

      if (updateError || !entry) {
        console.error('[Time Entries API] Stop error:', updateError)
        return NextResponse.json({ error: 'Failed to stop timer' }, { status: 500 })
      }

      return NextResponse.json({ entry })
    }

    return NextResponse.json({ error: 'Invalid action. Use "start" or "stop".' }, { status: 400 })
  } catch (error) {
    console.error('[Time Entries API] POST unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
