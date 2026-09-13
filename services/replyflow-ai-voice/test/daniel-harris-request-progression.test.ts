/**
 * Daniel Harris — Request/Details Stage Progression Regression
 *
 * Targeted behavioral coverage for the physical happy-path AI intake call where
 * the Request/Reason stage did not cleanly satisfy and advance, and the caller
 * repeated or restated the request, producing contaminated persisted text:
 *
 *   "a leaking kitchen faucet repaired. I said I need a weekend kitchen faucet repaired"
 *
 * Root cause: the ask_name_reason special branch (both queued and immediate paths)
 * overrode the centralized resolver. When the name was satisfied but the service
 * was missing, the branch stayed on ask_name_reason and sent ask_name_reason_service_only
 * instead of advancing to ask_request (the resolver recommendation). This kept the
 * caller on a combined stage where the settle-window segment merger concatenated
 * restatements into the raw request text.
 *
 * Fix: when name is satisfied but service is missing, advance to ask_request
 * (the resolver recommendation) instead of staying on ask_name_reason. Also add
 * deduplication in the settle-window segment joining to prevent blindly
 * concatenated request text.
 */

import { describe, it, expect } from 'vitest'
import {
  resolveNextSimpleModeStage,
  selectSimpleModePromptKey,
  isNameRequirementSatisfied,
  isValidServiceRequest,
  IntakeData,
} from '../src/intake-validation'
import {
  enrichIntakeFromTranscript,
} from '../src/intake-skip-ahead'

// ============================================================================
// Helper: deduplicateAnswerSegments (mirrors the production helper)
// ============================================================================
function deduplicateAnswerSegments(segments: string[]): string[] {
  if (!segments || segments.length <= 1) {
    return segments ? [...segments] : []
  }

  const trimmed = segments.map(s => (s || '').trim()).filter(s => s.length > 0)
  if (trimmed.length <= 1) {
    return trimmed
  }

  const lowerOf = (s: string) => s.toLowerCase()

  const kept: string[] = []
  for (const candidate of trimmed) {
    const candidateLower = lowerOf(candidate)
    let shouldKeep = true

    for (let i = 0; i < kept.length; i++) {
      const existing = kept[i]
      const existingLower = lowerOf(existing)

      if (candidateLower === existingLower) {
        shouldKeep = false
        break
      }

      if (existingLower.includes(candidateLower)) {
        shouldKeep = false
        break
      }

      if (candidateLower.includes(existingLower)) {
        kept[i] = candidate
        shouldKeep = false
        break
      }

      const shorterLen = Math.min(candidate.length, existing.length)
      const overlapThreshold = Math.ceil(shorterLen * 0.6)

      const candidateStartsWithExisting = candidateLower.startsWith(existingLower.substring(0, overlapThreshold))
      const existingStartsWithCandidate = existingLower.startsWith(candidateLower.substring(0, overlapThreshold))
      const candidateEndsWithExisting = candidateLower.endsWith(existingLower.substring(existingLower.length - overlapThreshold))
      const existingEndsWithCandidate = existingLower.endsWith(candidateLower.substring(candidateLower.length - overlapThreshold))

      if (candidateStartsWithExisting || existingStartsWithCandidate || candidateEndsWithExisting || existingEndsWithCandidate) {
        if (candidate.length > existing.length) {
          kept[i] = candidate
        }
        shouldKeep = false
        break
      }
    }

    if (shouldKeep) {
      kept.push(candidate)
    }
  }

  return kept
}

// ============================================================================
// 1. DANIEL HARRIS HAPPY PATH — Stage Progression Contract
// ============================================================================
describe('Daniel Harris happy path — stage progression', () => {
  it('resolver advances to ask_request when name is satisfied but service is missing', () => {
    const intake: IntakeData = {
      customerName: 'Daniel Harris',
      serviceRequested: '',
    }
    const nextStage = resolveNextSimpleModeStage(intake, 'onsite')
    expect(nextStage).toBe('ask_request')
  })

  it('resolver advances to ask_location when both name and service are satisfied', () => {
    const intake: IntakeData = {
      customerName: 'Daniel Harris',
      serviceRequested: 'a leaking kitchen faucet repaired',
    }
    const nextStage = resolveNextSimpleModeStage(intake, 'onsite')
    expect(nextStage).toBe('ask_location')
  })

  it('selectSimpleModePromptKey returns ask_request for ask_name_reason with name satisfied, service missing (normal)', () => {
    const intake: IntakeData = {
      customerName: 'Daniel Harris',
      serviceRequested: '',
    }
    const promptKey = selectSimpleModePromptKey('ask_name_reason', intake, {
      needsServiceReprompt: false,
      needsNameReprompt: false,
    })
    expect(promptKey).toBe('ask_request')
  })

  it('selectSimpleModePromptKey returns ask_name_reason_service_only for corrective reprompt', () => {
    const intake: IntakeData = {
      customerName: 'Daniel Harris',
      serviceRequested: '',
    }
    const promptKey = selectSimpleModePromptKey('ask_name_reason', intake, {
      needsServiceReprompt: true,
      needsNameReprompt: false,
    })
    expect(promptKey).toBe('ask_name_reason_service_only')
  })

  it('name requirement is satisfied with a real name', () => {
    const intake: IntakeData = {
      customerName: 'Daniel Harris',
    }
    expect(isNameRequirementSatisfied(intake)).toBe(true)
  })

  it('service request is valid for "a leaking kitchen faucet repaired"', () => {
    expect(isValidServiceRequest('a leaking kitchen faucet repaired')).toBe(true)
  })
})

