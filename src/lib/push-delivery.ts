import { supabaseAdmin } from '@/lib/supabase/admin'
import { sendApnsToTokens, PushPayload as ApnsPayload } from '@/lib/apns-sender'
import { sendToFcmTokens, PushPayload as FcmPayload } from '@/lib/fcm-sender'

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
  // Fetch enabled devices for the business
  const { data: devices, error } = await supabaseAdmin
    .from('push_devices')
    .select('push_token, platform')
    .eq('business_id', notification.business_id)
    .eq('enabled', true)

  if (error) {
    console.error('[PUSH DELIVERY] Failed to fetch push devices:', error)
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

  return {
    android: { attempted: (android as any).attempted ?? 0, successful: (android as any).successful ?? 0, failed: (android as any).failed ?? 0 },
    ios: ios as any,
  }
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
