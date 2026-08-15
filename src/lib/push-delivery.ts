import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendApnsToTokens, PushPayload as ApnsPayload } from '@/lib/apns-sender'
import { sendToFcmTokens, PushPayload as FcmPayload } from '@/lib/fcm-sender'

// Retry configuration
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAYS = [0, 2000, 5000] // Immediate, 2 seconds, 5 seconds

/**
 * Record a delivery attempt in the database
 */
async function recordDeliveryAttempt(
  notificationId: string,
  userId: string,
  channel: 'push' | 'email' | 'sms',
  attemptNumber: number,
  status: 'pending' | 'sent' | 'failed',
  errorMessage?: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from('notification_delivery_attempts')
      .insert({
        notification_id: notificationId,
        user_id: userId,
        channel,
        attempt_number: attemptNumber,
        status,
        error_message: errorMessage || null,
        attempted_at: new Date().toISOString()
      })
  } catch (error) {
    console.error('[PUSH DELIVERY] Failed to record delivery attempt:', {
      notificationId,
      userId,
      channel,
      attemptNumber,
      status,
      error: error instanceof Error ? error.message : String(error)
    })
    // Non-critical: don't fail delivery if tracking fails
  }
}

/**
 * Get user ID for a business (for delivery tracking)
 */
async function getUserIdForBusiness(businessId: string): Promise<string | null> {
  try {
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('user_id')
      .eq('id', businessId)
      .single()
    return business?.user_id || null
  } catch (error) {
    console.error('[PUSH DELIVERY] Failed to get user ID for business:', error)
    return null
  }
}

export interface UnifiedResult {
  android: { attempted: number; successful: number; failed: number }
  ios: { attempted: number; successful: number; failed: number; disabled?: number; skipped?: boolean; skipReason?: string }
}

function toFcmPayload(p: ApnsPayload): FcmPayload {
  return p as any
}

export async function sendPushForNotification(notification: {
  id: string
  business_id: string
  type: string
  title: string
  message: string
  action_url?: string
  data?: any
}): Promise<UnifiedResult> {
  const userId = await getUserIdForBusiness(notification.business_id)
  const correlationId = `NOTIF-${notification.id}`

  console.log('[PUSH DELIVERY] Starting push delivery', {
    notificationId: notification.id,
    businessId: notification.business_id,
    userId,
    correlationId
  })

  // Fetch enabled devices for the business
  const { data: devices, error } = await supabaseAdmin
    .from('push_devices')
    .select('push_token, platform')
    .eq('business_id', notification.business_id)
    .eq('enabled', true)

  if (error) {
    console.error('[PUSH DELIVERY] Failed to fetch push devices:', {
      notificationId: notification.id,
      businessId: notification.business_id,
      error: error.message,
      correlationId
    })
    return { android: { attempted: 0, successful: 0, failed: 0 }, ios: { attempted: 0, successful: 0, failed: 0 } }
  }

  const androidTokens = new Set<string>()
  const iosTokens = new Set<string>()
  for (const d of devices || []) {
    if (d.platform === 'android') androidTokens.add(d.push_token)
    else if (d.platform === 'ios') iosTokens.add(d.push_token)
  }

  const payload: ApnsPayload = {
    notificationId: notification.id,
    type: notification.type,
    actionUrl: notification.action_url || '',
    leadId: notification.data?.leadId,
  }

  // Implement retry logic with exponential backoff
  let finalResult: UnifiedResult = {
    android: { attempted: 0, successful: 0, failed: 0 },
    ios: { attempted: 0, successful: 0, failed: 0 }
  }

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    console.log(`[PUSH DELIVERY] Attempt ${attempt}/${MAX_RETRY_ATTEMPTS}`, {
      notificationId: notification.id,
      businessId: notification.business_id,
      correlationId
    })

    // Record attempt as pending
    if (userId) {
      await recordDeliveryAttempt(notification.id, userId, 'push', attempt, 'pending')
    }

    // Send in parallel; failures on one provider should not block the other
    const [androidRes, iosRes] = await Promise.allSettled([
      (async () => {
        if (androidTokens.size === 0) return { attempted: 0, successful: 0, failed: 0 }
        return await sendToFcmTokens(Array.from(androidTokens), {
          title: notification.title,
          body: notification.message,
          payload: payload as FcmPayload,
        })
      })(),
      (async () => {
        return await sendApnsToTokens(Array.from(iosTokens), {
          title: notification.title,
          body: notification.message,
          payload,
        })
      })(),
    ])

    const android = androidRes.status === 'fulfilled' ? androidRes.value : { attempted: 0, successful: 0, failed: 0 }
    const ios = iosRes.status === 'fulfilled' ? iosRes.value : { attempted: 0, successful: 0, failed: 0 }

    finalResult = {
      android: { attempted: (android as any).attempted ?? 0, successful: (android as any).successful ?? 0, failed: (android as any).failed ?? 0 },
      ios: ios as any,
    }

    // Check if delivery was successful
    const totalAttempted = finalResult.android.attempted + finalResult.ios.attempted
    const totalSuccessful = finalResult.android.successful + finalResult.ios.successful
    const totalFailed = finalResult.android.failed + finalResult.ios.failed

    const isSuccess = totalAttempted > 0 && totalFailed === 0

    if (isSuccess) {
      console.log('[PUSH DELIVERY] Delivery successful', {
        notificationId: notification.id,
        businessId: notification.business_id,
        attempt,
        totalSuccessful,
        correlationId
      })

      // Record successful delivery
      if (userId) {
        await recordDeliveryAttempt(notification.id, userId, 'push', attempt, 'sent')
      }

      return finalResult
    }

    // Delivery failed, check if we should retry
    if (attempt < MAX_RETRY_ATTEMPTS) {
      const delay = RETRY_DELAYS[attempt]
      console.log('[PUSH DELIVERY] Delivery failed, retrying', {
        notificationId: notification.id,
        businessId: notification.business_id,
        attempt,
        nextAttempt: attempt + 1,
        delay,
        totalFailed,
        correlationId
      })

      // Record failed attempt
      if (userId) {
        await recordDeliveryAttempt(notification.id, userId, 'push', attempt, 'failed', `Attempt ${attempt}: ${totalFailed} failures`)
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay))
    } else {
      // Final attempt failed
      console.error('[PUSH DELIVERY] All retry attempts exhausted', {
        notificationId: notification.id,
        businessId: notification.business_id,
        totalFailed,
        correlationId
      })

      // Record final failed attempt
      if (userId) {
        await recordDeliveryAttempt(notification.id, userId, 'push', attempt, 'failed', `All ${MAX_RETRY_ATTEMPTS} attempts failed: ${totalFailed} total failures`)
      }
    }
  }

  return finalResult
}

