import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { requireSubscriptionAccessWithClient } from '@/lib/server-subscription-guard'
import { getBusinessDayStart, getBusinessDayEnd, getBusinessWeekStart, getBusinessWeekEnd } from '@/lib/business-date-utils'

/**
 * GET /api/jobs/time-summary
 *
 * Returns business-level time-tracking aggregates for Today and This Week.
 * Single query to job_time_entries — no N+1.
 *
 * Response:
 *   {
 *     today_ms: number,
 *     week_ms: number,
 *     week_job_count: number,
 *     active_timer: boolean
 *   }
 *
 * Calculation:
 *   - completed entries: ended_at - started_at (only the portion within the period)
 *   - active entry: current time - started_at (only the portion within the period)
 *   - day/week boundaries use the business timezone (Sunday-start week)
 *   - no double-counting
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const authResult = await requireSubscriptionAccessWithClient(supabase, user.id)
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error, code: authResult.code },
        { status: authResult.statusCode }
      )
    }

    const business = authResult.business
    const businessTimezone = business.business_hours_timezone || 'UTC'

    const now = new Date()
    const todayStart = getBusinessDayStart(businessTimezone, now)
    const todayEnd = getBusinessDayEnd(businessTimezone, now)
    const weekStart = getBusinessWeekStart(businessTimezone, now)
    const weekEnd = getBusinessWeekEnd(businessTimezone, now)

    // Single query: all time entries for this business overlapping the week window.
    // We fetch entries where started_at < weekEnd AND (ended_at IS NULL OR ended_at > weekStart).
    const { data: entries, error } = await supabase
      .from('job_time_entries')
      .select('job_id, started_at, ended_at')
      .eq('business_id', business.id!)
      .lt('started_at', weekEnd)
      .or(`ended_at.is.null,ended_at.gt.${weekStart}`)

    if (error) {
      console.error('[Jobs Time Summary API] error:', error)
      return NextResponse.json({ error: 'Failed to fetch time summary' }, { status: 500 })
    }

    const todayStartMs = new Date(todayStart).getTime()
    const todayEndMs = new Date(todayEnd).getTime()
    const weekStartMs = new Date(weekStart).getTime()
    const weekEndMs = new Date(weekEnd).getTime()
    const nowMs = now.getTime()

    let todayMs = 0
    let weekMs = 0
    let activeTimer = false
    const weekJobIds = new Set<string>()

    for (const entry of entries || []) {
      const start = new Date(entry.started_at as string).getTime()
      const rawEnd = entry.ended_at as string | null
      const end = rawEnd ? new Date(rawEnd).getTime() : nowMs

      if (!rawEnd) activeTimer = true

      // Clamp to the period boundaries to avoid double-counting across day/week edges.
      const todayPortion = Math.max(0, Math.min(end, todayEndMs) - Math.max(start, todayStartMs))
      todayMs += todayPortion

      const weekPortion = Math.max(0, Math.min(end, weekEndMs) - Math.max(start, weekStartMs))
      if (weekPortion > 0) {
        weekMs += weekPortion
        weekJobIds.add(entry.job_id as string)
      }
    }

    return NextResponse.json({
      today_ms: Math.round(todayMs),
      week_ms: Math.round(weekMs),
      week_job_count: weekJobIds.size,
      active_timer: activeTimer,
    })
  } catch (error) {
    console.error('[Jobs Time Summary API] unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
