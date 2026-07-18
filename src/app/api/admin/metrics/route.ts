import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies()
    console.log('[SUPABASE SSR SOURCE] admin-metrics')
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              )
            } catch {
              // The `setAll` method was called from a Server Component.
              // This can be ignored if you have middleware refreshing
              // user sessions.
            }
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    if (!isAdmin(user.id)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    console.log('[ADMIN METRICS] Admin user:', user.id)

    // Calculate date ranges
    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    // Fetch all metrics in parallel - using real production schema
    const [
      activeBusinessesResult,
      trialsExpiringSoonResult,
      onboardingIssuesResult,
      provisioningFailuresResult,
      aiCallFailuresResult,
      smsFailuresResult,
      billingIssuesResult,
      personalVoicemailFailuresResult
    ] = await Promise.all([
      // Active Businesses (active or trialing subscription)
      supabaseAdmin
        .from('businesses')
        .select('id', { count: 'exact', head: true })
        .in('subscription_status', ['active', 'trialing']),

      // Trials Expiring in 7 Days
      supabaseAdmin
        .from('businesses')
        .select('id, name, trial_end_date', { count: 'exact' })
        .eq('subscription_status', 'trialing')
        .lte('trial_end_date', sevenDaysFromNow.toISOString())
        .gte('trial_end_date', now.toISOString()),

      // Onboarding Issues (incomplete after 24 hours)
      supabaseAdmin
        .from('businesses')
        .select('id, name, created_at, onboarding_status', { count: 'exact' })
        .not('onboarding_status', 'in', '(completed,forwarding_verified)')
        .lt('created_at', twentyFourHoursAgo.toISOString()),

      // Provisioning Failures
      supabaseAdmin
        .from('businesses')
        .select('id, name, provisioning_status', { count: 'exact' })
        .eq('provisioning_status', 'failed'),

      // AI Call Failures in 24 Hours
      supabaseAdmin
        .from('leads')
        .select('id, phone_number, created_at', { count: 'exact' })
        .not('ai_call_status', 'in', '(completed,pending)')
        .gte('created_at', twentyFourHoursAgo.toISOString()),

      // SMS Failures in 24 Hours
      supabaseAdmin
        .from('messages')
        .select('id, direction, status, created_at', { count: 'exact' })
        .in('status', ['failed', 'undelivered'])
        .gte('created_at', twentyFourHoursAgo.toISOString()),

      // Billing Issues (past_due or trial expiring soon)
      supabaseAdmin
        .from('businesses')
        .select('id, name, subscription_status, trial_end_date', { count: 'exact' })
        .or('subscription_status.eq.past_due,and(subscription_status.eq.trialing,trial_end_date.lt.' + threeDaysFromNow.toISOString() + ')'),

      // Personal Voicemail Failures (stuck processing)
      supabaseAdmin
        .from('personal_voicemails')
        .select('id, created_at', { count: 'exact' })
        .is('transcription_text', null)
        .is('processing_error', null)
        .lt('created_at', twentyFourHoursAgo.toISOString())
    ])

    const metrics = {
      activeBusinesses: activeBusinessesResult.count || 0,
      trialsExpiringSoon: {
        count: trialsExpiringSoonResult.count || 0,
        businesses: trialsExpiringSoonResult.data || []
      },
      onboardingIssues: {
        count: onboardingIssuesResult.count || 0,
        businesses: onboardingIssuesResult.data || []
      },
      provisioningFailures: {
        count: provisioningFailuresResult.count || 0,
        businesses: provisioningFailuresResult.data || []
      },
      aiCallFailures: {
        count: aiCallFailuresResult.count || 0,
        leads: aiCallFailuresResult.data || []
      },
      smsFailures: {
        count: smsFailuresResult.count || 0,
        messages: smsFailuresResult.data || []
      },
      billingIssues: {
        count: billingIssuesResult.count || 0,
        businesses: billingIssuesResult.data || []
      },
      personalVoicemailFailures: {
        count: personalVoicemailFailuresResult.count || 0,
        voicemails: personalVoicemailFailuresResult.data || []
      }
    }

    // Calculate needs attention (critical + high priority issues)
    const needsAttention = {
      critical: (provisioningFailuresResult.count || 0) + (billingIssuesResult.count || 0),
      high: (trialsExpiringSoonResult.count || 0) + (onboardingIssuesResult.count || 0),
      medium: (aiCallFailuresResult.count || 0) + (smsFailuresResult.count || 0)
    }

    console.log('[ADMIN METRICS] Active businesses:', metrics.activeBusinesses)

    return NextResponse.json({
      success: true,
      metrics,
      needsAttention
    })
  } catch (error: any) {
    console.error('[ADMIN METRICS] Error:', error)
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
