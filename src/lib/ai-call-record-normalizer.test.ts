import { describe, it, expect } from 'vitest'
import { sortAndDeduplicateRecords, type NormalizedIntake } from './ai-call-record-normalizer'

describe('sortAndDeduplicateRecords', () => {
  const baseTime = new Date('2024-01-01T12:00:00Z').getTime()

  it('should handle overlapping fetches - newer request wins', () => {
    const record1: NormalizedIntake = {
      id: '1',
      callSid: 'call-1',
      receivedAt: new Date(baseTime).toISOString(),
      outcome: 'completed',
      customerName: 'John Doe',
      serviceRequested: 'Service A',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const record2: NormalizedIntake = {
      id: '2',
      callSid: 'call-2',
      receivedAt: new Date(baseTime + 1000).toISOString(),
      outcome: 'completed',
      customerName: 'Jane Doe',
      serviceRequested: 'Service B',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const result = sortAndDeduplicateRecords([record1, record2])
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('2') // Newest first
    expect(result[1].id).toBe('1')
  })

  it('should remove duplicate records by ID', () => {
    const record: NormalizedIntake = {
      id: '1',
      callSid: 'call-1',
      receivedAt: new Date(baseTime).toISOString(),
      outcome: 'completed',
      customerName: 'John Doe',
      serviceRequested: 'Service A',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const result = sortAndDeduplicateRecords([record, record, record])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('1')
  })

  it('should preserve records without valid IDs (no deduplication)', () => {
    const recordWithId: NormalizedIntake = {
      id: '1',
      callSid: 'call-1',
      receivedAt: new Date(baseTime).toISOString(),
      outcome: 'completed',
      customerName: 'John Doe',
      serviceRequested: 'Service A',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const recordWithoutId: NormalizedIntake = {
      id: '',
      callSid: 'call-2',
      receivedAt: new Date(baseTime + 1000).toISOString(),
      outcome: 'completed',
      customerName: 'Jane Doe',
      serviceRequested: 'Service B',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const result = sortAndDeduplicateRecords([recordWithId, recordWithoutId, recordWithoutId])
    expect(result).toHaveLength(3) // Record with ID (1) + two records without ID (not collapsed)
  })

  it('should sort newest valid timestamp first', () => {
    const record1: NormalizedIntake = {
      id: '1',
      callSid: 'call-1',
      receivedAt: new Date(baseTime).toISOString(),
      outcome: 'completed',
      customerName: 'John Doe',
      serviceRequested: 'Service A',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const record2: NormalizedIntake = {
      id: '2',
      callSid: 'call-2',
      receivedAt: new Date(baseTime + 5000).toISOString(),
      outcome: 'completed',
      customerName: 'Jane Doe',
      serviceRequested: 'Service B',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const record3: NormalizedIntake = {
      id: '3',
      callSid: 'call-3',
      receivedAt: new Date(baseTime + 2000).toISOString(),
      outcome: 'completed',
      customerName: 'Bob Smith',
      serviceRequested: 'Service C',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const result = sortAndDeduplicateRecords([record1, record2, record3])
    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('2') // Newest
    expect(result[1].id).toBe('3') // Middle
    expect(result[2].id).toBe('1') // Oldest
  })

  it('should handle malformed/missing timestamps by placing them at the end', () => {
    const recordValid: NormalizedIntake = {
      id: '1',
      callSid: 'call-1',
      receivedAt: new Date(baseTime).toISOString(),
      outcome: 'completed',
      customerName: 'John Doe',
      serviceRequested: 'Service A',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const recordInvalid: NormalizedIntake = {
      id: '2',
      callSid: 'call-2',
      receivedAt: '',
      outcome: 'completed',
      customerName: 'Jane Doe',
      serviceRequested: 'Service B',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const result = sortAndDeduplicateRecords([recordValid, recordInvalid])
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('1') // Valid timestamp first
    expect(result[1].id).toBe('2') // Invalid timestamp at end
  })

  it('should handle all records with invalid timestamps', () => {
    const record1: NormalizedIntake = {
      id: '1',
      callSid: 'call-1',
      receivedAt: '',
      outcome: 'completed',
      customerName: 'John Doe',
      serviceRequested: 'Service A',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const record2: NormalizedIntake = {
      id: '2',
      callSid: 'call-2',
      receivedAt: '',
      outcome: 'completed',
      customerName: 'Jane Doe',
      serviceRequested: 'Service B',
      additionalDetails: null,
      serviceAddress: null,
      desiredCompletion: null,
      callbackTime: null,
      transcript: null
    }

    const result = sortAndDeduplicateRecords([record1, record2])
    expect(result).toHaveLength(2)
    // Should not crash or produce NaN comparator behavior
  })
})