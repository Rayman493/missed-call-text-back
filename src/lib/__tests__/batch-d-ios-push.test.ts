/**
 * Batch D — iOS push registration / delivery diagnostic hardening
 *
 * Contract tests for the iOS registration lifecycle:
 * permission → register() → token callback → retained token → deferred
 * registration → server upsert → enabled row → cleanup exclusion →
 * startup/resume/logout reconciliation → delivery selection.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pushServiceSrc = readFileSync('src/lib/push-service.ts', 'utf8').replace(/\r\n/g, '\n')
const registerRouteSrc = readFileSync('src/app/api/push/register-device/route.ts', 'utf8').replace(/\r\n/g, '\n')
const unregisterRouteSrc = readFileSync('src/app/api/push/unregister-device/route.ts', 'utf8').replace(/\r\n/g, '\n')
const deliverySrc = readFileSync('src/lib/push-delivery.ts', 'utf8').replace(/\r\n/g, '\n')

const fnBody = (src: string, startMarker: string, endMarker: string) =>
  src.substring(src.indexOf(startMarker), src.indexOf(endMarker))

describe('iOS permission → native register()', () => {
  it('1. permission granted at startup invokes register()', () => {
    expect(pushServiceSrc).toMatch(/currentPermissions\.receive === 'granted'[\s\S]{0,200}await this\.register\(\)/)
    expect(pushServiceSrc).toContain('startup_register')
    expect(pushServiceSrc).toContain('startup_register_skipped')
  })

  it('1b. permission granted via request invokes register()', () => {
    expect(pushServiceSrc).toMatch(/newState\.notifications\.status === 'granted'[\s\S]{0,200}await this\.register\(\)/)
    expect(pushServiceSrc).toContain('permission_request')
    expect(pushServiceSrc).toContain('permission_result')
  })

  it('tracks permissionGranted for deferred native re-registration', () => {
    expect(pushServiceSrc).toContain('private permissionGranted')
    expect(pushServiceSrc).toMatch(/this\.permissionGranted = currentPermissions\.receive === 'granted'/)
  })
})

describe('Token callback and retention', () => {
  it('2. token callback retains the native token', () => {
    expect(pushServiceSrc).toMatch(/addListener\('registration'[\s\S]*?this\.currentToken\s*=\s*token\.value/)
    expect(pushServiceSrc).toContain('token_received')
  })

  it('2b. token callback marks permission effectively granted (iOS APNs token delivery)', () => {
    const listenerBody = fnBody(pushServiceSrc, "addListener('registration'", "addListener('registrationError'")
    expect(listenerBody).toContain('this.permissionGranted = true')
  })

  it('2c. registration errors are logged distinctly for iOS', () => {
    expect(pushServiceSrc).toContain('token_error')
    expect(pushServiceSrc).toContain("addListener('registrationError'")
  })
})

describe('Deferred registration ordering', () => {
  it('3. token before auth → deferred, then registers when access token arrives', () => {
    const setAccessBody = fnBody(pushServiceSrc, 'setAccessToken(token: string)', 'setBusinessId')
    expect(setAccessBody).toContain('this.maybeRegisterDevice()')
    expect(pushServiceSrc).toContain('no_auth_token')
    expect(pushServiceSrc).toContain('registration_deferred')
  })

  it('4. token before business → deferred, then registers when business arrives', () => {
    const setBusinessBody = fnBody(pushServiceSrc, 'setBusinessId(businessId: string | null)', 'async initialize')
    expect(setBusinessBody).toContain('this.maybeRegisterDevice()')
  })

  it('5. auth/business before token → registers when token arrives', () => {
    const listenerBody = fnBody(pushServiceSrc, "addListener('registration'", "addListener('registrationError'")
    expect(listenerBody).toContain('this.maybeRegisterDevice()')
  })

  it('deferral reasons are enumerated for the diagnostic trace', () => {
    expect(pushServiceSrc).toContain('registrationDeferralReasons')
    expect(pushServiceSrc).toContain('no_native_token')
    expect(pushServiceSrc).toContain('no_auth_token')
    expect(pushServiceSrc).toContain('in_flight')
    expect(pushServiceSrc).toContain('already_registered')
  })
})

describe('Server upsert and cleanup contract', () => {
  it('6. platform is validated and persisted exactly as ios', () => {
    expect(registerRouteSrc).toMatch(/\['android',\s*'ios'\]\.includes\(platform\)/)
    expect(registerRouteSrc).toContain('platform,')
  })

  it('7. device_identifier is persisted', () => {
    expect(registerRouteSrc).toMatch(/device_identifier:\s*deviceIdentifier \|\| null/)
  })

  it('8. upsert sets enabled=true', () => {
    expect(registerRouteSrc).toMatch(/enabled:\s*true/)
    expect(registerRouteSrc).toContain("onConflict: 'user_id,platform,push_token'")
  })

  it('9. cleanup excludes the newly registered token and reports the count', () => {
    expect(registerRouteSrc).toMatch(/\.neq\('push_token',\s*pushToken\)/)
    expect(registerRouteSrc).toContain(".select('id')")
    expect(registerRouteSrc).toContain('disabledCount')
  })

  it('9b. cleanup is scoped to same user/business/platform/installation', () => {
    const cleanupBody = fnBody(registerRouteSrc, 'Stale-token cleanup', 'No device identifier')
    const disableIdx = registerRouteSrc.indexOf(".update({ enabled: false")
    const selectIdx = registerRouteSrc.indexOf(".select('id')", disableIdx)
    const block = registerRouteSrc.substring(disableIdx, selectIdx)
    expect(block).toContain(".eq('user_id', user.id)")
    expect(block).toContain(".eq('business_id', business.id)")
    expect(block).toContain(".eq('platform', platform)")
    expect(block).toContain(".eq('device_identifier', deviceIdentifier)")
  })
})

describe('Idempotency and lifecycle reconciliation', () => {
  it('10. duplicate registration is idempotent', () => {
    expect(pushServiceSrc).toContain('alreadyRegistered')
    expect(registerRouteSrc).toContain("onConflict: 'user_id,platform,push_token'")
  })

  it('11. business switch re-registers the same installation to the new business', () => {
    expect(pushServiceSrc).toContain('const businessIdAtRequest = this.currentBusinessId')
    expect(pushServiceSrc).toContain('businessId: businessIdAtRequest')
    expect(pushServiceSrc).toContain('this.lastRegisteredBusinessId = businessIdAtRequest')
    // Trailing reconciliation after a successful registration
    expect(pushServiceSrc).toMatch(/this\.lastRegisteredBusinessId = businessIdAtRequest[\s\S]{0,400}this\.maybeRegisterDevice\(\)/)
  })

  it('12. logout/login re-registers safely — native token is retained after unregister', () => {
    const unregisterBody = fnBody(pushServiceSrc, 'async unregisterDevice()', 'private handleNotificationReceived')
    expect(unregisterBody).not.toContain('this.currentToken = null')
    expect(unregisterBody).toContain('unregistered')
  })

  it('13. cold-start/resume reconciliation re-runs native registration when token is missing', () => {
    expect(pushServiceSrc).toMatch(/!this\.currentToken && this\.isInitialized && this\.permissionGranted/)
    expect(pushServiceSrc).toContain('token_missing_reregister')
    expect(pushServiceSrc).toContain('resume_register')
    expect(pushServiceSrc).toMatch(/'appStateChange'[\s\S]*?this\.register\(\)/)
  })

  it('13b. listeners are attached before register() can deliver a token', () => {
    expect(pushServiceSrc).toMatch(/await this\.setupListeners\(\)/)
    expect(pushServiceSrc).toMatch(/await PushNotifications\.addListener\('registration'/)
    expect(pushServiceSrc).toMatch(/await App\.addListener\('appStateChange'/)
  })
})

describe('Diagnostic trace coverage', () => {
  it('emits the full iOS lifecycle event set without full tokens', () => {
    for (const event of [
      'permission_state',
      'permission_request',
      'permission_result',
      'startup_register',
      'native_register_invoke',
      'native_register_invoked',
      'native_register_error',
      'token_received',
      'token_error',
      'registration_deferred',
      'registration_attempt',
      'request_sent',
      'server_response',
      'server_error',
      'registration_success',
      'token_missing_reregister',
      'resume_register',
      'unregistered'
    ]) {
      expect(pushServiceSrc).toContain(`'${event}'`)
    }
    expect(pushServiceSrc).toContain('[PUSH_IOS_REG]')
    // Only iOS logs through the helper — Android path stays unchanged
    expect(pushServiceSrc).toMatch(/if \(this\.currentPlatform !== 'ios'\) return/)
    // No full token logging: the token is only ever passed as a substring prefix
    expect(pushServiceSrc).not.toMatch(/[{,]\s*token:\s*token\.value\b/)
    expect(pushServiceSrc).toContain('token.value.substring(0, 8)')
  })
})

describe('Delivery selection', () => {
  it('14. selector counts iosEnabled and includes iOS tokens', () => {
    expect(deliverySrc).toMatch(/d\.platform === 'ios' && d\.enabled/)
    expect(deliverySrc).toContain('iosEnabled')
    expect(deliverySrc).toMatch(/d\.platform === 'ios'\) iosTokens\.add\(d\.push_token\)/)
    expect(deliverySrc).toContain('iosTokenPrefixes')
    expect(deliverySrc).toContain('sendApnsToTokens')
  })

  it('15. Android registration/delivery selection remains unchanged', () => {
    expect(deliverySrc).toMatch(/d\.platform === 'android'\) androidTokens\.add\(d\.push_token\)/)
    expect(deliverySrc).toContain('sendToFcmTokens')
    expect(deliverySrc).toContain('androidTokenPrefixes')
    // Platform stored/validated unchanged
    expect(registerRouteSrc).toMatch(/\['android',\s*'ios'\]\.includes\(platform\)/)
  })
})

describe('Server-side safe token logging', () => {
  it('register route logs only a token prefix', () => {
    expect(registerRouteSrc).toContain('pushToken.substring(0, 8)')
    expect(registerRouteSrc).not.toMatch(/console\.log\([^)]*pushToken[^.)]/)
  })

  it('unregister route logs only a token prefix', () => {
    expect(unregisterRouteSrc).toContain('pushToken.substring(0, 8)')
    expect(unregisterRouteSrc).not.toMatch(/pushToken,\s*\n?\s*authMethod/)
  })
})
