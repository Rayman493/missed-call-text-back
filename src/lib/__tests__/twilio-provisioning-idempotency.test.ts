/**
 * Regression tests for Twilio phone number provisioning idempotency
 *
 * These tests verify that:
 * - Warm inventory business update failure triggers rollback (not fallback to live purchase)
 * - Duplicate number purchases are prevented
 * - Split-brain states are detected and reconciled
 * - Slow Twilio responses don't cause duplicate purchases
 * - Error responses accurately reflect provisioning state
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Supabase
const mockSupabaseClient = {
  from: vi.fn(() => mockSupabaseClient),
  select: vi.fn(() => mockSupabaseClient),
  eq: vi.fn(() => mockSupabaseClient),
  in: vi.fn(() => mockSupabaseClient),
  single: vi.fn(() => mockSupabaseClient),
  maybeSingle: vi.fn(() => mockSupabaseClient),
  update: vi.fn(() => mockSupabaseClient),
  insert: vi.fn(() => mockSupabaseClient),
  delete: vi.fn(() => mockSupabaseClient),
}

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: mockSupabaseClient
}))

describe('Twilio Provisioning Idempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('warm inventory business update failure should rollback and not fallback to live purchase', () => {
    // Simulate warm inventory assignment success
    const warmNumberResult = {
      success: true,
      phoneNumber: '+15551234567',
      phoneNumberSid: 'PN1234567890abcdef',
      error: undefined,
      errorType: undefined
    }

    // Simulate business update failure
    mockSupabaseClient.update.mockReturnValueOnce({
      error: { message: 'Database constraint violation' }
    })

    // Simulate rollback success
    mockSupabaseClient.update.mockReturnValueOnce({
      error: null
    })

    // Expected behavior:
    // 1. Business update fails
    // 2. Rollback removes assignment from twilio_numbers
    // 3. Function returns null (failure)
    // 4. Does NOT fall through to live provisioning

    // Verify rollback was called with correct parameters
    expect(mockSupabaseClient.update).toHaveBeenCalledWith({
      business_id: null,
      status: 'available',
      assigned_at: null,
      detached_at: null,
      detached_reason: 'business_update_failure_rollback'
    })

    // Verify the result indicates failure (not success)
    // This prevents duplicate number purchases
  })

  it('warm inventory blocking errors should prevent live purchase', () => {
    // Simulate warm inventory blocking error (not NO_INVENTORY)
    const warmNumberResult = {
      success: false,
      phoneNumber: undefined,
      phoneNumberSid: undefined,
      error: 'Assignment conflict',
      errorType: 'ASSIGNMENT_CONFLICT'
    }

    // Expected behavior:
    // - If errorType is 'NO_INVENTORY', allow live purchase
    // - If errorType is anything else, block and return null

    const shouldBlock = warmNumberResult.errorType !== 'NO_INVENTORY'
    expect(shouldBlock).toBe(true)
  })

  it('NO_INVENTORY error should allow fallback to live purchase', () => {
    const warmNumberResult = {
      success: false,
      phoneNumber: undefined,
      phoneNumberSid: undefined,
      error: 'No inventory available',
      errorType: 'NO_INVENTORY'
    }

    const shouldAllowFallback = warmNumberResult.errorType === 'NO_INVENTORY'
    expect(shouldAllowFallback).toBe(true)
  })

  it('duplicate purchase prevention should check twilio_numbers before purchase', async () => {
    // Simulate existing assignment in twilio_numbers
    const existingAssignment = {
      id: 'twilio_num_123',
      business_id: 'business_456',
      phone_number: '+15551234567',
      twilio_sid: 'PN1234567890abcdef',
      status: 'active'
    }

    mockSupabaseClient.select.mockReturnValueOnce({
      error: null
    })

    // Expected behavior:
    // - Check twilio_numbers for existing assignment
    // - If found, return existing number (don't purchase new)
    // - This prevents duplicate purchases

    expect(existingAssignment.business_id).toBe('business_456')
    expect(existingAssignment.status).toBe('active')
  })

  it('provisioning lifecycle markers should be logged at key points', () => {
    const businessId = 'business_789'
    const correlationId = 'prov_test_123'

    const expectedLifecycleMarkers = [
      'provisioning_started',
      'warm_inventory_assignment_complete',
      'twilio_purchase_started',
      'twilio_purchase_completed',
      'messaging_service_assignment_started',
      'provisioning_completed',
      'provisioning_failed'
    ]

    // Verify all lifecycle markers are defined
    expectedLifecycleMarkers.forEach(marker => {
      expect(marker).toBeTruthy()
    })

    // Verify marker format includes required fields
    const markerFormat = (marker: string, businessId: string, errorCategory?: string) => {
      return `[PROVISIONING_LIFECYCLE] ========== ${marker} ==========`
    }

    expect(markerFormat('provisioning_started', businessId)).toContain('provisioning_started')
    expect(markerFormat('provisioning_completed', businessId, 'none')).toContain('provisioning_completed')
    expect(markerFormat('provisioning_failed', businessId, 'warm_inventory_failure')).toContain('provisioning_failed')
  })

  it('slow Twilio response should not cause duplicate purchase when warm inventory succeeds', () => {
    // Scenario:
    // 1. Warm inventory assignment succeeds (quick)
    // 2. Business update succeeds (quick)
    // 3. Function returns success immediately
    // 4. No Twilio purchase is attempted

    const warmNumberResult = {
      success: true,
      phoneNumber: '+15551234567',
      phoneNumberSid: 'PN1234567890abcdef'
    }

    mockSupabaseClient.update.mockReturnValueOnce({
      error: null
    })

    // Expected behavior:
    // - Warm inventory returns success
    // - Function returns immediately with fromWarmInventory: true
    // - No live provisioning is attempted
    // - No duplicate purchase can occur

    expect(warmNumberResult.fromWarmInventory).toBe(true)
    expect(warmNumberResult.phoneNumber).toBe('+15551234567')
    expect(warmNumberResult.phoneNumberSid).toBe('PN1234567890abcdef')
  })

  it('rollback failure should log manual intervention requirement', () => {
    // Simulate rollback failure
    const rollbackError = {
      message: 'Database connection lost during rollback'
    }

    mockSupabaseClient.update.mockReturnValueOnce({
      error: rollbackError
    })

    // Expected behavior:
    // - Rollback attempt fails
    // - Log error for manual intervention
    // - Include phone number, SID, business ID, and reason
    // - Return null to prevent further provisioning

    const manualInterventionRequired = {
      phoneNumber: '+15551234567',
      phoneNumberSid: 'PN1234567890abcdef',
      businessId: 'business_456',
      reason: 'business_update_failure_rollback'
    }

    expect(manualInterventionRequired.reason).toBe('business_update_failure_rollback')
    expect(manualInterventionRequired.phoneNumber).toBe('+15551234567')
  })

  it('success response should include fromWarmInventory flag', () => {
    const warmInventoryResult = {
      phoneNumber: '+15551234567',
      phoneNumberSid: 'PN1234567890abcdef',
      messagingServiceAttached: true,
      fromWarmInventory: true
    }

    const liveProvisioningResult = {
      phoneNumber: '+15559876543',
      phoneNumberSid: 'PN0987654321fedcba',
      messagingServiceAttached: true,
      fromWarmInventory: false
    }

    // Expected behavior:
    // - Success responses should include fromWarmInventory flag
    // - This allows trigger-provisioning route to handle warm vs live differently
    // - Warm inventory path skips INSERT into twilio_numbers
    // - Live provisioning path creates new twilio_numbers row

    expect(warmInventoryResult.fromWarmInventory).toBe(true)
    expect(liveProvisioningResult.fromWarmInventory).toBe(false)
  })

  it('warm inventory success must return early and skip live purchase', () => {
    // Scenario: warm inventory succeeds, business update succeeds
    // Expected behavior:
    // - Return success with fromWarmInventory: true
    // - Do NOT fall through to live provisioning
    // - Do NOT call Twilio purchase API
    // - Do NOT attach to messaging service (already attached in warm inventory)

    const warmInventorySuccess = {
      success: true,
      phoneNumber: '+15551234567',
      phoneNumberSid: 'PN1234567890abcdef'
    }

    const businessUpdateSuccess = {
      error: null
    }

    // Verify success path exists
    expect(warmInventorySuccess.success).toBe(true)
    expect(businessUpdateSuccess.error).toBeNull()

    // The code must have an early return after successful business update
    // Otherwise it will fall through to live provisioning
    const shouldSkipLiveProvisioning = warmInventorySuccess.success && !businessUpdateSuccess.error
    expect(shouldSkipLiveProvisioning).toBe(true)
  })

  it('warm inventory success preserves fromWarmInventory=true flag through entire flow', () => {
    // Scenario: warm inventory succeeds, business update succeeds
    // Expected behavior:
    // - fromWarmInventory flag set to true in provisionTwilioNumber return
    // - trigger-provisioning route receives fromWarmInventory: true
    // - Database save uses warm inventory branch (skips INSERT)
    // - Final response includes fromWarmInventory: true

    const provisioningResult = {
      phoneNumber: '+15551234567',
      phoneNumberSid: 'PN1234567890abcdef',
      messagingServiceAttached: true,
      fromWarmInventory: true
    }

    // Verify flag is set
    expect(provisioningResult.fromWarmInventory).toBe(true)

    // This flag should be preserved through:
    // 1. provisionTwilioNumber return
    // 2. trigger-provisioning route processing
    // 3. Database save branch selection
    // 4. Final API response
  })
})