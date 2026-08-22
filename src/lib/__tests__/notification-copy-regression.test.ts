/**
 * Notification Copy Regression Tests
 *
 * Tests for the notification copy simplification to ensure notifications
 * sound natural, concise, and immediately understandable to a business owner.
 *
 * Key changes:
 * - "AI captured" → removed, service shown directly
 * - "New Lead" → "New Customer" (matches UI terminology)
 * - "New AI Lead" → "New Request"
 * - "Follow-ups complete" → "Follow-Up Sent"
 * - "Forwarding Issue" → "Call Forwarding Disconnected"
 * - "SMS Failed" → "Message Failed"
 * - "Trial Ending" → "Trial Ending Soon"
 * - Customer reply title → "New Reply" (with name in body)
 * - Voicemail title → always "New Voicemail" (with sender in body)
 */

import { describe, it, expect } from 'vitest'
import { NOTIFICATION_TEMPLATES } from '../notifications'

describe('Notification Copy Regression', () => {
  describe('AI Intake Completed', () => {
    it('should NOT say "AI captured" - user-facing language only', () => {
      const result = NOTIFICATION_TEMPLATES.ai_intake_completed({
        leadName: 'Ryan',
        leadPhone: '555-1234',
        leadId: 'lead-1',
        serviceRequested: 'Fence Repair and Installation'
      })
      
      // Should NOT contain internal terminology
      expect(result.title).not.toContain('AI captured')
      expect(result.title).not.toContain('AI intake')
      expect(result.title).not.toContain('intake')
      expect(result.message).not.toContain('AI captured')
      expect(result.message).not.toContain('AI intake')
      expect(result.message).not.toContain('intake')
      
      // Should say "New Request" or show customer name
      expect(result.title === 'New Request' || result.title === 'Ryan').toBe(true)
      
      // Should show the service directly
      expect(result.message).toContain('Fence Repair and Installation')
    })

    it('should use "New Request" when customer name is placeholder', () => {
      const result = NOTIFICATION_TEMPLATES.ai_intake_completed({
        leadName: 'Customer',
        leadPhone: null,
        leadId: 'lead-1',
        serviceRequested: 'Fence Repair and Installation'
      })
      
      expect(result.title).toBe('New Request')
      expect(result.message).toContain('Fence Repair and Installation')
    })

    it('should show customer name when available', () => {
      const result = NOTIFICATION_TEMPLATES.ai_intake_completed({
        leadName: 'Ryan',
        leadPhone: '555-1234',
        leadId: 'lead-1',
        serviceRequested: 'Fence Repair and Installation'
      })
      
      expect(result.title).toBe('Ryan')
      expect(result.message).toContain('Fence Repair and Installation')
    })

    it('should use "New customer request" when service is missing', () => {
      const result = NOTIFICATION_TEMPLATES.ai_intake_completed({
        leadName: 'Customer',
        leadPhone: null,
        leadId: 'lead-1',
        serviceRequested: null
      })
      
      expect(result.title).toBe('New Request')
      expect(result.message).toBe('New customer request')
      expect(result.message).not.toContain('AI intake')
    })
  })

  describe('New Lead / New Customer', () => {
    it('should say "New Customer" instead of "New Lead" when name is placeholder and no phone', () => {
      const result = NOTIFICATION_TEMPLATES.new_lead({
        leadName: 'Customer',
        leadPhone: null,
        leadId: 'lead-1'
      })
      
      expect(result.title).toBe('New Customer')
      expect(result.title).not.toContain('New Lead')
    })

    it('should show customer name when available', () => {
      const result = NOTIFICATION_TEMPLATES.new_lead({
        leadName: 'Ryan',
        leadPhone: '555-1234',
        leadId: 'lead-1'
      })
      
      expect(result.title).toBe('Ryan')
    })

    it('should not mention internal "ReplyFlow started follow-up"', () => {
      const result = NOTIFICATION_TEMPLATES.new_lead({
        leadName: 'Customer',
        leadPhone: null,
        leadId: 'lead-1'
      })
      
      expect(result.message).not.toContain('ReplyFlow')
      expect(result.message).not.toContain('follow-up')
      expect(result.message).toBe('New customer request')
    })
  })

  describe('Customer Reply', () => {
    it('should use "New Reply" as title', () => {
      const result = NOTIFICATION_TEMPLATES.customer_reply({
        leadName: 'Ryan',
        message: 'Can you come tomorrow?',
        leadId: 'lead-1'
      })
      
      expect(result.title).toBe('New Reply')
    })

    it('should include customer name in message when available', () => {
      const result = NOTIFICATION_TEMPLATES.customer_reply({
        leadName: 'Ryan',
        message: 'Can you come tomorrow?',
        leadId: 'lead-1'
      })
      
      expect(result.message).toContain('Ryan:')
      expect(result.message).toContain('Can you come tomorrow?')
    })

    it('should show just message when customer is placeholder', () => {
      const result = NOTIFICATION_TEMPLATES.customer_reply({
        leadName: 'Customer',
        message: 'Can you come tomorrow?',
        leadId: 'lead-1'
      })
      
      expect(result.title).toBe('New Reply')
      expect(result.message).toBe('Can you come tomorrow?')
      expect(result.message).not.toContain('Customer:')
    })

    it('should use "Photo sent" for photo replies', () => {
      const result = NOTIFICATION_TEMPLATES.customer_reply({
        leadName: 'Ryan',
        message: '[Photo]',
        leadId: 'lead-1',
        hasPhoto: true
      })
      
      expect(result.title).toBe('Photo sent')
    })
  })

  describe('Follow-Up Completed', () => {
    it('should say "Follow-Up Sent" instead of "Follow-ups complete"', () => {
      const result = NOTIFICATION_TEMPLATES.followup_completed({
        leadName: 'Customer',
        leadId: 'lead-1'
      })
      
      expect(result.title).toBe('Follow-Up Sent')
      expect(result.title).not.toContain('complete')
    })

    it('should show customer name when available', () => {
      const result = NOTIFICATION_TEMPLATES.followup_completed({
        leadName: 'Ryan',
        leadId: 'lead-1'
      })
      
      expect(result.title).toBe('Ryan')
    })

    it('should say "All follow-up messages sent"', () => {
      const result = NOTIFICATION_TEMPLATES.followup_completed({
        leadName: 'Customer',
        leadId: 'lead-1'
      })
      
      expect(result.message).toBe('All follow-up messages sent')
    })
  })

  describe('Call Forwarding Disconnected', () => {
    it('should say "Call Forwarding Disconnected" instead of "Forwarding Issue"', () => {
      const result = NOTIFICATION_TEMPLATES.forwarding_disconnected()
      
      expect(result.title).toBe('Call Forwarding Disconnected')
      expect(result.title).not.toContain('Forwarding Issue')
    })

    it('should use concise "Tap to fix setup" message', () => {
      const result = NOTIFICATION_TEMPLATES.forwarding_disconnected()
      
      expect(result.message).toBe('Tap to fix setup')
      expect(result.message).not.toContain('may be disconnected')
    })
  })

  describe('SMS Failed', () => {
    it('should say "Message Failed" instead of "SMS Failed"', () => {
      const result = NOTIFICATION_TEMPLATES.sms_failed({
        leadName: 'Ryan',
        leadId: 'lead-1'
      })
      
      expect(result.title).toBe('Message Failed')
      expect(result.title).not.toContain('SMS')
    })

    it('should say "Not delivered to" instead of "Message to ... not delivered"', () => {
      const result = NOTIFICATION_TEMPLATES.sms_failed({
        leadName: 'Ryan',
        leadId: 'lead-1'
      })
      
      expect(result.message).toContain('Not delivered to')
      expect(result.message).not.toContain('not delivered')
    })
  })

  describe('Trial Ending', () => {
    it('should say "Trial Ending Soon"', () => {
      const result = NOTIFICATION_TEMPLATES.trial_ending({ daysLeft: 3 })
      
      expect(result.title).toBe('Trial Ending Soon')
    })
  })

  describe('Voicemail Received', () => {
    it('should always use "New Voicemail" as title', () => {
      const result = NOTIFICATION_TEMPLATES.voicemail_received({
        leadName: 'Ryan',
        leadPhone: '555-1234',
        leadId: 'lead-1'
      })
      
      expect(result.title).toBe('New Voicemail')
      expect(result.title).not.toContain('Voicemail from')
    })

    it('should show sender in message when available', () => {
      const result = NOTIFICATION_TEMPLATES.voicemail_received({
        leadName: 'Ryan',
        leadPhone: '555-1234',
        leadId: 'lead-1'
      })
      
      expect(result.message).toContain('From Ryan')
    })

    it('should use "Tap to listen" when customer is placeholder and no phone', () => {
      const result = NOTIFICATION_TEMPLATES.voicemail_received({
        leadName: 'Customer',
        leadPhone: null,
        leadId: 'lead-1'
      })
      
      expect(result.message).toBe('Tap to listen')
      expect(result.message).not.toContain('From')
    })
  })

  describe('Payment Notifications', () => {
    it('payment_requested should use clear business language', () => {
      const result = NOTIFICATION_TEMPLATES.payment_requested({
        leadName: 'Ryan',
        leadPhone: '555-1234',
        leadId: 'lead-1',
        amountCents: 5000
      })
      
      expect(result.title).toBe('Payment Requested')
      expect(result.message).toContain('$50.00')
      expect(result.message).toContain('Ryan')
    })

    it('payment_completed should say "Payment Received"', () => {
      const result = NOTIFICATION_TEMPLATES.payment_completed({
        leadName: 'Ryan',
        leadPhone: '555-1234',
        leadId: 'lead-1',
        amountCents: 5000
      })
      
      expect(result.title).toBe('Payment Received')
    })
  })

  describe('Appointment Notifications', () => {
    it('appointment_created should say "Appointment Scheduled"', () => {
      const result = NOTIFICATION_TEMPLATES.appointment_created({
        title: 'Fence Repair',
        date: '2026-08-25'
      })
      
      expect(result.title).toBe('Appointment Scheduled')
    })

    it('appointment_deleted should say "Appointment Cancelled"', () => {
      const result = NOTIFICATION_TEMPLATES.appointment_deleted({
        title: 'Fence Repair'
      })
      
      expect(result.title).toBe('Appointment Cancelled')
    })
  })

  describe('Calendar Notifications', () => {
    it('calendar_connected should say "Calendar Connected"', () => {
      const result = NOTIFICATION_TEMPLATES.calendar_connected({
        calendarEmail: 'user@gmail.com'
      })
      
      expect(result.title).toBe('Calendar Connected')
    })

    it('calendar_disconnected should say "Calendar Disconnected"', () => {
      const result = NOTIFICATION_TEMPLATES.calendar_disconnected()
      
      expect(result.title).toBe('Calendar Disconnected')
    })
  })

  describe('Subscription Issue', () => {
    it('should say "Subscription Issue"', () => {
      const result = NOTIFICATION_TEMPLATES.subscription_issue({
        issue: 'Payment method expired'
      })
      
      expect(result.title).toBe('Subscription Issue')
    })
  })

  describe('Personal Voicemail', () => {
    it('should say "Personal Voicemail"', () => {
      const result = NOTIFICATION_TEMPLATES.personal_voicemail({
        callerPhone: '555-1234',
        voicemailId: 'vm-1'
      })
      
      expect(result.title).toBe('Personal Voicemail')
    })
  })
})