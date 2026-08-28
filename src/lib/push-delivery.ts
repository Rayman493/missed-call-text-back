import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendApnsToTokens, PushPayload as ApnsPayload } from '@/lib/apns-sender'
import { sendToFcmTokens, PushPayload as FcmPayload } from '@/lib/fcm-sender'

// Retry configuration
const MAX_RETRY_ATTEMPTS = 3
const RETRY_DELAYS = [0, 2000, 5000] // Immediate, 2 seconds, 5 seconds

// Per-token result for retry logic
export interface TokenResult {
  token: string
  success: boolean
  permanentFailure: boolean
  platform: 'android' | 'ios'
  errorCode?: string
}

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

  // Track per-token state across retry attempts
  const tokenState = new Map<string, TokenResult>()

  // Initialize token state for all eligible tokens
  for (const token of androidTokens) {
    tokenState.set(token, { token, success: false, permanentFailure: false, platform: 'android' })
  }
  for (const token of iosTokens) {
    tokenState.set(token, { token, success: false, permanentFailure: false, platform: 'ios' })
  }

  let finalResult: UnifiedResult = {
    android: { attempted: 0, successful: 0, failed: 0 },
    ios: { attempted: 0, successful: 0, failed: 0 }
  }

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
    // Build retry token sets from current state
    const retryAndroidTokens = Array.from(tokenState.entries())
      .filter(([_, state]) => state.platform === 'android' && !state.success && !state.permanentFailure)
      .map(([token]) => token)

    const retryIosTokens = Array.from(tokenState.entries())
      .filter(([_, state]) => state.platform === 'ios' && !state.success && !state.permanentFailure)
      .map(([token]) => token)

    // If no retryable tokens remain, exit early
    if (retryAndroidTokens.length === 0 && retryIosTokens.length === 0) {
      console.log('[PUSH DELIVERY] No retryable tokens remaining, exiting retry loop', {
        notificationId: notification.id,
        attempt,
        correlationId
      })
      break
    }

    console.log(`[PUSH DELIVERY] Attempt ${attempt}/${MAX_RETRY_ATTEMPTS}`, {
      notificationId: notification.id,
      businessId: notification.business_id,
      attempt,
      androidTokens: retryAndroidTokens.length,
      iosTokens: retryIosTokens.length,
      correlationId
    })

    // Record attempt as pending
    if (userId) {
      await recordDeliveryAttempt(notification.id, userId, 'push', attempt, 'pending')
    }

    // Send in parallel; failures on one provider should not block the other
    const [androidRes, iosRes] = await Promise.allSettled([
      (async () => {
        if (retryAndroidTokens.length === 0) return { attempted: 0, successful: 0, failed: 0, results: [] }
        const result = await sendToFcmTokens(retryAndroidTokens, {
          title: notification.title,
          body: notification.message,
          payload: payload as FcmPayload,
        })

        // Update token state with FCM results
        for (const fcmResult of result.results) {
          tokenState.set(fcmResult.token, {
            token: fcmResult.token,
            success: fcmResult.success,
            permanentFailure: fcmResult.permanentFailure,
            platform: 'android',
            errorCode: fcmResult.errorCode
          })
        }

        return result
      })(),
      (async () => {
        if (retryIosTokens.length === 0) return { attempted: 0, successful: 0, failed: 0, disabled: 0, results: [] }
        const result = await sendApnsToTokens(retryIosTokens, {
          title: notification.title,
          body: notification.message,
          payload,
        })

        // Update token state with APNS results
        if (result.results) {
          for (const apnsResult of result.results) {
            tokenState.set(apnsResult.token, {
              token: apnsResult.token,
              success: apnsResult.success,
              permanentFailure: apnsResult.permanentFailure,
              platform: 'ios',
              errorCode: apnsResult.errorCode
            })
          }
        }

        return result
      })(),
    ])

    const android = androidRes.status === 'fulfilled' ? androidRes.value : { attempted: 0, successful: 0, failed: 0, results: [] }
    const ios = iosRes.status === 'fulfilled' ? iosRes.value : { attempted: 0, successful: 0, failed: 0, disabled: 0, results: [] }

    // Calculate final aggregate results from token state
    const androidSuccessful = Array.from(tokenState.values()).filter(s => s.platform === 'android' && s.success).length
    const androidFailed = Array.from(tokenState.values()).filter(s => s.platform === 'android' && !s.success).length
    const iosSuccessful = Array.from(tokenState.values()).filter(s => s.platform === 'ios' && s.success).length
    const iosFailed = Array.from(tokenState.values()).filter(s => s.platform === 'ios' && !s.success).length

    finalResult = {
      android: { attempted: retryAndroidTokens.length, successful: androidSuccessful, failed: androidFailed },
      ios: { attempted: retryIosTokens.length, successful: iosSuccessful, failed: iosFailed }
    }

    // Log attempt results
    console.log(`[PUSH DELIVERY] Attempt ${attempt} complete`, {
      notificationId: notification.id,
      businessId: notification.business_id,
      attempt,
      androidAttempted: (android as any).attempted,
      androidSuccessful: (android as any).successful,
      androidFailed: (android as any).failed,
      iosAttempted: (ios as any).attempted,
      iosSuccessful: (ios as any).successful,
      iosFailed: (ios as any).failed,
      newAndroidSuccess: androidSuccessful - finalResult.android.successful,
      newIosSuccess: iosSuccessful - finalResult.ios.successful,
      remainingRetryTokens: Array.from(tokenState.values()).filter(s => !s.success && !s.permanentFailure).length,
      correlationId
    })

    // Check if delivery was successful (no failures remain)
    const totalFailed = finalResult.android.failed + finalResult.ios.failed
    const isSuccess = totalFailed === 0

    if (isSuccess) {
      console.log('[PUSH DELIVERY] Delivery successful', {
        notificationId: notification.id,
        businessId: notification.business_id,
        attempt,
        totalSuccessful: finalResult.android.successful + finalResult.ios.successful,
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
        retryableTokens: Array.from(tokenState.values()).filter(s => !s.success && !s.permanentFailure).length,
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
      const remainingRetryableTokens = Array.from(tokenState.values()).filter(s => !s.success && !s.permanentFailure).length

      if (remainingRetryableTokens === 0) {
        console.error('[PUSH DELIVERY] All retry attempts exhausted - no retryable tokens remain', {
          notificationId: notification.id,
          businessId: notification.business_id,
          totalFailed,
          maxAttempts: MAX_RETRY_ATTEMPTS,
          correlationId
        })
      } else {
        console.error('[PUSH DELIVERY] Maximum retry attempts reached with retryable tokens remaining', {
          notificationId: notification.id,
          businessId: notification.business_id,
          totalFailed,
          maxAttempts: MAX_RETRY_ATTEMPTS,
          remainingRetryableTokens,
          correlationId
        })
      }

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
