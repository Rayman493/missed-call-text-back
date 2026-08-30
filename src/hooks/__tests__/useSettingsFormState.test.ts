import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useSettingsFormState } from '../useSettingsFormState'

// Mock the out-of-office functions
vi.mock('@/lib/out-of-office', () => ({
  getDefaultAfterHoursTemplate: () => 'Default after hours message',
  getDefaultOutOfOfficeTemplate: () => 'Default OOO message',
  DEFAULT_BUSINESS_HOURS_TIMEZONE: 'America/New_York',
  DEFAULT_BUSINESS_HOURS_START: '09:00',
  DEFAULT_BUSINESS_HOURS_END: '18:00',
  getBusinessHoursFieldWithDefault: (value: any, defaultValue: any) => value || defaultValue
}))

describe('useSettingsFormState - Business Hours defaults', () => {
  const mockSaveBusiness = vi.fn().mockResolvedValue({ id: '1', name: 'Test Business' })
  const mockBusinessUpdated = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('when Business Hours is enabled with empty values', () => {
    it('should apply defaults to empty Business Hours fields', () => {
      const initialBusiness = {
        id: '1',
        name: 'Test Business',
        business_hours_enabled: true,
        business_hours_timezone: null,
        business_hours_start: null,
        business_hours_end: null,
        after_hours_message: null
      } as any

      const { result } = renderHook(() =>
        useSettingsFormState({
          initialBusiness,
          onSaveBusiness: mockSaveBusiness,
          onBusinessUpdated: mockBusinessUpdated
        })
      )

      expect(result.current.business?.business_hours_timezone).toBe('America/New_York')
      expect(result.current.business?.business_hours_start).toBe('09:00')
      expect(result.current.business?.business_hours_end).toBe('18:00')
      expect(result.current.business?.after_hours_message).toBe('Default after hours message')
    })
  })

  describe('when Business Hours is enabled with existing values', () => {
    it('should preserve existing Business Hours values', () => {
      const initialBusiness = {
        id: '1',
        name: 'Test Business',
        business_hours_enabled: true,
        business_hours_timezone: 'America/Chicago',
        business_hours_start: '08:30',
        business_hours_end: '16:30',
        after_hours_message: 'Custom message'
      } as any

      const { result } = renderHook(() =>
        useSettingsFormState({
          initialBusiness,
          onSaveBusiness: mockSaveBusiness,
          onBusinessUpdated: mockBusinessUpdated
        })
      )

      expect(result.current.business?.business_hours_timezone).toBe('America/Chicago')
      expect(result.current.business?.business_hours_start).toBe('08:30')
      expect(result.current.business?.business_hours_end).toBe('16:30')
      expect(result.current.business?.after_hours_message).toBe('Custom message')
    })
  })

  describe('when Business Hours is disabled', () => {
    it('should NOT apply defaults when Business Hours is disabled', () => {
      const initialBusiness = {
        id: '1',
        name: 'Test Business',
        business_hours_enabled: false,
        business_hours_timezone: null,
        business_hours_start: null,
        business_hours_end: null,
        after_hours_message: null
      } as any

      const { result } = renderHook(() =>
        useSettingsFormState({
          initialBusiness,
          onSaveBusiness: mockSaveBusiness,
          onBusinessUpdated: mockBusinessUpdated
        })
      )

      expect(result.current.business?.business_hours_timezone).toBeNull()
      expect(result.current.business?.business_hours_start).toBeNull()
      expect(result.current.business?.business_hours_end).toBeNull()
      // Message defaults still apply as they're not conditional on Business Hours
      expect(result.current.business?.after_hours_message).toBe('Default after hours message')
    })
  })

  describe('when Business Hours is disabled with existing values', () => {
    it('should preserve existing values when Business Hours is disabled', () => {
      const initialBusiness = {
        id: '1',
        name: 'Test Business',
        business_hours_enabled: false,
        business_hours_timezone: 'America/Chicago',
        business_hours_start: '08:30',
        business_hours_end: '16:30',
        after_hours_message: 'Custom message'
      } as any

      const { result } = renderHook(() =>
        useSettingsFormState({
          initialBusiness,
          onSaveBusiness: mockSaveBusiness,
          onBusinessUpdated: mockBusinessUpdated
        })
      )

      expect(result.current.business?.business_hours_timezone).toBe('America/Chicago')
      expect(result.current.business?.business_hours_start).toBe('08:30')
      expect(result.current.business?.business_hours_end).toBe('16:30')
      expect(result.current.business?.after_hours_message).toBe('Custom message')
    })
  })

  describe('field changes are detected correctly', () => {
    it('should detect when a Business Hours field is changed', () => {
      const initialBusiness = {
        id: '1',
        name: 'Test Business',
        business_hours_enabled: true,
        business_hours_timezone: 'America/New_York',
        business_hours_start: '09:00',
        business_hours_end: '18:00',
        after_hours_message: 'Default after hours message'
      } as any

      const { result } = renderHook(() =>
        useSettingsFormState({
          initialBusiness,
          onSaveBusiness: mockSaveBusiness,
          onBusinessUpdated: mockBusinessUpdated
        })
      )

      expect(result.current.hasUnsavedChanges).toBe(false)

      act(() => {
        result.current.updateBusiness({ business_hours_end: '17:00' })
      })

      expect(result.current.hasUnsavedChanges).toBe(true)
      expect(result.current.business?.business_hours_end).toBe('17:00')
    })

    it('should treat clearing a field with default as a change', () => {
      const initialBusiness = {
        id: '1',
        name: 'Test Business',
        business_hours_enabled: true,
        business_hours_timezone: null,
        business_hours_start: null,
        business_hours_end: null,
        after_hours_message: null
      } as any

      const { result } = renderHook(() =>
        useSettingsFormState({
          initialBusiness,
          onSaveBusiness: mockSaveBusiness,
          onBusinessUpdated: mockBusinessUpdated
        })
      )

      // Form state has defaults applied
      expect(result.current.business?.business_hours_timezone).toBe('America/New_York')
      expect(result.current.hasUnsavedChanges).toBe(false)

      // Clearing the field (setting to empty string) is a change because it removes the default
      act(() => {
        result.current.updateBusiness({ business_hours_timezone: '' })
      })

      expect(result.current.hasUnsavedChanges).toBe(true)
    })
  })
})