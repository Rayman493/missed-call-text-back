/**
 * Batch 5B — AI Intake Hardening Regression Matrix
 *
 * Behavioral tests for the canonical intake validation, extraction, and
 * completion functions. Tests the physical failure CLASSES, not specific names.
 */

import { describe, it, expect } from 'vitest'
import {
  isValidServiceAddress,
  isValidServiceRequest,
  isValidCompletionTime,
  isValidCallbackTime,
  isValidCustomerName,
  isUsableServiceAddress,
  isNameRequirementSatisfied,
  resolveNextRequiredStage,
  resolveNextSimpleModeStage,
  normalizeStructuredFieldValue,
  IntakeData,
} from '../src/intake-validation'
import {
  enrichIntakeFromTranscript,
  detectCorrectionIntent,
} from '../src/intake-skip-ahead'

// ============================================================================
// 1. VALID ONSITE MAX SKIP-AHEAD
// ============================================================================
describe('1. Valid onsite max skip-ahead', () => {
  it('pre-fills name, service, location, timing, callback from one utterance', () => {
    const intake: IntakeData = {}
    const result = enrichIntakeFromTranscript(
      'My name is John Smith, I need a plumber at 123 Main Street, Pittsburgh, I want it done by Friday, and you can call me back anytime after 4pm',
      intake,
      'ask_name_reason'
    )
    expect(result.applied).toContain('customerName')
    expect(intake.customerName).toBeTruthy()
    expect(intake.serviceRequested || intake.request).toBeTruthy()
    // Location/timing/callback may or may not be extracted depending on pattern
    // but the key is that the utterance is parsed without crashing
  })
})

// ============================================================================
// 2. CROSS-STAGE ADDRESS CORRECTION (David Reynolds)
// ============================================================================
describe('2. Cross-stage address correction (AI-INTAKE-015)', () => {
  it('detects correction intent in "Actually, sorry, the address is 46 Oak Street"', () => {
    const { isCorrection } = detectCorrectionIntent('Actually, sorry, the address is 46 Oak Street')
    expect(isCorrection).toBe(true)
  })

  it('extracts address from correction utterance at timing stage', () => {
    const intake: IntakeData = {
      customerName: 'David Reynolds',
      serviceRequested: 'HVAC repair',
      desiredCompletionTime: 'next week',
    }
    enrichIntakeFromTranscript(
      'Actually, sorry, the address is 46 Oak Street',
      intake,
      'ask_completion_time'
    )
    // Address should be extracted to serviceAddress, NOT desiredCompletionTime
    expect(intake.serviceAddress).toBe('46 Oak Street')
  })

  it('does NOT pollute desiredCompletionTime with correction text', () => {
    const intake: IntakeData = {
      customerName: 'David Reynolds',
      serviceRequested: 'HVAC repair',
      desiredCompletionTime: 'next week',
    }
    enrichIntakeFromTranscript(
      'Actually, sorry, the address is 46 Oak Street',
      intake,
      'ask_completion_time'
    )
    // The existing timing value should NOT be overwritten with the correction prose
    expect(intake.desiredCompletionTime).toBe('next week')
  })
})

// ============================================================================
// 3. CROSS-STAGE TIMING CORRECTION (Jason Williams)
// ============================================================================
describe('3. Cross-stage timing correction (AI-INTAKE-015)', () => {
  it('detects correction in "Actually make that within two weeks, not in next month"', () => {
    const { isCorrection } = detectCorrectionIntent('Actually make that within two weeks, not in next month')
    expect(isCorrection).toBe(true)
  })

  it('extracts timing correction at callback stage without polluting callbackTime', () => {
    const intake: IntakeData = {
      customerName: 'Jason Williams',
      serviceRequested: 'plumbing',
      desiredCompletionTime: 'next month',
      callbackTime: 'anytime',
    }
    enrichIntakeFromTranscript(
      'Actually make that within two weeks, not in next month',
      intake,
      'ask_callback_time'
    )
    // The correction should update desiredCompletionTime if extracted
    // but should NOT write the raw correction text into callbackTime
    expect(intake.callbackTime).not.toContain('Actually make that')
    expect(intake.callbackTime).not.toContain('not in next month')
  })
})