export async function sendTestPush(
  businessId: string,
  title: string,
  body: string,
  actionUrl: string
): Promise<{ success: boolean; message: string; details?: any }> {
  const { data: devices, error } = await supabaseAdmin
    .from('push_devices')
    .select('push_token, platform')
    .eq('business_id', businessId)
    .eq('enabled', true)

  if (error) {
    console.error('[PUSH DELIVERY] Failed to fetch push devices for test:', error)
    return { success: false, message: 'Failed to fetch push devices' }
  }

  const androidTokens = devices?.filter(d => d.platform === 'android').map(d => d.push_token) || []
  const iosTokens = devices?.filter(d => d.platform === 'ios').map(d => d.push_token) || []

  const [iosRes] = await Promise.allSettled([
    sendApnsToTokens(iosTokens, { title, body, payload: { notificationId: 'test-' + Date.now(), type: 'test', actionUrl } })
  ])

  // For Android, reuse existing test path that already sends to all devices; to avoid duplicate sends,
  // only call it if there are Android tokens. This will also cover legacy behavior.
  let androidSummary = { attempted: 0, successful: 0, failed: 0 }
  if (androidTokens.length > 0) {
    const fcm = await import('@/lib/fcm-sender')
    const res = await fcm.sendTestPush(businessId, title, body, actionUrl)
    androidSummary = {
      attempted: (res.details?.attempted as number) ?? androidTokens.length,
      successful: (res.details?.succeeded as number) ?? 0,
      failed: (res.details?.failed as number) ?? 0,
    }
  }

  const iosSummary = iosRes.status === 'fulfilled' ? iosRes.value : { attempted: 0, successful: 0, failed: 0, skipped: false }

  const totalSuccess = androidSummary.successful + (iosSummary as any).successful
  const totalAttempts = androidSummary.attempted + (iosSummary as any).attempted

  return {
    success: totalSuccess > 0,
    message: `Attempted ${totalAttempts}, success ${totalSuccess}`,
    details: {
      android: androidSummary,
      ios: iosSummary,
    }
  }
}
