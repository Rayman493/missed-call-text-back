import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const registrationRouteContent = readFileSync(
  'src/app/api/push/register-device/route.ts',
  'utf8'
)
const pushServiceContent = readFileSync('src/lib/push-service.ts', 'utf8')
const fcmSenderContent = readFileSync('src/lib/fcm-sender.ts', 'utf8')
const apnsSenderContent = readFileSync('src/lib/apns-sender.ts', 'utf8')

describe('Push device registration identity and rotation contract', () => {
  it('does not have a stable native installation identifier today', () => {
    // getDeviceIdentifier currently returns null because the Capacitor Device
    // plugin is not wired. The DB device_identifier column is therefore null
    // in practice.
    expect(pushServiceContent).toMatch(/private getDeviceIdentifier\(\): string \| null/)
    expect(pushServiceContent).toMatch(/return null/)
  })

  it('does not disable other tokens by user+business+platform only', () => {
    // Without a stable device id, disabling by (user, business, platform)
    // would collapse multiple legitimate devices into a single active token.
    // The route must NOT contain any bulk `enabled: false` update.
    expect(registrationRouteContent).not.toMatch(/\.update\(\{\s*enabled:\s*false/)
  })

  it('uses the unique (user_id, platform, push_token) identity for idempotent re-registration', () => {
    expect(registrationRouteContent).toMatch(/onConflict:\s*['"]user_id,platform,push_token['"]/)
  })

  it('explains stale-token handling is delegated to the providers', () => {
    // Stale tokens are disabled when FCM/APNs rejects them, not at registration.
    expect(registrationRouteContent).toMatch(/fcm-sender\.ts/)
    expect(registrationRouteContent).toMatch(/apns-sender\.ts/)
    expect(fcmSenderContent).toMatch(/disableInvalidToken\(/)
    expect(apnsSenderContent).toMatch(/disableInvalidIosToken\(/)
  })

  it('disables FCM tokens on permanent invalid responses only', () => {
    expect(fcmSenderContent).toMatch(/messaging\/registration-token-not-registered/)
    expect(fcmSenderContent).toMatch(/messaging\/invalid-registration-token/)
  })

  it('disables APNs tokens on permanent invalid responses only', () => {
    expect(apnsSenderContent).toMatch(/BadDeviceToken/)
    expect(apnsSenderContent).toMatch(/DeviceTokenNotForTopic/)
    expect(apnsSenderContent).toMatch(/Unregistered/)
  })
})
