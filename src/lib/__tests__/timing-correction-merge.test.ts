import { describe, it, expect } from 'vitest'
import { getLeadAIIntake } from '../ai-field-mapping'
import { safeMergeVoicemailExtraction } from '../voicemail-extraction'
import { normalizeTiming, normalizeCallbackTime } from '../ai-intake-formatter'

describe('TIMING-SPECIFIC USER CORRECTION TESTS', () => {
  describe('CASE A - Callback Correction', () => {
    it('should use user-corrected callbackTime over AI value', () => {
      const lead = {
        id: 'lead-1',
        name: 'Test Lead',
        raw_metadata: {
          extracted_info: {
            preferredCallbackTime: 'Anytime',
          },
          corrected_fields: {
            callbackTime: 'After 5',
          },
        },
      }

      const result = getLeadAIIntake(lead)

      // User correction should be authoritative
      expect(result.callbackTime).toBe('After 5')
      expect(result.callbackTime).not.toBe('Anytime')
    })
  })

  describe('CASE B - Desired Completion Correction', () => {
    it('should use user-corrected desiredCompletion over AI value', () => {
      const lead = {
        id: 'lead-1',
        name: 'Test Lead',
        raw_metadata: {
          extracted_info: {
            desiredCompletionTime: 'Next week',
          },
          corrected_fields: {
            desiredCompletion: 'Friday',
          },
        },
      }

      const result = getLeadAIIntake(lead)

      // User correction should be authoritative
      expect(result.desiredCompletion).toBe('Friday')
      expect(result.desiredCompletion).not.toBe('Next week')
    })
  })

  describe('CASE C - Stale AI After Callback Correction', () => {
    it('should preserve user correction even when AI provides stale value', () => {
      const lead = {
        id: 'lead-1',
        name: 'Test Lead',
        raw_metadata: {
          extracted_info: {
            preferredCallbackTime: 'Anytime', // Stale AI value
          },
          corrected_fields: {
            callbackTime: 'After 5', // User correction
          },
        },
      }

      const result = getLeadAIIntake(lead)

      // User correction remains authoritative
      expect(result.callbackTime).toBe('After 5')
      expect(result.callbackTime).not.toBe('Anytime')
    })
  })
})

describe('TIMING-SPECIFIC PARTIAL/FINAL MERGE TESTS', () => {
  describe('CASE D - High Confidence Improves Callback', () => {
    it('should update callback with high-confidence new value', () => {
      const existingMetadata = {
        extracted_info: {
          preferredCallbackTime: 'Anytime',
        }
      }

      const voicemailExtraction = {
        extractedInfo: {
          preferredCallbackTime: 'After 5',
        },
        confidence: 0.8,
        source: 'sms',
        extractedAt: new Date().toISOString()
      }

      const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction)

      // High confidence should update
      expect(merged.extracted_info.preferredCallbackTime).toBe('After 5')
    })
  })

  describe('CASE E - Low Confidence Does Not Degrade Callback', () => {
    it('should preserve existing callback with low-confidence new value', () => {
      const existingMetadata = {
        extracted_info: {
          preferredCallbackTime: 'After 5',
        }
      }

      const voicemailExtraction = {
        extractedInfo: {
          preferredCallbackTime: 'Anytime',
        },
        confidence: 0.3,
        source: 'sms',
        extractedAt: new Date().toISOString()
      }

      const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction)

      // Low confidence should not degrade
      expect(merged.extracted_info.preferredCallbackTime).toBe('After 5')
    })
  })

  describe('CASE F - Null Final Preserves Desired Completion', () => {
    it('should preserve existing desiredCompletion when final is null', () => {
      const existingMetadata = {
        extracted_info: {
          desiredCompletionTime: 'Next week',
        }
      }

      const voicemailExtraction = {
        extractedInfo: {
          desiredCompletionTime: null,
        },
        confidence: 0.8,
        source: 'sms',
        extractedAt: new Date().toISOString()
      }

      const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction)

      // Null final should preserve existing
      expect(merged.extracted_info.desiredCompletionTime).toBe('Next week')
    })
  })
})

describe('MERGE → NORMALIZATION INTEGRATION', () => {
  it('should normalize callback after merge', () => {
    const existingMetadata = {
      extracted_info: {
        preferredCallbackTime: null,
      }
    }

    const voicemailExtraction = {
      extractedInfo: {
        preferredCallbackTime: 'Um, anytime after 4 but before 9.',
      },
      confidence: 0.8,
      source: 'sms',
      extractedAt: new Date().toISOString()
    }

    const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction)
    const normalized = normalizeCallbackTime(merged.extracted_info.preferredCallbackTime)

    // Raw merged value should be preserved
    expect(merged.extracted_info.preferredCallbackTime).toBe('Um, anytime after 4 but before 9.')

    // Normalized value should have filler removed
    expect(normalized).toBe('Anytime after 4 but before 9')
    expect(normalized).not.toContain('Um')
    expect(normalized).not.toContain('um')
  })

  it('should normalize desiredCompletion after merge', () => {
    const existingMetadata = {
      extracted_info: {
        desiredCompletionTime: null,
      }
    }

    const voicemailExtraction = {
      extractedInfo: {
        desiredCompletionTime: 'Uh September 9th through the 12th.',
      },
      confidence: 0.8,
      source: 'sms',
      extractedAt: new Date().toISOString()
    }

    const merged = safeMergeVoicemailExtraction(existingMetadata, voicemailExtraction)
    const normalized = normalizeTiming(merged.extracted_info.desiredCompletionTime)

    // Raw merged value should be preserved
    expect(merged.extracted_info.desiredCompletionTime).toBe('Uh September 9th through the 12th.')

    // Normalized value should have filler removed
    expect(normalized).toBe('September 9th through the 12th')
    expect(normalized).not.toContain('Uh')
    expect(normalized).not.toContain('uh')
  })
})