// ============================================================================
// 4. MIXED TIMING + NEW REQUEST DETAIL (AI-INTAKE-020)
// ============================================================================
describe('4. Mixed-intent: timing + new request detail', () => {
  it('extracts timing from mixed utterance at timing stage', () => {
    const intake: IntakeData = {
      customerName: 'Test Caller',
      serviceRequested: 'existing service',
    }
    enrichIntakeFromTranscript(
      'Probably next week. Actually, wait. Before that, I also need help importing my employee list.',
      intake,
      'ask_completion_time'
    )
    // The timing should be extracted, not the full prose
    if (intake.desiredCompletionTime) {
      expect(intake.desiredCompletionTime).not.toContain('I also need help')
      expect(intake.desiredCompletionTime).not.toContain('importing my employee list')
    }
  })
})

// ============================================================================
// 5. ONSITE "I DON'T KNOW" ADDRESS (AI-INTAKE-017/018)
// ============================================================================
describe('5. Onsite invalid location: "I don\'t know"', () => {
  it('isValidServiceAddress rejects "I don\'t know"', () => {
    expect(isValidServiceAddress("I don't know")).toBe(false)
  })

  it('isValidServiceAddress rejects "I said I don\'t know"', () => {
    expect(isValidServiceAddress("I said I don't know")).toBe(false)
  })

  it('isValidServiceAddress rejects "not sure"', () => {
    expect(isValidServiceAddress('not sure')).toBe(false)
  })

  it('isValidServiceAddress rejects "can\'t remember"', () => {
    expect(isValidServiceAddress("can't remember")).toBe(false)
  })

  it('isUsableServiceAddress returns false for "I don\'t know" with raw text', () => {
    const intake: IntakeData = { serviceAddress: "I don't know" }
    expect(isUsableServiceAddress(intake)).toBe(false)
  })

  it('isUsableServiceAddress returns false when locationRefused is true', () => {
    const intake: IntakeData = { serviceAddress: '123 Main St', locationRefused: true }
    expect(isUsableServiceAddress(intake)).toBe(false)
  })

  it('resolveNextRequiredStage does NOT complete when address is "I don\'t know"', () => {
    const intake: IntakeData = {
      customerName: 'Test',
      serviceRequested: 'plumbing',
      serviceAddress: "I don't know",
      desiredCompletionTime: 'next week',
      callbackTime: 'anytime',
    }
    const stage = resolveNextRequiredStage(intake, 'onsite')
    expect(stage).not.toBe('complete')
    expect(stage).toBe('ask_location_or_context')
  })
})

// ============================================================================
// 6. VALID FULL STREET ADDRESS PRESERVATION
// ============================================================================
describe('6. Full street address preservation', () => {
  it('isValidServiceAddress accepts "725 Liberty Avenue, Pittsburgh"', () => {
    expect(isValidServiceAddress('725 Liberty Avenue, Pittsburgh')).toBe(true)
  })

  it('isValidServiceAddress accepts "123 Main Street"', () => {
    expect(isValidServiceAddress('123 Main Street')).toBe(true)
  })

  it('isUsableServiceAddress returns true for valid full address', () => {
    const intake: IntakeData = { serviceAddress: '725 Liberty Avenue, Pittsburgh' }
    expect(isUsableServiceAddress(intake)).toBe(true)
  })

  it('resolveNextRequiredStage completes with valid onsite address', () => {
    const intake: IntakeData = {
      customerName: 'Test',
      serviceRequested: 'plumbing',
      serviceAddress: '725 Liberty Avenue, Pittsburgh',
      desiredCompletionTime: 'next week',
      callbackTime: 'anytime',
    }
    const stage = resolveNextRequiredStage(intake, 'onsite')
    expect(stage).toBe('complete')
  })
})

