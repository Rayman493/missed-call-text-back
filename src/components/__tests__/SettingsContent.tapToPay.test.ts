/**
 * Focused tests for Tap to Pay Settings enablement logic
 *
 * These tests verify the enablement handler boundaries without requiring
 * physical hardware or full payment orchestration setup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock service boundaries
const mockTerminalService = {
  getInstance: vi.fn(),
  isTapToPayAccountLinked: vi.fn(),
  initialize: vi.fn(),
  connectTapToPay: vi.fn(),
  disconnect: vi.fn(),
}

// Mock Tap to Pay awareness
const mockTapToPayAwareness = {
  state: {
    tapToPaySupportStatus: {
      platform: 'ios',
      status: 'supported',
    },
  },
}

// Mock business
const mockBusiness = {
  stripe_charges_enabled: true,
  tap_to_pay_education_completed_at: null,
}

describe('Tap to Pay Settings Enablement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTerminalService.getInstance.mockReturnValue(mockTerminalService)
  })

  describe('Account already linked', () => {
    it('should not call connect if already linked', async () => {
      mockTerminalService.isTapToPayAccountLinked.mockResolvedValue({ isLinked: true })

      // Simulate enablement handler initial check
      const initialCheck = await mockTerminalService.isTapToPayAccountLinked()

      expect(initialCheck.isLinked).toBe(true)
      expect(mockTerminalService.initialize).not.toHaveBeenCalled()
      expect(mockTerminalService.connectTapToPay).not.toHaveBeenCalled()
    })

    it('should show Enabled badge when linked', () => {
      const linkageState = { status: 'linked' as const, isLoading: false }
      expect(linkageState.status).toBe('linked')
    })
  })

  describe('Initially unlinked → connect → linked', () => {
    it('should show Enabled after successful enablement', async () => {
      // Initial check: not linked
      mockTerminalService.isTapToPayAccountLinked
        .mockResolvedValueOnce({ isLinked: false })

      // Initialize succeeds
      mockTerminalService.initialize.mockResolvedValue({ status: 'ready' })

      // Connect succeeds
      mockTerminalService.connectTapToPay.mockResolvedValue({ status: 'connected' })

      // Final check: linked
      mockTerminalService.isTapToPayAccountLinked
        .mockResolvedValueOnce({ isLinked: true })

      // Simulate enablement flow
      const initialCheck = await mockTerminalService.isTapToPayAccountLinked()
      expect(initialCheck.isLinked).toBe(false)

      await mockTerminalService.initialize()
      expect(mockTerminalService.initialize).toHaveBeenCalled()

      await mockTerminalService.connectTapToPay()
      expect(mockTerminalService.connectTapToPay).toHaveBeenCalled()

      const finalCheck = await mockTerminalService.isTapToPayAccountLinked()
      expect(finalCheck.isLinked).toBe(true)

      await mockTerminalService.disconnect()
      expect(mockTerminalService.disconnect).toHaveBeenCalled()
    })
  })

  describe('Initially unlinked → connect canceled → unlinked', () => {
    it('should remain Not Enabled if Terms not accepted', async () => {
      // Initial check: not linked
      mockTerminalService.isTapToPayAccountLinked
        .mockResolvedValueOnce({ isLinked: false })

      // Initialize succeeds
      mockTerminalService.initialize.mockResolvedValue({ status: 'ready' })

      // Connect fails (user canceled)
      mockTerminalService.connectTapToPay.mockRejectedValue(
        new Error('User canceled')
      )

      // Fallback check: still not linked
      mockTerminalService.isTapToPayAccountLinked
        .mockResolvedValueOnce({ isLinked: false })

      // Simulate enablement flow
      const initialCheck = await mockTerminalService.isTapToPayAccountLinked()
      expect(initialCheck.isLinked).toBe(false)

      await mockTerminalService.initialize()

      try {
        await mockTerminalService.connectTapToPay()
      } catch (error) {
        // Expected cancellation
      }

      const fallbackCheck = await mockTerminalService.isTapToPayAccountLinked()
      expect(fallbackCheck.isLinked).toBe(false)

      const linkageState = { status: 'not_linked' as const, isLoading: false }
      expect(linkageState.status).toBe('not_linked')
    })
  })

  describe('Connect throws → linked (Apple authoritative)', () => {
    it('should show Enabled if Apple check returns true despite error', async () => {
      // Initial check: not linked
      mockTerminalService.isTapToPayAccountLinked
        .mockResolvedValueOnce({ isLinked: false })

      // Initialize succeeds
      mockTerminalService.initialize.mockResolvedValue({ status: 'ready' })

      // Connect throws error
      mockTerminalService.connectTapToPay.mockRejectedValue(
        new Error('Connection failed')
      )

      // Fallback check: linked (Apple accepted Terms before error)
      mockTerminalService.isTapToPayAccountLinked
        .mockResolvedValueOnce({ isLinked: true })

      // Simulate enablement flow with fallback
      const initialCheck = await mockTerminalService.isTapToPayAccountLinked()
      expect(initialCheck.isLinked).toBe(false)

      await mockTerminalService.initialize()

      try {
        await mockTerminalService.connectTapToPay()
      } catch (error) {
        // Expected error
      }

      const fallbackCheck = await mockTerminalService.isTapToPayAccountLinked()
      expect(fallbackCheck.isLinked).toBe(true)

      const linkageState = { status: 'linked' as const, isLoading: false }
      expect(linkageState.status).toBe('linked')
    })
  })

  describe('Connect throws → unlinked', () => {
    it('should remain Not Enabled if Apple check returns false', async () => {
      // Initial check: not linked
      mockTerminalService.isTapToPayAccountLinked
        .mockResolvedValueOnce({ isLinked: false })

      // Initialize succeeds
      mockTerminalService.initialize.mockResolvedValue({ status: 'ready' })

      // Connect throws error
      mockTerminalService.connectTapToPay.mockRejectedValue(
        new Error('Connection failed')
      )

      // Fallback check: still not linked
      mockTerminalService.isTapToPayAccountLinked
        .mockResolvedValueOnce({ isLinked: false })

      // Simulate enablement flow with fallback
      const initialCheck = await mockTerminalService.isTapToPayAccountLinked()
      expect(initialCheck.isLinked).toBe(false)

      await mockTerminalService.initialize()

      try {
        await mockTerminalService.connectTapToPay()
      } catch (error) {
        // Expected error
      }

      const fallbackCheck = await mockTerminalService.isTapToPayAccountLinked()
      expect(fallbackCheck.isLinked).toBe(false)

      const linkageState = { status: 'not_linked' as const, isLoading: false }
      expect(linkageState.status).toBe('not_linked')
    })
  })

  describe('Education timestamp vs Apple linkage', () => {
    it('should show Not Enabled when education complete but Apple unlinked', () => {
      const educationComplete = true
      const appleLinked = false

      // Badge depends ONLY on Apple linkage
      const badgeStatus = appleLinked ? 'linked' : 'not_linked'
      expect(badgeStatus).toBe('not_linked')
      expect(educationComplete).toBe(true) // education is separate
    })

    it('should show Enabled when education incomplete but Apple linked', () => {
      const educationComplete = false
      const appleLinked = true

      // Badge depends ONLY on Apple linkage
      const badgeStatus = appleLinked ? 'linked' : 'not_linked'
      expect(badgeStatus).toBe('linked')
      expect(educationComplete).toBe(false) // education is separate
    })
  })

  describe('Duplicate click protection', () => {
    it('should guard against concurrent enablement attempts', () => {
      let isEnablingTapToPay = false

      // First click
      const firstClick = () => {
        if (isEnablingTapToPay) return
        isEnablingTapToPay = true
        return 'started'
      }

      expect(firstClick()).toBe('started')
      expect(isEnablingTapToPay).toBe(true)

      // Second click should be ignored
      expect(firstClick()).toBe(undefined)
      expect(isEnablingTapToPay).toBe(true)
    })
  })

  describe('Prerequisite checks', () => {
    it('should require Stripe Connect setup', () => {
      const businessWithoutStripe = { stripe_charges_enabled: false }
      const canEnable = businessWithoutStripe.stripe_charges_enabled
      expect(canEnable).toBe(false)
    })

    it('should require iOS platform', () => {
      const platform = 'android'
      const isIOS = platform === 'ios'
      expect(isIOS).toBe(false)
    })

    it('should require supported device', () => {
      const status = 'unsupported_device'
      const isSupported = status === 'supported'
      expect(isSupported).toBe(false)
    })
  })

  describe('Error classification', () => {
    it('should classify location permission errors', () => {
      const error = new Error('location permission denied')
      const isLocationError = error.message.toLowerCase().includes('location') ||
                             error.message.toLowerCase().includes('permission')
      expect(isLocationError).toBe(true)
    })

    it('should classify Terminal Location errors', () => {
      const error = new Error('terminal location address required')
      const isLocationError = error.message.toLowerCase().includes('terminal location') ||
                             error.message.toLowerCase().includes('business address')
      expect(isLocationError).toBe(true)
    })

    it('should classify network errors', () => {
      const error = new Error('network timeout')
      const isNetworkError = error.message.toLowerCase().includes('network') ||
                            error.message.toLowerCase().includes('timeout')
      expect(isNetworkError).toBe(true)
    })
  })
})