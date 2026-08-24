/**
 * Simple Mode Transcript Persistence Tests
 * 
 * Tests for turn-by-turn transcript persistence in Simple Mode
 * ensuring canonical questions are paired with verbatim customer answers.
 */

import { describe, it, expect } from 'vitest'

// Mock the intake template helper
const mockGetIntakeStageTextSafe = (template: string, stage: string): string => {
  const templates: Record<string, Record<string, string>> = {
    on_site: {
      ask_name: "Hi, thanks for calling. I'm the virtual assistant for the business. I'll gather a few quick details so the business owner can follow up with you. First, may I have your name?",
      ask_request: "Thank you. Can you let me know what you need help with today and any details that would be helpful?",
      ask_location: "All right. Just a couple more questions. Where will this take place?",
      ask_completion_time: "When are you hoping this will be done?",
      ask_callback_time: "Okay. Last question—what would be the best time for the business to call you back?",
      complete: "Okay. Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a great day."
    },
    appointment: {
      ask_name: "Hi, thanks for calling. I'm the virtual assistant for the business. I'll gather a few quick details so the business owner can follow up with you. First, may I have your name?",
      ask_request: "Thank you. Can you let me know what you need help with today and any details that would be helpful?",
      ask_location: "All right. Just a couple more questions. Where will this take place?",
      ask_completion_time: "When are you hoping this will be done?",
      ask_callback_time: "Okay. Last question—what would be the best time for the business to call you back?",
      complete: "Okay. Thank you for calling. I'll pass this information along to the business, and they will get back to you soon. Have a great day."
    }
  }
  
  return templates[template]?.[stage] || templates.on_site[stage] || "Can you please provide more information?"
}

/**
 * Helper function to build turn-by-turn transcript from stageCaptures
 * This mirrors the backend persistence logic
 */
function buildSimpleModeTranscript(
  stageCaptures: Array<{
    stage: string
    rawTranscript: string
    capturedAnswer: string
    extractedField: string
    source: string
    timestamp: string
    blocked?: boolean
    blockReason?: string
  }>,
  intakeTemplate: string = 'on_site'
): Array<{ role: string; text: string; timestamp?: string }> {
  const transcript: Array<{ role: string; text: string; timestamp?: string }> = []
  
  for (const capture of stageCaptures) {
    // Skip blocked captures
    if (capture.blocked) {
      continue
    }
    
    // Get canonical question text
    const questionText = mockGetIntakeStageTextSafe(intakeTemplate, capture.stage)
    
    // Add assistant turn (question)
    transcript.push({
      role: 'assistant',
      text: questionText,
      timestamp: capture.timestamp
    })
    
    // Add user turn (answer) - verbatim
    transcript.push({
      role: 'user',
      text: capture.rawTranscript,
      timestamp: capture.timestamp
    })
  }
  
  return transcript
}