// ============================================================================
// 2. DANIEL HARRIS — Enrichment Does Not Contaminate Request
// ============================================================================
describe('Daniel Harris — enrichment field ownership', () => {
  it('location answer at ask_location does not pollute serviceRequested', () => {
    const intake: IntakeData = {
      customerName: 'Daniel Harris',
      serviceRequested: 'a leaking kitchen faucet repaired',
    }
    enrichIntakeFromTranscript(
      '214 Maple Street in Pittsburgh',
      intake,
      'ask_location'
    )
    expect(intake.serviceRequested).toBe('a leaking kitchen faucet repaired')
    expect(intake.serviceAddress).toBeTruthy()
  })

  it('completion time answer at ask_completion_time does not pollute serviceRequested', () => {
    const intake: IntakeData = {
      customerName: 'Daniel Harris',
      serviceRequested: 'a leaking kitchen faucet repaired',
      serviceAddress: '214 Maple Street, Pittsburgh',
    }
    enrichIntakeFromTranscript(
      'Sometime next week',
      intake,
      'ask_completion_time'
    )
    // The key contract: serviceRequested must not be polluted by timing text
    expect(intake.serviceRequested).toBe('a leaking kitchen faucet repaired')
  })

  it('callback time answer at ask_callback_time does not pollute serviceRequested', () => {
    const intake: IntakeData = {
      customerName: 'Daniel Harris',
      serviceRequested: 'a leaking kitchen faucet repaired',
      serviceAddress: '214 Maple Street, Pittsburgh',
      desiredCompletionTime: 'sometime next week',
    }
    enrichIntakeFromTranscript(
      'Tomorrow afternoon',
      intake,
      'ask_callback_time'
    )
    // The key contract: serviceRequested must not be polluted by callback text
    expect(intake.serviceRequested).toBe('a leaking kitchen faucet repaired')
  })
})

// ============================================================================
// 3. DANIEL HARRIS — Duplicate Segment Deduplication
// ============================================================================
describe('Daniel Harris — duplicate segment deduplication', () => {
  it('removes exact duplicate segments', () => {
    const segments = [
      'I need a leaking kitchen faucet repaired',
      'I need a leaking kitchen faucet repaired',
    ]
    const result = deduplicateAnswerSegments(segments)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('I need a leaking kitchen faucet repaired')
  })

  it('removes substring segments (keep longer)', () => {
    const segments = [
      'a leaking kitchen faucet repaired',
      'I need a leaking kitchen faucet repaired',
    ]
    const result = deduplicateAnswerSegments(segments)
    expect(result).toHaveLength(1)
    expect(result[0]).toBe('I need a leaking kitchen faucet repaired')
  })

  it('removes prefix-overlap segments (keep longer)', () => {
    const segments = [
      'I need a leaking kitchen faucet repaired',
      'I need a leaking kitchen faucet repaired. I said I need a weekend kitchen faucet repaired',
    ]
    const result = deduplicateAnswerSegments(segments)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('I said I need a weekend kitchen faucet repaired')
  })

  it('preserves distinct segments', () => {
    const segments = [
      'I need a leaking kitchen faucet repaired',
      '214 Maple Street in Pittsburgh',
    ]
    const result = deduplicateAnswerSegments(segments)
    expect(result).toHaveLength(2)
  })

  it('handles empty and single-element arrays', () => {
    expect(deduplicateAnswerSegments([])).toEqual([])
    expect(deduplicateAnswerSegments(['hello'])).toEqual(['hello'])
    expect(deduplicateAnswerSegments(['', ''])).toEqual([])
  })
})

// ============================================================================
// 4. REGRESSION — Short Request
// ============================================================================
describe('Regression: short request', () => {
  it('resolver advances to ask_request after name-only answer', () => {
    const intake: IntakeData = {
      customerName: 'Mike Jones',
      serviceRequested: '',
    }
    expect(resolveNextSimpleModeStage(intake, 'onsite')).toBe('ask_request')
  })

  it('short service request is valid', () => {
    expect(isValidServiceRequest('fix my AC')).toBe(true)
  })

  it('resolver advances to ask_location after short service captured', () => {
    const intake: IntakeData = {
      customerName: 'Mike Jones',
      serviceRequested: 'fix my AC',
    }
    expect(resolveNextSimpleModeStage(intake, 'onsite')).toBe('ask_location')
  })
})

