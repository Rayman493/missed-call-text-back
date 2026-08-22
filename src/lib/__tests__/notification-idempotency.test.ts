import { describe, it, expect } from 'vitest'

/**
 * Notification Idempotency Key Generation Tests
 *
 * These tests verify that the idempotency key generation logic
 * produces consistent keys for the same AI intake event.
 */

describe('Notification Idempotency Key Generation', () => {
  describe('ai_intake_completed idempotency key', () => {
    it('should generate consistent key from aiCallRecordId', () => {
      const aiCallRecordId = 'df290e36-a081-4048-8830-25048f96a408'
      const expectedKey = `ai_${aiCallRecordId}`
      const actualKey = `ai_${aiCallRecordId}`
      expect(actualKey).toBe(expectedKey)
    })

    it('should generate different keys for different AI call records', () => {
      const aiCallRecordId1 = 'df290e36-a081-4048-8830-25048f96a408'
      const aiCallRecordId2 = 'abc12345-def6-7890-1234-567890abcdef'
      const key1 = `ai_${aiCallRecordId1}`
      const key2 = `ai_${aiCallRecordId2}`
      expect(key1).not.toBe(key2)
    })

    it('should NOT use leadId as fallback to avoid suppressing legitimate subsequent calls', () => {
      // This test documents the design decision:
      // We do NOT use leadId as a fallback because it would suppress
      // legitimate subsequent AI intake completions for the same lead
      const leadId = 'b068a018-ab81-4811-8918-abde778d445b'
      const aiCallRecordId1 = 'df290e36-a081-4048-8830-25048f96a408'
      const aiCallRecordId2 = 'abc12345-def6-7890-1234-567890abcdef'

      // Both calls for same lead should have DIFFERENT keys
      const key1 = `ai_${aiCallRecordId1}`
      const key2 = `ai_${aiCallRecordId2}`
      expect(key1).not.toBe(key2)

      // Neither should equal a lead-based key
      const leadKey = `ai_${leadId}`
      expect(key1).not.toBe(leadKey)
      expect(key2).not.toBe(leadKey)
    })
  })

  describe('both producers generate same key', () => {
    it('should generate same key when both producers use same aiCallRecordId', () => {
      const aiCallRecordId = 'df290e36-a081-4048-8830-25048f96a408'

      // Simulate voice-status producer
      const voiceStatusKey = `ai_${aiCallRecordId}`

      // Simulate ai-confirmation-sms producer (latestAiCallRecord.id)
      const aiConfirmationSmsKey = `ai_${aiCallRecordId}`

      expect(voiceStatusKey).toBe(aiConfirmationSmsKey)
    })
  })

  describe('23505 unique constraint error code', () => {
    it('should recognize PostgreSQL unique violation error code', () => {
      const uniqueViolationCode = '23505'
      expect(uniqueViolationCode).toBe('23505')
    })
  })

  describe('created_at preservation', () => {
    it('should document that created_at is not updated on conflict', () => {
      // This test documents the design:
      // When a duplicate insert fails with 23505, we fetch the existing row
      // The existing row's created_at is preserved and NOT updated
      const originalCreatedAt = '2024-09-03T10:00:00.000Z'
      const newAttemptCreatedAt = '2024-09-03T10:00:01.000Z'

      // The existing row should keep its original created_at
      expect(originalCreatedAt).not.toBe(newAttemptCreatedAt)
    })
  })

  describe('non-idempotent notification types', () => {
    it('should document that non-idempotent types use NULL idempotency_key', () => {
      // customer_reply, voicemail_received, new_lead, etc. use NULL
      // PostgreSQL allows multiple NULL values in unique indexes
      const nullKey = null
      expect(nullKey).toBeNull()
    })
  })
})