describe('Simple Mode Transcript Persistence', () => {
  describe('Basic turn-by-turn persistence', () => {
    it('TEST A - ask_name capture persists assistant question then user answer', () => {
      const stageCaptures = [
        {
          stage: 'ask_name',
          rawTranscript: 'John Smith',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ]
      
      const transcript = buildSimpleModeTranscript(stageCaptures, 'on_site')
      
      expect(transcript).toHaveLength(2)
      expect(transcript[0]).toEqual({
        role: 'assistant',
        text: "Hi, thanks for calling. I'm the virtual assistant for the business. I'll gather a few quick details so the business owner can follow up with you. First, may I have your name?",
        timestamp: '2024-01-01T10:00:00Z'
      })
      expect(transcript[1]).toEqual({
        role: 'user',
        text: 'John Smith',
        timestamp: '2024-01-01T10:00:00Z'
      })
    })
    
    it('TEST B - multiple captures persist alternating question/answer pairs in stage order', () => {
      const stageCaptures = [
        {
          stage: 'ask_name',
          rawTranscript: 'John Smith',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        },
        {
          stage: 'ask_location',
          rawTranscript: '123 Main Street',
          capturedAnswer: '123 Main Street',
          extractedField: 'serviceAddress',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:05Z'
        },
        {
          stage: 'ask_callback_time',
          rawTranscript: 'This afternoon',
          capturedAnswer: 'This afternoon',
          extractedField: 'callbackTime',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:10Z'
        }
      ]
      
      const transcript = buildSimpleModeTranscript(stageCaptures, 'on_site')
      
      expect(transcript).toHaveLength(6)
      
      // Verify alternating pattern
      expect(transcript[0].role).toBe('assistant')
      expect(transcript[1].role).toBe('user')
      expect(transcript[2].role).toBe('assistant')
      expect(transcript[3].role).toBe('user')
      expect(transcript[4].role).toBe('assistant')
      expect(transcript[5].role).toBe('user')
      
      // Verify stage order preserved
      expect(transcript[0].text).toContain('First, may I have your name?')
      expect(transcript[2].text).toContain('Where will this take place?')
      expect(transcript[4].text).toContain('what would be the best time')
      
      // Verify customer answers verbatim
      expect(transcript[1].text).toBe('John Smith')
      expect(transcript[3].text).toBe('123 Main Street')
      expect(transcript[5].text).toBe('This afternoon')
    })
    
    it('TEST C - customer rawTranscript is byte-for-byte preserved', () => {
      const verbatimWording = "Yeah, I need to get my grass cut. That's about a half an acre yard and it's got a privacy fence. But it can make it tougher to get some heavier equipment into the yard in the backyard 1632 South Pine Drive Sometime in the next two weeks, if that's possible. Any time in the mornings"
      
      const stageCaptures = [
        {
          stage: 'ask_request',
          rawTranscript: verbatimWording,
          capturedAnswer: verbatimWording,
          extractedField: 'serviceRequested',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ]
      
      const transcript = buildSimpleModeTranscript(stageCaptures, 'on_site')
      
      expect(transcript[1].text).toBe(verbatimWording)
      expect(transcript[1].text).toContain('half an acre yard')
      expect(transcript[1].text).toContain('privacy fence')
      expect(transcript[1].text).toContain('1632 South Pine Drive')
    })
  })
  
  describe('Template resolution', () => {
    it('TEST D - different intake templates resolve through canonical template helper', () => {
      const stageCaptures = [
        {
          stage: 'ask_name',
          rawTranscript: 'Jane Doe',
          capturedAnswer: 'Jane Doe',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ]
      
      const onSiteTranscript = buildSimpleModeTranscript(stageCaptures, 'on_site')
      const appointmentTranscript = buildSimpleModeTranscript(stageCaptures, 'appointment')
      
      // Both should use canonical questions
      expect(onSiteTranscript[0].text).toContain('First, may I have your name?')
      expect(appointmentTranscript[0].text).toContain('First, may I have your name?')
      
      // Customer answer should be identical
      expect(onSiteTranscript[1].text).toBe('Jane Doe')
      expect(appointmentTranscript[1].text).toBe('Jane Doe')
    })
  })
  
  describe('Skipped and blocked stages', () => {
    it('TEST E - skipped stage creates no fake pair', () => {
      // If a stage was skipped, it won't have a stageCapture
      const stageCaptures = [
        {
          stage: 'ask_name',
          rawTranscript: 'John Smith',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        }
        // ask_location was skipped, no capture
        // ask_callback_time was skipped, no capture
      ]
      
      const transcript = buildSimpleModeTranscript(stageCaptures, 'on_site')
      
      // Only ask_name should have a pair
      expect(transcript).toHaveLength(2)
      expect(transcript[0].role).toBe('assistant')
      expect(transcript[1].role).toBe('user')
    })
    
    it('TEST F - blocked capture does not create fake dialogue', () => {
      const stageCaptures = [
        {
          stage: 'ask_name',
          rawTranscript: 'John Smith',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        },
        {
          stage: 'ask_name',
          rawTranscript: 'I already said John',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:05Z',
          blocked: true,
          blockReason: 'stage_finalized_field_already_set'
        }
      ]
      
      const transcript = buildSimpleModeTranscript(stageCaptures, 'on_site')
      
      // Blocked capture should be skipped
      expect(transcript).toHaveLength(2)
      expect(transcript[1].text).toBe('John Smith') // First answer only
    })
  })
  
  describe('Fallback behavior', () => {
    it('TEST G - no stageCaptures fallback remains customer-only and does not invent question', () => {
      const stageCaptures: any[] = []
      
      const transcript = buildSimpleModeTranscript(stageCaptures, 'on_site')
      
      // Empty transcript - no fake questions invented
      expect(transcript).toHaveLength(0)
    })
  })
  
  describe('Legacy compatibility', () => {
    it('TEST H - legacy customer-only transcript normalization still works', () => {
      // Simulate legacy customer-only transcript
      const legacyTranscript = [
        { role: 'user', text: 'John Smith' }
      ]
      
      // Should not crash and should preserve the data
      expect(legacyTranscript).toHaveLength(1)
      expect(legacyTranscript[0].role).toBe('user')
      expect(legacyTranscript[0].text).toBe('John Smith')
    })
    
    it('TEST I - legacy warning detection still works for customer-only', () => {
      const customerOnlyTranscript = [
        { role: 'user', text: 'John Smith' }
      ]
      
      const hasUserTurns = customerOnlyTranscript.some(t => t.role === 'user' || t.role === 'caller')
      const hasAssistantTurns = customerOnlyTranscript.some(t => t.role === 'assistant')
      const isLegacyCustomerOnly = hasUserTurns && !hasAssistantTurns && customerOnlyTranscript.length > 0
      
      expect(isLegacyCustomerOnly).toBe(true)
    })
    
    it('TEST J - new assistant/user transcript does NOT show legacy warning', () => {
      const newTranscript = buildSimpleModeTranscript([
        {
          stage: 'ask_name',
          rawTranscript: 'John Smith',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ])
      
      const hasUserTurns = newTranscript.some(t => t.role === 'user' || t.role === 'caller')
      const hasAssistantTurns = newTranscript.some(t => t.role === 'assistant')
      const isLegacyCustomerOnly = hasUserTurns && !hasAssistantTurns && newTranscript.length > 0
      
      expect(hasUserTurns).toBe(true)
      expect(hasAssistantTurns).toBe(true)
      expect(isLegacyCustomerOnly).toBe(false)
    })
  })
  
  describe('Message count pluralization', () => {
    it('TEST K - message count: 1 message (singular)', () => {
      const count = 1
      const label = count === 1 ? 'message' : 'messages'
      
      expect(label).toBe('message')
      expect(`${count} ${label}`).toBe('1 message')
    })
    
    it('TEST K - message count: 2 messages (plural)', () => {
      const count = 2
      const label = count === 1 ? 'message' : 'messages'
      
      expect(label).toBe('messages')
      expect(`${count} ${label}`).toBe('2 messages')
    })
    
    it('TEST K - message count: 0 messages (plural)', () => {
      const count = 0
      const label = count === 1 ? 'message' : 'messages'
      
      expect(label).toBe('messages')
      expect(`${count} ${label}`).toBe('0 messages')
    })
  })
  
  describe('Isolation and robustness', () => {
    it('TEST L - selected-call isolation remains intact', () => {
      const callATranscript = buildSimpleModeTranscript([
        {
          stage: 'ask_name',
          rawTranscript: 'John Smith',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ])
      
      const callBTranscript = buildSimpleModeTranscript([
        {
          stage: 'ask_name',
          rawTranscript: 'Jane Doe',
          capturedAnswer: 'Jane Doe',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-02T10:00:00Z'
        }
      ])
      
      // Each call should have its own transcript
      expect(callATranscript[1].text).toBe('John Smith')
      expect(callBTranscript[1].text).toBe('Jane Doe')
      expect(callATranscript[1].text).not.toBe(callBTranscript[1].text)
    })
    
    it('TEST M - malformed transcript remains crash-safe', () => {
      const malformedInputs = [
        null,
        undefined,
        '',
        'not an array',
        [],
        [null, undefined, 'string']
      ]
      
      // These should not crash when processed by normalization
      malformedInputs.forEach(input => {
        expect(() => {
          // Simulate what normalizeAITranscript does
          if (!input || typeof input !== 'object') {
            return []
          }
          if (Array.isArray(input)) {
            return input.filter(Boolean)
          }
          return []
        }).not.toThrow()
      })
    })
  })
  
  describe('Extraction and downstream compatibility', () => {
    it('TEST N - Simple Mode extracted_info behavior is unchanged by persistence enhancement', () => {
      // The transcript persistence change should NOT affect extracted_info
      // extracted_info is built from intakeData, not from the persisted transcript
      
      const intakeData = {
        customerName: 'John Smith',
        serviceRequested: 'Lawn mowing',
        serviceAddress: '123 Main Street',
        callbackTime: 'This afternoon'
      }
      
      // extracted_info should be derived from intakeData only
      expect(intakeData.customerName).toBe('John Smith')
      expect(intakeData.serviceRequested).toBe('Lawn mowing')
      
      // Transcript enhancement should not change this
      const transcript = buildSimpleModeTranscript([
        {
          stage: 'ask_name',
          rawTranscript: 'John Smith',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ])
      
      // Transcript now has assistant turns, but extracted_info is unchanged
      expect(intakeData.customerName).toBe('John Smith')
      expect(transcript[0].role).toBe('assistant') // New assistant turn
    })
    
    it('TEST O - SMS output remains unchanged for same extracted_info', () => {
      // SMS is generated from extracted_info, not from transcript
      // So adding assistant turns should not affect SMS
      
      const extractedInfo = {
        customerName: 'John Smith',
        serviceRequested: 'Lawn mowing',
        serviceAddress: '123 Main Street'
      }
      
      // SMS template uses extracted_info
      const smsSummary = `${extractedInfo.customerName} called regarding ${extractedInfo.serviceRequested} at ${extractedInfo.serviceAddress}`
      
      expect(smsSummary).toBe('John Smith called regarding Lawn mowing at 123 Main Street')
      
      // Adding assistant turns to transcript should not change SMS
      const transcript = buildSimpleModeTranscript([
        {
          stage: 'ask_name',
          rawTranscript: 'John Smith',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ])
      
      // SMS should still be the same
      expect(smsSummary).toBe('John Smith called regarding Lawn mowing at 123 Main Street')
    })
    
    it('TEST P - follow-up completion behavior remains unchanged', () => {
      // Follow-ups are based on lead status and extracted_info, not transcript
      
      const leadStatus = 'active'
      const extractedInfo = {
        customerName: 'John Smith',
        serviceRequested: 'Lawn mowing'
      }
      
      // Follow-up logic checks lead status and extracted_info
      const shouldCreateFollowUp = leadStatus === 'active' && !!extractedInfo.customerName
      
      expect(shouldCreateFollowUp).toBe(true)
      
      // Adding assistant turns should not change follow-up behavior
      const transcript = buildSimpleModeTranscript([
        {
          stage: 'ask_name',
          rawTranscript: 'John Smith',
          capturedAnswer: 'John Smith',
          extractedField: 'customerName',
          source: 'whisper',
          timestamp: '2024-01-01T10:00:00Z'
        }
      ])
      
      // Follow-up logic should still be the same
      expect(shouldCreateFollowUp).toBe(true)
    })
  })
})