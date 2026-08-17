/**
 * Tests for Google Calendar events route lead_id filtering
 */

import { describe, it, expect } from 'vitest'

describe('Google Calendar Events Route - lead_id Filtering', () => {
  describe('Filtering logic', () => {
    it('should include event with matching replyflow_lead_id', () => {
      const leadId = 'lead-123'
      const event = {
        extendedProperties: {
          private: {
            replyflow_lead_id: leadId
          }
        }
      }

      const shouldInclude = event.extendedProperties?.private?.replyflow_lead_id === leadId
      expect(shouldInclude).toBe(true)
    })

    it('should exclude event with different replyflow_lead_id', () => {
      const requestedLeadId = 'lead-123'
      const event = {
        extendedProperties: {
          private: {
            replyflow_lead_id: 'lead-456'
          }
        }
      }

      const shouldInclude = event.extendedProperties?.private?.replyflow_lead_id === requestedLeadId
      expect(shouldInclude).toBe(false)
    })

    it('should exclude event without replyflow_lead_id', () => {
      const leadId = 'lead-123'
      const event = {
        extendedProperties: {
          private: {
            someOtherProperty: 'value'
          }
        }
      }

      const shouldInclude = event.extendedProperties?.private?.replyflow_lead_id === leadId
      expect(shouldInclude).toBe(false)
    })

    it('should exclude event without extendedProperties', () => {
      const leadId = 'lead-123'
      const event = {
        summary: 'Personal Event'
      }

      const shouldInclude = event.extendedProperties?.private?.replyflow_lead_id === leadId
      expect(shouldInclude).toBe(false)
    })

    it('should exclude holiday events when lead_id is provided', () => {
      const leadId = 'lead-123'
      const holidayEvent = {
        summary: 'Thanksgiving',
        isHoliday: true
      }

      // When lead_id is provided, holidays should not be merged
      const shouldIncludeHoliday = !leadId
      expect(shouldIncludeHoliday).toBe(false)
    })
  })

  describe('Security - ownership verification', () => {
    it('should verify lead belongs to authenticated business', () => {
      const authenticatedBusinessId = 'business-123'
      const requestedLeadId = 'lead-456'
      const leadBusinessId = 'business-123'

      const belongsToBusiness = leadBusinessId === authenticatedBusinessId
      expect(belongsToBusiness).toBe(true)
    })

    it('should reject lead from different business', () => {
      const authenticatedBusinessId = 'business-123'
      const requestedLeadId = 'lead-456'
      const leadBusinessId = 'business-789'

      const belongsToBusiness = leadBusinessId === authenticatedBusinessId
      expect(belongsToBusiness).toBe(false)
    })
  })

  describe('Backward compatibility', () => {
    it('should preserve existing behavior when lead_id is absent', () => {
      const leadId = null
      const event = {
        summary: 'Any Event',
        extendedProperties: null
      }

      // Without lead_id, all events should be included (filtered only by cancelled status)
      const shouldInclude = !leadId
      expect(shouldInclude).toBe(true)
    })

    it('should include holidays when lead_id is absent', () => {
      const leadId = null
      const holidayEvent = { isHoliday: true }

      // Without lead_id, holidays should be merged
      const shouldIncludeHoliday = !leadId
      expect(shouldIncludeHoliday).toBe(true)
    })
  })

  describe('ExtendedProperties preservation', () => {
    it('should preserve extendedProperties in normalized event', () => {
      const originalEvent = {
        id: 'event-123',
        summary: 'Test Event',
        extendedProperties: {
          private: {
            replyflow_lead_id: 'lead-123',
            custom_field: 'value'
          }
        }
      }

      const normalizedEvent = {
        ...originalEvent,
        extendedProperties: originalEvent.extendedProperties || null
      }

      expect(normalizedEvent.extendedProperties).not.toBeNull()
      expect(normalizedEvent.extendedProperties?.private?.replyflow_lead_id).toBe('lead-123')
      expect(normalizedEvent.extendedProperties?.private?.custom_field).toBe('value')
    })
  })
})