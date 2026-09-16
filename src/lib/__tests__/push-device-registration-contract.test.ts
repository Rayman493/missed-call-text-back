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
  it('uses a stable native installation identifier from the Device plugin', () => {
    // getDeviceIdentifier now returns the Capacitor Device plugin's
    // installation identifier so the server can scope stale-token cleanup.
    expect(pushServiceContent).toMatch(/import\s+{\s*Device\s*}\s+from\s+['"]@capacitor\/device['"]/)
    expect(pushServiceContent).toMatch(/private getDeviceIdentifier\(\): string \| null/)
    expect(pushServiceContent).toMatch(/return this\.deviceId/)
  })

  it('disables stale tokens only for the same installation identifier', () => {
    // The cleanup query is constrained by device_identifier and always
    // excludes the just-registered push_token.
    expect(registrationRouteContent).toMatch(/\.eq\(['"]device_identifier['"],\s*deviceIdentifier\)/)
    expect(registrationRouteContent).not.toMatch(/\.is\(['"]device_identifier['"],\s*null\)/)
  })

  it('uses the unique (user_id, platform, push_token) identity for idempotent re-registration', () => {
    expect(registrationRouteContent).toMatch(/onConflict:\s*['"]user_id,platform,push_token['"]/)
  })

  it('explains stale-token handling is delegated to the providers', () => {
    // Registration disables only same-installation prior tokens.
    // Provider-side permanent failures are handled in fcm-sender.ts/apns-sender.ts.
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
