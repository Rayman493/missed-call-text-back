import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { isAdmin } from '@/lib/admin'
import { supabaseAdmin } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    console.log('[ADMIN METRICS] START')

    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { user }, error: userError } = await supabase.auth.getUser()

    console.log('[ADMIN METRICS] Auth check', {
      user,
      userError,
      userId: user?.id,
      userEmail: user?.email
    })

    if (userError || !user) {
      console.log('[ADMIN METRICS] 401 Unauthorized')
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const isAdminResult = isAdmin(user.id)
    console.log('[ADMIN METRICS] Admin check', {
      userId: user.id,
      isAdminResult,
      ADMIN_USER_IDS: process.env.ADMIN_USER_IDS
    })

    if (!isAdminResult) {
      console.log('[ADMIN METRICS] 403 Forbidden')
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    console.log('[ADMIN METRICS] Admin verified, starting queries')

    // DEBUG: First try a simple count query without filters
    console.log('[ADMIN METRICS] DEBUG: Trying simple count query')
    const { count: totalCount, error: countError } = await supabaseAdmin
      .from('businesses')
      .select('*', { count: 'exact', head: true })

    console.log('[ADMIN METRICS] DEBUG: Total count result', {
      totalCount,
      countError,
      countErrorCode: countError?.code,
      countErrorMessage: countError?.message
    })

    // DEBUG: Try count without deleted_at filter
    console.log('[ADMIN METRICS] DEBUG: Trying count without deleted_at filter')
    const { count: countNoFilter, error: countNoFilterError } = await supabaseAdmin
      .from('businesses')
      .select('*', { count: 'exact', head: true })

    console.log('[ADMIN METRICS] DEBUG: Count no filter result', {
      countNoFilter,
      countNoFilterError
    })

    // DEBUG: Try count with deleted_at IS NULL
    console.log('[ADMIN METRICS] DEBUG: Trying count with deleted_at IS NULL')
    const { count: countWithNull, error: countWithNullError } = await supabaseAdmin
      .from('businesses')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)

    console.log('[ADMIN METRICS] DEBUG: Count with NULL result', {
      countWithNull,
      countWithNullError,
      countWithNullErrorCode: countWithNullError?.code,
      countWithNullErrorMessage: countWithNullError?.message
    })

    // Calculate date ranges
    const now = new Date()
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    console.log('[ADMIN METRICS] Date ranges', {
      now: now.toISOString(),
      sevenDaysFromNow: sevenDaysFromNow.toISOString(),
      threeDaysFromNow: threeDaysFromNow.toISOString(),
      twentyFourHoursAgo: twentyFourHoursAgo.toISOString()
    })

    // Fetch all metrics in parallel
    console.log('[ADMIN METRICS] Starting parallel queries')
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
      // Active Businesses (deleted_at IS NULL means active)
      supabaseAdmin
        .from('businesses')
        .select('id', { count: 'exact', head: true })
        .in('subscription_status', ['active', 'trialing'])
        .is('deleted_at', null),

      // Trials Expiring in 7 Days
      supabaseAdmin
        .from('businesses')
        .select('id, business_name, trial_end_date', { count: 'exact' })
        .eq('subscription_status', 'trialing')
        .is('deleted_at', null)
        .lte('trial_end_date', sevenDaysFromNow.toISOString())
        .gte('trial_end_date', now.toISOString()),

      // Onboarding Issues (incomplete after 24 hours)
      supabaseAdmin
        .from('businesses')
        .select('id, business_name, created_at, onboarding_status', { count: 'exact' })
        .not('onboarding_status', 'in', '(completed,forwarding_verified)')
        .is('deleted_at', null)
        .lt('created_at', twentyFourHoursAgo.toISOString()),

      // Provisioning Failures
      supabaseAdmin
        .from('businesses')
        .select('id, business_name, provisioning_status', { count: 'exact' })
        .eq('provisioning_status', 'failed')
        .is('deleted_at', null),

      // AI Call Failures in 24 Hours
      supabaseAdmin
        .from('leads')
        .select('id, phone_number, created_at', { count: 'exact' })
        .not('ai_call_status', 'in', '(completed,pending)')
        .gte('created_at', twentyFourHoursAgo.toISOString())
        .is('deleted_at', null),

      // SMS Failures in 24 Hours
      supabaseAdmin
        .from('messages')
        .select('id, direction, status, created_at', { count: 'exact' })
        .in('status', ['failed', 'undelivered'])
        .gte('created_at', twentyFourHoursAgo.toISOString()),

      // Billing Issues (past_due or incomplete setup)
      supabaseAdmin
        .from('businesses')
        .select('id, business_name, subscription_status, trial_end_date', { count: 'exact' })
        .or('subscription_status.eq.past_due,and(subscription_status.eq.trialing,trial_end_date.lt.' + threeDaysFromNow.toISOString() + ')')
        .is('deleted_at', null),

      // Personal Voicemail Failures (stuck processing)
      supabaseAdmin
        .from('personal_voicemails')
        .select('id, created_at', { count: 'exact' })
        .is('transcription_text', null)
        .is('processing_error', null)
        .lt('created_at', twentyFourHoursAgo.toISOString())
    ])

    console.log('[ADMIN METRICS] Query results', {
      activeBusinesses: {
        count: activeBusinessesResult.count,
        error: activeBusinessesResult.error,
        errorCode: activeBusinessesResult.error?.code
      },
      trialsExpiringSoon: {
        count: trialsExpiringSoonResult.count,
        error: trialsExpiringSoonResult.error,
        errorCode: trialsExpiringSoonResult.error?.code
      },
      onboardingIssues: {
        count: onboardingIssuesResult.count,
        error: onboardingIssuesResult.error,
        errorCode: onboardingIssuesResult.error?.code
      },
      provisioningFailures: {
        count: provisioningFailuresResult.count,
        error: provisioningFailuresResult.error,
        errorCode: provisioningFailuresResult.error?.code
      },
      aiCallFailures: {
        count: aiCallFailuresResult.count,
        error: aiCallFailuresResult.error,
        errorCode: aiCallFailuresResult.error?.code
      },
      smsFailures: {
        count: smsFailuresResult.count,
        error: smsFailuresResult.error,
        errorCode: smsFailuresResult.error?.code
      },
      billingIssues: {
        count: billingIssuesResult.count,
        error: billingIssuesResult.error,
        errorCode: billingIssuesResult.error?.code
      },
      personalVoicemailFailures: {
        count: personalVoicemailFailuresResult.count,
        error: personalVoicemailFailuresResult.error,
        errorCode: personalVoicemailFailuresResult.error?.code
      }
    })

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

    console.log('[ADMIN METRICS] Success', {
      activeBusinesses: metrics.activeBusinesses,
      needsAttention
    })

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
