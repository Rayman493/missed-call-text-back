/**
 * Firebase Cloud Messaging (FCM) Sender
 * 
 * This service handles server-side push notification delivery via FCM.
 * It integrates with the existing notification creation flow and uses
 * the push policy to determine which notifications should trigger pushes.
 */

import { initializeApp, getApps, App, cert } from 'firebase-admin/app'
import { getMessaging as getFirebaseMessaging, Messaging } from 'firebase-admin/messaging'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { shouldSendPush } from './push-policy'

// FCM service account credentials from environment variables
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
}

// Initialize Firebase Admin SDK (lazy initialization)
let firebaseApp: App | null = null
let messagingInstance: Messaging | null = null

function getMessaging(): Messaging {
  if (!messagingInstance) {
    if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
      console.error('[FCM SENDER] Missing Firebase credentials')
      throw new Error('Firebase credentials not configured')
    }

    const existingApps = getApps()
    if (existingApps.length > 0) {
      firebaseApp = existingApps[0]
    } else {
      firebaseApp = initializeApp({
        credential: cert(serviceAccount),
      })
    }

    messagingInstance = getFirebaseMessaging(firebaseApp)
  }
  return messagingInstance
}

/**
 * Push notification payload
 */
export interface PushPayload {
  notificationId: string
  type: string
  actionUrl: string
  leadId?: string
}

/**
 * Send push notification for a given notification record
 * 
 * This is called asynchronously after in-app notification creation.
 * Failures are logged but do not affect the original business event.
 * 
 * @param notification - The notification record from the database
 */
export async function sendPushForNotification(notification: {
  id: string
  business_id: string
  type: string
  title: string
  message: string
  action_url?: string
  data?: any
}): Promise<void> {
  try {
    // Check if this notification type should trigger a push
    if (!shouldSendPush(notification.type as any)) {
      console.log('[FCM SENDER] Notification type not push-enabled:', notification.type)
      return
    }

    // Validate action_url
    if (!notification.action_url) {
      console.warn('[FCM SENDER] Notification missing action_url, skipping push:', notification.id)
      return
    }

    console.log('[FCM SENDER] Sending push for notification:', notification.id)

    // Get active enabled push devices for this business
    const { data: devices, error: devicesError } = await supabaseAdmin
      .from('push_devices')
      .select('id, push_token, platform')
      .eq('business_id', notification.business_id)
      .eq('enabled', true)

    if (devicesError) {
      console.error('[FCM SENDER] Failed to fetch push devices:', devicesError)
      return
    }

    if (!devices || devices.length === 0) {
      console.log('[FCM SENDER] No active push devices for business:', notification.business_id)
      return
    }

    console.log('[FCM SENDER] Found active devices:', devices.length)

    // Deduplicate tokens (in case of duplicate registrations)
    const uniqueTokens = new Set(devices.map(d => d.push_token))
    console.log('[FCM SENDER] Unique tokens:', uniqueTokens.size)

    // Prepare push payload
    const payload: PushPayload = {
      notificationId: notification.id,
      type: notification.type,
      actionUrl: notification.action_url,
      leadId: notification.data?.leadId,
    }

    // Prepare FCM message
    const fcmMessage = {
      notification: {
        title: notification.title,
        body: notification.message,
      },
      data: payload as any,
      android: {
        channelId: 'replyflow-high',
        priority: 'high' as const,
      },
      token: '', // Will be set per device
    }

    // Get Firebase messaging instance
    const messaging = getMessaging()

    // Send to each device
    const results = await Promise.allSettled(
      Array.from(uniqueTokens).map(async (token) => {
        try {
          const message = { ...fcmMessage, token }
          const messageId = await messaging.send(message)
          console.log('[FCM SENDER] Push sent successfully:', messageId)
          return { success: true, token }
        } catch (error: any) {
          console.error('[FCM SENDER] Push send failed for token:', token.substring(0, 20) + '...', error)
          
          // Check if token is invalid/unregistered
          if (error.code === 'messaging/registration-token-not-registered' ||
              error.code === 'messaging/invalid-registration-token') {
            console.log('[FCM SENDER] Disabling invalid token:', token.substring(0, 20) + '...')
            await disableInvalidToken(token)
          }
          
          return { success: false, token, error: error.message }
        }
      })
    )

    // Log results
    const successful = results.filter(r => r.status === 'fulfilled' && (r.value as any).success).length
    const failed = results.filter(r => r.status === 'rejected' || !(r.value as any).success).length

    console.log('[FCM SENDER] Push delivery complete:', {
      total: results.length,
      successful,
      failed,
    })
  } catch (error) {
    console.error('[FCM SENDER] Unexpected error in sendPushForNotification:', error)
    // Do not throw - push failures should not break business events
  }
}

/**
 * Disable an invalid push token
 * 
 * @param token - The invalid FCM token to disable
 */
async function disableInvalidToken(token: string): Promise<void> {
  try {
    const { error } = await supabaseAdmin
      .from('push_devices')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('push_token', token)

    if (error) {
      console.error('[FCM SENDER] Failed to disable invalid token:', error)
    } else {
      console.log('[FCM SENDER] Invalid token disabled successfully')
    }
  } catch (error) {
    console.error('[FCM SENDER] Error disabling invalid token:', error)
  }
}

/**
 * Send a test push notification
 * 
 * This is used for development/testing purposes only.
 * 
 * @param businessId - The business ID to send test push to
 * @param title - Test notification title
 * @param body - Test notification body
 * @param actionUrl - Test action URL
 */
export async function sendTestPush(
  businessId: string,
  title: string,
  body: string,
  actionUrl: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Get active enabled push devices for this business
    const { data: devices, error: devicesError } = await supabaseAdmin
      .from('push_devices')
      .select('push_token')
      .eq('business_id', businessId)
      .eq('enabled', true)

    if (devicesError) {
      console.error('[FCM SENDER] Failed to fetch push devices for test:', devicesError)
      return { success: false, message: 'Failed to fetch push devices' }
    }

    if (!devices || devices.length === 0) {
      return { success: false, message: 'No active push devices for this business' }
    }

    // Get Firebase messaging instance
    const messaging = getMessaging()

    // Send to first device only (for testing)
    const token = devices[0].push_token
    const message = {
      notification: {
        title,
        body,
      },
      data: {
        notificationId: 'test-' + Date.now(),
        type: 'test',
        actionUrl,
      } as any,
      android: {
        channelId: 'replyflow-high',
        priority: 'high' as const,
      },
      token,
    }

    const messageId = await messaging.send(message)
    console.log('[FCM SENDER] Test push sent:', messageId)

    return { success: true, message: 'Test push sent successfully' }
  } catch (error: any) {
    console.error('[FCM SENDER] Test push failed:', error)
    return { success: false, message: error.message || 'Test push failed' }
  }
}
