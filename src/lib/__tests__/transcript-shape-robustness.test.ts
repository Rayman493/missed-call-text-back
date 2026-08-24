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
})