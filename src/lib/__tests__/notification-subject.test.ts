/**
 * Notification Subject Formatter Tests
 *
 * Tests for resolveNotificationSubject function
 * Ensures customer context is displayed correctly in notifications
 */

import { describe, it, expect } from 'vitest'
import { resolveNotificationSubject } from '@/lib/notifications'

describe('resolveNotificationSubject', () => {
  describe('Named customer', () => {
    it('should return customer name when leadName is provided', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: 'Ryan', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Ryan')
    })

    it('should return customer name when lead_name is provided (snake_case)', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { lead_name: 'Sarah', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Sarah')
    })

    it('should return caller name for personal voicemail', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'personal_voicemail',
        title: 'Personal Voicemail',
        message: 'From (412) 253-3598',
        data: { callerName: 'John Doe', voicemailId: 'vm-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('John Doe')
    })

    it('should handle customer name with extra whitespace', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: '  Ryan Smith  ', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Ryan Smith')
    })
  })

  describe('Placeholder customer name', () => {
    it('should reject "Customer" placeholder', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: 'Customer', leadPhone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should reject "Unknown" placeholder', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: 'Unknown', leadPhone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should reject "Unknown Customer" placeholder', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: 'Unknown Customer', leadPhone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should reject "Caller" placeholder', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: 'Caller', leadPhone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should reject "Anonymous" placeholder', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: 'Anonymous', leadPhone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should reject "Not collected" placeholder', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: 'Not collected', leadPhone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })
  })

  describe('Phone fallback', () => {
    it('should return formatted phone number when leadPhone is provided', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadPhone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should return formatted phone number when lead_phone is provided (snake_case)', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { lead_phone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should return formatted phone number when callerPhone is provided', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'personal_voicemail',
        title: 'Personal Voicemail',
        message: 'From phone',
        data: { callerPhone: '+14122533598', voicemailId: 'vm-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should return formatted phone number when caller_phone is provided (snake_case)', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'personal_voicemail',
        title: 'Personal Voicemail',
        message: 'From phone',
        data: { caller_phone: '+14122533598', voicemailId: 'vm-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should format 10-digit phone numbers', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadPhone: '4122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should format 11-digit phone numbers with country code', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadPhone: '14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should return original phone number if unformatable', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadPhone: '123', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('123')
    })
  })

  describe('Unknown caller', () => {
    it('should return "Unknown Caller" when no data is provided', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Unknown Caller')
    })

    it('should return "Unknown Caller" when data is empty', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: {},
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Unknown Caller')
    })

    it('should return "Unknown Caller" when name is empty string', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: '', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Unknown Caller')
    })

    it('should return "Unknown Caller" when name is null', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: null, leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Unknown Caller')
    })
  })

  describe('Personal voicemail', () => {
    it('should use callerPhone for personal voicemail', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'personal_voicemail',
        title: 'Personal Voicemail',
        message: 'From phone',
        data: { callerPhone: '+14122533598', voicemailId: 'vm-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })

    it('should use callerName for personal voicemail when available', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'personal_voicemail',
        title: 'Personal Voicemail',
        message: 'From phone',
        data: { callerName: 'Jane Smith', callerPhone: '+14122533598', voicemailId: 'vm-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Jane Smith')
    })

    it('should return "Unknown Caller" for personal voicemail without caller info', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'personal_voicemail',
        title: 'Personal Voicemail',
        message: 'From phone',
        data: { voicemailId: 'vm-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Unknown Caller')
    })
  })

  describe('Customer reply', () => {
    it('should use leadName for customer reply', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: 'Mike', message: 'Hi there', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Mike')
    })

    it('should fallback to phone for customer reply without name', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { message: 'Hi there', leadPhone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })
  })

  describe('Appointment notifications', () => {
    it('should handle appointment_created without customer data', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'appointment_created',
        title: 'Appointment Scheduled',
        message: 'Lawn Mowing · Jan 15, 2025',
        data: { title: 'Lawn Mowing', date: '2025-01-15' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Unknown Caller')
    })

    it('should use customer name if provided in appointment notification', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'appointment_created',
        title: 'Appointment Scheduled',
        message: 'Lawn Mowing · Jan 15, 2025',
        data: { title: 'Lawn Mowing', date: '2025-01-15', leadName: 'Tom' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Tom')
    })
  })

  describe('Priority handling', () => {
    it('should prefer leadName over callerName', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: 'Lead Name', callerName: 'Caller Name', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Lead Name')
    })

    it('should prefer leadName over leadPhone', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadName: 'Valid Name', leadPhone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Valid Name')
    })

    it('should prefer callerName over callerPhone', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'personal_voicemail',
        title: 'Personal Voicemail',
        message: 'From phone',
        data: { callerName: 'Valid Caller', callerPhone: '+14122533598', voicemailId: 'vm-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('Valid Caller')
    })

    it('should prefer leadPhone over callerPhone', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply',
        title: 'New Reply',
        message: 'Hi there',
        data: { leadPhone: '+14122533598', callerPhone: '+15551234567', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      expect(resolveNotificationSubject(notification)).toBe('(412) 253-3598')
    })
  })
})