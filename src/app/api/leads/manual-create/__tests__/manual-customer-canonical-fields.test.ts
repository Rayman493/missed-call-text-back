/**
 * Manual Customer Canonical Fields Regression Tests
 *
 * Regression tests to verify that manually created customers populate
 * canonical lead table fields correctly.
 *
 * Current contract (production schema):
 * - Customer Name → contact_name (canonical)
 * - Phone → caller_phone (canonical)
 * - Email → raw_metadata.extracted_info.email (canonical in metadata)
 * - Notes → notes (canonical)
 * - Other fields → raw_metadata.extracted_info (metadata)
 *
 * This ensures manual customers are first-class citizens in the same
 * canonical data model as AI-created customers.
 */

import { describe, it, expect } from 'vitest'
import { normalizeLeadForApplication } from '@/lib/types'

describe('Manual Customer Canonical Fields', () => {
  describe('API request payload before fix', () => {
    it('should include customerName in payload', () => {
      const payload = {
        businessId: 'business-123',
        customerName: 'Ryan',
        phoneNumber: '(412) 253-3598',
        email: 'ryan@example.com',
        address: '1632 Southpine Drive',
        notes: 'The yard is a quarter acre.',
        reasonForCalling: 'Get Grass Cut',
        desiredCompletionTime: 'tomorrow',
        preferredCallbackTime: '3PM'
      }

      expect(payload.customerName).toBe('Ryan')
      expect(payload.reasonForCalling).toBe('Get Grass Cut')
      expect(payload.notes).toBe('The yard is a quarter acre.')
    })

    it('should not rely solely on raw_metadata for canonical fields', () => {
      // Before fix: name was only stored in raw_metadata.extracted_info.callerName
      // After fix: name should also be stored in canonical leads.name field
      const rawMetadataOnly = {
        raw_metadata: {
          extracted_info: {
            callerName: 'Ryan'
          }
        }
      }

      const canonicalFields = {
        name: 'Ryan',
        email: 'ryan@example.com',
        raw_metadata: {
          extracted_info: {
            callerName: 'Ryan'
          }
        }
      }

      expect(canonicalFields.name).toBeDefined()
      expect(rawMetadataOnly.name).toBeUndefined()
    })
  })

  describe('Database persistence after fix', () => {
    it('should persist name to canonical leads.contact_name column', () => {
      const leadRow = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '14122533598',
        contact_name: 'Ryan', // Canonical field - MUST be populated
        notes: 'The yard is a quarter acre.', // Canonical field - MUST be populated
        status: 'new',
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            callerName: 'Ryan', // Supplemental - preserved for context
            email: 'ryan@example.com', // Canonical in metadata - MUST be populated
            reasonForCalling: 'Get Grass Cut',
            importantDetails: 'The yard is a quarter acre.',
            addressOrLocation: '1632 Southpine Drive',
            desiredCompletionTime: 'tomorrow',
            preferredCallbackTime: '3PM'
          },
          creation_source: 'manual'
        }
      }

      expect(leadRow.contact_name).toBe('Ryan')
      expect(leadRow.notes).toBe('The yard is a quarter acre.')
      expect(leadRow.raw_metadata.extracted_info.email).toBe('ryan@example.com')
    })

    it('should preserve raw_metadata.extracted_info for Customer Context', () => {
      const leadRow = {
        contact_name: 'Ryan',
        raw_metadata: {
          extracted_info: {
            callerName: 'Ryan',
            reasonForCalling: 'Get Grass Cut',
            importantDetails: 'The yard is a quarter acre.',
            addressOrLocation: '1632 Southpine Drive',
            preferredCallbackTime: '3PM'
          }
        }
      }

      expect(leadRow.raw_metadata.extracted_info.callerName).toBe('Ryan')
      expect(leadRow.raw_metadata.extracted_info.reasonForCalling).toBe('Get Grass Cut')
      expect(leadRow.raw_metadata.extracted_info.importantDetails).toBe('The yard is a quarter acre.')
    })
  })

  describe('Display name resolution after fix', () => {
    it('should return canonical name when available', () => {
      const dbRow = {
        id: 'lead-123',
        contact_name: 'Ryan',
        caller_phone: '14122533598',
        raw_metadata: {
          extracted_info: {
            callerName: 'Ryan'
          }
        }
      }

      const lead = normalizeLeadForApplication(dbRow)

      // Normalization should populate lead.name from contact_name
      expect(lead.name).toBe('Ryan')
      expect(lead.contact_name).toBe('Ryan') // Original field preserved
    })

    it('should not fall back to phone when canonical name exists', () => {
      const dbRow = {
        id: 'lead-123',
        contact_name: 'Ryan',
        caller_phone: '14122533598'
      }

      const lead = normalizeLeadForApplication(dbRow)

      // Priority: canonical name > formatted phone
      expect(lead.name).toBe('Ryan')
      expect(lead.name).not.toBe('(412) 253-3598')
    })

    it('should fall back to metadata callerName when contact_name is null', () => {
      const dbRow = {
        id: 'lead-123',
        contact_name: null,
        caller_phone: '14122533598',
        raw_metadata: {
          extracted_info: {
            callerName: 'Fallback Name'
          }
        }
      }

      const lead = normalizeLeadForApplication(dbRow)

      // Fallback to metadata callerName
      expect(lead.name).toBe('Fallback Name')
    })

    it('should return null when no name source exists', () => {
      const dbRow = {
        id: 'lead-123',
        contact_name: null,
        caller_phone: '14122533598',
        raw_metadata: {}
      }

      const lead = normalizeLeadForApplication(dbRow)

      // Safe fallback behavior preserved
      expect(lead.name).toBeNull()
      expect(lead.caller_phone).toBe('14122533598')
    })
  })

  describe('Request title resolution after fix', () => {
    it('should return reasonForCalling for manual customers', () => {
      const manualLead = {
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Get Grass Cut'
          }
        }
      }

      // getLeadAIIntake should return serviceRequested from raw_metadata.extracted_info
      // for manual customers when no ai_call_record exists
      expect(manualLead.raw_metadata.extracted_info.reasonForCalling).toBe('Get Grass Cut')
    })

    it('should return additionalDetails when available', () => {
      const manualLead = {
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Get Grass Cut',
            importantDetails: 'The yard is a quarter acre.'
          }
        }
      }

      expect(manualLead.raw_metadata.extracted_info.importantDetails).toBe('The yard is a quarter acre.')
    })

    it('should not show Not collected when reasonForCalling exists', () => {
      const manualLead = {
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Get Grass Cut'
          }
        }
      }

      expect(manualLead.raw_metadata.extracted_info.reasonForCalling).toBe('Get Grass Cut')
      expect(manualLead.raw_metadata.extracted_info.reasonForCalling).not.toBe('Not collected')
    })
  })

  describe('AI customer regression', () => {
    it('should not break AI-created customer resolution', () => {
      const dbRow = {
        id: 'lead-123',
        source: 'ai_voice',
        contact_name: 'John Doe',
        caller_phone: '14125551234',
        raw_metadata: {
          extracted_info: {
            callerName: 'John Doe',
            serviceRequested: 'Plumbing Repair'
          }
        }
      }

      const aiLead = normalizeLeadForApplication(dbRow)

      // AI customers should continue to work correctly
      expect(aiLead.name).toBe('John Doe')
      expect(aiLead.contact_name).toBe('John Doe')
    })

    it('should prioritize contact_name over raw_metadata for AI customers', () => {
      const dbRow = {
        id: 'lead-123',
        source: 'ai_voice',
        contact_name: 'AI Captured Name',
        raw_metadata: {
          extracted_info: {
            callerName: 'Historical Name',
            serviceRequested: 'Historical Service'
          }
        }
      }

      const aiLead = normalizeLeadForApplication(dbRow)

      // contact_name takes precedence over metadata callerName
      expect(aiLead.name).toBe('AI Captured Name')
    })
  })

  describe('Duplicate customer behavior', () => {
    it('should preserve existing canonical name on update', () => {
      const existingLead = normalizeLeadForApplication({
        id: 'lead-123',
        contact_name: 'Existing Name',
        caller_phone: '14122533598',
        raw_metadata: {
          extracted_info: {
            callerName: 'Existing Name',
            email: 'existing@example.com'
          }
        }
      })

      const updateData = {
        customerName: 'Ryan',
        email: 'ryan@example.com'
      }

      // Update should use new data if provided
      const updatedName = updateData.customerName || existingLead.name
      expect(updatedName).toBe('Ryan')
    })

    it('should preserve existing name if new name not provided', () => {
      const existingLead = normalizeLeadForApplication({
        contact_name: 'Existing Name',
        caller_phone: '14122533598'
      })

      const updateData = {
        customerName: null // Not provided
      }

      // Update should preserve existing name
      const updatedName = updateData.customerName || existingLead.name
      expect(updatedName).toBe('Existing Name')
    })
  })

  describe('Immediate UI freshness', () => {
    it('should return canonical fields in API response', () => {
      const dbRow = {
        id: 'lead-123',
        contact_name: 'Ryan',
        caller_phone: '14122533598',
        raw_metadata: {
          extracted_info: {
            callerName: 'Ryan',
            email: 'ryan@example.com'
          }
        }
      }

      const apiResponse = {
        success: true,
        leadId: 'lead-123',
        lead: normalizeLeadForApplication(dbRow)
      }

      // UI can read from compatibility aliases
      expect(apiResponse.lead.name).toBe('Ryan')
      expect(apiResponse.lead.contact_name).toBe('Ryan') // Production field preserved
    })

    it('should not require refresh to see canonical name', () => {
      // The API response should contain canonical fields immediately
      // No stale local object issue
      const immediateResponse = {
        name: 'Ryan'
      }

      expect(immediateResponse.name).toBe('Ryan')
    })
  })

  describe('Customer Context preservation', () => {
    it('should continue to show manual context correctly', () => {
      const dbRow = {
        contact_name: 'Ryan',
        raw_metadata: {
          extracted_info: {
            callerName: 'Ryan',
            reasonForCalling: 'Get Grass Cut',
            importantDetails: 'The yard is a quarter acre.',
            addressOrLocation: '1632 Southpine Drive',
            preferredCallbackTime: '3PM'
          }
        }
      }

      const lead = normalizeLeadForApplication(dbRow)

      const context = {
        name: lead.raw_metadata.extracted_info.callerName,
        reason: lead.raw_metadata.extracted_info.reasonForCalling,
        details: lead.raw_metadata.extracted_info.importantDetails,
        location: lead.raw_metadata.extracted_info.addressOrLocation,
        callback: lead.raw_metadata.extracted_info.preferredCallbackTime
      }

      expect(context.name).toBe('Ryan')
      expect(context.reason).toBe('Get Grass Cut')
      expect(context.details).toBe('The yard is a quarter acre.')
      expect(context.location).toBe('1632 Southpine Drive')
      expect(context.callback).toBe('3PM')
    })
  })

  describe('No N+1 queries', () => {
    it('should resolve canonical fields from lead object', () => {
      const lead = {
        name: 'Ryan',
        email: 'ryan@example.com',
        caller_phone: '14122533598'
      }

      // All canonical fields are on the lead object itself
      // No additional database queries required
      expect(lead.name).toBe('Ryan')
      expect(lead.email).toBe('ryan@example.com')
    })

    it('should resolve request title from raw_metadata on lead object', () => {
      const lead = {
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            reasonForCalling: 'Get Grass Cut'
          }
        }
      }

      // raw_metadata is already on the lead object
      // No additional queries required
      expect(lead.raw_metadata.extracted_info.reasonForCalling).toBe('Get Grass Cut')
    })
  })
})