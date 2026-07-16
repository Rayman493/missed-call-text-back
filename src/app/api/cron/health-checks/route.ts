import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { alertManager } from '@/lib/alerting'
import { verifyCronRequest } from '@/lib/cron-auth'

export const dynamic = 'force-dynamic'

/**
 * Cron job to check system health and send alerts for critical failures
 * Run this every 15-30 minutes via Vercel Cron or similar
 * 
 * Authentication: Requires CRON_SECRET in Authorization header
 * Example: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: NextRequest) {
  // Verify cron secret using shared helper
  const authResult = verifyCronRequest(request)
  if (!authResult.authorized) {
    return NextResponse.json({ error: authResult.error }, { status: authResult.status })
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // Alert Condition 1: Database connectivity
    const dbCondition = {
      id: 'database-connectivity',
      name: 'Database Connectivity',
      severity: 'critical' as const,
      description: 'ReplyFlow cannot connect to the database',
      check: async () => {
        const { error } = await supabase.from('businesses').select('id').limit(1)
        return !!error
      },
    }
    await alertManager.checkAndAlert(dbCondition, 'Database query failed')

    // Alert Condition 2: AI Voice critical failures
    const aiVoiceCondition = {
      id: 'ai-voice-critical',
      name: 'AI Voice Critical Failures',
      severity: 'critical' as const,
      description: 'AI voice service experiencing critical failure rate',
      check: async () => {
        const { data: recentFailures, error } = await supabase
          .from('ai_call_failures')
          .select('id')
          .gte('created_at', oneHourAgo)

        if (error) return false // Don't alert if we can't check
        const failureCount = recentFailures?.length || 0
        return failureCount > 10 // More than 10 failures in the last hour
      },
    }
    await alertManager.checkAndAlert(aiVoiceCondition, `Recent AI failures: ${(await supabase.from('ai_call_failures').select('id').gte('created_at', oneHourAgo)).data?.length || 0}`)

    // Alert Condition 3: Twilio Voice critical failures
    const twilioVoiceCondition = {
      id: 'twilio-voice-critical',
      name: 'Twilio Voice Critical Failures',
      severity: 'critical' as const,
      description: 'Twilio voice processing experiencing critical failure rate',
      check: async () => {
        const { data: recentCalls, error } = await supabase
          .from('call_events')
          .select('id, call_status')
          .gte('created_at', oneHourAgo)

        if (error) return false
        const failedCalls = recentCalls?.filter(c => c.call_status === 'failed') || []
        const totalCalls = recentCalls?.length || 0
        return totalCalls > 0 && failedCalls.length > totalCalls * 0.5 // More than 50% failure rate
      },
    }
    await alertManager.checkAndAlert(twilioVoiceCondition, 'High Twilio voice failure rate detected')

    // Alert Condition 4: Twilio SMS critical failures
    const twilioSmsCondition = {
      id: 'twilio-sms-critical',
      name: 'Twilio SMS Critical Failures',
      severity: 'critical' as const,
      description: 'Twilio SMS processing experiencing critical failure rate',
      check: async () => {
        const { data: recentMessages, error } = await supabase
          .from('messages')
          .select('id, status')
          .gte('created_at', oneHourAgo)

        if (error) return false
        const failedMessages = recentMessages?.filter(m => m.status === 'failed') || []
        const totalMessages = recentMessages?.length || 0
        return totalMessages > 0 && failedMessages.length > totalMessages * 0.5 // More than 50% failure rate
      },
    }
    await alertManager.checkAndAlert(twilioSmsCondition, 'High Twilio SMS failure rate detected')

    // Alert Condition 5: Stripe webhook critical failures
    const stripeCondition = {
      id: 'stripe-webhook-critical',
      name: 'Stripe Webhook Critical Failures',
      severity: 'critical' as const,
      description: 'Stripe webhook processing experiencing critical failures',
      check: async () => {
        const { data: failedWebhooks, error } = await supabase
          .from('stripe_webhook_events')
          .select('id')
          .eq('status', 'error')
          .gte('processed_at', oneHourAgo)

        if (error) return false
        const failureCount = failedWebhooks?.length || 0
        return failureCount > 5 // More than 5 webhook errors in the last hour
      },
    }
    await alertManager.checkAndAlert(stripeCondition, `Recent Stripe webhook errors: ${(await supabase.from('stripe_webhook_events').select('id').eq('status', 'error').gte('processed_at', oneHourAgo)).data?.length || 0}`)

    // Alert Condition 6: Provisioning stuck businesses
    const provisioningCondition = {
      id: 'provisioning-stuck',
      name: 'Provisioning Stuck Businesses',
      severity: 'degraded' as const,
      description: 'Multiple businesses stuck in provisioning for extended period',
      check: async () => {
        const { data: stuckBusinesses, error } = await supabase
          .from('businesses')
          .select('id')
          .is('twilio_phone_number', null)
          .gte('created_at', twentyFourHoursAgo)

        if (error) return false
        const stuckCount = stuckBusinesses?.length || 0
        return stuckCount > 5 // More than 5 businesses stuck for over 24 hours
      },
    }
    await alertManager.checkAndAlert(provisioningCondition, `Businesses stuck in provisioning: ${(await supabase.from('businesses').select('id').is('twilio_phone_number', null).gte('created_at', twentyFourHoursAgo)).data?.length || 0}`)

    return NextResponse.json({
      success: true,
      checkedAt: now.toISOString(),
      alertStates: alertManager.getAlertStates(),
    })
  } catch (error) {
    console.error('[Health Checks Cron] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
