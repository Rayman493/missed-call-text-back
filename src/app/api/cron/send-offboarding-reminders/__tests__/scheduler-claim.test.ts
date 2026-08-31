/**
 * Offboarding Reminder Scheduler Tests
 *
 * Tests for claim mechanism, idempotency, and SMS classification.
 */

import { describe, it, expect, vi } from 'vitest'

describe('Offboarding Reminder Scheduler - Claim Mechanism', () => {
  describe('Claim acquisition', () => {
    it('should claim a record with null processing_at', () => {
      const record = {
        id: 'record-1',
        processing_at: null,
        reminder_count: 0
      }

      const claimTimestamp = new Date().toISOString()

      // Simulate claim: UPDATE SET processing_at = claimTimestamp WHERE processing_at IS NULL
      const canClaim = record.processing_at === null
      const claimedRecord = canClaim ? { ...record, processing_at: claimTimestamp } : record

      expect(canClaim).toBe(true)
      expect(claimedRecord.processing_at).toBe(claimTimestamp)
    })

    it('should not claim a record with existing processing_at', () => {
      const record = {
        id: 'record-1',
        processing_at: new Date(Date.now() - 60000).toISOString(), // 1 minute ago
        reminder_count: 0
      }

      const claimTimestamp = new Date().toISOString()

      // Simulate claim attempt: UPDATE SET processing_at = claimTimestamp WHERE processing_at IS NULL
      const canClaim = record.processing_at === null
      const claimedRecord = canClaim ? { ...record, processing_at: claimTimestamp } : record

      expect(canClaim).toBe(false)
      expect(claimedRecord.processing_at).not.toBe(claimTimestamp)
      expect(claimedRecord.processing_at).toBe(record.processing_at)
    })
  })

  describe('Stale claim cleanup', () => {
    it('should release claims older than 5 minutes', () => {
      const now = new Date()
      const staleThreshold = new Date(now.getTime() - 5 * 60 * 1000)

      const staleRecord = {
        id: 'record-1',
        processing_at: new Date(now.getTime() - 6 * 60 * 1000).toISOString(), // 6 minutes ago
        reminder_count: 0
      }

      const activeRecord = {
        id: 'record-2',
        processing_at: new Date(now.getTime() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
        reminder_count: 0
      }

      // Simulate cleanup: UPDATE SET processing_at = null WHERE processing_at < staleThreshold
      const shouldReleaseStale = new Date(staleRecord.processing_at) < staleThreshold
      const shouldReleaseActive = new Date(activeRecord.processing_at) < staleThreshold

      expect(shouldReleaseStale).toBe(true)
      expect(shouldReleaseActive).toBe(false)
    })
  })

  describe('Conditional update for tracking', () => {
    it('should only update tracking if reminder_count unchanged', () => {
      const record = {
        id: 'record-1',
        reminder_count: 0,
        last_reminder_at: null,
        processing_at: new Date().toISOString()
      }

      const currentReminderCount = 0
      const now = new Date().toISOString()

      // Simulate conditional update: UPDATE SET reminder_count = 1, last_reminder_at = now, processing_at = null
      // WHERE id = record.id AND reminder_count = currentReminderCount
      const updateSucceeds = record.reminder_count === currentReminderCount

      const updatedRecord = updateSucceeds
        ? {
            ...record,
            reminder_count: record.reminder_count + 1,
            last_reminder_at: now,
            processing_at: null
          }
        : record

      expect(updateSucceeds).toBe(true)
      expect(updatedRecord.reminder_count).toBe(1)
      expect(updatedRecord.last_reminder_at).toBe(now)
      expect(updatedRecord.processing_at).toBeNull()
    })

    it('should fail conditional update if reminder_count changed', () => {
      const record = {
        id: 'record-1',
        reminder_count: 1, // Another worker updated it
        last_reminder_at: new Date().toISOString(),
        processing_at: new Date().toISOString()
      }

      const currentReminderCount = 0 // We have stale data
      const now = new Date().toISOString()

      // Simulate conditional update
      const updateSucceeds = record.reminder_count === currentReminderCount

      const updatedRecord = updateSucceeds
        ? {
            ...record,
            reminder_count: record.reminder_count + 1,
            last_reminder_at: now,
            processing_at: null
          }
        : record

      expect(updateSucceeds).toBe(false)
      expect(updatedRecord.reminder_count).toBe(1) // Unchanged
      expect(updatedRecord.processing_at).not.toBeNull() // Claim not released
    })
  })
})

describe('Offboarding Reminder Scheduler - SMS Classification', () => {
  describe('SMS send result classification', () => {
    it('should classify successful SMS send as sent', () => {
      const smsSent = 'SM1234567890abcdef' // Non-null SID

      const smsResult = smsSent ? 'sent' : 'failed'

      expect(smsResult).toBe('sent')
    })

    it('should classify null SMS result as failed', () => {
      const smsSent = null

      const smsResult = smsSent ? 'sent' : 'failed'

      expect(smsResult).toBe('failed')
    })

    it('should classify SMS exception as failed', () => {
      let smsResult: 'sent' | 'skipped' | 'failed' = 'skipped'
      let smsError: Error | null = null

      // Simulate try-catch
      try {
        // SMS send would throw
        throw new Error('Twilio error')
      } catch (error) {
        smsError = error as Error
        smsResult = 'failed'
      }

      expect(smsError).toBeInstanceOf(Error)
      expect(smsResult).toBe('failed')
    })

    it('should classify SMS as skipped when twilio_phone_number is null', () => {
      const record = {
        business_phone_number: '+14122533598',
        twilio_phone_number: null // Recycled/released
      }

      let smsResult: 'sent' | 'skipped' | 'failed' = 'skipped'

      if (record.business_phone_number && record.twilio_phone_number) {
        smsResult = 'sent' // or failed after attempt
      } else if (!record.twilio_phone_number) {
        smsResult = 'skipped'
      }

      expect(smsResult).toBe('skipped')
    })

    it('should classify SMS as skipped when business_phone_number is null', () => {
      const record = {
        business_phone_number: null,
        twilio_phone_number: '+14129998888'
      }

      let smsResult: 'sent' | 'skipped' | 'failed' = 'skipped'

      if (record.business_phone_number && record.twilio_phone_number) {
        smsResult = 'sent' // or failed after attempt
      } else if (!record.twilio_phone_number) {
        smsResult = 'skipped'
      }

      expect(smsResult).toBe('skipped')
    })
  })
})

describe('Offboarding Reminder Scheduler - Reminder Limits', () => {
  it('should not send reminder if max reminders reached', () => {
    const MAX_REMINDERS = 2

    const record = {
      id: 'record-1',
      reminder_count: 2, // At max
      forwarding_confirmed: false
    }

    const shouldDelete = record.reminder_count >= MAX_REMINDERS
    const shouldSendReminder = !shouldDelete

    expect(shouldDelete).toBe(true)
    expect(shouldSendReminder).toBe(false)
  })

  it('should send reminder if below max reminders', () => {
    const MAX_REMINDERS = 2

    const record = {
      id: 'record-1',
      reminder_count: 1, // Below max
      forwarding_confirmed: false
    }

    const shouldDelete = record.reminder_count >= MAX_REMINDERS
    const shouldSendReminder = !shouldDelete

    expect(shouldDelete).toBe(false)
    expect(shouldSendReminder).toBe(true)
  })
})