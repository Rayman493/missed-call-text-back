import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mapTapToPayError } from './error-mapper'

describe('Terminal error mapper - address configuration errors', () => {
  it('terminal_location_address_required should return configure action', () => {
    const error = mapTapToPayError({
      stage: 'connecting_reader',
      code: 'terminal_location_address_required',
      message: 'A valid business address is required before Tap to Pay can be enabled.',
    })

    expect(error.title).toBe('Business Address Required')
    expect(error.message).toBe('Add your business address before using Tap to Pay.')
    expect(error.action).toBe('configure')
    expect(error.technicalCode).toBe('terminal_location_address_required')
  })

  it('terminal_location_address_invalid should return configure action', () => {
    const error = mapTapToPayError({
      stage: 'connecting_reader',
      code: 'terminal_location_address_invalid',
      message: 'Add a valid business address before using Tap to Pay.',
    })

    expect(error.title).toBe('Business Address Required')
    expect(error.message).toBe('Add your business address before using Tap to Pay.')
    expect(error.action).toBe('configure')
    expect(error.technicalCode).toBe('terminal_location_address_invalid')
  })

  it('message containing business address required should return configure action', () => {
    const error = mapTapToPayError({
      stage: 'connecting_reader',
      code: 'unknown_error',
      message: 'a valid business address is required before Tap to Pay can be enabled',
    })

    expect(error.title).toBe('Business Address Required')
    expect(error.message).toBe('Add your business address before using Tap to Pay.')
    expect(error.action).toBe('configure')
  })

  it('message containing add a valid business address should return configure action', () => {
    const error = mapTapToPayError({
      stage: 'connecting_reader',
      code: 'unknown_error',
      message: 'add a valid business address before using Tap to Pay',
    })

    expect(error.title).toBe('Business Address Required')
    expect(error.message).toBe('Add your business address before using Tap to Pay.')
    expect(error.action).toBe('configure')
  })

  it('other errors should continue to return retry action', () => {
    const error = mapTapToPayError({
      stage: 'connecting_reader',
      code: 'reader_connection_failed',
      message: 'Failed to connect to reader',
    })

    expect(error.action).toBe('retry')
    expect(error.title).not.toBe('Business Address Required')
  })
})

