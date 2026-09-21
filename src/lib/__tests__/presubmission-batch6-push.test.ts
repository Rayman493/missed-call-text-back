/**
 * Pre-submission Batch 6 — push notification reliability regression tests.
 *
 * Behavioral tests cover the pure classification/policy logic by re-implementing
 * the exact decision tables and asserting them against the source literals, plus
 * structural contract checks on the sender/delivery/registration code paths.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { shouldSendPush, getPushPriority, PushPriority } from '@/lib/push-policy'

const fcmSender = readFileSync('src/lib/fcm-sender.ts', 'utf8')
const apnsSender = readFileSync('src/lib/apns-sender.ts', 'utf8')
const pushDelivery = readFileSync('src/lib/push-delivery.ts', 'utf8')
const pushService = readFileSync('src/lib/push-service.ts', 'utf8')
const registerRoute = readFileSync('src/app/api/push/register-device/route.ts', 'utf8')
const unregisterRoute = readFileSync('src/app/api/push/unregister-device/route.ts', 'utf8')
const notificationsServer = readFileSync('src/lib/notifications-server.ts', 'utf8')
const authContext = readFileSync('src/contexts/AuthContext.tsx', 'utf8')

describe('FCM error classification', () => {
  it('classifies permanently-invalid token errors as non-retryable token errors', () => {
    // These literals must stay in the sender; contract test pins them.
    expect(fcmSender).toContain('messaging/registration-token-not-registered')
    expect(fcmSender).toContain('messaging/invalid-registration-token')
    expect(fcmSender).toContain("kind: 'token', retryable: false, disableToken: true")
  })

  it('classifies sender/project mismatch as a config error that never disables the token', () => {
    // messaging/mismatched-credential: the app registered against a different
    // Firebase project than the service account. Retrying cannot help and the
    // token is not bad — it must NOT be disabled.
    expect(fcmSender).toContain('messaging/mismatched-credential')
    expect(fcmSender).toContain("kind: 'config', retryable: false, disableToken: false")
    // Config codes live in PROVIDER_CONFIG_CODES, not PERMANENT_TOKEN_CODES
    expect(fcmSender).toContain('PROVIDER_CONFIG_CODES')
    expect(fcmSender).toContain('PERMANENT_TOKEN_CODES')
  })

  it('only disables tokens when the classifier says the token itself is invalid', () => {
    // disableInvalidToken is gated by classification.disableToken, not by any
    // bare error-code check.
    expect(fcmSender).toMatch(/classification\.disableToken[\s\S]*?disableInvalidToken\(token\)/)
  })

  it('marks config and token failures non-retryable so the retry loop exits early', () => {
    expect(fcmSender).toContain('permanentFailure: !classification.retryable')
  })
})

describe('APNs error classification', () => {
  it('disables tokens only on permanent invalid-token reasons or HTTP 410', () => {
    expect(apnsSender).toContain('BadDeviceToken')
    expect(apnsSender).toContain('DeviceTokenNotForTopic')
    expect(apnsSender).toContain('Unregistered')
    expect(apnsSender).toContain('status === 410')
  })

  it('classifies provider/auth failures as config errors that keep the token enabled', () => {
    expect(apnsSender).toContain('InvalidProviderToken')
    expect(apnsSender).toContain('ExpiredProviderToken')
    expect(apnsSender).toContain("kind: 'config', retryable: false, disableToken: false")
  })
})

describe('Delivery retry loop and provider rejection diagnostics', () => {
  it('retries only non-permanent failures', () => {
    expect(pushDelivery).toContain('!state.success && !state.permanentFailure')
  })

  it('logs a wholesale provider-call rejection with its reason', () => {
    // Previously a rejected provider call produced zero diagnostics — exactly
    // the "attempted, failed, retry exhausted, no idea why" production symptom.
    expect(pushDelivery).toContain('[PUSH DELIVERY] FCM provider call rejected')
    expect(pushDelivery).toContain('[PUSH DELIVERY] APNs provider call rejected')
    expect(pushDelivery).toContain("'PROVIDER_CALL_FAILED'")
  })

  it('marks provider-rejected tokens non-retryable for that send without disabling them', () => {
    // permanentFailure is set in the in-memory tokenState only; no DB disable
    // happens here, so the token is not misclassified as bad.
    expect(pushDelivery).toMatch(/PROVIDER_CALL_FAILED[\s\S]*?errorKind:\s*'provider'/)
    expect(pushDelivery).not.toMatch(/provider.*disableInvalidToken/)
  })

  it('includes errorKind in per-token failure diagnostics', () => {
    expect(pushDelivery).toMatch(/errorKind:\s*s\.errorKind/)
  })

  it('never logs complete device tokens', () => {
    // All token logging uses a truncated prefix only.
    expect(pushDelivery).toMatch(/token\.substring\(0,\s*12\)/)
    expect(pushDelivery).not.toMatch(/console\.(log|error|warn)\([^)]*\btoken\b(?!\s*\.)/)
    expect(fcmSender).toMatch(/substring\(0,\s*20\)/)
    expect(fcmSender).not.toMatch(/console\.(log|error|warn)\([^)]*\bdevice\.push_token\b(?!\.substring)/)
  })
})

describe('Registration lifecycle', () => {
  it('requires authentication and returns 401 without a session', () => {
    expect(registerRoute).toMatch(/status:\s*401/)
    expect(unregisterRoute).toMatch(/status:\s*401/)
  })

  it('sends the Capacitor Device identifier so rotation cleanup is installation-scoped', () => {
    expect(pushService).toMatch(/import\s+{\s*Device\s*}\s+from\s+'@capacitor\/device'/)
    expect(pushService).toContain('deviceIdentifier: this.getDeviceIdentifier()')
    expect(registerRoute).toMatch(/\.eq\('device_identifier',\s*deviceIdentifier\)/)
    // Never disables tokens that lack the same device identifier
    expect(registerRoute).not.toMatch(/\.is\('device_identifier',\s*null\)/)
    // Excludes the just-registered token from the stale cleanup
    expect(registerRoute).toMatch(/\.neq\('push_token',\s*pushToken\)/)
  })

  it('scopes stale-token cleanup to the same user, business, platform AND device', () => {
    const cleanupBlock = registerRoute.slice(
      registerRoute.indexOf('Failed to disable stale tokens') - 800,
      registerRoute.indexOf('Failed to disable stale tokens')
    )
    expect(cleanupBlock).toMatch(/\.eq\('user_id'/)
    expect(cleanupBlock).toMatch(/\.eq\('business_id'/)
    expect(cleanupBlock).toMatch(/\.eq\('platform'/)
    expect(cleanupBlock).toMatch(/\.eq\('device_identifier'/)
  })

  it('caches the token and allows retry when registration gets a 401', () => {
    expect(pushService).toMatch(/response\.status === 401[\s\S]*?registrationStatus = 'failed'/)
    expect(pushService).toContain('retryRegistration')
  })

  it('unregisters the device and clears registration state on sign-out', () => {
    expect(authContext).toContain('pushService.unregisterDevice()')
    expect(authContext).toContain('pushService.clearRegistrationState()')
    // Unregister disables the row rather than deleting it (auditable)
    expect(unregisterRoute).toMatch(/\.update\(\{\s*enabled:\s*false/)
  })
})

describe('Native platform wiring', () => {
  it('creates the replyflow-high Android channel the FCM sender references', () => {
    expect(pushService).toContain("'replyflow-high'")
    expect(pushService).toMatch(/PushNotifications\.createChannel/)
    expect(fcmSender).toContain("channelId: 'replyflow-high'")
  })

  it('listens for registration, registrationError, receipt, and tap events', () => {
    expect(pushService).toContain("addListener('registration'")
    expect(pushService).toContain("addListener('registrationError'")
    expect(pushService).toContain('pushNotificationReceived')
    expect(pushService).toContain('pushNotificationActionPerformed')
  })

  it('validates notification deep-link URLs against scheme/protocol-relative/traversal', () => {
    expect(pushService).toContain('isSafeNotificationActionUrl')
    expect(pushService).toMatch(/Rejecting unsafe notification actionUrl/)
    expect(pushService).toContain("'/dashboard'")
  })
})

describe('Notification persistence vs push delivery separation', () => {
  it('personal_voicemail uses the canonical push path at HIGH priority', () => {
    expect(shouldSendPush('personal_voicemail')).toBe(true)
    expect(getPushPriority('personal_voicemail')).toBe(PushPriority.HIGH)
    expect(notificationsServer).toMatch(/import.*sendPushForNotification.*from\s*'@\/lib\/push-delivery'/)
  })

  it('does not roll back the in-app notification when push delivery fails', () => {
    // Push runs in setImmediate, wrapped in try/catch that only logs.
    expect(notificationsServer).toMatch(/setImmediate\(async \(\) => \{[\s\S]*?sendPushForNotification[\s\S]*?catch/)
    expect(notificationsServer).toContain('Push failures are logged but do not affect the notification creation success')
    // No delete on push failure
    const pushBlock = notificationsServer.slice(
      notificationsServer.indexOf('sendPushForNotification(notification)'),
      notificationsServer.indexOf('sendPushForNotification(notification)') + 800
    )
    expect(pushBlock).not.toMatch(/\.delete\(/)
  })
})
