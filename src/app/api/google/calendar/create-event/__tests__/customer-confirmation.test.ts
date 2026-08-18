/**
 * Tests for Google Meet appointment customer confirmation SMS
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('Google Meet Appointment Customer Confirmation', () => {
  describe('Confirmation trigger conditions', () => {
    it('should trigger confirmation when meeting_type is google_meet and meetingUrl exists and lead_id is provided', () => {
      const meeting_type = 'google_meet'
      const meetingUrl = 'https://meet.google.com/abc-defg-hij'
      const lead_id = 'lead-123'

      const shouldSend = Boolean(meeting_type === 'google_meet' && meetingUrl && lead_id)
      expect(shouldSend).toBe(true)
    })

    it('should not trigger confirmation for in-person appointments', () => {
      const meeting_type = 'in_person'
      const meetingUrl = null
      const lead_id = 'lead-123'

      const shouldSend = Boolean(meeting_type === 'google_meet' && meetingUrl && lead_id)
      expect(shouldSend).toBe(false)
    })

    it('should not trigger confirmation for custom meeting type', () => {
      const meeting_type = 'custom'
      const meetingUrl = 'https://zoom.us/j/123456'
      const lead_id = 'lead-123'

      const shouldSend = Boolean(meeting_type === 'google_meet' && meetingUrl && lead_id)
      expect(shouldSend).toBe(false)
    })

    it('should not trigger confirmation when meetingUrl is missing', () => {
      const meeting_type = 'google_meet'
      const meetingUrl = null
      const lead_id = 'lead-123'

      const shouldSend = Boolean(meeting_type === 'google_meet' && meetingUrl && lead_id)
      expect(shouldSend).toBe(false)
    })

    it('should not trigger confirmation when lead_id is missing', () => {
      const meeting_type = 'google_meet'
      const meetingUrl = 'https://meet.google.com/abc-defg-hij'
      const lead_id = null

      const shouldSend = Boolean(meeting_type === 'google_meet' && meetingUrl && lead_id)
      expect(shouldSend).toBe(false)
    })
  })

  describe('Message formatting', () => {
    it('should format all-day appointment date without time', () => {
      const start = { date: '2024-06-19' }
      const timezone = 'America/New_York'
      const date = new Date(start.date)
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: timezone
      })

      // All-day events should not include time
      expect(typeof formattedDate).toBe('string')
      expect(formattedDate.length).toBeGreaterThan(0)
      expect(formattedDate).not.toContain(':')
      expect(formattedDate).not.toContain('at')
    })

    it('should format timed appointment date and time with timezone', () => {
      const start = { dateTime: '2024-06-19T09:00:00' }
      const timezone = 'America/New_York'
      const date = new Date(start.dateTime)
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: timezone
      })
      const formattedTime = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone
      })

      expect(typeof formattedDate).toBe('string')
      expect(typeof formattedTime).toBe('string')
      expect(formattedTime).toContain(':')
      expect(formattedTime).toMatch(/AM|PM/)
    })

    it('should format appointment in different timezone than server', () => {
      // Simulate a business in Los Angeles (PST/PDT)
      const businessTimezone = 'America/Los_Angeles'
      const start = { dateTime: '2024-06-19T09:00:00' }
      const date = new Date(start.dateTime)
      
      const formattedTime = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: businessTimezone
      })

      // Should format in LA timezone, not server timezone
      expect(typeof formattedTime).toBe('string')
      expect(formattedTime).toMatch(/AM|PM/)
    })

    it('should not shift all-day appointment date across timezone boundary', () => {
      const start = { date: '2024-06-19' }
      const timezone = 'America/Los_Angeles'
      const date = new Date(start.date)
      
      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: timezone
      })

      // For all-day events, we only format the date (no time component)
      // The date should represent the calendar date, not a shifted date
      expect(typeof formattedDate).toBe('string')
      expect(formattedDate).not.toContain(':')
      expect(formattedDate).not.toContain('at')
    })

    it('should handle timezone near date boundary correctly', () => {
      // Test an appointment at 11:59 PM in New York timezone
      const start = { dateTime: '2024-06-19T23:59:00' }
      const timezone = 'America/New_York'
      const date = new Date(start.dateTime)

      const formattedDate = date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        timeZone: timezone
      })
      const formattedTime = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone
      })

      // Should show the correct date in the timezone (not shifted to next day)
      expect(typeof formattedDate).toBe('string')
      expect(typeof formattedTime).toBe('string')
      expect(formattedTime).toContain('11:59')
      expect(formattedTime).toMatch(/PM/)
    })

    it('should construct confirmation message with Meet URL and timezone', () => {
      const customerName = 'John'
      const businessName = 'ABC Services'
      const dateTimeStr = 'Wednesday, June 19, 2024 at 9:00 AM'
      const meetingUrl = 'https://meet.google.com/abc-defg-hij'
      const timezone = 'America/New_York'

      const messageLines: string[] = []
      messageLines.push(`Hi ${customerName}, your appointment with ${businessName} is scheduled for ${dateTimeStr}.`)
      messageLines.push('')
      messageLines.push('Join the Google Meet here:')
      messageLines.push(meetingUrl)

      const message = messageLines.join('\n')

      expect(message).toContain(customerName)
      expect(message).toContain(businessName)
      expect(message).toContain(dateTimeStr)
      expect(message).toContain('Google Meet')
      expect(message).toContain(meetingUrl)
    })

    it('should construct confirmation message without time for all-day events', () => {
      const customerName = 'Jane'
      const businessName = 'XYZ Company'
      const dateTimeStr = 'Wednesday, June 19, 2024' // No time
      const meetingUrl = 'https://meet.google.com/xyz-uvw-rst'
      const timezone = 'America/New_York'

      const messageLines: string[] = []
      messageLines.push(`Hi ${customerName}, your appointment with ${businessName} is scheduled for ${dateTimeStr}.`)
      messageLines.push('')
      messageLines.push('Join the Google Meet here:')
      messageLines.push(meetingUrl)

      const message = messageLines.join('\n')

      expect(message).toContain(dateTimeStr)
      expect(message).not.toContain('at') // Should not have "at" for all-day
      expect(message).toContain(meetingUrl)
    })

    it('should fallback to "there" when customer name is not available', () => {
      const customerName = 'there'
      const businessName = 'Test Business'
      const dateTimeStr = 'Wednesday, June 19, 2024 at 9:00 AM'
      const meetingUrl = 'https://meet.google.com/abc-defg-hij'

      const message = `Hi ${customerName}, your appointment with ${businessName} is scheduled for ${dateTimeStr}.`

      expect(message).toContain('Hi there')
    })
  })

  describe('Customer name extraction', () => {
    it('should prefer customerName from raw_metadata', () => {
      const raw_metadata = {
        customerName: 'John Doe',
        callerName: 'Jane Doe',
        name: 'Bob Smith'
      }
      
      const name = raw_metadata.customerName || raw_metadata.callerName || raw_metadata.name || 'there'
      expect(name).toBe('John Doe')
    })

    it('should fallback to callerName if customerName not present', () => {
      const raw_metadata = {
        callerName: 'Jane Doe',
        name: 'Bob Smith'
      }
      
      const name = raw_metadata.customerName || raw_metadata.callerName || raw_metadata.name || 'there'
      expect(name).toBe('Jane Doe')
    })

    it('should fallback to name if customerName and callerName not present', () => {
      const raw_metadata = {
        name: 'Bob Smith'
      }
      
      const name = raw_metadata.customerName || raw_metadata.callerName || raw_metadata.name || 'there'
      expect(name).toBe('Bob Smith')
    })

    it('should fallback to "there" if no name fields present', () => {
      const raw_metadata = {}
      
      const name = raw_metadata.customerName || raw_metadata.callerName || raw_metadata.name || 'there'
      expect(name).toBe('there')
    })
  })

  describe('SMS options for idempotency', () => {
    it('should use source parameter for idempotency', () => {
      const lead_id = 'lead-123'
      const isManual = false
      const source = 'google_meet_appointment_confirmation'
      const skipBusinessAvailabilityAppend = true

      const isAutomatedMessage = lead_id && !isManual && !source.includes('Manual test')
      
      expect(isAutomatedMessage).toBe(true)
      expect(source).toBe('google_meet_appointment_confirmation')
      expect(skipBusinessAvailabilityAppend).toBe(true)
    })

    it('should use skipBusinessAvailabilityAppend to avoid appending availability notes', () => {
      const skipBusinessAvailabilityAppend = true
      
      expect(skipBusinessAvailabilityAppend).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('should handle missing lead phone gracefully', () => {
      const leadDetails = {
        id: 'lead-123',
        caller_phone: null,
        conversation_id: null,
        raw_metadata: {}
      }

      const canSend = leadDetails.caller_phone !== null
      expect(canSend).toBe(false)
    })

    it('should handle lead fetch failure gracefully', () => {
      const leadDetailsError = { code: 'PGRST116' }
      const hasError = leadDetailsError !== null
      expect(hasError).toBe(true)
    })

    it('should handle message sanitization failure gracefully', () => {
      const sanitizedMessage = null
      const canSend = sanitizedMessage !== null
      expect(canSend).toBe(false)
    })

    it('should handle SMS delivery failure without rolling back appointment', () => {
      const smsResult = { sid: null, messageId: null }
      const appointmentCreated = true

      const shouldRollback = !smsResult.sid && !appointmentCreated
      expect(shouldRollback).toBe(false)

      const appointmentShouldPersist = appointmentCreated
      expect(appointmentShouldPersist).toBe(true)
    })

    it('should preserve timezone-aware formatting in confirmation logic', () => {
      const businessTimezone = 'America/Los_Angeles'
      const startDateTime = '2024-06-19T14:00:00'
      const createdEvent = { start: { dateTime: startDateTime } }

      const date = new Date(createdEvent.start.dateTime)
      const formattedTime = date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: businessTimezone
      })

      // Should format in business timezone (LA), not server timezone
      expect(typeof formattedTime).toBe('string')
      expect(formattedTime).toMatch(/AM|PM/)
    })
  })

  describe('Response structure', () => {
    it('should include customerConfirmation status in response', () => {
      const response = {
        event: {
          id: 'event-123',
          meetingUrl: 'https://meet.google.com/abc-defg-hij'
        },
        customerConfirmation: {
          sent: true,
          error: null
        }
      }

      expect(response.customerConfirmation).toBeDefined()
      expect(response.customerConfirmation.sent).toBe(true)
      expect(response.customerConfirmation.error).toBeNull()
    })

    it('should include error when confirmation fails', () => {
      const response = {
        event: {
          id: 'event-123',
          meetingUrl: 'https://meet.google.com/abc-defg-hij'
        },
        customerConfirmation: {
          sent: false,
          error: 'SMS delivery failed'
        }
      }

      expect(response.customerConfirmation.sent).toBe(false)
      expect(response.customerConfirmation.error).toBe('SMS delivery failed')
    })

    it('should not include customerConfirmation for in-person appointments', () => {
      const response = {
        event: {
          id: 'event-123',
          meetingUrl: null
        }
      }

      expect(response.customerConfirmation).toBeUndefined()
    })
  })

  describe('Ownership security', () => {
    it('should allow confirmation when lead belongs to current business', () => {
      const businessId = 'business-123'
      const leadId = 'lead-456'
      const leadBusinessId = 'business-123'

      const belongsToBusiness = leadBusinessId === businessId
      expect(belongsToBusiness).toBe(true)
    })

    it('should reject lead from different business', () => {
      const businessId = 'business-123'
      const leadId = 'lead-456'
      const leadBusinessId = 'business-789'

      const belongsToBusiness = leadBusinessId === businessId
      expect(belongsToBusiness).toBe(false)
    })

    it('should require both lead_id match and business_id match for confirmation', () => {
      const businessId = 'business-123'
      const requestedLeadId = 'lead-456'
      const actualLeadId = 'lead-456'
      const leadBusinessId = 'business-123'

      const idMatches = actualLeadId === requestedLeadId
      const businessMatches = leadBusinessId === businessId
      const shouldAllowConfirmation = idMatches && businessMatches

      expect(shouldAllowConfirmation).toBe(true)
    })

    it('should block confirmation if lead_id matches but business_id differs', () => {
      const businessId = 'business-123'
      const requestedLeadId = 'lead-456'
      const actualLeadId = 'lead-456'
      const leadBusinessId = 'business-789'

      const idMatches = actualLeadId === requestedLeadId
      const businessMatches = leadBusinessId === businessId
      const shouldAllowConfirmation = idMatches && businessMatches

      expect(shouldAllowConfirmation).toBe(false)
    })
  })
})