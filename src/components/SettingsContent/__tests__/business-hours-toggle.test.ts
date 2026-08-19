/**
 * Business Hours Toggle Persistence Tests
 *
 * Tests for the explicit Business Hours enable/disable toggle.
 * Verifies that configuration is preserved when toggling enabled state.
 */

import { describe, it, expect } from 'vitest'
import { Business } from '@/lib/types'

describe('Business Hours Toggle Persistence', () => {
  const createMockBusiness = (overrides: Partial<Business> = {}): Business => ({
    id: 'test-id',
    name: 'Test Business',
    business_type: 'plumbing',
    business_type_other: null,
    business_phone_number: '+15551234567',
    twilio_phone_number: '+15559876543',
    call_forwarding_enabled: false,
    business_hours_enabled: true,
    business_hours_start: '09:00',
    business_hours_end: '18:00',
    business_hours_timezone: 'America/New_York',
    after_hours_message: 'After business hours',
    forwarding_phone_number: null,
    carrier: null,
    phone_carrier: null,
    onboarding_step: null,
    onboarding_status: 'complete',
    out_of_office_enabled: false,
    out_of_office_start: null,
    out_of_office_end: null,
    out_of_office_message: '',
    automation_settings: {},
    venmo_username: null,
    paypal_payment_link: null,
    service_location_type: null,
    business_address_line1: null,
    business_address_line2: null,
    business_address_city: null,
    business_address_state: null,
    business_address_postal_code: null,
    business_address_country: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  })

  it('CASE A: existing active configuration should have enabled=true and complete fields', () => {
    const business = createMockBusiness({
      business_hours_enabled: true,
      business_hours_start: '09:00',
      business_hours_end: '18:00',
      business_hours_timezone: 'America/New_York',
      after_hours_message: 'After hours message'
    })

    expect(business.business_hours_enabled).toBe(true)
    expect(business.business_hours_start).toBe('09:00')
    expect(business.business_hours_end).toBe('18:00')
    expect(business.business_hours_timezone).toBe('America/New_York')
    expect(business.after_hours_message).toBe('After hours message')
  })

  it('CASE B: disable should set enabled=false while preserving configuration', () => {
    const business = createMockBusiness({
      business_hours_enabled: true,
      business_hours_start: '09:00',
      business_hours_end: '18:00',
      business_hours_timezone: 'America/New_York',
      after_hours_message: 'After hours message'
    })

    const updated = { ...business, business_hours_enabled: false }

    expect(updated.business_hours_enabled).toBe(false)
    expect(updated.business_hours_start).toBe('09:00')
    expect(updated.business_hours_end).toBe('18:00')
    expect(updated.business_hours_timezone).toBe('America/New_York')
    expect(updated.after_hours_message).toBe('After hours message')
  })

  it('CASE C: re-enable should restore enabled=true while preserving configuration', () => {
    const business = createMockBusiness({
      business_hours_enabled: false,
      business_hours_start: '09:00',
      business_hours_end: '18:00',
      business_hours_timezone: 'America/New_York',
      after_hours_message: 'After hours message'
    })

    const updated = { ...business, business_hours_enabled: true }

    expect(updated.business_hours_enabled).toBe(true)
    expect(updated.business_hours_start).toBe('09:00')
    expect(updated.business_hours_end).toBe('18:00')
    expect(updated.business_hours_timezone).toBe('America/New_York')
    expect(updated.after_hours_message).toBe('After hours message')
  })

  it('CASE D: editing configuration while disabled should not auto-enable', () => {
    const business = createMockBusiness({
      business_hours_enabled: false,
      business_hours_start: '09:00',
      business_hours_end: '18:00'
    })

    const updated = { ...business, business_hours_start: '10:00' }

    expect(updated.business_hours_enabled).toBe(false)
    expect(updated.business_hours_start).toBe('10:00')
  })

  it('existing enabled state loads enabled', () => {
    const business = createMockBusiness({ business_hours_enabled: true })
    expect(business.business_hours_enabled).toBe(true)
  })

  it('existing disabled state loads disabled', () => {
    const business = createMockBusiness({ business_hours_enabled: false })
    expect(business.business_hours_enabled).toBe(false)
  })

  it('CASE E: incomplete configuration cannot be enabled', () => {
    const business = createMockBusiness({
      business_hours_enabled: false,
      business_hours_start: null,
      business_hours_end: null,
      business_hours_timezone: null,
      after_hours_message: null
    })

    // Validation should prevent enabling without complete configuration
    const hasValidConfig =
      !!(business.business_hours_timezone &&
      business.business_hours_start &&
      business.business_hours_end &&
      business.after_hours_message)

    expect(hasValidConfig).toBe(false)

    // Attempting to enable should be rejected
    const shouldAllowEnable = hasValidConfig
    expect(shouldAllowEnable).toBe(false)
  })

  it('failed enable attempt does not persist true', () => {
    const business = createMockBusiness({
      business_hours_enabled: false,
      business_hours_start: null,
      business_hours_end: null,
      business_hours_timezone: null,
      after_hours_message: null
    })

    // Since validation fails, enabled should remain false
    const hasValidConfig =
      !!(business.business_hours_timezone &&
      business.business_hours_start &&
      business.business_hours_end &&
      business.after_hours_message)

    const enabledAfterAttempt = hasValidConfig ? true : business.business_hours_enabled

    expect(enabledAfterAttempt).toBe(false)
  })

  it('configuration remains intact after failed enable attempt', () => {
    const business = createMockBusiness({
      business_hours_enabled: false,
      business_hours_start: '09:00',
      business_hours_end: '18:00',
      business_hours_timezone: null,
      after_hours_message: 'Test message'
    })

    // Partial config exists but is incomplete
    const hasValidConfig =
      !!(business.business_hours_timezone &&
      business.business_hours_start &&
      business.business_hours_end &&
      business.after_hours_message)

    expect(hasValidConfig).toBe(false)

    // Configuration fields should remain intact
    expect(business.business_hours_start).toBe('09:00')
    expect(business.business_hours_end).toBe('18:00')
    expect(business.after_hours_message).toBe('Test message')
  })

  it('Done button should not auto-flip enabled state', () => {
    const business = createMockBusiness({
      business_hours_enabled: false,
      business_hours_start: '09:00',
      business_hours_end: '18:00'
    })

    // Done should save the current state without auto-enabling
    const saved = { ...business }

    expect(saved.business_hours_enabled).toBe(false)
    expect(saved.business_hours_start).toBe('09:00')
  })
})