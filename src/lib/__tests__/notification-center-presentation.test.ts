/**
 * Notification Center Presentation Tests
 *
 * Tests for the premium presentation polish that removes duplicate
 * customer identity from customer_reply notifications.
 */

import { describe, it, expect } from 'vitest'
import { resolveNotificationSubject } from '../notifications'

describe('Notification Center Presentation', () => {
  describe('Customer Reply Message Display', () => {
    it('should strip duplicate name prefix from customer_reply message', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply' as const,
        title: 'New Reply',
        message: 'Ryan: Notification name test',
        data: { leadName: 'Ryan', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      const subject = resolveNotificationSubject(notification)
      const prefix = `${subject}: `
      const displayMessage = notification.message.startsWith(prefix)
        ? notification.message.substring(prefix.length)
        : notification.message

      expect(displayMessage).toBe('Notification name test')
    })

    it('should preserve message when no duplicate prefix exists', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply' as const,
        title: 'New Reply',
        message: 'Hello, are you available tomorrow?',
        data: { leadName: 'Ryan', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      const subject = resolveNotificationSubject(notification)
      const prefix = `${subject}: `
      const displayMessage = notification.message.startsWith(prefix)
        ? notification.message.substring(prefix.length)
        : notification.message

      expect(displayMessage).toBe('Hello, are you available tomorrow?')
    })

    it('should handle message containing legitimate colon', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply' as const,
        title: 'New Reply',
        message: 'Ryan: I need help with: scheduling and pricing',
        data: { leadName: 'Ryan', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      const subject = resolveNotificationSubject(notification)
      const prefix = `${subject}: `
      const displayMessage = notification.message.startsWith(prefix)
        ? notification.message.substring(prefix.length)
        : notification.message

      expect(displayMessage).toBe('I need help with: scheduling and pricing')
    })

    it('should preserve phone fallback for unknown customer', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply' as const,
        title: 'New Reply',
        message: '(412) 253-3598: Hello',
        data: { leadPhone: '+14122533598', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      const subject = resolveNotificationSubject(notification)
      const prefix = `${subject}: `
      const displayMessage = notification.message.startsWith(prefix)
        ? notification.message.substring(prefix.length)
        : notification.message

      expect(displayMessage).toBe('Hello')
      expect(subject).toBe('(412) 253-3598')
    })

    it('should not affect other notification types', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'followup_completed' as const,
        title: 'Follow-Up Sent',
        message: 'All follow-up messages sent',
        data: { leadName: 'Ryan', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      const displayMessage = notification.message
      expect(displayMessage).toBe('All follow-up messages sent')
    })

    it('should handle long customer names', () => {
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply' as const,
        title: 'New Reply',
        message: 'Alexander Christopher Richardson: Hi there',
        data: { leadName: 'Alexander Christopher Richardson', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      const subject = resolveNotificationSubject(notification)
      const prefix = `${subject}: `
      const displayMessage = notification.message.startsWith(prefix)
        ? notification.message.substring(prefix.length)
        : notification.message

      expect(displayMessage).toBe('Hi there')
    })

    it('should handle long messages', () => {
      const longMessage = 'This is a very long message that should be displayed without the duplicate customer name prefix at the beginning of the text'
      const notification = {
        id: '1',
        business_id: 'biz-1',
        type: 'customer_reply' as const,
        title: 'New Reply',
        message: `Ryan: ${longMessage}`,
        data: { leadName: 'Ryan', leadId: 'lead-1' },
        read: false,
        created_at: new Date().toISOString()
      }

      const subject = resolveNotificationSubject(notification)
      const prefix = `${subject}: `
      const displayMessage = notification.message.startsWith(prefix)
        ? notification.message.substring(prefix.length)
        : notification.message

      expect(displayMessage).toBe(longMessage)
    })
  })
})