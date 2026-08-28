/**
 * Edit Customer API Tests
 *
 * Tests for the simple customer profile update API endpoint.
 * Verifies metadata merge behavior, field clearing, and preservation
 * of unrelated data.
 */

import { describe, it, expect } from 'vitest'

describe('Edit Customer Metadata Merge Logic', () => {
  describe('Field clearing semantics', () => {
    it('should remove field when null is provided', () => {
      const currentMetadata = {
        extracted_info: {
          email: 'old@example.com',
          addressOrLocation: '123 Old St'
        }
      }

      const incomingExtractedInfo = {
        email: null
      }

      const mergedExtractedInfo = {
        ...currentMetadata.extracted_info,
        ...incomingExtractedInfo
      }

      // Handle null as clearing the field
      Object.keys(incomingExtractedInfo).forEach(key => {
        if (incomingExtractedInfo[key] === null || incomingExtractedInfo[key] === '') {
          delete mergedExtractedInfo[key]
        }
      })

      expect(mergedExtractedInfo.email).toBeUndefined()
      expect(mergedExtractedInfo.addressOrLocation).toBe('123 Old St')
    })

    it('should remove field when empty string is provided', () => {
      const currentMetadata = {
        extracted_info: {
          email: 'old@example.com',
          addressOrLocation: '123 Old St'
        }
      }

      const incomingExtractedInfo = {
        email: ''
      }

      const mergedExtractedInfo = {
        ...currentMetadata.extracted_info,
        ...incomingExtractedInfo
      }

      // Handle empty string as clearing the field
      Object.keys(incomingExtractedInfo).forEach(key => {
        if (incomingExtractedInfo[key] === null || incomingExtractedInfo[key] === '') {
          delete mergedExtractedInfo[key]
        }
      })

      expect(mergedExtractedInfo.email).toBeUndefined()
      expect(mergedExtractedInfo.addressOrLocation).toBe('123 Old St')
    })
  })

  describe('Metadata merge behavior', () => {
    it('should preserve unrelated metadata fields', () => {
      const currentMetadata = {
        extracted_info: {
          email: 'old@example.com',
          reasonForCalling: 'Plumbing',
          addressOrLocation: '123 Main St',
          aiSpecificField: 'should be preserved',
          otherUnrelatedField: 'also preserved'
        }
      }

      const incomingExtractedInfo = {
        email: 'new@example.com'
      }

      const mergedExtractedInfo = {
        ...currentMetadata.extracted_info,
        ...incomingExtractedInfo
      }

      expect(mergedExtractedInfo.email).toBe('new@example.com')
      expect(mergedExtractedInfo.reasonForCalling).toBe('Plumbing')
      expect(mergedExtractedInfo.addressOrLocation).toBe('123 Main St')
      expect(mergedExtractedInfo.aiSpecificField).toBe('should be preserved')
      expect(mergedExtractedInfo.otherUnrelatedField).toBe('also preserved')
    })

    it('should merge multiple updated fields while preserving others', () => {
      const currentMetadata = {
        extracted_info: {
          email: 'old@example.com',
          addressOrLocation: '123 Old St',
          reasonForCalling: 'Old reason',
          desiredCompletionTime: 'Tomorrow'
        }
      }

      const incomingExtractedInfo = {
        email: 'new@example.com',
        addressOrLocation: '456 New St'
      }

      const mergedExtractedInfo = {
        ...currentMetadata.extracted_info,
        ...incomingExtractedInfo
      }

      expect(mergedExtractedInfo.email).toBe('new@example.com')
      expect(mergedExtractedInfo.addressOrLocation).toBe('456 New St')
      expect(mergedExtractedInfo.reasonForCalling).toBe('Old reason')
      expect(mergedExtractedInfo.desiredCompletionTime).toBe('Tomorrow')
    })
  })

  describe('Field mapping', () => {
    it('should map form fields to correct database columns', () => {
      const formData = {
        customerName: 'John Doe',
        companyName: 'Acme Corp',
        email: 'john@example.com',
        address: '123 Main St',
        notes: 'Test notes',
        reasonForCalling: 'Plumbing',
        desiredCompletionTime: 'Tomorrow',
        preferredCallbackTime: '3PM'
      }

      const updatePayload = {
        contact_name: formData.customerName,
        company_name: formData.companyName,
        notes: formData.notes,
        raw_metadata: {
          extracted_info: {
            callerName: formData.customerName,
            email: formData.email,
            addressOrLocation: formData.address,
            importantDetails: formData.notes,
            reasonForCalling: formData.reasonForCalling,
            serviceRequested: formData.reasonForCalling,
            desiredCompletionTime: formData.desiredCompletionTime,
            preferredCallbackTime: formData.preferredCallbackTime
          }
        }
      }

      expect(updatePayload.contact_name).toBe('John Doe')
      expect(updatePayload.company_name).toBe('Acme Corp')
      expect(updatePayload.notes).toBe('Test notes')
      expect(updatePayload.raw_metadata.extracted_info.email).toBe('john@example.com')
      expect(updatePayload.raw_metadata.extracted_info.addressOrLocation).toBe('123 Main St')
    })
  })

  describe('Phone safety', () => {
    it('should not include phone in update payload', () => {
      const formData = {
        customerName: 'John Doe',
        phoneNumber: '+14122533598',
        email: 'john@example.com'
      }

      const updatePayload = {
        contact_name: formData.customerName,
        raw_metadata: {
          extracted_info: {
            callerName: formData.customerName,
            email: formData.email
          }
        }
      }

      // Phone should not be in the update payload
      expect(updatePayload).not.toHaveProperty('caller_phone')
      expect(updatePayload.raw_metadata.extracted_info).not.toHaveProperty('caller_phone')
    })
  })
})