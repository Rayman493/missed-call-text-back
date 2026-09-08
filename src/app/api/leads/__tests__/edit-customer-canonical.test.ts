/**
 * Edit Customer API Tests - Canonical Current Fields Only
 *
 * Simulates the is_simple_update branch of PATCH /api/leads/[id].
 * Verifies that current customer/intake fields persist to canonical lead columns
 * and raw_metadata.corrected_fields without mutating historical AI intake.
 */

import { describe, it, expect } from 'vitest'

function applySimpleUpdate(currentLead: any, payload: any) {
  const updateData: any = {}
  const currentMetadata = currentLead.raw_metadata || {}
  const correctedFields = { ...(currentMetadata.corrected_fields || {}) }

  const setCorrected = (aliases: string[], value: string | null | undefined) => {
    if (value === undefined) return
    const trimmed = value ? value.trim() : ''
    if (trimmed) {
      for (const alias of aliases) correctedFields[alias] = trimmed
    } else {
      for (const alias of aliases) delete correctedFields[alias]
    }
  }

  if (payload.contact_name !== undefined) {
    updateData.contact_name = payload.contact_name
    setCorrected(['name', 'callerName', 'customerName', 'caller_name', 'customer_name'], payload.contact_name)
  }
  if (payload.caller_phone !== undefined) {
    updateData.caller_phone = payload.caller_phone ? payload.caller_phone.replace(/\D/g, '') : null
  }
  if (payload.email !== undefined) {
    const trimmed = payload.email ? payload.email.trim() : null
    if (trimmed) correctedFields.email = trimmed
    else delete correctedFields.email
  }
  if (payload.reasonForCalling !== undefined) {
    setCorrected(['reasonForCalling', 'serviceRequested', 'reason', 'service_requested'], payload.reasonForCalling)
  }
  if (payload.importantDetails !== undefined) {
    setCorrected(['importantDetails', 'details', 'issueDescription', 'additionalDetails'], payload.importantDetails)
  }
  if (payload.addressOrLocation !== undefined) {
    setCorrected(['addressOrLocation', 'address', 'serviceAddress', 'service_address'], payload.addressOrLocation)
  }
  if (payload.desiredCompletionTime !== undefined) {
    setCorrected(['desiredCompletion', 'desiredCompletionTime', 'desired_completion_time', 'urgency'], payload.desiredCompletionTime)
  }
  if (payload.preferredCallbackTime !== undefined) {
    setCorrected(['preferredCallbackTime', 'callbackTime', 'callback_time', 'preferred_callback_time'], payload.preferredCallbackTime)
  }
  if (payload.company_name !== undefined) updateData.company_name = payload.company_name
  if (payload.notes !== undefined) updateData.notes = payload.notes

  const mergedRawMetadata = {
    ...currentMetadata,
    corrected_fields: correctedFields,
    customer_corrected_info: true,
    last_correction_at: '2024-01-01T00:00:00Z',
    last_correction_source: 'manual_edit_customer'
  }
  updateData.raw_metadata = mergedRawMetadata

  return {
    ...currentLead,
    ...updateData
  }
}

describe('Edit Customer - Canonical Current Fields Only', () => {
  it('does not overwrite raw_metadata.extracted_info (historical AI snapshot)', () => {
    const currentLead = {
      id: 'lead-123',
      contact_name: 'Old Name',
      caller_phone: '+15550000000',
      raw_metadata: {
        extracted_info: {
          callerName: 'AI Captured Name',
          email: 'ai@example.com',
          reasonForCalling: 'Plumbing Issue',
          importantDetails: 'AI details',
          addressOrLocation: '123 AI Street',
          desiredCompletionTime: 'Tomorrow',
          preferredCallbackTime: '3PM'
        }
      }
    }

    const updated = applySimpleUpdate(currentLead, {
      is_simple_update: true,
      contact_name: 'New Name',
      email: 'new@example.com',
      reasonForCalling: 'New Reason',
      importantDetails: 'New Details',
      addressOrLocation: 'New Address',
      desiredCompletionTime: 'Next week',
      preferredCallbackTime: '9 AM'
    })

    expect(updated.contact_name).toBe('New Name')
    expect(updated.raw_metadata.corrected_fields.email).toBe('new@example.com')
    expect(updated.raw_metadata.corrected_fields.reasonForCalling).toBe('New Reason')
    expect(updated.raw_metadata.corrected_fields.importantDetails).toBe('New Details')

    expect(updated.raw_metadata.extracted_info.callerName).toBe('AI Captured Name')
    expect(updated.raw_metadata.extracted_info.email).toBe('ai@example.com')
    expect(updated.raw_metadata.extracted_info.reasonForCalling).toBe('Plumbing Issue')
  })

  it('round-trips all 8 current customer/intake fields', () => {
    const currentLead = { id: 'lead-123', raw_metadata: {} }

    const updated = applySimpleUpdate(currentLead, {
      is_simple_update: true,
      contact_name: 'John Doe',
      caller_phone: '(555) 123-4567',
      email: 'john@example.com',
      reasonForCalling: 'Roof Repair',
      importantDetails: 'Shingles missing',
      addressOrLocation: '789 Pine Rd',
      desiredCompletionTime: 'This week',
      preferredCallbackTime: '2 PM'
    })

    expect(updated.contact_name).toBe('John Doe')
    expect(updated.caller_phone).toBe('5551234567')
    expect(updated.raw_metadata.corrected_fields.email).toBe('john@example.com')
    expect(updated.raw_metadata.corrected_fields.reasonForCalling).toBe('Roof Repair')
    expect(updated.raw_metadata.corrected_fields.importantDetails).toBe('Shingles missing')
    expect(updated.raw_metadata.corrected_fields.addressOrLocation).toBe('789 Pine Rd')
    expect(updated.raw_metadata.corrected_fields.desiredCompletion).toBe('This week')
    expect(updated.raw_metadata.corrected_fields.preferredCallbackTime).toBe('2 PM')
  })

  it('stores email in corrected_fields, not a top-level lead column', () => {
    const currentLead = { id: 'lead-123', raw_metadata: {} }
    const updated = applySimpleUpdate(currentLead, {
      is_simple_update: true,
      email: 'test@example.com'
    })

    expect(updated.email).toBeUndefined()
    expect(updated.raw_metadata.corrected_fields.email).toBe('test@example.com')
  })

  it('preserves company_name and notes when omitted', () => {
    const currentLead = {
      id: 'lead-123',
      company_name: 'Acme Inc',
      notes: 'Existing notes',
      raw_metadata: {}
    }

    const updated = applySimpleUpdate(currentLead, {
      is_simple_update: true,
      contact_name: 'New Name'
    })

    expect(updated.company_name).toBe('Acme Inc')
    expect(updated.notes).toBe('Existing notes')
  })

  it('allows clearing a corrected intake field by sending an empty string', () => {
    const currentLead = {
      id: 'lead-123',
      raw_metadata: {
        corrected_fields: {
          reasonForCalling: 'Old Reason'
        }
      }
    }

    const updated = applySimpleUpdate(currentLead, {
      is_simple_update: true,
      reasonForCalling: ''
    })

    expect(updated.raw_metadata.corrected_fields.reasonForCalling).toBeUndefined()
    expect(updated.raw_metadata.extracted_info).toBeUndefined()
  })
})
