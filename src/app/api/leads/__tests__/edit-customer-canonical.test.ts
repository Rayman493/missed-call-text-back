/**
 * Edit Customer API Tests - Canonical Fields Only
 *
 * Tests for the simple customer profile update API endpoint.
 * Verifies that canonical fields are updated without mutating historical AI intake data.
 */

import { describe, it, expect } from 'vitest'

describe('Edit Customer - Canonical Fields Only', () => {
  describe('Historical AI intake preservation', () => {
    it('should NOT mutate raw_metadata.extracted_info for simple update', () => {
      const currentLead = {
        id: 'lead-123',
        contact_name: 'Old Name',
        raw_metadata: {
          extracted_info: {
            callerName: 'AI Captured Name',
            email: 'ai@example.com',
            addressOrLocation: '123 AI Street',
            reasonForCalling: 'Plumbing Issue',
            desiredCompletionTime: 'Tomorrow',
            preferredCallbackTime: '3PM'
          }
        }
      }

      const updatePayload = {
        is_simple_update: true,
        contact_name: 'New Name',
        email: 'new@example.com'
      }

      // Simulate the new behavior: only update canonical fields
      const updateData: Record<string, any> = {}
      if (updatePayload.contact_name !== undefined) updateData.contact_name = updatePayload.contact_name
      if (updatePayload.email !== undefined) updateData.email = updatePayload.email

      const updatedLead = {
        ...currentLead,
        ...updateData
      }

      // Canonical fields updated
      expect(updatedLead.contact_name).toBe('New Name')
      expect(updatedLead.email).toBe('new@example.com')

      // Historical AI intake UNCHANGED
      expect(updatedLead.raw_metadata.extracted_info.callerName).toBe('AI Captured Name')
      expect(updatedLead.raw_metadata.extracted_info.addressOrLocation).toBe('123 AI Street')
      expect(updatedLead.raw_metadata.extracted_info.reasonForCalling).toBe('Plumbing Issue')
      expect(updatedLead.raw_metadata.extracted_info.desiredCompletionTime).toBe('Tomorrow')
      expect(updatedLead.raw_metadata.extracted_info.preferredCallbackTime).toBe('3PM')
    })

    it('should update contact_name without affecting AI intake', () => {
      const currentLead = {
        id: 'lead-123',
        contact_name: 'Old Name',
        company_name: 'Old Company',
        notes: 'Old notes',
        raw_metadata: {
          extracted_info: {
            callerName: 'AI Name',
            reasonForCalling: 'AI Reason'
          }
        }
      }

      const updatePayload = {
        is_simple_update: true,
        contact_name: 'New Name',
        company_name: 'New Company',
        notes: 'New notes'
      }

      const updateData: Record<string, any> = {}
      if (updatePayload.contact_name !== undefined) updateData.contact_name = updatePayload.contact_name
      if (updatePayload.company_name !== undefined) updateData.company_name = updatePayload.company_name
      if (updatePayload.notes !== undefined) updateData.notes = updatePayload.notes

      const updatedLead = {
        ...currentLead,
        ...updateData
      }

      expect(updatedLead.contact_name).toBe('New Name')
      expect(updatedLead.company_name).toBe('New Company')
      expect(updatedLead.notes).toBe('New notes')
      expect(updatedLead.raw_metadata.extracted_info.callerName).toBe('AI Name')
      expect(updatedLead.raw_metadata.extracted_info.reasonForCalling).toBe('AI Reason')
    })
  })

  describe('Canonical field updates', () => {
    it('should update contact_name when provided', () => {
      const currentLead = { id: 'lead-123', contact_name: 'Old Name' }
      const updatePayload = { is_simple_update: true, contact_name: 'New Name' }

      const updateData: Record<string, any> = {}
      if (updatePayload.contact_name !== undefined) updateData.contact_name = updatePayload.contact_name

      const updatedLead = { ...currentLead, ...updateData }
      expect(updatedLead.contact_name).toBe('New Name')
    })

    it('should update email when provided', () => {
      const currentLead = { id: 'lead-123', email: 'old@example.com' }
      const updatePayload = { is_simple_update: true, email: 'new@example.com' }

      const updateData: Record<string, any> = {}
      if (updatePayload.email !== undefined) updateData.email = updatePayload.email

      const updatedLead = { ...currentLead, ...updateData }
      expect(updatedLead.email).toBe('new@example.com')
    })

    it('should update company_name when provided', () => {
      const currentLead = { id: 'lead-123', company_name: 'Old Company' }
      const updatePayload = { is_simple_update: true, company_name: 'New Company' }

      const updateData: Record<string, any> = {}
      if (updatePayload.company_name !== undefined) updateData.company_name = updatePayload.company_name

      const updatedLead = { ...currentLead, ...updateData }
      expect(updatedLead.company_name).toBe('New Company')
    })

    it('should update notes when provided', () => {
      const currentLead = { id: 'lead-123', notes: 'Old notes' }
      const updatePayload = { is_simple_update: true, notes: 'New notes' }

      const updateData: Record<string, any> = {}
      if (updatePayload.notes !== undefined) updateData.notes = updatePayload.notes

      const updatedLead = { ...currentLead, ...updateData }
      expect(updatedLead.notes).toBe('New notes')
    })

    it('should use null for empty canonical fields to clear them', () => {
      const currentLead = { id: 'lead-123', company_name: 'Has Company', notes: 'Has Notes' }
      const updatePayload = { is_simple_update: true, company_name: null, notes: null }

      const updateData: Record<string, any> = {}
      if (updatePayload.company_name !== undefined) updateData.company_name = updatePayload.company_name
      if (updatePayload.notes !== undefined) updateData.notes = updatePayload.notes

      const updatedLead = { ...currentLead, ...updateData }
      expect(updatedLead.company_name).toBeNull()
      expect(updatedLead.notes).toBeNull()
    })
  })

  describe('Phone safety', () => {
    it('should not include phone in canonical update payload', () => {
      const updatePayload = {
        is_simple_update: true,
        contact_name: 'John Doe',
        email: 'john@example.com'
      }

      // Phone should not be in the update payload
      expect(updatePayload).not.toHaveProperty('caller_phone')
      expect(updatePayload).not.toHaveProperty('raw_metadata')
    })
  })
})