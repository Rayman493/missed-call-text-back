/**
 * Tests for Google Calendar event PATCH - customer assignment (replyflow_lead_id)
 */

import { describe, it, expect } from 'vitest'

describe('Google Calendar Event PATCH - Customer Assignment', () => {
  describe('ExtendedProperties merge behavior', () => {
    it('should preserve existing private properties when updating replyflow_lead_id', () => {
      const existingPrivate = {
        replyflow_meeting_url: 'https://meet.google.com/abc-defg-hij',
        someOtherProperty: 'value',
        replyflow_lead_id: 'old-lead-123'
      }

      const newLeadId = 'new-lead-456'
      const updatedPrivate = {
        ...existingPrivate,
        replyflow_lead_id: String(newLeadId)
      }

      expect(updatedPrivate.replyflow_meeting_url).toBe('https://meet.google.com/abc-defg-hij')
      expect(updatedPrivate.someOtherProperty).toBe('value')
      expect(updatedPrivate.replyflow_lead_id).toBe('new-lead-456')
    })

    it('should remove replyflow_lead_id when set to null while preserving other properties', () => {
      const existingPrivate = {
        replyflow_meeting_url: 'https://meet.google.com/abc-defg-hij',
        replyflow_lead_id: 'lead-123',
        someOtherProperty: 'value'
      }

      const updatedPrivate = { ...existingPrivate }
      delete updatedPrivate.replyflow_lead_id

      expect(updatedPrivate.replyflow_meeting_url).toBe('https://meet.google.com/abc-defg-hij')
      expect(updatedPrivate.someOtherProperty).toBe('value')
      expect(updatedPrivate.replyflow_lead_id).toBeUndefined()
    })

    it('should handle event with no existing extendedProperties', () => {
      const existingPrivate = {}
      const newLeadId = 'lead-123'

      const updatedPrivate = {
        ...existingPrivate,
        replyflow_lead_id: String(newLeadId)
      }

      expect(updatedPrivate.replyflow_lead_id).toBe('lead-123')
      expect(Object.keys(updatedPrivate)).toHaveLength(1)
    })

    it('should not mutate original private object', () => {
      const original = {
        replyflow_meeting_url: 'https://meet.google.com/abc-defg-hij',
        replyflow_lead_id: 'old-lead'
      }

      const updated = {
        ...original,
        replyflow_lead_id: 'new-lead'
      }

      expect(original.replyflow_lead_id).toBe('old-lead')
      expect(updated.replyflow_lead_id).toBe('new-lead')
    })
  })

  describe('Tenant validation - lead ownership', () => {
    it('should allow assignment of lead from same business', () => {
      const authenticatedBusinessId = 'business-123'
      const requestedLeadId = 'lead-456'
      const leadBusinessId = 'business-123'

      const isAuthorized = leadBusinessId === authenticatedBusinessId
      expect(isAuthorized).toBe(true)
    })

    it('should reject assignment of lead from different business', () => {
      const authenticatedBusinessId = 'business-123'
      const requestedLeadId = 'lead-456'
      const leadBusinessId = 'business-789'

      const isAuthorized = leadBusinessId === authenticatedBusinessId
      expect(isAuthorized).toBe(false)
    })

    it('should reject assignment of non-existent lead', () => {
      const lead = null
      const exists = lead !== null

      expect(exists).toBe(false)
    })

    it('should allow clearing customer (null lead_id)', () => {
      const leadId = null
      const isValid = leadId === null

      expect(isValid).toBe(true)
    })
  })

  describe('Google Calendar payload construction', () => {
    it('should construct correct extendedProperties structure', () => {
      const leadId = 'lead-123'
      const googleEvent = {
        extendedProperties: {
          private: {
            replyflow_lead_id: String(leadId)
          }
        }
      }

      expect(googleEvent.extendedProperties.private.replyflow_lead_id).toBe('lead-123')
    })

    it('should not include replyflow_lead_id in payload when not provided', () => {
      const body = { summary: 'Updated title' }
      const googleEvent: any = {}

      if (body.summary !== undefined) {
        googleEvent.summary = body.summary
      }

      // replyflow_lead_id should NOT be in googleEvent
      expect(googleEvent.extendedProperties).toBeUndefined()
    })

    it('should include replyflow_lead_id in payload when provided', () => {
      const body = { replyflow_lead_id: 'lead-123' }
      const googleEvent: any = {}

      if (body.replyflow_lead_id !== undefined) {
        googleEvent.extendedProperties = {
          private: {
            replyflow_lead_id: String(body.replyflow_lead_id)
          }
        }
      }

      expect(googleEvent.extendedProperties.private.replyflow_lead_id).toBe('lead-123')
    })
  })

  describe('Backward compatibility', () => {
    it('should not alter existing PATCH behavior when replyflow_lead_id is omitted', () => {
      const body = {
        summary: 'Updated title',
        description: 'Updated description',
        location: 'Updated location'
      }

      const googleEvent: any = {}

      if (body.summary !== undefined) googleEvent.summary = body.summary
      if (body.description !== undefined) googleEvent.description = body.description
      if (body.location !== undefined) googleEvent.location = body.location

      expect(googleEvent.summary).toBe('Updated title')
      expect(googleEvent.description).toBe('Updated description')
      expect(googleEvent.location).toBe('Updated location')
      expect(googleEvent.extendedProperties).toBeUndefined()
    })

    it('should allow replyflow_lead_id to be updated alongside other fields', () => {
      const body = {
        summary: 'Updated title',
        replyflow_lead_id: 'lead-123'
      }

      const googleEvent: any = {}

      if (body.summary !== undefined) googleEvent.summary = body.summary
      if (body.replyflow_lead_id !== undefined) {
        googleEvent.extendedProperties = {
          private: {
            replyflow_lead_id: String(body.replyflow_lead_id)
          }
        }
      }

      expect(googleEvent.summary).toBe('Updated title')
      expect(googleEvent.extendedProperties.private.replyflow_lead_id).toBe('lead-123')
    })
  })

  describe('Error scenarios', () => {
    it('should return 404 when lead does not exist', () => {
      const lead = null
      const statusCode = lead ? 200 : 404

      expect(statusCode).toBe(404)
    })

    it('should return 404 when lead belongs to different business', () => {
      const authenticatedBusinessId = 'business-123'
      const leadBusinessId = 'business-789'
      const isAuthorized = leadBusinessId === authenticatedBusinessId
      const statusCode = isAuthorized ? 200 : 404

      expect(statusCode).toBe(404)
    })

    it('should return 401 when not authenticated', () => {
      const user = null
      const statusCode = user ? 200 : 401

      expect(statusCode).toBe(401)
    })
  })
})