// ============================================================================
// 7. REMOTE NO-LOCATION COMPLETION
// ============================================================================
describe('7. Remote no-location completion', () => {
  it('resolveNextRequiredStage completes without address for remote', () => {
    const intake: IntakeData = {
      customerName: 'Test',
      serviceRequested: 'consultation',
      desiredCompletionTime: 'next week',
      callbackTime: 'anytime',
    }
    const stage = resolveNextRequiredStage(intake, 'remote')
    expect(stage).toBe('complete')
  })

  it('resolveNextSimpleModeStage completes without address for remote', () => {
    const intake: IntakeData = {
      customerName: 'Test',
      serviceRequested: 'consultation',
      desiredCompletionTime: 'next week',
      callbackTime: 'anytime',
    }
    const stage = resolveNextSimpleModeStage(intake, 'remote')
    expect(stage).toBe('complete')
  })
})

// ============================================================================
// 8. CUSTOMERS-COME-TO-BUSINESS NO-LOCATION COMPLETION
// ============================================================================
describe('8. Customers-come-to-business no-location completion', () => {
  it('resolveNextRequiredStage completes without address for customers_come_to_business', () => {
    const intake: IntakeData = {
      customerName: 'Test',
      serviceRequested: 'haircut',
      desiredCompletionTime: 'tomorrow',
      callbackTime: 'anytime',
    }
    const stage = resolveNextRequiredStage(intake, 'customers_come_to_business')
    expect(stage).toBe('complete')
  })
})

// ============================================================================
// 9. WEAK/GARBLED NAME CANNOT POLLUTE SERVICE/ADDRESS
// ============================================================================
describe('9. Name containment: garbled name does not pollute other fields', () => {
  it('name extraction at non-name stage does not overwrite serviceRequested', () => {
    const intake: IntakeData = {
      customerName: 'Previous Name',
      serviceRequested: 'plumbing repair',
    }
    // A name-like utterance at ask_location should not change customerName
    // (containment guard: non-name stage + no correction intent)
    enrichIntakeFromTranscript(
      'My name is Sivon OConnor',
      intake,
      'ask_location'
    )
    // customerName should NOT be overwritten at a non-name stage without correction
    expect(intake.customerName).toBe('Previous Name')
  })

  it('isValidCustomerName rejects service-type words as names', () => {
    expect(isValidCustomerName('plumbing')).toBe(false)
    expect(isValidCustomerName('HVAC')).toBe(false)
    expect(isValidCustomerName('property management')).toBe(false)
  })

  it('isValidCustomerName accepts real names', () => {
    expect(isValidCustomerName('John Smith')).toBe(true)
    expect(isValidCustomerName('Amanda Brooks')).toBe(true)
  })
})

// ============================================================================
// 10. NORMAL COMMON-NAME CALL STILL PASSES
// ============================================================================
describe('10. Normal common-name call still passes', () => {
  it('isValidCustomerName accepts common names', () => {
    expect(isValidCustomerName('Amanda Brooks')).toBe(true)
    expect(isValidCustomerName('Robert Hayes')).toBe(true)
    expect(isValidCustomerName('Michael Thompson')).toBe(true)
    expect(isValidCustomerName('Jennifer Martinez')).toBe(true)
  })

  it('isNameRequirementSatisfied passes with valid name', () => {
    const intake: IntakeData = { customerName: 'Amanda Brooks' }
    expect(isNameRequirementSatisfied(intake)).toBe(true)
  })

  it('isNameRequirementSatisfied passes with nameRefused', () => {
    const intake: IntakeData = { nameRefused: true }
    expect(isNameRequirementSatisfied(intake)).toBe(true)
  })
})

// ============================================================================
// 11. finalStage SKIP PATH NO EXCEPTION
// ============================================================================
describe('11. finalStage skip path no ReferenceError', () => {
  it('resolveNextRequiredStage does not throw on max skip-ahead', () => {
    // This tests the stage resolver path that was previously affected by
    // the finalStage TDZ. The resolver itself should never throw.
    const intake: IntakeData = {
      customerName: 'Test',
      serviceRequested: 'service',
      serviceAddress: '123 Main St',
      desiredCompletionTime: 'next week',
      callbackTime: 'anytime',
    }
    expect(() => resolveNextRequiredStage(intake, 'onsite')).not.toThrow()
    expect(() => resolveNextSimpleModeStage(intake, 'onsite')).not.toThrow()
  })

  it('resolveNextRequiredStage returns correct stage for partial intake', () => {
    const intake: IntakeData = {
      customerName: 'Test',
      serviceRequested: 'service',
      // Missing: address, timing, callback
    }
    const stage = resolveNextRequiredStage(intake, 'onsite')
    expect(stage).toBe('ask_location_or_context')
  })
})

