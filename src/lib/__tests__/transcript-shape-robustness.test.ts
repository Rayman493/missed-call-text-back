/**
 * Transcript Shape Robustness Tests
 *
 * Tests that transcript rendering is robust against all possible transcript shapes
 * that can exist in production, preventing crashes like "transcript.map is not a function".
 *
 * This tests the fix for the production crash where malformed transcript data
 * caused the customer detail page to crash.
 */

import { describe, it, expect } from 'vitest'
import { normalizeAITranscript, type TranscriptMessage } from '@/lib/transcript-normalization'

describe('Transcript Shape Robustness', () => {
  describe('normalizeAITranscript handles all shapes', () => {
    it('TEST A - Canonical transcript array renders', () => {
      const input = [
        { role: 'assistant', text: 'Hello', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'caller', text: 'Hi there', timestamp: '2024-01-01T10:00:05Z' }
      ]
      
      const result = normalizeAITranscript(input)
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(2)
      expect(result[0].role).toBe('assistant')
      expect(result[0].content).toBe('Hello')
      expect(result[1].role).toBe('caller')
      expect(result[1].content).toBe('Hi there')
    })

    it('TEST B - JSON-stringified transcript array normalizes and renders', () => {
      const input = JSON.stringify([
        { role: 'assistant', text: 'Hello', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'caller', text: 'Hi there', timestamp: '2024-01-01T10:00:05Z' }
      ])
      
      const result = normalizeAITranscript(input)
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(2)
      expect(result[0].role).toBe('assistant')
      expect(result[0].content).toBe('Hello')
    })

    it('TEST C - Supported legacy plain-string transcript does not crash', () => {
      const input = 'I need lawn mowing at 123 Main Street'
      
      const result = normalizeAITranscript(input)
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
      expect(result[0].role).toBe('caller')
      expect(result[0].content).toBe('I need lawn mowing at 123 Main Street')
    })

    it('TEST D - Object/wrapper transcript with messages array normalizes', () => {
      const input = {
        messages: [
          { role: 'assistant', text: 'Hello', timestamp: '2024-01-01T10:00:00Z' },
          { role: 'caller', text: 'Hi there', timestamp: '2024-01-01T10:00:05Z' }
        ]
      }
      
      const result = normalizeAITranscript(input)
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(2)
      expect(result[0].role).toBe('assistant')
    })

    it('TEST E - null transcript does not crash', () => {
      const result = normalizeAITranscript(null)
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('TEST F - undefined transcript does not crash', () => {
      const result = normalizeAITranscript(undefined)
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('TEST G - {} does not crash', () => {
      const result = normalizeAITranscript({})
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('TEST H - malformed string does not crash', () => {
      const result = normalizeAITranscript('this is not valid json {{{')
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
      expect(result[0].role).toBe('caller')
      expect(result[0].content).toBe('this is not valid json {{{')
    })

    it('TEST I - unexpected primitive value does not crash', () => {
      const result1 = normalizeAITranscript(123)
      expect(Array.isArray(result1)).toBe(true)
      expect(result1.length).toBe(0)
      
      const result2 = normalizeAITranscript(true)
      expect(Array.isArray(result2)).toBe(true)
      expect(result2.length).toBe(0)
    })

    it('TEST J - empty array does not render broken card', () => {
      const result = normalizeAITranscript([])
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('TEST K - verbatim turn.text remains unchanged', () => {
      const input = [
        { role: 'caller', text: 'I need lawn mowing with specific details about the yard', timestamp: '2024-01-01T10:00:00Z' }
      ]
      
      const result = normalizeAITranscript(input)
      
      expect(result[0].content).toBe('I need lawn mowing with specific details about the yard')
      // Verbatim wording is preserved
    })

    it('TEST L - content field is also supported and normalized', () => {
      const input = [
        { role: 'caller', content: 'I need lawn mowing', timestamp: '2024-01-01T10:00:00Z' }
      ]
      
      const result = normalizeAITranscript(input)
      
      expect(result[0].content).toBe('I need lawn mowing')
    })

    it('TEST M - production crash condition: truthy but not array does not crash', () => {
      // This reproduces the exact production failure condition
      const input = { transcript: 'some string value' } // Object that is truthy but not array
      
      const result = normalizeAITranscript(input)
      
      // Should return empty array instead of crashing with ".map is not a function"
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(0)
    })

    it('TEST N - JSON string of object with messages normalizes', () => {
      const input = JSON.stringify({
        messages: [
          { role: 'assistant', text: 'Hello', timestamp: '2024-01-01T10:00:00Z' }
        ]
      })
      
      const result = normalizeAITranscript(input)
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1)
      expect(result[0].role).toBe('assistant')
    })

    it('TEST O - Array with mixed valid and invalid entries filters invalid', () => {
      const input = [
        { role: 'assistant', text: 'Valid message', timestamp: '2024-01-01T10:00:00Z' },
        null,
        { role: 'invalid', text: '' }, // Invalid role
        'string',
        123
      ]
      
      const result = normalizeAITranscript(input)
      
      expect(Array.isArray(result)).toBe(true)
      expect(result.length).toBe(1) // Only the valid message
      expect(result[0].content).toBe('Valid message')
    })
  })

  describe('Current-call isolation preserved', () => {
    it('TEST P - selected historical call displays only its own transcript', () => {
      const callA = {
        id: 'call-a',
        transcript: [
          { role: 'caller', text: 'Lawn mowing', timestamp: '2024-01-01T10:00:00Z' }
        ]
      }

      const callB = {
        id: 'call-b',
        transcript: [
          { role: 'caller', text: 'Gutter cleaning', timestamp: '2024-01-02T10:00:00Z' }
        ]
      }

      const resultA = normalizeAITranscript(callA.transcript)
      const resultB = normalizeAITranscript(callB.transcript)

      expect(resultA[0].content).toBe('Lawn mowing')
      expect(resultB[0].content).toBe('Gutter cleaning')
      expect(resultA[0].content).not.toBe(resultB[0].content)
    })

    it('TEST Q - Call B malformed transcript cannot cause Call A transcript to appear as fallback', () => {
      const callA = {
        id: 'call-a',
        transcript: [
          { role: 'caller', text: 'Valid transcript A', timestamp: '2024-01-01T10:00:00Z' }
        ]
      }

      const callB = {
        id: 'call-b',
        transcript: { malformed: 'object' } // Malformed shape
      }

      const resultA = normalizeAITranscript(callA.transcript)
      const resultB = normalizeAITranscript(callB.transcript)

      // Call A should still have its valid transcript
      expect(resultA[0].content).toBe('Valid transcript A')
      
      // Call B should have empty array, not Call A's transcript
      expect(resultB.length).toBe(0)
      expect(resultB).not.toContain(resultA[0])
    })
  })

  describe('Legacy transcript detection', () => {
    it('TEST R - Full assistant + customer turns → no legacy warning', () => {
      const input = [
        { role: 'assistant', text: 'Hello, how can I help?', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'user', text: 'I need lawn mowing', timestamp: '2024-01-01T10:00:05Z' },
        { role: 'assistant', text: 'What is your address?', timestamp: '2024-01-01T10:00:10Z' },
        { role: 'caller', text: '123 Main Street', timestamp: '2024-01-01T10:00:15Z' }
      ]

      const result = normalizeAITranscript(input)

      const hasUserTurns = result.some(t => t.role === 'user' || t.role === 'caller')
      const hasAssistantTurns = result.some(t => t.role === 'assistant')
      const isLegacyCustomerOnly = hasUserTurns && !hasAssistantTurns && result.length > 0

      expect(hasUserTurns).toBe(true)
      expect(hasAssistantTurns).toBe(true)
      expect(isLegacyCustomerOnly).toBe(false)
    })

    it('TEST S - Customer-only legacy transcript → warning where reliably identifiable', () => {
      const input = [
        { role: 'user', text: 'I need lawn mowing at 123 Main Street', timestamp: '2024-01-01T10:00:00Z' }
      ]

      const result = normalizeAITranscript(input)

      const hasUserTurns = result.some(t => t.role === 'user' || t.role === 'caller')
      const hasAssistantTurns = result.some(t => t.role === 'assistant')
      const isLegacyCustomerOnly = hasUserTurns && !hasAssistantTurns && result.length > 0

      expect(hasUserTurns).toBe(true)
      expect(hasAssistantTurns).toBe(false)
      expect(isLegacyCustomerOnly).toBe(true)
    })

    it('TEST T - Multiple customer-only turns → legacy warning', () => {
      const input = [
        { role: 'caller', text: 'I need lawn mowing', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'user', text: 'My address is 123 Main Street', timestamp: '2024-01-01T10:00:05Z' }
      ]

      const result = normalizeAITranscript(input)

      const hasUserTurns = result.some(t => t.role === 'user' || t.role === 'caller')
      const hasAssistantTurns = result.some(t => t.role === 'assistant')
      const isLegacyCustomerOnly = hasUserTurns && !hasAssistantTurns && result.length > 0

      expect(hasUserTurns).toBe(true)
      expect(hasAssistantTurns).toBe(false)
      expect(isLegacyCustomerOnly).toBe(true)
    })

    it('TEST U - Empty transcript → no legacy warning', () => {
      const input: any[] = []

      const result = normalizeAITranscript(input)

      const hasUserTurns = result.some(t => t.role === 'user' || t.role === 'caller')
      const hasAssistantTurns = result.some(t => t.role === 'assistant')
      const isLegacyCustomerOnly = hasUserTurns && !hasAssistantTurns && result.length > 0

      expect(hasUserTurns).toBe(false)
      expect(hasAssistantTurns).toBe(false)
      expect(isLegacyCustomerOnly).toBe(false)
    })

    it('TEST V - Assistant-only transcript → no legacy warning (edge case)', () => {
      const input = [
        { role: 'assistant', text: 'Hello? Anyone there?', timestamp: '2024-01-01T10:00:00Z' }
      ]

      const result = normalizeAITranscript(input)

      const hasUserTurns = result.some(t => t.role === 'user' || t.role === 'caller')
      const hasAssistantTurns = result.some(t => t.role === 'assistant')
      const isLegacyCustomerOnly = hasUserTurns && !hasAssistantTurns && result.length > 0

      expect(hasUserTurns).toBe(false)
      expect(hasAssistantTurns).toBe(true)
      expect(isLegacyCustomerOnly).toBe(false)
    })

    it('TEST W - Verbatim wording preserved in legacy transcript', () => {
      const exactWording = "Yeah, I need to get my grass cut. That's about a half an acre yard and it's got a privacy fence. But it can make it tougher to get some heavier equipment into the yard in the backyard 1632 South Pine Drive Sometime in the next two weeks, if that's possible. Any time in the mornings"
      const input = [
        { role: 'user', text: exactWording, timestamp: '2024-01-01T10:00:00Z' }
      ]

      const result = normalizeAITranscript(input)

      expect(result[0].content).toBe(exactWording)
      expect(result[0].content).toContain('half an acre yard')
      expect(result[0].content).toContain('privacy fence')
      expect(result[0].content).toContain('1632 South Pine Drive')
    })
  })

  describe('Call Review UI behavior', () => {
    it('TEST X - Message count label: 1 message (singular)', () => {
      const input = [
        { role: 'assistant', text: 'Hello', timestamp: '2024-01-01T10:00:00Z' }
      ]

      const result = normalizeAITranscript(input)
      const count = result.length
      const label = count === 1 ? 'message' : 'messages'

      expect(count).toBe(1)
      expect(label).toBe('message')
      expect(`${count} ${label}`).toBe('1 message')
    })

    it('TEST Y - Message count label: 2 messages (plural)', () => {
      const input = [
        { role: 'assistant', text: 'Hello', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'user', text: 'Hi there', timestamp: '2024-01-01T10:00:05Z' }
      ]

      const result = normalizeAITranscript(input)
      const count = result.length
      const label = count === 1 ? 'message' : 'messages'

      expect(count).toBe(2)
      expect(label).toBe('messages')
      expect(`${count} ${label}`).toBe('2 messages')
    })

    it('TEST Z - Simple Mode structured Q/A pairs render as turn-by-turn', () => {
      // Simulate Simple Mode transcript with canonical questions and verbatim answers
      const input = [
        { role: 'assistant', text: 'Hi, thanks for calling. I\'m the virtual assistant for the business. I\'ll gather a few quick details so the business owner can follow up with you. First, may I have your name?', timestamp: '2024-01-01T10:00:00Z' },
        { role: 'user', text: 'Ryan', timestamp: '2024-01-01T10:00:05Z' },
        { role: 'assistant', text: 'Thank you. Can you let me know what you need help with today and any details that would be helpful?', timestamp: '2024-01-01T10:00:10Z' },
        { role: 'user', text: 'I need my grass cut', timestamp: '2024-01-01T10:00:15Z' }
      ]

      const result = normalizeAITranscript(input)

      // Verify alternating pattern
      expect(result[0].role).toBe('assistant')
      expect(result[1].role).toBe('caller')
      expect(result[2].role).toBe('assistant')
      expect(result[3].role).toBe('caller')

      // Verify canonical question text preserved
      expect(result[0].content).toContain('First, may I have your name?')
      expect(result[2].content).toContain('what you need help with')

      // Verify verbatim customer answers preserved
      expect(result[1].content).toBe('Ryan')
      expect(result[3].content).toBe('I need my grass cut')

      // Verify no legacy warning (has assistant turns)
      const hasUserTurns = result.some(t => t.role === 'user' || t.role === 'caller')
      const hasAssistantTurns = result.some(t => t.role === 'assistant')
      const isLegacyCustomerOnly = hasUserTurns && !hasAssistantTurns && result.length > 0

      expect(isLegacyCustomerOnly).toBe(false)
    })
  })
})