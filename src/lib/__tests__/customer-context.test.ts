import { describe, it, expect } from 'vitest'
import {
  getCurrentCustomerContext,
  getHistoricalJobRequestContext,
  getCanonicalCustomerDisplayName
} from '../customer-context'

describe('customer-context', () => {
  it('A: current manually edited name beats stale historical intake name', () => {
    const lead = {
      id: 'lead-1',
      name: 'Current Name',
      contact_name: 'Current Name',
      caller_phone: '+15551234567',
      aiCallRecords: [
        {
          created_at: '2024-01-01T00:00:00Z',
          extracted_info: {
            callerName: 'Stale AI Name',
            reasonForCalling: 'Stale Reason'
          }
        }
      ],
      raw_metadata: {
        extracted_info: {
          callerName: 'Stale AI Name',
          reasonForCalling: 'Stale Reason'
        }
      }
    }

    expect(getCurrentCustomerContext(lead).customerName).toBe('Current Name')
    expect(getCanonicalCustomerDisplayName(lead)).toBe('Current Name')
  })

  it('B: historical Previous Job Request still displays old captured name', () => {
    const historicalRecord = {
      id: 'record-1',
      created_at: '2024-01-01T00:00:00Z',
      caller_phone: '+15551234567',
      extracted_info: {
        callerName: 'Old AI Name',
        reasonForCalling: 'Old Request',
        importantDetails: 'Old captured details',
        addressOrLocation: 'Old Address',
        desiredCompletionTime: 'Old Completion',
        preferredCallbackTime: 'Old Callback'
      }
    }

    const context = getHistoricalJobRequestContext(historicalRecord)
    expect(context.customerName).toBe('Old AI Name')
    expect(context.reasonForCalling).toBe('Old Request')
    expect(context.details).toBe('Old captured details')
    expect(context.location).toBe('Old Address')
    expect(context.desiredCompletionTime).toBe('Old Completion')
    expect(context.preferredCallbackTime).toBe('Old Callback')
    expect(context.phoneNumber).toBe('+15551234567')
  })

  it('C: current email persists and renders from corrected_fields', () => {
    const lead = {
      raw_metadata: {
        corrected_fields: { email: 'current@example.com' },
        extracted_info: { email: 'old@example.com' }
      }
    }

    expect(getCurrentCustomerContext(lead).email).toBe('current@example.com')
  })

  it('D: null or placeholder email does not become a placeholder email', () => {
    expect(getCurrentCustomerContext({ raw_metadata: { extracted_info: { email: null } } }).email).toBe('')
    expect(getCurrentCustomerContext({ raw_metadata: { extracted_info: { email: 'Not collected' } } }).email).toBe('')
    expect(getCurrentCustomerContext({ raw_metadata: { extracted_info: { email: 'unknown' } } }).email).toBe('')
    expect(getCurrentCustomerContext({ email: '   ' }).email).toBe('')
  })

  it('E: reason/details/location/timing manual edits round-trip', () => {
    const lead = {
      raw_metadata: {
        corrected_fields: {
          reasonForCalling: 'Leak Repair',
          importantDetails: 'Under kitchen sink',
          addressOrLocation: '123 Main St',
          desiredCompletionTime: 'Tomorrow',
          preferredCallbackTime: '3 PM'
        }
      }
    }

    const context = getCurrentCustomerContext(lead)
    expect(context.reasonForCalling).toBe('Leak Repair')
    expect(context.details).toBe('Under kitchen sink')
    expect(context.location).toBe('123 Main St')
    expect(context.desiredCompletionTime).toBe('Tomorrow')
    expect(context.preferredCallbackTime).toBe('3 PM')
  })

  it('F: Edit Customer values prefill from current canonical context', () => {
    const lead = {
      name: 'Jane Doe',
      contact_name: 'Jane Doe',
      caller_phone: '+15551234567',
      email: 'jane@example.com',
      raw_metadata: {
        corrected_fields: {
          reasonForCalling: 'Plumbing',
          importantDetails: 'Burst pipe',
          addressOrLocation: '456 Oak Ave',
          desiredCompletionTime: 'Today',
          preferredCallbackTime: '5 PM'
        }
      }
    }

    const context = getCurrentCustomerContext(lead)
    expect(context.customerName).toBe('Jane Doe')
    expect(context.phoneNumber).toBe('+15551234567')
    expect(context.email).toBe('jane@example.com')
    expect(context.reasonForCalling).toBe('Plumbing')
    expect(context.details).toBe('Burst pipe')
    expect(context.location).toBe('456 Oak Ave')
    expect(context.desiredCompletionTime).toBe('Today')
    expect(context.preferredCallbackTime).toBe('5 PM')
  })
})