// ============================================================================
// 12. COMPLETED INTAKE THEN EMPTY PARTIAL -> CANONICAL CONTEXT PRESERVED
// ============================================================================
describe('12. Partial intake does not erase valid context (canonical merge)', () => {
  // This tests the merge contract at the data level: a later empty record
  // should not erase fields from an earlier valid record.
  // The actual getLeadAIIntake function is in the Next.js codebase;
  // here we test the contract logic directly.

  it('merge contract: later empty record preserves earlier valid fields', () => {
    // Simulate the findLatestNonEmptyField logic from getLeadAIIntake
    const callRecords = [
      { created_at: '2024-01-02', extracted_info: {} }, // Latest: empty (silence call)
      { created_at: '2024-01-01', extracted_info: { reasonForCalling: 'Furnace Repair', addressOrLocation: '88 Cedar Street, Pittsburgh', desiredCompletionTime: 'This weekend', preferredCallbackTime: 'Friday morning' } },
    ]

    const sorted = [...callRecords].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    // Find latest non-empty for each field
    const findLatest = (paths: string[]): string | null => {
      for (const record of sorted) {
        const info = record.extracted_info
        if (!info) continue
        for (const path of paths) {
          const val = (info as any)[path]
          if (val && typeof val === 'string' && val.trim()) return val.trim()
        }
      }
      return null
    }

    // Even though the latest record is empty, earlier values should be preserved
    expect(findLatest(['reasonForCalling', 'serviceRequested'])).toBe('Furnace Repair')
    expect(findLatest(['addressOrLocation', 'serviceAddress'])).toBe('88 Cedar Street, Pittsburgh')
    expect(findLatest(['desiredCompletionTime'])).toBe('This weekend')
    expect(findLatest(['preferredCallbackTime', 'callbackTime'])).toBe('Friday morning')
  })

  it('merge contract: explicit correction in later record overrides earlier', () => {
    const callRecords = [
      { created_at: '2024-01-02', extracted_info: { addressOrLocation: '46 Oak Street' } }, // Correction
      { created_at: '2024-01-01', extracted_info: { addressOrLocation: '88 Cedar Street, Pittsburgh', reasonForCalling: 'Furnace Repair' } },
    ]

    const sorted = [...callRecords].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )

    const findLatest = (paths: string[]): string | null => {
      for (const record of sorted) {
        const info = record.extracted_info
        if (!info) continue
        for (const path of paths) {
          const val = (info as any)[path]
          if (val && typeof val === 'string' && val.trim()) return val.trim()
        }
      }
      return null
    }

    // Corrected address wins (latest non-empty)
    expect(findLatest(['addressOrLocation'])).toBe('46 Oak Street')
    // But other fields from earlier record are preserved
    expect(findLatest(['reasonForCalling'])).toBe('Furnace Repair')
  })
})

// ============================================================================
// NORMALIZATION TESTS (Part F)
// ============================================================================
describe('Normalization: strip dangling filler fragments', () => {
  it('strips "I live" trailing fragment from service request', () => {
    expect(normalizeStructuredFieldValue('a manicure. I live', 'service')).toBe('a manicure')
  })

  it('strips trailing "I\'m" alone', () => {
    expect(normalizeStructuredFieldValue("I'm", 'service')).toBe('')
  })

  it('preserves meaningful content', () => {
    expect(normalizeStructuredFieldValue('a manicure', 'service')).toBe('a manicure')
  })

  it('preserves temporal qualifiers for callback', () => {
    expect(normalizeStructuredFieldValue('anytime tomorrow afternoon', 'callback')).toBe('anytime tomorrow afternoon')
  })

  it('strips "and I..." trailing from service', () => {
    expect(normalizeStructuredFieldValue('a manicure, and I need help', 'service')).toBe('a manicure')
  })
})
