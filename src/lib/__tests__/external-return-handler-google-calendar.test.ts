/**
 * External Return Handler - Google Calendar Tests
 *
 * Verifies that Google Calendar OAuth return is properly handled
 * for iOS universal link return-to-app behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock Capacitor Preferences before importing the module
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}))

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
  },
}))

// Mock window.location
const mockLocation = {
  href: '',
  origin: 'https://www.replyflowhq.com',
}

Object.defineProperty(global, 'window', {
  value: {
    location: mockLocation,
    sessionStorage: {
      setItem: vi.fn(),
      getItem: vi.fn(),
      removeItem: vi.fn(),
    },
    dispatchEvent: vi.fn(),
  },
  writable: true,
})

import { handleExternalReturn, setPendingGoogleOperation } from '@/lib/external-return-handler'
import { Preferences } from '@capacitor/preferences'

describe('External Return Handler - Google Calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(Preferences.get).mockResolvedValue({ value: null })
    vi.mocked(Preferences.set).mockResolvedValue(undefined)
    vi.mocked(Preferences.remove).mockResolvedValue(undefined)
    mockLocation.href = ''
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Google Calendar return recognition', () => {
    it('should recognize Google Calendar connected return on /dashboard/calendar', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/calendar?calendar=connected'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(true)
    })

    it('should recognize Google Calendar cancelled return on /dashboard/calendar', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/calendar?calendar=cancelled'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(true)
    })

    it('should recognize Google Calendar error return on /dashboard/calendar', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/calendar?calendar=error'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(true)
    })

    it('should recognize Google Calendar connected return on /dashboard/settings', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/settings?calendar=connected'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(true)
    })

    it('should recognize Google Calendar cancelled return on /dashboard/settings', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/settings?calendar=cancelled'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(true)
    })

    it('should recognize Google Calendar error return on /dashboard/settings', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/settings?calendar=error'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(true)
    })

    it('should NOT recognize Google Calendar return without calendar parameter', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/calendar'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(false)
    })

    it('should NOT recognize Google Calendar return with unknown calendar status', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/calendar?calendar=unknown'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(false)
    })

    it('should NOT recognize non-Google Calendar dashboard URLs', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/settings'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(false)
    })
  })

  describe('Google Calendar navigation', () => {
    it('should navigate to /dashboard/calendar after Google Calendar return', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/calendar?calendar=connected'
      await handleExternalReturn(url)

      expect(mockLocation.href).toBe('/dashboard/calendar')
    })

    it('should navigate to /dashboard/calendar even when return was from settings', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/settings?calendar=connected'
      await handleExternalReturn(url)

      expect(mockLocation.href).toBe('/dashboard/calendar')
    })
  })

  describe('Non-Google Calendar URLs', () => {
    it('should NOT recognize non-Google Calendar dashboard URLs', async () => {
      const url = 'https://www.replyflowhq.com/dashboard/settings'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(false)
    })
  })

  describe('Foreign hostnames', () => {
    it('should NOT handle Google Calendar return from foreign hostname', async () => {
      const url = 'https://example.com/dashboard/calendar?calendar=connected'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(false)
      expect(mockLocation.href).toBe('')
    })

    it('should recognize Google Calendar return from non-www hostname', async () => {
      const url = 'https://replyflowhq.com/dashboard/calendar?calendar=connected'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(true)
    })
  })

  describe('HTTPS protocol requirement', () => {
    it('should NOT handle non-HTTPS URLs', async () => {
      const url = 'http://www.replyflowhq.com/dashboard/calendar?calendar=connected'
      const handled = await handleExternalReturn(url)

      expect(handled).toBe(false)
    })
  })
})