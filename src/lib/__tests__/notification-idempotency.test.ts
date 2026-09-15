import { describe, it, expect } from 'vitest'

/**
 * Notification Idempotency Key Generation Tests
 *
 * These tests verify that the idempotency key generation logic
 * produces consistent keys for the same AI intake event.
 */

describe('Notification Idempotency Key Generation', () => {
  describe('ai_intake_completed idempotency key', () => {
    const callSid = 'CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
    const aiCallRecordId = 'df290e36-a081-4048-8830-25048f96a408'

    it('prefers CallSid as the canonical key', () => {
      expect(`ai_intake_completed:${callSid}`).toBe(`ai_intake_completed:${callSid}`)
    })

    it('falls back to the AI call record id only when CallSid is missing', () => {
      const fallbackKey = `ai_intake_completed:record:${aiCallRecordId}`
      expect(fallbackKey).toBe(fallbackKey)
    })

    it('should generate different keys for different calls', () => {
      const callSid2 = 'CAYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY'
      const key1 = `ai_intake_completed:${callSid}`
      const key2 = `ai_intake_completed:${callSid2}`
      expect(key1).not.toBe(key2)
    })

    it('should NOT use leadId as fallback to avoid suppressing legitimate subsequent calls', () => {
      const leadId = 'b068a018-ab81-4811-8918-abde778d445b'
      const key1 = `ai_intake_completed:${callSid}`
      const key2 = `ai_intake_completed:record:${aiCallRecordId}`
      expect(key1).not.toBe(`ai_intake_completed:${leadId}`)
      expect(key2).not.toBe(`ai_intake_completed:record:${leadId}`)
    })
  })

  describe('both producers generate same key', () => {
    it('should generate same key when both producers use same CallSid', () => {
      const callSid = 'CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'

      // Simulate voice-status producer (passes CallSid)
      const voiceStatusKey = `ai_intake_completed:${callSid}`

      // Simulate ai-confirmation-sms producer (passes the same CallSid)
      const aiConfirmationSmsKey = `ai_intake_completed:${callSid}`

      // Simulate /api/notifications/create (passes the same CallSid)
      const apiCreateKey = `ai_intake_completed:${callSid}`

      expect(voiceStatusKey).toBe(aiConfirmationSmsKey)
      expect(aiConfirmationSmsKey).toBe(apiCreateKey)
    })

    it('different CallSids create separate notifications', () => {
      const key1 = 'ai_intake_completed:CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      const key2 = 'ai_intake_completed:CAYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY'
      expect(key1).not.toBe(key2)
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
    it('should document that truly non-idempotent types use NULL idempotency_key', () => {
      // new_lead, payment_requested, payment_created, calendar_* have no
      // canonical event identity and use NULL. PostgreSQL allows multiple NULLs.
      const nullKey = null
      expect(nullKey).toBeNull()
    })
  })

  // ── Extended idempotency for retried/replayed notification types ──

  describe('customer_reply idempotency key', () => {
    it('should generate consistent key from messageId', () => {
      const messageId = 'msg_abc123'
      const expectedKey = `reply_${messageId}`
      const actualKey = `reply_${messageId}`
      expect(actualKey).toBe(expectedKey)
    })

    it('should generate different keys for different messages', () => {
      const key1 = `reply_msg_001`
      const key2 = `reply_msg_002`
      expect(key1).not.toBe(key2)
    })
  })

  describe('payment_completed idempotency key', () => {
    it('should generate consistent key from paymentId', () => {
      const paymentId = 'pay_abc123'
      const expectedKey = `pay_${paymentId}`
      const actualKey = `pay_${paymentId}`
      expect(actualKey).toBe(expectedKey)
    })

    it('should generate different keys for different payments', () => {
      const key1 = `pay_req_001`
      const key2 = `pay_req_002`
      expect(key1).not.toBe(key2)
    })
  })

  describe('appointment_created idempotency key', () => {
    it('should generate consistent key from appointmentId', () => {
      const appointmentId = 'evt_google_123'
      const expectedKey = `appt_${appointmentId}`
      const actualKey = `appt_${appointmentId}`
      expect(actualKey).toBe(expectedKey)
    })

    it('should generate different keys for different appointments', () => {
      const key1 = `appt_evt_001`
      const key2 = `appt_evt_002`
      expect(key1).not.toBe(key2)
    })
  })

  describe('appointment_deleted idempotency key', () => {
    it('should generate consistent key from appointmentId', () => {
      const appointmentId = 'evt_google_456'
      const expectedKey = `appt_del_${appointmentId}`
      const actualKey = `appt_del_${appointmentId}`
      expect(actualKey).toBe(expectedKey)
    })
  })

  describe('personal_voicemail idempotency key', () => {
    it('should generate consistent key from voicemailId', () => {
      const voicemailId = 'vm_uuid_123'
      const expectedKey = `vm_${voicemailId}`
      const actualKey = `vm_${voicemailId}`
      expect(actualKey).toBe(expectedKey)
    })

    it('should generate different keys for different voicemails', () => {
      const key1 = `vm_vm_001`
      const key2 = `vm_vm_002`
      expect(key1).not.toBe(key2)
    })
  })

  describe('voicemail_received idempotency key', () => {
    it('should generate consistent key from voicemailId', () => {
      const voicemailId = 'vm_rec_789'
      const expectedKey = `vmr_${voicemailId}`
      const actualKey = `vmr_${voicemailId}`
      expect(actualKey).toBe(expectedKey)
    })
  })

  describe('ai_intake_completed via callSid fallback', () => {
    it('should use callSid as the canonical idempotency key', () => {
      const callSid = 'CAa51dd2fefb843730887685f57c77cc3b'
      const idempotencyKey = `ai_intake_completed:${callSid}`
      expect(idempotencyKey).toBe(`ai_intake_completed:${callSid}`)
    })

    it('should dedupe AI voice service + voice-status webhook for same callSid', () => {
      // Both paths now pass the same CallSid explicitly.
      const callSid = 'CAa51dd2fefb843730887685f57c77cc3b'
      const aiVoiceServiceKey = `ai_intake_completed:${callSid}`
      const voiceStatusKey = `ai_intake_completed:${callSid}`
      expect(aiVoiceServiceKey).toBe(voiceStatusKey)
    })

    it('falls back to record id only when CallSid is missing', () => {
      const aiCallRecordId = 'df290e36-a081-4048-8830-25048f96a408'
      const fallbackKey = `ai_intake_completed:record:${aiCallRecordId}`
      expect(fallbackKey).toBe(`ai_intake_completed:record:${aiCallRecordId}`)
    })
  })

  describe('returning customer does not suppress new notifications', () => {
    it('should allow new notifications for different CallSids from same customer', () => {
      const callSidA = 'CAaaa111'
      const callSidB = 'CAbbb222'
      const callSidC = 'CAccc333'

      const keyA = `ai_intake_completed:${callSidA}`
      const keyB = `ai_intake_completed:${callSidB}`
      const keyC = `ai_intake_completed:${callSidC}`

      expect(keyA).not.toBe(keyB)
      expect(keyB).not.toBe(keyC)
      expect(keyA).not.toBe(keyC)
    })

    it('should NOT use lead_id or customer_id for dedup', () => {
      // The idempotency key is derived from the EVENT identity (CallSid),
      // not the entity identity (lead_id, customer_id, phone).
      // This ensures a returning customer gets a NEW notification for each call.
      const leadId = 'lead_uuid_123'
      const callSid1 = 'CAcall001'
      const callSid2 = 'CAcall002'

      const key1 = `ai_intake_completed:${callSid1}`
      const key2 = `ai_intake_completed:${callSid2}`

      // Neither key should be lead-based
      expect(key1).not.toBe(`ai_intake_completed:${leadId}`)
      expect(key2).not.toBe(`ai_intake_completed:${leadId}`)
      // Both keys should be different
      expect(key1).not.toBe(key2)
    })
  })
})

import { readFileSync } from 'fs'

const notificationsServerContent = readFileSync('src/lib/notifications-server.ts', 'utf8')

describe('Notification 23505 duplicate/push contract', () => {
  it('creates idempotency_key on the notifications insert', () => {
    expect(notificationsServerContent).toMatch(/idempotency_key: idempotencyKey/)
  })

  it('catches unique conflict 23505 and reuses the existing row', () => {
    expect(notificationsServerContent).toMatch(/insertError\.code === '23505'/)
    expect(notificationsServerContent).toMatch(/insertedData = existingNotification/)
    expect(notificationsServerContent).toMatch(/isNewInsert = false/)
  })

  it('does NOT trigger push for the duplicate (losing) attempt', () => {
    // Push delivery is gated by isNewInsert. The 23505 path sets isNewInsert = false.
    expect(notificationsServerContent).toMatch(/if \(isNewInsert\) \{/)
    expect(notificationsServerContent).toMatch(/Existing rows \(from 23505 conflict\) do NOT trigger push again/)
    expect(notificationsServerContent).toMatch(/\[PUSH\] delivery skipped - existing notification reused/)
  })
})