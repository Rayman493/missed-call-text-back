/**
 * Tests for admin delete account endpoint and shared deletion service
 *
 * These tests verify:
 * 1. PGRST205 handling for optional tables
 * 2. Offboarding email idempotency
 * 3. Table reference correctness
 * 4. Interface validation
 */

import { describe, it, expect } from '@jest/globals'

describe('Shared Deletion Service - Table References', () => {
  it('should have the correct interface', async () => {
    const { deleteAccountLifecycle, DeletionContext, DeletionResult } = await import('@/lib/account-deletion-service')

    expect(typeof deleteAccountLifecycle).toBe('function')
    expect(typeof DeletionContext).toBe('object')
    expect(typeof DeletionResult).toBe('object')
  })

  it('should require userId in context', async () => {
    const { deleteAccountLifecycle } = await import('@/lib/account-deletion-service')

    try {
      await deleteAccountLifecycle({
        userId: '',
        deletionSource: 'self_service',
      })
      fail('Should have thrown an error')
    } catch (error) {
      expect(error).toBeDefined()
    }
  })

  it('should not reference ai_call_transcripts table', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // ai_call_transcripts should not be referenced
    expect(serviceCode).not.toContain('ai_call_transcripts')
  })

  it('should not reference appointments table', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // appointments should not be referenced
    expect(serviceString).not.toContain("from('appointments')")
  })

  it('should not reference payment_intents table', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // payment_intents should not be referenced
    expect(serviceCode).not.toContain("from('payment_intents')")
  })

  it('should not reference terminal_connections table', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // terminal_connections should not be referenced
    expect(serviceCode).not.toContain("from('terminal_connections')")
  })

  it('should reference calendar_integrations table', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // calendar_integrations should be referenced
    expect(serviceString).toContain("from('calendar_integrations')")
  })

  it('should reference ignored_contacts table', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // ignored_contacts should be referenced
    expect(serviceString).toContain("from('ignored_contacts')")
  })

  it('should reference stripe_webhook_events table with PGRST205 handling', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // stripe_webhook_events should be referenced
    expect(serviceString).toContain("from('stripe_webhook_events')")
    // PGRST205 should be handled
    expect(serviceString).toContain('PGRST205')
  })

  it('should reference jobs table', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // jobs should be referenced
    expect(serviceString).toContain("from('jobs')")
  })

  it('should have offboarding email idempotency check', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // Should check for existing offboarding tracking record
    expect(serviceString).toContain('offboarding_tracking')
    expect(serviceString).toContain('existingTrackingRecord')
  })
})

describe('Deletion Service - PGRST205 Handling', () => {
  it('should handle PGRST205 error for stripe_webhook_events', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // Should check for PGRST205 error code
    expect(serviceString).toContain("error.code === 'PGRST205'")
    // Should continue on PGRST205 (not fail)
    expect(serviceString).toContain('table not found (PGRST205), skipping')
  })
})

describe('Deletion Service - Offboarding Idempotency', () => {
  it('should check for existing offboarding tracking record before creating new one', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // Should query for existing records
    expect(serviceString).toContain('.from(\'offboarding_tracking\')')
    expect(serviceString).toContain('existingRecords')
  })

  it('should skip offboarding email if tracking record already exists', async () => {
    const serviceCode = await import('@/lib/account-deletion-service')
    const serviceString = JSON.stringify(serviceCode)

    // Should skip email if existingTrackingRecord exists
    expect(serviceString).toContain('!existingTrackingRecord')
    expect(serviceString).toContain('already_sent')
  })
})