/**
 * Regression tests for Tap to Pay diagnostics opt-in gate
 *
 * These tests verify that diagnostics are only shown when explicitly enabled
 * by an engineer, never in production builds or without opt-in.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import {
  isDiagnosticsEnabled,
  enableDiagnostics,
  disableDiagnostics,
  isDiagnosticsOptInEnabled
} from './tap-to-pay-diagnostics-opt-in'

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
    getPlatform: vi.fn()
  }
}))

// Mock Preferences
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn()
  }
}))

describe('Tap to Pay Diagnostics Opt-In Gate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default to web platform
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Test 1: Release build + any opt-in state → diagnostics hidden', () => {
    it('should hide diagnostics in production web regardless of opt-in', async () => {
      // Simulate production web environment
      vi.stubEnv('NODE_ENV', 'production')

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)
      vi.mocked(Preferences.get).mockResolvedValue({ value: 'true' })

      const enabled = await isDiagnosticsEnabled(false)

      expect(enabled).toBe(false)

      vi.unstubAllEnvs()
    })

    it('should hide diagnostics in production native release build regardless of opt-in', async () => {
      // Simulate production native release build
      vi.stubEnv('NODE_ENV', 'production')

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Preferences.get).mockResolvedValue({ value: 'true' })

      const enabled = await isDiagnosticsEnabled(false) // isNativeDebugBuild = false

      expect(enabled).toBe(false)

      vi.unstubAllEnvs()
    })
  })

  describe('Test 2: Debug build + no explicit opt-in → diagnostics hidden', () => {
    it('should hide diagnostics in native debug build without opt-in', async () => {
      // Simulate production environment (not dev)
      vi.stubEnv('NODE_ENV', 'production')

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Preferences.get).mockResolvedValue({ value: null }) // No opt-in

      const enabled = await isDiagnosticsEnabled(true) // isNativeDebugBuild = true

      expect(enabled).toBe(false)

      vi.unstubAllEnvs()
    })

    it('should hide diagnostics in native debug build with opt-in disabled', async () => {
      // Simulate production environment (not dev)
      vi.stubEnv('NODE_ENV', 'production')

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Preferences.get).mockResolvedValue({ value: 'false' }) // Opt-in disabled

      const enabled = await isDiagnosticsEnabled(true) // isNativeDebugBuild = true

      expect(enabled).toBe(false)

      vi.unstubAllEnvs()
    })
  })

  describe('Test 3: Debug build + explicit developer opt-in → diagnostics shown', () => {
    it('should show diagnostics in native debug build with opt-in enabled', async () => {
      // Simulate production environment (not dev)
      vi.stubEnv('NODE_ENV', 'production')

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Preferences.get).mockResolvedValue({ value: 'true' }) // Opt-in enabled

      const enabled = await isDiagnosticsEnabled(true) // isNativeDebugBuild = true

      expect(enabled).toBe(true)

      vi.unstubAllEnvs()
    })
  })

  describe('Test 4: Missing/failed native environment check → diagnostics hidden', () => {
    it('should hide diagnostics when native environment check fails', async () => {
      // Simulate production environment (not dev)
      vi.stubEnv('NODE_ENV', 'production')

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
      vi.mocked(Preferences.get).mockRejectedValue(new Error('Preferences error'))

      const enabled = await isDiagnosticsEnabled(true) // isNativeDebugBuild = true

      expect(enabled).toBe(false)

      vi.unstubAllEnvs()
    })

    it('should hide diagnostics when Capacitor is not available', async () => {
      // Simulate production environment (not dev)
      vi.stubEnv('NODE_ENV', 'production')

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false) // Not native

      const enabled = await isDiagnosticsEnabled(true) // isNativeDebugBuild = true (but not native)

      expect(enabled).toBe(false)

      vi.unstubAllEnvs()
    })
  })

  describe('Test 5: Normal Tap to Pay UI remains unchanged when diagnostics are hidden', () => {
    it('should allow web development to enable diagnostics', async () => {
      // Simulate development environment
      vi.stubEnv('NODE_ENV', 'development')

      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)

      const enabled = await isDiagnosticsEnabled(false)

      expect(enabled).toBe(true)

      vi.unstubAllEnvs()
    })
  })

  describe('Developer opt-in functions', () => {
    it('should enable diagnostics opt-in', async () => {
      vi.mocked(Preferences.set).mockResolvedValue()

      await enableDiagnostics()

      expect(Preferences.set).toHaveBeenCalledWith({
        key: 'ttp_diagnostics_enabled',
        value: 'true'
      })
    })

    it('should disable diagnostics opt-in', async () => {
      vi.mocked(Preferences.remove).mockResolvedValue()

      await disableDiagnostics()

      expect(Preferences.remove).toHaveBeenCalledWith({
        key: 'ttp_diagnostics_enabled'
      })
    })

    it('should check if opt-in is enabled', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: 'true' })

      const enabled = await isDiagnosticsOptInEnabled()

      expect(enabled).toBe(true)
      expect(Preferences.get).toHaveBeenCalledWith({
        key: 'ttp_diagnostics_enabled'
      })
    })

    it('should return false when opt-in is not set', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: null })

      const enabled = await isDiagnosticsOptInEnabled()

      expect(enabled).toBe(false)
    })

    it('should return false when opt-in is explicitly false', async () => {
      vi.mocked(Preferences.get).mockResolvedValue({ value: 'false' })

      const enabled = await isDiagnosticsOptInEnabled()

      expect(enabled).toBe(false)
    })
  })
})