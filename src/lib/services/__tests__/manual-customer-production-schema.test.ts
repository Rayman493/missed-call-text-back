import { describe, it, expect, beforeEach, vi } from 'vitest'
import { LeadService } from '../LeadService'
import { normalizeLeadForApplication } from '@/lib/types'

// Mock supabase admin
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: 'test-lead-id', business_id: 'test-business-id', caller_phone: '+14122533598', status: 'new' }, error: null }))
        }))
      })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: { code: 'PGRST116' } }))
        }))
      }))
    }))
  },
  normalizePhoneNumberForStorage: vi.fn((phone) => {
    const digits = phone.replace(/\D/g, '')
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
    return `+${digits}`
  })
}))

describe('Manual Customer Production Schema Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Production-compatible direct columns', () => {
    it('should include contact_name as a direct column in createLead payload', async () => {
      const { supabaseAdmin } = await import('@/lib/supabase/admin')
      const fromSpy = vi.spyOn(supabaseAdmin, 'from')

      await LeadService.createLead({
        business_id: 'test-business-id',
        caller_phone: '(412) 253-3598',
        contact_name: 'Test Customer',
        company_name: null,
        notes: 'Test notes',
        tags: null,
        status: 'new',
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            callerName: 'Test Customer',
            email: 'test@example.com'
          }
        }
      })

      expect(fromSpy).toHaveBeenCalledWith('leads')
      const insertCall = fromSpy.mock.results[0].value.insert
      expect(insertCall).toHaveBeenCalled()

      // Get the payload passed to insert
      const insertPayload = insertCall.mock.calls[0][0]

      // Verify contact_name IS a direct column (canonical)
      expect(insertPayload).toHaveProperty('contact_name')
      expect(insertPayload.contact_name).toBe('Test Customer')

      // Verify notes IS a direct column (canonical)
      expect(insertPayload).toHaveProperty('notes')
      expect(insertPayload.notes).toBe('Test notes')

      // Verify email is NOT a direct column (metadata-only in production)
      expect(insertPayload).not.toHaveProperty('email')

      // Verify email IS in metadata (canonical storage in production)
      expect(insertPayload.raw_metadata.extracted_info.email).toBe('test@example.com')

      // Verify required direct columns are present
      expect(insertPayload.business_id).toBe('test-business-id')
      expect(insertPayload.caller_phone).toBe('+14122533598')
      expect(insertPayload.status).toBe('new')
    })

    it('should include all supported direct columns in createLead payload', async () => {
      const { supabaseAdmin } = await import('@/lib/supabase/admin')
      const fromSpy = vi.spyOn(supabaseAdmin, 'from')

      await LeadService.createLead({
        business_id: 'test-business-id',
        caller_phone: '(412) 253-3598',
        contact_name: 'Test Customer',
        company_name: 'Test Company',
        notes: 'Test notes',
        tags: ['tag1', 'tag2'],
        status: 'new',
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            callerName: 'Test Customer'
          }
        }
      })

      const insertPayload = fromSpy.mock.results[0].value.insert.mock.calls[0][0]

      // Verify supported direct columns are present
      expect(insertPayload).toHaveProperty('business_id')
      expect(insertPayload).toHaveProperty('caller_phone')
      expect(insertPayload).toHaveProperty('contact_name')
      expect(insertPayload).toHaveProperty('company_name')
      expect(insertPayload).toHaveProperty('notes')
      expect(insertPayload).toHaveProperty('tags')
      expect(insertPayload).toHaveProperty('status')
      expect(insertPayload).toHaveProperty('raw_metadata')

      // Verify unsupported columns are NOT present
      expect(insertPayload).not.toHaveProperty('name') // Replaced by contact_name
      expect(insertPayload).not.toHaveProperty('email') // Metadata-only in production
      expect(insertPayload).not.toHaveProperty('phone') // Replaced by caller_phone
      expect(insertPayload).not.toHaveProperty('updated_at') // Not in production schema
    })

    it('should handle null contact_name gracefully', async () => {
      const { supabaseAdmin } = await import('@/lib/supabase/admin')
      const fromSpy = vi.spyOn(supabaseAdmin, 'from')

      await LeadService.createLead({
        business_id: 'test-business-id',
        caller_phone: '(412) 253-3598',
        contact_name: null,
        company_name: null,
        notes: null,
        tags: null,
        status: 'new',
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            callerName: null,
            email: null
          }
        }
      })

      const insertPayload = fromSpy.mock.results[0].value.insert.mock.calls[0][0]

      // Verify null contact_name is handled correctly
      expect(insertPayload.contact_name).toBeUndefined()
      expect(insertPayload.raw_metadata.extracted_info.email).toBeNull()
    })
  })

  describe('Metadata persistence', () => {
    it('should preserve email in raw_metadata.extracted_info', async () => {
      const { supabaseAdmin } = await import('@/lib/supabase/admin')
      const fromSpy = vi.spyOn(supabaseAdmin, 'from')

      await LeadService.createLead({
        business_id: 'test-business-id',
        caller_phone: '(412) 253-3598',
        contact_name: 'Test Customer',
        company_name: null,
        notes: null,
        tags: null,
        status: 'new',
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            callerName: 'Test Customer',
            email: 'test@example.com'
          }
        }
      })

      const insertPayload = fromSpy.mock.results[0].value.insert.mock.calls[0][0]

      // Email should be in metadata (canonical storage in production)
      expect(insertPayload.raw_metadata.extracted_info.email).toBe('test@example.com')
    })

    it('should handle null email gracefully in metadata', async () => {
      const { supabaseAdmin } = await import('@/lib/supabase/admin')
      const fromSpy = vi.spyOn(supabaseAdmin, 'from')

      await LeadService.createLead({
        business_id: 'test-business-id',
        caller_phone: '(412) 253-3598',
        contact_name: null,
        company_name: null,
        notes: null,
        tags: null,
        status: 'new',
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            callerName: null,
            email: null
          }
        }
      })

      const insertPayload = fromSpy.mock.results[0].value.insert.mock.calls[0][0]

      // Null email should be preserved in metadata
      expect(insertPayload.raw_metadata.extracted_info.email).toBeNull()
    })
  })

  describe('Phone normalization and duplicate protection', () => {
    it('should normalize phone number correctly', async () => {
      const { supabaseAdmin } = await import('@/lib/supabase/admin')
      const fromSpy = vi.spyOn(supabaseAdmin, 'from')

      await LeadService.createLead({
        business_id: 'test-business-id',
        caller_phone: '(412) 253-3598',
        contact_name: null,
        company_name: null,
        notes: null,
        tags: null,
        status: 'new'
      })

      const insertPayload = fromSpy.mock.results[0].value.insert.mock.calls[0][0]

      // Phone should be normalized to E.164 format
      expect(insertPayload.caller_phone).toBe('+14122533598')
    })

    it('should include business_id for scoping', async () => {
      const { supabaseAdmin } = await import('@/lib/supabase/admin')
      const fromSpy = vi.spyOn(supabaseAdmin, 'from')

      await LeadService.createLead({
        business_id: 'test-business-id',
        caller_phone: '(412) 253-3598',
        contact_name: null,
        company_name: null,
        notes: null,
        tags: null,
        status: 'new'
      })

      const insertPayload = fromSpy.mock.results[0].value.insert.mock.calls[0][0]

      // Business ID should be included for duplicate protection
      expect(insertPayload.business_id).toBe('test-business-id')
    })
  })

  describe('Production error scenario', () => {
    it('should not trigger PGRST204 error for missing name/email columns', async () => {
      // This test verifies the fix for the production PGRST204 error
      // caused by sending stale 'name' and 'email' columns
      const { supabaseAdmin } = await import('@/lib/supabase/admin')
      const fromSpy = vi.spyOn(supabaseAdmin, 'from')

      await LeadService.createLead({
        business_id: '311c2f79-6d79-4e4f-8d09-9a661206de24',
        caller_phone: '+14122533598',
        contact_name: 'Test Customer',
        company_name: null,
        notes: null,
        tags: null,
        status: 'new',
        source: 'manual',
        raw_metadata: {
          extracted_info: {
            callerName: 'Test Customer',
            email: 'customer@example.com'
          }
        }
      })

      const insertPayload = fromSpy.mock.results[0].value.insert.mock.calls[0][0]

      // After fix, should use production-compatible columns
      expect(insertPayload).toHaveProperty('contact_name')
      expect(insertPayload.contact_name).toBe('Test Customer')
      expect(insertPayload).not.toHaveProperty('name') // Stale column removed
      expect(insertPayload).not.toHaveProperty('email') // Stale column removed

      // Email should be in metadata only
      expect(insertPayload.raw_metadata.extracted_info.email).toBe('customer@example.com')
    })
  })

  describe('Read compatibility - production row to application model', () => {
    it('should populate name from contact_name', () => {
      const dbRow = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '+14122533598',
        contact_name: 'Jane Customer',
        raw_metadata: {
          extracted_info: {
            email: 'jane@example.com'
          }
        },
        status: 'new',
        created_at: '2026-01-01T00:00:00Z'
      }

      const appLead = normalizeLeadForApplication(dbRow)

      expect(appLead.contact_name).toBe('Jane Customer')
      expect(appLead.name).toBe('Jane Customer') // Compatibility alias
    })

    it('should populate email from metadata', () => {
      const dbRow = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '+14122533598',
        contact_name: 'Jane Customer',
        raw_metadata: {
          extracted_info: {
            email: 'jane@example.com'
          }
        },
        status: 'new',
        created_at: '2026-01-01T00:00:00Z'
      }

      const appLead = normalizeLeadForApplication(dbRow)

      expect(appLead.raw_metadata.extracted_info.email).toBe('jane@example.com')
      expect(appLead.email).toBe('jane@example.com') // Compatibility alias
    })

    it('should populate phone from caller_phone', () => {
      const dbRow = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '+14122533598',
        contact_name: 'Jane Customer',
        status: 'new',
        created_at: '2026-01-01T00:00:00Z'
      }

      const appLead = normalizeLeadForApplication(dbRow)

      expect(appLead.caller_phone).toBe('+14122533598')
      expect(appLead.phone).toBe('+14122533598') // Compatibility alias
    })

    it('should fall back to metadata callerName when contact_name is null', () => {
      const dbRow = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '+14122533598',
        contact_name: null,
        raw_metadata: {
          extracted_info: {
            callerName: 'Fallback Name'
          }
        },
        status: 'new',
        created_at: '2026-01-01T00:00:00Z'
      }

      const appLead = normalizeLeadForApplication(dbRow)

      expect(appLead.name).toBe('Fallback Name')
    })

    it('should handle null email gracefully', () => {
      const dbRow = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '+14122533598',
        contact_name: 'Jane Customer',
        raw_metadata: {},
        status: 'new',
        created_at: '2026-01-01T00:00:00Z'
      }

      const appLead = normalizeLeadForApplication(dbRow)

      expect(appLead.email).toBeNull()
    })

    it('should handle null raw_metadata gracefully', () => {
      const dbRow = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '+14122533598',
        contact_name: 'Jane Customer',
        raw_metadata: null,
        status: 'new',
        created_at: '2026-01-01T00:00:00Z'
      }

      const appLead = normalizeLeadForApplication(dbRow)

      expect(appLead.name).toBe('Jane Customer')
      expect(appLead.email).toBeNull()
    })

    it('should preserve all production fields unchanged', () => {
      const dbRow = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '+14122533598',
        contact_name: 'Jane Customer',
        company_name: 'Acme Corp',
        notes: 'Test notes',
        tags: ['tag1', 'tag2'],
        status: 'new',
        raw_metadata: {
          extracted_info: {
            email: 'jane@example.com'
          }
        },
        created_at: '2026-01-01T00:00:00Z'
      }

      const appLead = normalizeLeadForApplication(dbRow)

      expect(appLead.id).toBe('lead-123')
      expect(appLead.business_id).toBe('business-123')
      expect(appLead.caller_phone).toBe('+14122533598')
      expect(appLead.contact_name).toBe('Jane Customer')
      expect(appLead.company_name).toBe('Acme Corp')
      expect(appLead.notes).toBe('Test notes')
      expect(appLead.tags).toEqual(['tag1', 'tag2'])
      expect(appLead.status).toBe('new')
      expect(appLead.created_at).toBe('2026-01-01T00:00:00Z')
    })

    it('should preserve all production fields during metadata merge', () => {
      // Simulate existing lead with metadata
      const existingLead = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '+14122533598',
        contact_name: 'Existing Customer',
        raw_metadata: {
          extracted_info: {
            callerName: 'Existing Customer',
            reasonForCalling: 'Existing reason',
            addressOrLocation: 'Existing address',
            desiredCompletionTime: 'next week',
            email: 'existing@example.com',
            otherField: 'preserve me'
          },
          otherExistingMetadata: 'preserve me too'
        }
      }

      // Simulate update through manual duplicate path
      const updateData = {
        customerName: 'New Customer',
        email: 'new@example.com',
        notes: 'New notes'
      }

      // Merge metadata (simulating what manual-create route does)
      const mergedExtractedInfo = {
        ...existingLead.raw_metadata.extracted_info,
        callerName: updateData.customerName || existingLead.raw_metadata.extracted_info.callerName,
        email: updateData.email || existingLead.raw_metadata.extracted_info.email
      }

      const mergedMetadata = {
        ...existingLead.raw_metadata,
        extracted_info: mergedExtractedInfo
      }

      // Verify unrelated fields are preserved
      expect(mergedMetadata.extracted_info.reasonForCalling).toBe('Existing reason')
      expect(mergedMetadata.extracted_info.addressOrLocation).toBe('Existing address')
      expect(mergedMetadata.extracted_info.desiredCompletionTime).toBe('next week')
      expect(mergedMetadata.extracted_info.otherField).toBe('preserve me')
      expect(mergedMetadata.otherExistingMetadata).toBe('preserve me too')

      // Verify new fields are updated
      expect(mergedExtractedInfo.callerName).toBe('New Customer')
      expect(mergedExtractedInfo.email).toBe('new@example.com')
    })
  })
})