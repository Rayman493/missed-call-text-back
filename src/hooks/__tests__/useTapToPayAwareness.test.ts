import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { useTapToPayAwareness } from '../useTapToPayAwareness'
import { Business } from '@/lib/types'

// Mock ReplyflowStripeTerminal plugin
const mockReplyflowStripeTerminal = {
  getTapToPaySupportStatus: vi.fn(),
}

// Mock the terminal module
vi.mock('@/lib/terminal', () => ({
  default: mockReplyflowStripeTerminal,
}))

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn(),
  },
}))

// Mock fetch
global.fetch = vi.fn()

// Helper to create minimal Business object
function createMockBusiness(overrides: Partial<Business> = {}): Business {
  return {
    id: 'test-business-id',
    name: 'Test Business',
    twilio_phone_number: '+14125551234',
    auto_reply_message: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('useTapToPayAwareness', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockReset()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('native capability checks with PaymentCardReader.isSupported API', () => {
    it('should show awareness when PaymentCardReader.isSupported returns true', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
        deviceInfo: {
          deviceModel: 'iPhone',
          deviceIdentifier: 'iPhone15,4',
          systemVersion: '17.0',
          checkMethod: 'PaymentCardReader.isSupported',
          isiOSAppOnMac: false,
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(true)
      expect(hook.state.tapToPaySupportStatus?.status).toBe('supported')
      expect(hook.state.tapToPaySupportStatus?.deviceInfo?.checkMethod).toBe('PaymentCardReader.isSupported')
    })

    it('should not show awareness when PaymentCardReader.isSupported returns false', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'unsupported_device',
        supported: false,
        platform: 'ios',
        unsupportedReason: 'unsupported_device_type',
        deviceInfo: {
          deviceModel: 'iPhone',
          deviceIdentifier: 'iPhone10,3',
          systemVersion: '17.0',
          checkMethod: 'PaymentCardReader.isSupported',
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus?.status).toBe('unsupported_device')
      expect(hook.state.tapToPaySupportStatus?.deviceInfo?.checkMethod).toBe('PaymentCardReader.isSupported')
    })

    it('should show awareness when SCPTerminal.supportsReaders returns true (iOS 15.x fallback)', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
        deviceInfo: {
          deviceModel: 'iPhone',
          systemVersion: '15.5',
          checkMethod: 'SCPTerminal.supportsReaders',
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(true)
      expect(hook.state.tapToPaySupportStatus?.status).toBe('supported')
      expect(hook.state.tapToPaySupportStatus?.deviceInfo?.checkMethod).toBe('SCPTerminal.supportsReaders')
    })

    it('should not show awareness when SCPTerminal.supportsReaders returns false (iOS 15.x fallback)', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'unsupported_device',
        supported: false,
        platform: 'ios',
        unsupportedReason: 'unsupported_device_type',
        deviceInfo: {
          deviceModel: 'iPhone',
          systemVersion: '15.5',
          checkMethod: 'SCPTerminal.supportsReaders',
          error: 'Unsupported mobile device configuration',
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus?.status).toBe('unsupported_device')
      expect(hook.state.tapToPaySupportStatus?.deviceInfo?.checkMethod).toBe('SCPTerminal.supportsReaders')
    })

    it('should not show awareness for iPad', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'unsupported_device',
        supported: false,
        platform: 'ios',
        unsupportedReason: 'unsupported_device_type',
        deviceInfo: {
          deviceModel: 'iPad',
          deviceType: 'ipad',
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus?.unsupportedReason).toBe('unsupported_device_type')
    })

    it('should not show awareness for simulator', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'unsupported_device',
        supported: false,
        platform: 'ios',
        unsupportedReason: 'simulator_not_supported',
        deviceInfo: {
          isSimulator: true,
          deviceModel: 'iPhone',
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus?.unsupportedReason).toBe('simulator_not_supported')
    })

    it('should not show awareness for unsupported iOS version', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'unsupported_ios_version',
        supported: false,
        platform: 'ios',
        unsupportedReason: 'ios_version_too_old',
        deviceInfo: {
          systemVersion: '15.0',
          requiredVersion: '15.4',
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus?.status).toBe('unsupported_ios_version')
    })

    it('should support future iPhone models automatically without app update', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      // Simulate a future iPhone model that Apple's API reports as supported
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
        deviceInfo: {
          deviceModel: 'iPhone',
          deviceIdentifier: 'iPhone18,1',
          systemVersion: '18.0',
          checkMethod: 'PaymentCardReader.isSupported',
          isiOSAppOnMac: false,
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(true)
      expect(hook.state.tapToPaySupportStatus?.status).toBe('supported')
      // Future models should be supported automatically via Apple's API
      expect(hook.state.tapToPaySupportStatus?.deviceInfo?.deviceIdentifier).toBe('iPhone18,1')
    })

    it('should not show awareness when native capability unavailable', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'unavailable',
        supported: false,
        platform: 'ios',
        unsupportedReason: 'sdk_missing',
      })

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus?.status).toBe('unavailable')
    })

    it('should handle capability check failure gracefully', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockRejectedValue(new Error('Capability check failed'))

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus?.status).toBe('unknown')
    })

    it('should not show awareness for iOS on Mac', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'unsupported_device',
        supported: false,
        platform: 'ios',
        unsupportedReason: 'ios_on_mac_not_supported',
        deviceInfo: {
          isiOSAppOnMac: true,
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus?.unsupportedReason).toBe('ios_on_mac_not_supported')
    })
  })

  describe('checkCapability method for Settings retry', () => {
    it('should retry capability check and update state on success', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      
      // First call returns unknown
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValueOnce({
        status: 'unknown',
        supported: false,
        platform: 'ios',
        unsupportedReason: 'capability_check_failed',
      })

      const hook = useTapToPayAwareness(mockBusiness)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.tapToPaySupportStatus?.status).toBe('unknown')

      // Retry returns supported
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValueOnce({
        status: 'supported',
        supported: true,
        platform: 'ios',
        deviceInfo: {
          deviceModel: 'iPhone',
          checkMethod: 'PaymentCardReader.isSupported',
        },
      })

      await hook.checkCapability()

      expect(hook.state.tapToPaySupportStatus?.status).toBe('supported')
      expect(hook.state.isLoading).toBe(false)
    })

    it('should retry capability check and update state on failure', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockRejectedValueOnce(new Error('First failure'))
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockRejectedValueOnce(new Error('Retry failure'))

      const hook = useTapToPayAwareness(mockBusiness)
      await new Promise(resolve => setTimeout(resolve, 0))

      await hook.checkCapability()

      expect(hook.state.tapToPaySupportStatus?.status).toBe('unknown')
      expect(hook.state.isLoading).toBe(false)
    })

    it('should set loading state during capability retry', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({
          status: 'supported',
          supported: true,
          platform: 'ios',
        }), 100))
      )

      const hook = useTapToPayAwareness(mockBusiness)
      await new Promise(resolve => setTimeout(resolve, 0))

      const checkPromise = hook.checkCapability()
      expect(hook.state.isLoading).toBe(true)
      
      await checkPromise
      expect(hook.state.isLoading).toBe(false)
    })
  })

  describe('Settings status scenarios', () => {
    it('should return supported status for compatible iPhone with Stripe connected', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
        deviceInfo: {
          checkMethod: 'PaymentCardReader.isSupported',
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.tapToPaySupportStatus?.status).toBe('supported')
      expect(hook.state.tapToPaySupportStatus?.supported).toBe(true)
    })

    it('should return unsupported_device for incompatible hardware', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'unsupported_device',
        supported: false,
        platform: 'ios',
        unsupportedReason: 'unsupported_device_type',
        deviceInfo: {
          deviceType: 'ipad',
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.tapToPaySupportStatus?.status).toBe('unsupported_device')
      expect(hook.state.tapToPaySupportStatus?.unsupportedReason).toBe('unsupported_device_type')
    })

    it('should return unsupported_ios_version for old iOS', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'unsupported_ios_version',
        supported: false,
        platform: 'ios',
        unsupportedReason: 'ios_version_too_old',
        deviceInfo: {
          systemVersion: '15.0',
          requiredVersion: '15.4',
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.tapToPaySupportStatus?.status).toBe('unsupported_ios_version')
    })

    it('should return unavailable for web platform', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('web')

      const hook = useTapToPayAwareness(mockBusiness)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.tapToPaySupportStatus).toBeNull()
    })

    it('should return unavailable for Android platform', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android')

      const hook = useTapToPayAwareness(mockBusiness)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.tapToPaySupportStatus).toBeNull()
    })

    it('should handle Stripe disconnected on supported iPhone', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'not_connected',
        stripe_charges_enabled: false,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')

      const hook = useTapToPayAwareness(mockBusiness)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus).toBeNull()
    })

    it('should handle Stripe connected on supported iPhone', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
        deviceInfo: {
          checkMethod: 'PaymentCardReader.isSupported',
        },
      })

      const hook = useTapToPayAwareness(mockBusiness)
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(true)
      expect(hook.state.tapToPaySupportStatus?.status).toBe('supported')
    })
  })

  describe('eligibility checks', () => {
    it('should not show awareness for web platform', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)

      const hook = useTapToPayAwareness(mockBusiness)
      
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus).toBeNull()
    })

    it('should not show awareness for Android platform', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('android')

      const hook = useTapToPayAwareness(mockBusiness)
      
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus).toBeNull()
    })

    it('should not show awareness for ineligible Stripe state', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'not_connected',
        stripe_charges_enabled: false,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')

      const hook = useTapToPayAwareness(mockBusiness)
      
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus).toBeNull()
    })

    it('should not show awareness when charges are not enabled', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: false,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')

      const hook = useTapToPayAwareness(mockBusiness)
      
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.state.tapToPaySupportStatus).toBeNull()
    })

    it('should not show awareness when already acknowledged', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: '2024-01-01T00:00:00Z',
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')

      const hook = useTapToPayAwareness(mockBusiness)
      
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
      expect(hook.isAcknowledged).toBe(true)
    })

    it('should not show awareness when business is null', async () => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')

      const hook = useTapToPayAwareness(null)
      
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(hook.state.isEligible).toBe(false)
    })
  })

  describe('acknowledgment', () => {
    it('should persist acknowledgment on "Not Now"', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
      })

      vi.mocked(fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          business: {
            ...mockBusiness,
            tap_to_pay_awareness_acknowledged_at: '2024-01-01T00:00:00Z',
          },
          message: 'Tap to Pay awareness acknowledged successfully',
        }),
      } as Response)

      const hook = useTapToPayAwareness(mockBusiness)
      
      await new Promise(resolve => setTimeout(resolve, 0))

      await hook.acknowledgeAwareness()

      expect(hook.isAcknowledged).toBe(true)
      expect(hook.state.isEligible).toBe(false)
      expect(fetch).toHaveBeenCalledWith('/api/business/tap-to-pay-awareness', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
    })

    it('should handle persistence failure gracefully', async () => {
      const mockBusiness = createMockBusiness({
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
        tap_to_pay_awareness_acknowledged_at: null,
      })

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Capacitor.getPlatform).mockReturnValue('ios')
      mockReplyflowStripeTerminal.getTapToPaySupportStatus.mockResolvedValue({
        status: 'supported',
        supported: true,
        platform: 'ios',
      })

      vi.mocked(fetch).mockRejectedValue(new Error('Network error'))

      const hook = useTapToPayAwareness(mockBusiness)
      
      await new Promise(resolve => setTimeout(resolve, 0))

      await expect(hook.acknowledgeAwareness()).rejects.toThrow('Network error')
    })
  })
})
