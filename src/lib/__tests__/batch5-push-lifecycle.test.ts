import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pushServiceSrc = readFileSync('src/lib/push-service.ts', 'utf8').replace(/\r\n/g, '\n')
const registerRouteSrc = readFileSync('src/app/api/push/register-device/route.ts', 'utf8').replace(/\r\n/g, '\n')
const unregisterRouteSrc = readFileSync('src/app/api/push/unregister-device/route.ts', 'utf8').replace(/\r\n/g, '\n')

describe('Batch 5 — push registration lifecycle', () => {
  it('wires the Capacitor Device plugin for a stable installation identifier', () => {
    expect(pushServiceSrc).toMatch(/import\s+{\s*Device\s*}\s+from\s+['"]@capacitor\/device['"]/)
    expect(pushServiceSrc).toMatch(/await\s+Device\.getId\(\)/)
    expect(pushServiceSrc).toMatch(/return this\.deviceId/)
  })

  it('receives and persists the native token before auth/business are ready', () => {
    expect(pushServiceSrc).toMatch(/this\.currentToken\s*=\s*token\.value/)
  })

  it('registers once access token and business are resolved', () => {
    expect(pushServiceSrc).toMatch(/setAccessToken\(token:\s*string\)/)
    expect(pushServiceSrc).toMatch(/setBusinessId\(businessId:\s*string\s*\|\s*null\)/)
    expect(pushServiceSrc).toMatch(/this\.maybeRegisterDevice\(\)/)
  })

  it('sends the exact native platform and active business to the server', () => {
    expect(pushServiceSrc).toMatch(/businessId:\s*this\.currentBusinessId/)
    expect(pushServiceSrc).toMatch(/platform:\s*this\.currentPlatform/)
    expect(pushServiceSrc).toMatch(/deviceIdentifier:\s*this\.getDeviceIdentifier\(\)/)
  })

  it('is idempotent for the same token and business', () => {
    expect(pushServiceSrc).toMatch(/alreadyRegistered/)
    expect(pushServiceSrc).toMatch(/this\.currentToken\s*===\s*this\.lastRegisteredToken/)
    expect(pushServiceSrc).toMatch(/this\.currentBusinessId\s*===\s*this\.lastRegisteredBusinessId/)
  })

  it('re-registers after business switch', () => {
    expect(pushServiceSrc).toMatch(/this\.currentBusinessId\s*=\s*businessId/)
    expect(pushServiceSrc).toMatch(/Re-registers the current push token when the active business changes/)
  })

  it('survives logout/login without losing the native token', () => {
    // clearRegistrationState must not clear the native push token so that
    // the next login can re-register it.
    expect(pushServiceSrc).not.toMatch(/clearRegistrationState\(\)[\s\S]{0,300}this\.currentToken\s*=\s*null/)
    expect(pushServiceSrc).toMatch(/this\.registrationStatus\s*=\s*['"]none['"]/)
  })

  it('registers the route accepts and validates the client business id', () => {
    expect(registerRouteSrc).toMatch(/businessId:\s*requestedBusinessId/)
    expect(registerRouteSrc).toMatch(/requestedBusinessId/)
    expect(registerRouteSrc).toMatch(/\.eq\(['"]id['"],\s*requestedBusinessId\)/)
    expect(registerRouteSrc).toMatch(/user_id/)
  })

  it('disables only stale tokens for the same installation identifier', () => {
    expect(registerRouteSrc).toMatch(/\.eq\(['"]device_identifier['"],\s*deviceIdentifier\)/)
    expect(registerRouteSrc).not.toMatch(/\.is\(['"]device_identifier['"],\s*null\)/)
    expect(registerRouteSrc).toMatch(/\.neq\(['"]push_token['"],\s*pushToken\)/)
  })

  it('keeps the current token enabled after registration', () => {
    expect(registerRouteSrc).toMatch(/enabled:\s*true/)
    expect(registerRouteSrc).toMatch(/onConflict:\s*['"]user_id,platform,push_token['"]/)
  })

  it('unregister route targets the current token specifically', () => {
    expect(unregisterRouteSrc).toMatch(/push_token/)
    expect(unregisterRouteSrc).toMatch(/\.eq\(['"]push_token['"],/)
  })

  it('logs safe token prefixes and platform for diagnostics', () => {
    expect(pushServiceSrc).toMatch(/tokenPrefix/)
    expect(pushServiceSrc).toMatch(/token\.substring\(0,\s*8\)/)
    expect(pushServiceSrc).toMatch(/platform:\s*this\.currentPlatform/)
  })

  it('re-registers on app resume when initialized', () => {
    expect(pushServiceSrc).toMatch(/'appStateChange'/)
    expect(pushServiceSrc).toMatch(/this\.register\(\)/)
  })

  it('keeps APNs/FCM token rotation working through the registration listener', () => {
    expect(pushServiceSrc).toMatch(/PushNotifications\.addListener\(['"]registration['"],/)
    expect(pushServiceSrc).toMatch(/this\.maybeRegisterDevice\(\)/)
  })
})
