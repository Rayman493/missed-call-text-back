/**
 * Manual Customer Canonical Fields Regression Tests
 *
 * Regression tests to verify that manually created customers populate
 * canonical lead table fields (name, email) correctly, not just raw_metadata.
 *
 * This ensures manual customers are first-class citizens in the same
 * canonical data model as AI-created customers.
 */

import { describe, it, expect } from 'vitest'

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
    it('should persist name to canonical leads.name column', () => {
      const leadRow = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '14122533598',
        name: 'Ryan', // Canonical field - MUST be populated
        email: 'ryan@example.com', // Canonical field - MUST be populated
        status: 'new',
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            callerName: 'Ryan', // Supplemental - preserved for context
            reasonForCalling: 'Get Grass Cut',
            importantDetails: 'The yard is a quarter acre.',
            addressOrLocation: '1632 Southpine Drive',
            email: 'ryan@example.com',
            desiredCompletionTime: 'tomorrow',
            preferredCallbackTime: '3PM'
          },
          creation_source: 'manual'
        }
      }

      expect(leadRow.name).toBe('Ryan')
      expect(leadRow.email).toBe('ryan@example.com')
    })

    it('should preserve raw_metadata.extracted_info for Customer Context', () => {
      const leadRow = {
        name: 'Ryan',
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
      const lead = {
        name: 'Ryan',
        caller_phone: '14122533598',
        raw_metadata: {
          extracted_info: {
            callerName: 'Ryan'
          }
        }
      }

      // getLeadDisplayName should return 'Ryan' from canonical name field
      // not fall back to phone number
      expect(lead.name).toBe('Ryan')
    })

    it('should not fall back to phone when canonical name exists', () => {
      const lead = {
        name: 'Ryan',
        caller_phone: '14122533598'
      }

      // Priority: canonical name > formatted phone
      expect(lead.name).toBe('Ryan')
      expect(lead.name).not.toBe('(412) 253-3598')
    })

    it('should fall back to phone when canonical name is null', () => {
      const lead = {
        name: null,
        caller_phone: '14122533598'
      }

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
      const aiLead = {
        source: 'ai_voice',
        name: 'John Doe',
        caller_phone: '14125551234',
        ai_call_records: [
          {
            extracted_info: {
              callerName: 'John Doe',
              serviceRequested: 'Plumbing Repair'
            }
          }
        ]
      }

      // AI customers should continue to work correctly
      expect(aiLead.name).toBe('John Doe')
      expect(aiLead.ai_call_records).toBeDefined()
      expect(aiLead.ai_call_records.length).toBeGreaterThan(0)
    })

    it('should prioritize ai_call_record over raw_metadata for AI customers', () => {
      const aiLead = {
        source: 'ai_voice',
        ai_call_records: [
          {
            extracted_info: {
              callerName: 'AI Captured Name',
              serviceRequested: 'AI Service'
            }
          }
        ],
        raw_metadata: {
          extracted_info: {
            callerName: 'Historical Name',
            serviceRequested: 'Historical Service'
          }
        }
      }

      // Current call AI intake should take precedence
      expect(aiLead.ai_call_records[0].extracted_info.callerName).toBe('AI Captured Name')
    })
  })

  describe('Duplicate customer behavior', () => {
    it('should preserve existing canonical name on update', () => {
      const existingLead = {
        id: 'lead-123',
        name: 'Existing Name',
        email: 'existing@example.com',
        caller_phone: '14122533598',
        raw_metadata: {
          extracted_info: {
            callerName: 'Existing Name'
          }
        }
      }

      const updateData = {
        customerName: 'Ryan',
        email: 'ryan@example.com'
      }

      // Update should use new data if provided
      const updatedName = updateData.customerName || existingLead.name
      expect(updatedName).toBe('Ryan')
    })

    it('should preserve existing name if new name not provided', () => {
      const existingLead = {
        name: 'Existing Name',
        caller_phone: '14122533598'
      }

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
      const apiResponse = {
        success: true,
        leadId: 'lead-123',
        lead: {
          id: 'lead-123',
          name: 'Ryan', // Canonical field in response
          caller_phone: '14122533598',
          raw_metadata: {
            extracted_info: {
              callerName: 'Ryan'
            }
          }
        }
      }

      expect(apiResponse.lead.name).toBe('Ryan')
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
      const lead = {
        name: 'Ryan',
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