describe('Terminal error mapper - debug build vs Developer Options distinction', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  describe('debug_build_not_supported (debuggable APK)', () => {
    it('in development build, should show Release Build Required message', () => {
      process.env.NODE_ENV = 'development'

      const error = mapTapToPayError({
        code: 'debug_build_not_supported',
        message: 'Debuggable applications are not supported when using the production version of the Tap to Pay reader.',
        nativeCode: 'INTEGRATION_ERROR.TAP_TO_PAY_DEBUG_NOT_SUPPORTED',
      })

      expect(error.title).toBe('Release Build Required')
      expect(error.message).toBe('Real Tap to Pay requires a non-debuggable release build. Install a release build to use Tap to Pay.')
      expect(error.action).toBe('none')
      expect(error.technicalCode).toBe('debug_build_not_supported')
      expect(error.technicalMessage).toContain('Debuggable applications are not supported')
    })

    it('in production build, should show clean unavailable message without developer instructions', () => {
      process.env.NODE_ENV = 'production'

      const error = mapTapToPayError({
        code: 'debug_build_not_supported',
        message: 'Debuggable applications are not supported when using the production version of the Tap to Pay reader.',
        nativeCode: 'INTEGRATION_ERROR.TAP_TO_PAY_DEBUG_NOT_SUPPORTED',
      })

      expect(error.title).toBe('Tap to Pay Unavailable')
      expect(error.message).toBe('Tap to Pay is not available on this device. Please contact ReplyFlow support for assistance.')
      expect(error.action).toBe('none')
      expect(error.technicalCode).toBe('debug_build_not_supported')
      expect(error.technicalMessage).toContain('Debuggable applications are not supported')
      // Production message should NOT contain developer instructions
      expect(error.message).not.toContain('build')
      expect(error.message).not.toContain('install')
    })

    it('should match exact native code INTEGRATION_ERROR.TAP_TO_PAY_DEBUG_NOT_SUPPORTED', () => {
      process.env.NODE_ENV = 'development'

      const error = mapTapToPayError({
        code: 'INTEGRATION_ERROR.TAP_TO_PAY_DEBUG_NOT_SUPPORTED',
        message: 'Debuggable applications are not supported',
      })

      expect(error.title).toBe('Release Build Required')
      expect(error.action).toBe('none')
    })

    it('should be non-retryable (action: none)', () => {
      process.env.NODE_ENV = 'development'

      const error = mapTapToPayError({
        code: 'debug_build_not_supported',
        message: 'Debuggable applications are not supported',
      })

      expect(error.action).toBe('none')
    })
  })

  describe('Developer Options enabled (separate condition)', () => {
    it('device_not_secure should show Device Settings Required with Developer Options guidance', () => {
      const error = mapTapToPayError({
        code: 'device_not_secure',
        message: 'Device is not secure due to Developer Options',
      })

      expect(error.title).toBe('Device Settings Required')
      expect(error.message).toBe('Developer Options must be turned off to use Tap to Pay on this device. Turn off Developer Options in Android Settings, then try again.')
      expect(error.action).toBe('open_app_settings')
      expect(error.technicalCode).toBe('device_not_secure')
    })

    it('tap_to_pay_insecure_environment should show Device Settings Required', () => {
      const error = mapTapToPayError({
        code: 'tap_to_pay_insecure_environment',
        message: 'Insecure environment detected',
      })

      expect(error.title).toBe('Device Settings Required')
      expect(error.message).toContain('Developer Options')
      expect(error.action).toBe('open_app_settings')
    })

    it('tap_to_pay_device_tampered should show Device Settings Required', () => {
      const error = mapTapToPayError({
        code: 'tap_to_pay_device_tampered',
        message: 'Device tampered',
      })

      expect(error.title).toBe('Device Settings Required')
      expect(error.message).toContain('Developer Options')
      expect(error.action).toBe('open_app_settings')
    })

    it('message mentioning developer options should show Device Settings Required', () => {
      const error = mapTapToPayError({
        code: 'some_other_code',
        message: 'Developer Options must be disabled',
      })

      expect(error.title).toBe('Device Settings Required')
      expect(error.message).toContain('Developer Options')
      expect(error.action).toBe('open_app_settings')
    })

    it('should be retryable via settings (action: open_app_settings)', () => {
      const error = mapTapToPayError({
        code: 'device_not_secure',
        message: 'Device not secure',
      })

      expect(error.action).toBe('open_app_settings')
    })
  })

  describe('debug_build_not_supported should NOT match Developer Options errors', () => {
    it('debug_build_not_supported should NOT show Device Settings Required', () => {
      process.env.NODE_ENV = 'development'

      const error = mapTapToPayError({
        code: 'debug_build_not_supported',
        message: 'Debuggable applications are not supported',
      })

      expect(error.title).not.toBe('Device Settings Required')
      expect(error.message).not.toContain('Developer Options')
      expect(error.action).not.toBe('open_app_settings')
    })

    it('device_not_secure should NOT show Release Build Required', () => {
      const error = mapTapToPayError({
        code: 'device_not_secure',
        message: 'Device not secure',
      })

      expect(error.title).not.toBe('Release Build Required')
      expect(error.message).not.toContain('release build')
      expect(error.action).not.toBe('none')
    })
  })

  describe('iOS mappings unchanged', () => {
    it('ios_version_unsupported should still show iOS Update Required', () => {
      const error = mapTapToPayError({
        code: 'ios_version_unsupported',
        message: 'iOS version is too old',
      })

      expect(error.title).toBe('iOS Update Required')
      expect(error.message).toBe('Update your iPhone to use Tap to Pay on iPhone.')
      expect(error.action).toBe('back')
    })

    it('debug_build_not_supported on iOS should still be handled (though rare)', () => {
      process.env.NODE_ENV = 'development'

      const error = mapTapToPayError({
        code: 'debug_build_not_supported',
        message: 'Debuggable applications are not supported',
      })

      // Should use the debug build mapping, not iOS-specific mapping
      expect(error.title).toBe('Release Build Required')
      expect(error.action).toBe('none')
    })
  })
})