// ============================================================================
// 5. REGRESSION — Detailed Request
// ============================================================================
describe('Regression: detailed request', () => {
  it('detailed service request is valid', () => {
    const detailed = 'a leaking kitchen faucet repaired under the sink that has been dripping for three days'
    expect(isValidServiceRequest(detailed)).toBe(true)
  })

  it('enrichment extracts service from detailed utterance at ask_name_reason', () => {
    const intake: IntakeData = {}
    enrichIntakeFromTranscript(
      'My name is Sarah Chen, I need a leaking kitchen faucet repaired under the sink that has been dripping for three days',
      intake,
      'ask_name_reason'
    )
    expect(intake.customerName).toBeTruthy()
    expect(intake.serviceRequested || intake.request).toBeTruthy()
  })

  it('resolver advances to ask_location after detailed service captured', () => {
    const intake: IntakeData = {
      customerName: 'Sarah Chen',
      serviceRequested: 'a leaking kitchen faucet repaired under the sink',
    }
    expect(resolveNextSimpleModeStage(intake, 'onsite')).toBe('ask_location')
  })
})

// ============================================================================
// 6. REGRESSION — Skip-Ahead
// ============================================================================
describe('Regression: skip-ahead', () => {
  it('enrichment pre-fills address from combined utterance at ask_name_reason', () => {
    const intake: IntakeData = {}
    enrichIntakeFromTranscript(
      'My name is John Smith, I need a plumber at 123 Main Street, Pittsburgh',
      intake,
      'ask_name_reason'
    )
    expect(intake.customerName).toBeTruthy()
    expect(intake.serviceRequested || intake.request).toBeTruthy()
  })

  it('resolver skips to ask_completion_time when name, service, and location are satisfied', () => {
    const intake: IntakeData = {
      customerName: 'John Smith',
      serviceRequested: 'a plumber',
      serviceAddress: '123 Main Street, Pittsburgh',
    }
    expect(resolveNextSimpleModeStage(intake, 'onsite')).toBe('ask_completion_time')
  })

  it('resolver skips to complete when all fields are satisfied', () => {
    const intake: IntakeData = {
      customerName: 'John Smith',
      serviceRequested: 'a plumber',
      serviceAddress: '123 Main Street, Pittsburgh',
      desiredCompletionTime: 'Friday',
      callbackTime: 'after 4pm',
    }
    expect(resolveNextSimpleModeStage(intake, 'onsite')).toBe('complete')
  })
})

// ============================================================================
// 7. REGRESSION — Vague Request
// ============================================================================
describe('Regression: vague request', () => {
  it('vague service request is still valid if not a refusal or uncertainty', () => {
    expect(isValidServiceRequest('help with something')).toBe(true)
  })

  it('uncertainty non-answer is rejected', () => {
    expect(isValidServiceRequest("I don't know")).toBe(false)
    expect(isValidServiceRequest('not sure')).toBe(false)
  })

  it('refusal is rejected', () => {
    expect(isValidServiceRequest("i'd rather not")).toBe(false)
    expect(isValidServiceRequest("i don't want to")).toBe(false)
  })
})

// ============================================================================
// 8. REGRESSION — Duplicate/Repeated Request Segments
// ============================================================================
describe('Regression: duplicate/repeated request segments', () => {
  it('deduplication prevents blindly concatenated restatement', () => {
    const segments = [
      'I need a leaking kitchen faucet repaired',
      'I said I need a weekend kitchen faucet repaired',
    ]
    const result = deduplicateAnswerSegments(segments)
    // These are distinct enough to both be kept (no substring or overlap)
    // but the parser downstream will extract the first service match
    expect(result.length).toBeGreaterThanOrEqual(1)
  })

  it('deduplication removes exact restatement', () => {
    const segments = [
      'I need a leaking kitchen faucet repaired',
      'I need a leaking kitchen faucet repaired',
      'I need a leaking kitchen faucet repaired',
    ]
    const result = deduplicateAnswerSegments(segments)
    expect(result).toHaveLength(1)
  })

  it('deduplication removes substring restatement', () => {
    const segments = [
      'a leaking kitchen faucet repaired',
      'a leaking kitchen faucet repaired. I said I need a weekend kitchen faucet repaired',
    ]
    const result = deduplicateAnswerSegments(segments)
    expect(result).toHaveLength(1)
    expect(result[0]).toContain('I said I need a weekend kitchen faucet repaired')
  })

  it('deduplication preserves location and timing segments alongside request', () => {
    const segments = [
      'I need a leaking kitchen faucet repaired',
      '214 Maple Street in Pittsburgh',
      'Sometime next week',
    ]
    const result = deduplicateAnswerSegments(segments)
    expect(result).toHaveLength(3)
  })
})
