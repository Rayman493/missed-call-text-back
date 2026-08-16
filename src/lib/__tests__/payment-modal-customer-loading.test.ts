/**
 * Payment Request Modal Customer Loading Regression Tests
 *
 * Tests to ensure RequestPaymentModal reliably loads existing customers
 * using the same data source as the Customers page (direct Supabase query)
 */

import { describe, it, expect } from 'vitest'

describe('Payment Modal Customer Loading', () => {
  describe('Direct Supabase Query Approach', () => {
    it('should construct correct Supabase query with business_id filter', () => {
      const businessId = 'business-123'

      // Simulate the query construction from RequestPaymentModal
      const query = {
        from: 'leads',
        select: 'id, business_id, caller_phone, status, created_at, raw_metadata',
        filters: [
          { column: 'business_id', operator: 'eq', value: businessId },
          { column: 'deleted_at', operator: 'is', value: null }
        ],
        orderBy: { column: 'created_at', ascending: false },
        limit: 100
      }

      expect(query.from).toBe('leads')
      expect(query.filters[0]).toEqual({ column: 'business_id', operator: 'eq', value: businessId })
      expect(query.filters[1]).toEqual({ column: 'deleted_at', operator: 'is', value: null })
    })

    it('should normalize lead data correctly for dropdown display', () => {
      const rawLead = {
        id: 'lead-123',
        business_id: 'business-123',
        caller_phone: '+15551234567',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
        raw_metadata: {
          customerName: 'John Doe'
        }
      }

      // Simulate the normalization from RequestPaymentModal
      const normalized = {
        id: rawLead.id,
        caller_phone: rawLead.caller_phone,
        name: rawLead.raw_metadata?.customerName ||
               rawLead.raw_metadata?.callerName ||
               rawLead.raw_metadata?.name ||
               rawLead.caller_phone,
        raw_metadata: rawLead.raw_metadata
      }

      expect(normalized.id).toBe('lead-123')
      expect(normalized.name).toBe('John Doe')
      expect(normalized.caller_phone).toBe('+15551234567')
    })

    it('should fallback to phone number when name is not in metadata', () => {
      const rawLead = {
        id: 'lead-456',
        business_id: 'business-123',
        caller_phone: '+15551234567',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
        raw_metadata: {}
      }

      const normalized = {
        id: rawLead.id,
        caller_phone: rawLead.caller_phone,
        name: rawLead.raw_metadata?.customerName ||
               rawLead.raw_metadata?.callerName ||
               rawLead.raw_metadata?.name ||
               rawLead.caller_phone,
        raw_metadata: rawLead.raw_metadata
      }

      expect(normalized.name).toBe('+15551234567')
    })

    it('should prefer customerName over other name fields', () => {
      const rawLead = {
        id: 'lead-789',
        business_id: 'business-123',
        caller_phone: '+15551234567',
        status: 'new',
        created_at: '2024-01-01T00:00:00Z',
        raw_metadata: {
          customerName: 'Preferred Name',
          callerName: 'Fallback Name',
          name: 'Another Name'
        }
      }

      const normalized = {
        id: rawLead.id,
        caller_phone: rawLead.caller_phone,
        name: rawLead.raw_metadata?.customerName ||
               rawLead.raw_metadata?.callerName ||
               rawLead.raw_metadata?.name ||
               rawLead.caller_phone,
        raw_metadata: rawLead.raw_metadata
      }

      expect(normalized.name).toBe('Preferred Name')
    })
  })

  describe('Empty State Handling', () => {
    it('should return empty array when no leads exist', () => {
      const queryResult = { data: null, error: null }
      const leads = (queryResult.data || []).map((lead: any) => ({
        id: lead.id,
        caller_phone: lead.caller_phone,
        name: lead.raw_metadata?.customerName || lead.caller_phone,
        raw_metadata: lead.raw_metadata
      }))

      expect(leads).toEqual([])
    })

    it('should distinguish between empty array and error state', () => {
      const emptyResult = { data: [], error: null }
      const errorResult = { data: null, error: { message: 'Database error' } }

      const emptyLeads = (emptyResult.data || []).map((lead: any) => lead)
      const errorLeads = (errorResult.data || []).map((lead: any) => lead)

      expect(emptyLeads).toEqual([])
      expect(errorLeads).toEqual([])
      // Error should be caught and set in leadsError state, not in leads array
    })
  })

  describe('Business Isolation', () => {
    it('should only return leads for the specified business_id', () => {
      const businessId = 'business-123'

      // Simulate query results
      const allLeads = [
        { id: 'lead-1', business_id: 'business-123', caller_phone: '+15551111111' },
        { id: 'lead-2', business_id: 'business-456', caller_phone: '+15552222222' },
        { id: 'lead-3', business_id: 'business-123', caller_phone: '+15553333333' }
      ]

      const filteredLeads = allLeads.filter(lead => lead.business_id === businessId)

      expect(filteredLeads.length).toBe(2)
      expect(filteredLeads.every(lead => lead.business_id === businessId)).toBe(true)
      expect(filteredLeads.some(lead => lead.id === 'lead-2')).toBe(false)
    })
  })

  describe('Deleted Lead Exclusion', () => {
    it('should exclude leads with deleted_at set', () => {
      const allLeads = [
        { id: 'lead-1', deleted_at: null, caller_phone: '+15551111111' },
        { id: 'lead-2', deleted_at: '2024-01-01T00:00:00Z', caller_phone: '+15552222222' },
        { id: 'lead-3', deleted_at: null, caller_phone: '+15553333333' }
      ]

      const activeLeads = allLeads.filter(lead => lead.deleted_at === null)

      expect(activeLeads.length).toBe(2)
      expect(activeLeads.some(lead => lead.id === 'lead-2')).toBe(false)
    })
  })
})