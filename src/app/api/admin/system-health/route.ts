import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'
import { aggregateOverallHealth, ServiceHealth, SystemHealth, OperationalIssue, HealthStatus } from '@/lib/system-health'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get the user from the request
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    if (!isAdmin(user.id)) {
      return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 })
    }

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // Collect health data from existing tables
    const services: Record<string, ServiceHealth> = {}

    // Application / Database Health
    try {
      const { error: dbError } = await supabase.from('businesses').select('id').limit(1)
      services.application = {
        name: 'Application / Database',
        status: dbError ? 'critical' : 'healthy',
        summary: dbError ? 'Database connectivity failed' : 'Database connectivity normal',
        lastActivity: now.toISOString(),
      }
    } catch (e) {
      services.application = {
        name: 'Application / Database',
        status: 'critical',
        summary: 'Database check failed',
        lastActivity: now.toISOString(),
      }
    }

    // AI Voice Health - check ai_call_failures and ai_call_records
    // Customer-impact aware: use final_recovery_outcome to distinguish actual customer impact
    try {
      const { data: recentFailures, error: failuresError } = await supabase
        .from('ai_call_failures')
        .select('id, failure_stage, created_at')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(50)

      const { data: recentCalls, error: callsError } = await supabase
        .from('ai_call_records')
        .select('id, outcome, final_recovery_outcome, created_at')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(50)

      const failureCount = recentFailures?.length || 0
      const totalCalls = recentCalls?.length || 0

      // Use final_recovery_outcome for accurate customer impact assessment
      const aiSuccessCount = recentCalls?.filter(c => c.final_recovery_outcome === 'ai_success').length || 0
      const voicemailSuccessCount = recentCalls?.filter(c => c.final_recovery_outcome === 'voicemail_success').length || 0
      const smsSuccessCount = recentCalls?.filter(c => c.final_recovery_outcome === 'sms_success').length || 0
      const unrecoveredCount = recentCalls?.filter(c => c.final_recovery_outcome === 'unrecovered').length || 0
      
      // Fallback to outcome if final_recovery_outcome is null (migration not applied yet)
      const legacyCompletedCount = recentCalls?.filter(c => !c.final_recovery_outcome && c.outcome === 'completed').length || 0
      const legacyVoicemailCount = recentCalls?.filter(c => !c.final_recovery_outcome && c.outcome === 'voicemail_fallback').length || 0
      const legacyFailedCount = recentCalls?.filter(c => !c.final_recovery_outcome && c.outcome === 'ai_failed').length || 0

      // Combine final outcomes with legacy outcomes for backward compatibility
      const totalSuccess = aiSuccessCount + legacyCompletedCount
      const totalVoicemail = voicemailSuccessCount + legacyVoicemailCount
      const totalUnrecovered = unrecoveredCount + legacyFailedCount
      const totalRecovered = totalVoicemail + smsSuccessCount

      let aiStatus: HealthStatus = 'healthy'
      let aiSummary = `${totalSuccess} successful AI calls in the last 24 hours`

      if (failuresError || callsError) {
        aiStatus = 'unknown'
        aiSummary = 'Unable to determine AI voice status'
      } else if (totalCalls === 0) {
        aiStatus = 'unknown'
        aiSummary = 'No recent AI calls to evaluate'
      } else if (totalUnrecovered > 10) {
        // Many unrecovered failures - Critical (customers not reached)
        aiStatus = 'critical'
        aiSummary = `${totalUnrecovered} unrecovered AI failures in the last 24 hours`
      } else if (totalRecovered > totalCalls * 0.5) {
        // Very high fallback usage (>50%) - Critical (AI largely unavailable)
        aiStatus = 'critical'
        aiSummary = `${totalRecovered} calls required fallback (${Math.round(totalRecovered / totalCalls * 100)}% of calls)`
      } else if (totalUnrecovered > 3) {
        // Multiple unrecovered failures - Degraded (AI unreliable)
        aiStatus = 'degraded'
        aiSummary = `${totalUnrecovered} unrecovered AI failures in the last 24 hours`
      } else if (totalRecovered > totalCalls * 0.3) {
        // High fallback usage (>30%) - Degraded (AI not working as intended)
        aiStatus = 'degraded'
        aiSummary = `${totalRecovered} calls required fallback (${Math.round(totalRecovered / totalCalls * 100)}% of calls)`
      } else if (totalRecovered > 5) {
        // Moderate fallback usage - Degraded
        aiStatus = 'degraded'
        aiSummary = `${totalRecovered} calls required fallback in the last 24 hours`
      } else if (totalUnrecovered > 0 || totalRecovered > 0) {
        // Isolated unrecovered failure or fallback - Healthy (customers mostly recovered)
        aiSummary = `${totalSuccess} successful AI calls, ${totalUnrecovered} unrecovered, ${totalRecovered} recovered via fallback`
      }

      services.aiVoice = {
        name: 'AI Voice',
        status: aiStatus,
        summary: aiSummary,
        lastActivity: recentCalls?.[0]?.created_at || null,
        failureCount: totalUnrecovered, // Only count unrecovered as failures
        details: {
          successCount: totalSuccess,
          totalCalls,
          recoveredFailures: totalRecovered,
          potentiallyUnrecovered: totalUnrecovered,
          recentFailures: recentFailures?.slice(0, 5).map(f => ({
            stage: f.failure_stage,
            time: f.created_at,
          })) || [],
        },
      }
    } catch (e) {
      services.aiVoice = {
        name: 'AI Voice',
        status: 'unknown',
        summary: 'Unable to check AI voice status',
        lastActivity: null,
      }
    }

    // Twilio Voice Health - check call_events
    try {
      const { data: recentCallEvents, error: callEventsError } = await supabase
        .from('call_events')
        .select('id, call_status, created_at')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(50)

      const failedCalls = recentCallEvents?.filter(c => c.call_status === 'failed') || []
      const totalCallEvents = recentCallEvents?.length || 0

      let voiceStatus: HealthStatus = 'healthy'
      let voiceSummary = 'Recent call processing normal'

      if (callEventsError) {
        voiceStatus = 'unknown'
        voiceSummary = 'Unable to determine Twilio voice status'
      } else if (totalCallEvents === 0) {
        voiceStatus = 'unknown'
        voiceSummary = 'No recent call events to evaluate'
      } else if (failedCalls.length > 10) {
        // High absolute failure count - Critical
        voiceStatus = 'critical'
        voiceSummary = `${failedCalls.length} call failures in the last 24 hours`
      } else if (failedCalls.length > totalCallEvents * 0.5 && totalCallEvents > 5) {
        // High failure rate with sufficient volume - Critical
        voiceStatus = 'critical'
        voiceSummary = `${failedCalls.length} call failures (${Math.round(failedCalls.length / totalCallEvents * 100)}% failure rate)`
      } else if (failedCalls.length > 3) {
        // Moderate failure count - Degraded
        voiceStatus = 'degraded'
        voiceSummary = `${failedCalls.length} call failures in the last 24 hours`
      } else if (failedCalls.length > 0) {
        // Isolated failure - Healthy (transient)
        voiceSummary = `${totalCallEvents - failedCalls.length} successful calls, ${failedCalls.length} transient failure`
      }

      services.twilioVoice = {
        name: 'Twilio Voice',
        status: voiceStatus,
        summary: voiceSummary,
        lastActivity: recentCallEvents?.[0]?.created_at || null,
        failureCount: failedCalls.length,
      }
    } catch (e) {
      services.twilioVoice = {
        name: 'Twilio Voice',
        status: 'unknown',
        summary: 'Unable to check Twilio voice status',
        lastActivity: null,
      }
    }

    // Twilio SMS Health - check messages
    try {
      const { data: recentMessages, error: messagesError } = await supabase
        .from('messages')
        .select('id, status, direction, created_at')
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(50)

      const failedMessages = recentMessages?.filter(m => m.status === 'failed') || []
      const totalMessages = recentMessages?.length || 0

      let smsStatus: HealthStatus = 'healthy'
      let smsSummary = 'Recent SMS processing normal'

      if (messagesError) {
        smsStatus = 'unknown'
        smsSummary = 'Unable to determine Twilio SMS status'
      } else if (totalMessages === 0) {
        smsStatus = 'unknown'
        smsSummary = 'No recent messages to evaluate'
      } else if (failedMessages.length > 10) {
        // High absolute failure count - Critical
        smsStatus = 'critical'
        smsSummary = `${failedMessages.length} SMS failures in the last 24 hours`
      } else if (failedMessages.length > totalMessages * 0.5 && totalMessages > 5) {
        // High failure rate with sufficient volume - Critical
        smsStatus = 'critical'
        smsSummary = `${failedMessages.length} SMS failures (${Math.round(failedMessages.length / totalMessages * 100)}% failure rate)`
      } else if (failedMessages.length > 3) {
        // Moderate failure count - Degraded
        smsStatus = 'degraded'
        smsSummary = `${failedMessages.length} SMS failures in the last 24 hours`
      } else if (failedMessages.length > 0) {
        // Isolated failure - Healthy (transient)
        smsSummary = `${totalMessages - failedMessages.length} successful messages, ${failedMessages.length} transient failure`
      }

      services.twilioSms = {
        name: 'Twilio SMS',
        status: smsStatus,
        summary: smsSummary,
        lastActivity: recentMessages?.[0]?.created_at || null,
        failureCount: failedMessages.length,
      }
    } catch (e) {
      services.twilioSms = {
        name: 'Twilio SMS',
        status: 'unknown',
        summary: 'Unable to check Twilio SMS status',
        lastActivity: null,
      }
    }

    // Stripe Health - check stripe_webhook_events
    try {
      const { data: failedWebhooks, error: webhooksError } = await supabase
        .from('stripe_webhook_events')
        .select('id, event_type, error_message, processed_at')
        .eq('status', 'error')
        .gte('processed_at', twentyFourHoursAgo)
        .order('processed_at', { ascending: false })
        .limit(20)

      const { data: recentWebhooks, error: recentWebhooksError } = await supabase
        .from('stripe_webhook_events')
        .select('id, processed_at')
        .gte('processed_at', twentyFourHoursAgo)
        .order('processed_at', { ascending: false })
        .limit(1)

      const { data: totalWebhooks, error: totalWebhooksError } = await supabase
        .from('stripe_webhook_events')
        .select('id')
        .gte('processed_at', twentyFourHoursAgo)

      const failureCount = failedWebhooks?.length || 0
      const totalCount = totalWebhooks?.length || 0

      let stripeStatus: HealthStatus = 'healthy'
      let stripeSummary = 'Recent Stripe webhook processing normal'

      if (webhooksError || recentWebhooksError || totalWebhooksError) {
        stripeStatus = 'unknown'
        stripeSummary = 'Unable to determine Stripe status'
      } else if (!recentWebhooks || recentWebhooks.length === 0) {
        stripeStatus = 'unknown'
        stripeSummary = 'No recent Stripe webhook activity to evaluate'
      } else if (failureCount > 5) {
        // High absolute error count - Critical
        stripeStatus = 'critical'
        stripeSummary = `${failureCount} webhook processing failures in the last 24 hours`
      } else if (failureCount > totalCount * 0.5 && totalCount > 3) {
        // High error rate with sufficient volume - Critical
        stripeStatus = 'critical'
        stripeSummary = `${failureCount} webhook errors (${Math.round(failureCount / totalCount * 100)}% error rate)`
      } else if (failureCount > 2) {
        // Moderate error count - Degraded
        stripeStatus = 'degraded'
        stripeSummary = `${failureCount} webhook processing failures in the last 24 hours`
      } else if (failureCount > 0) {
        // Isolated error - Healthy (webhooks typically retry)
        stripeSummary = `${totalCount - failureCount} successful webhooks, ${failureCount} transient error`
      }

      services.stripe = {
        name: 'Stripe',
        status: stripeStatus,
        summary: stripeSummary,
        lastActivity: recentWebhooks?.[0]?.processed_at || null,
        failureCount,
      }
    } catch (e) {
      services.stripe = {
        name: 'Stripe',
        status: 'unknown',
        summary: 'Unable to check Stripe status',
        lastActivity: null,
      }
    }

    // Provisioning Health - check businesses with provisioning issues
    try {
      const { data: stuckBusinesses, error: provisioningError } = await supabase
        .from('businesses')
        .select('id, twilio_phone_number, created_at')
        .is('twilio_phone_number', null)
        .gte('created_at', twentyFourHoursAgo)

      const stuckCount = stuckBusinesses?.length || 0

      let provisioningStatus: HealthStatus = 'healthy'
      let provisioningSummary = 'No businesses stuck in provisioning'

      if (provisioningError) {
        provisioningStatus = 'unknown'
        provisioningSummary = 'Unable to determine provisioning status'
      } else if (stuckCount > 5) {
        provisioningStatus = 'critical'
        provisioningSummary = `${stuckCount} businesses stuck in provisioning for over 24 hours`
      } else if (stuckCount > 0) {
        provisioningStatus = 'degraded'
        provisioningSummary = `${stuckCount} businesses stuck in provisioning for over 24 hours`
      }

      services.provisioning = {
        name: 'Provisioning',
        status: provisioningStatus,
        summary: provisioningSummary,
        lastActivity: now.toISOString(),
        failureCount: stuckCount,
      }
    } catch (e) {
      services.provisioning = {
        name: 'Provisioning',
        status: 'unknown',
        summary: 'Unable to check provisioning status',
        lastActivity: null,
      }
    }

    // Aggregate recent issues
    const recentIssues: OperationalIssue[] = []

    // Note: Test alert condition (manual_test_alert) is excluded from health aggregation
    // The operational_alerts table is not queried here - only actual service metrics are used
    // This ensures test alerts cannot affect the displayed system health status

    // Add AI failures as issues (only technical failures from ai_call_failures)
    // Note: Recovered failures (voicemail/SMS) are not included here since they're not customer-facing issues
    if (services.aiVoice.details?.recentFailures && services.aiVoice.details.recentFailures.length > 0) {
      services.aiVoice.details.recentFailures.forEach((failure: any, index: number) => {
        recentIssues.push({
          id: `ai-failure-${index}`,
          timestamp: failure.time,
          service: 'AI Voice',
          severity: services.aiVoice.status === 'critical' ? 'critical' : 'degraded',
          summary: `AI call failed at stage: ${failure.stage}`,
          resolved: false,
        })
      })
    }

    // Add recent critical service issues (only if actually critical with failures)
    Object.entries(services).forEach(([serviceName, health]) => {
      if (health.status === 'critical' && health.failureCount && health.failureCount > 0) {
        recentIssues.push({
          id: `${serviceName}-critical`,
          timestamp: health.lastActivity || now.toISOString(),
          service: health.name,
          severity: 'critical',
          summary: health.summary,
          resolved: false,
        })
      }
    })

    // Sort issues by timestamp (most recent first) and limit to 10
    recentIssues.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    recentIssues.splice(10)

    const overall = aggregateOverallHealth(services)

    const systemHealth: SystemHealth = {
      overall,
      lastChecked: now.toISOString(),
      services: {
        application: services.application,
        aiVoice: services.aiVoice,
        twilioVoice: services.twilioVoice,
        twilioSms: services.twilioSms,
        stripe: services.stripe,
        provisioning: services.provisioning,
      },
      recentIssues,
    }

    return NextResponse.json(systemHealth)
  } catch (error) {
    console.error('[System Health] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
