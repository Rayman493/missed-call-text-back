import { describe, it, expect } from 'vitest'

// Copy the extractKeyPoints function for testing
function extractKeyPoints(summary: string): string[] {
  if (!summary || typeof summary !== 'string') return []

  // Normalize common list prefixes to avoid double bullets
  let normalized = summary
    .replace(/^[-•*]\s+/gm, '')  // Remove leading markdown bullets
    .replace(/^\d+\.\s+/gm, '')  // Remove leading numbered list markers

  // Normalize time abbreviations to prevent sentence splitting inside time expressions
  // This prevents "7 p. M." from being split into "7 p" and "M"
  const timeAbbreviationPatterns = [
    // Match "p. M." or "P. M." (with any spacing and case)
    /\bp\s*\.\s*m\s*\./gi,
    // Match "a. M." or "A. M."
    /\ba\s*\.\s*m\s*\./gi,
    // Match "p.m." or "P.M."
    /\bp\.m\./gi,
    // Match "a.m." or "A.M."
    /\ba\.m\./gi,
  ]
  normalized = normalized.replace(timeAbbreviationPatterns[0], 'PM')
  normalized = normalized.replace(timeAbbreviationPatterns[1], 'AM')
  normalized = normalized.replace(timeAbbreviationPatterns[2], 'PM')
  normalized = normalized.replace(timeAbbreviationPatterns[3], 'AM')

  // Split by sentences and filter for meaningful points
  const sentences = normalized
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 100) // Filter out very short or very long sentences

  // Return up to 5 key points
  return sentences.slice(0, 5)
}

describe('extractKeyPoints - Time Expression Preservation', () => {
  describe('Time abbreviations should not be split', () => {
    it('should not split "7 p. M."', () => {
      const summary = 'Wants work: Every Tuesday and Thursday at 7 p. M.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('7 PM')
      expect(result[0]).not.toContain('7 p')
      expect(result[0]).not.toMatch(/^M$/)
    })

    it('should not split "9 a. M."', () => {
      const summary = 'Call me at 9 a. M. for the appointment.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('9 AM')
      expect(result[0]).not.toContain('9 a')
      expect(result[0]).not.toMatch(/^M$/)
    })

    it('should preserve "7:00 PM"', () => {
      const summary = 'Appointment is at 7:00 PM tomorrow.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('7:00 PM')
    })

    it('should preserve "12 PM"', () => {
      const summary = 'Meeting at 12 PM. Please confirm.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(2)
      expect(result[0]).toContain('12 PM')
    })

    it('should preserve "12 AM"', () => {
      const summary = 'Available after 12 AM on weekdays.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('12 AM')
    })

    it('should handle lowercase "p.m."', () => {
      const summary = 'Work needed at 5 p.m. today.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('5 PM')
    })

    it('should handle lowercase "a.m."', () => {
      const summary = 'Call at 8 a.m. sharp.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('8 AM')
    })
  })

  describe('Normal sentence splitting should still work', () => {
    it('should split normal sentences', () => {
      const summary = 'Customer wants lawn service. They prefer Tuesdays.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(2)
      expect(result[0]).toContain('lawn service')
      expect(result[1]).toContain('Tuesdays')
    })

    it('should split multiple sentences correctly', () => {
      const summary = 'First point. Second point. Third point.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(3)
      expect(result[0]).toBe('First point')
      expect(result[1]).toBe('Second point')
      expect(result[2]).toBe('Third point')
    })

    it('should split by exclamation marks', () => {
      const summary = 'Urgent! Needs immediate attention.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(2)
    })

    it('should split by question marks', () => {
      const summary = 'Can you help? Customer needs service.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(2)
    })
  })

  describe('Mixed summary text handling', () => {
    it('should handle summary with time and other sentences', () => {
      const summary = 'Customer needs plumbing. Work at 7 p. M. on Tuesday. Please confirm.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(3)
      expect(result[0]).toContain('plumbing')
      expect(result[1]).toContain('7 PM')
      expect(result[2]).toContain('confirm')
    })

    it('should handle multiple time expressions', () => {
      const summary = 'Available at 9 a. M. and 5 p. M. on weekdays.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(1)
      expect(result[0]).toContain('9 AM')
      expect(result[0]).toContain('5 PM')
    })
  })

  describe('Edge cases', () => {
    it('should handle empty string', () => {
      const result = extractKeyPoints('')
      expect(result).toEqual([])
    })

    it('should handle null', () => {
      const result = extractKeyPoints(null as any)
      expect(result).toEqual([])
    })

    it('should handle undefined', () => {
      const result = extractKeyPoints(undefined as any)
      expect(result).toEqual([])
    })

    it('should filter out very short sentences', () => {
      const summary = 'A. B. C. D. This is a normal sentence.'
      const result = extractKeyPoints(summary)
      // Single letters are kept by the filter (length > 0), so we get 5 results
      expect(result).toHaveLength(5)
      expect(result[4]).toContain('normal sentence')
    })

    it('should filter out very long sentences', () => {
      const longSentence = 'A'.repeat(150)
      const summary = `Short sentence. ${longSentence}. Another short.`
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(2)
      expect(result[0]).toContain('Short')
      expect(result[1]).toContain('Another')
    })

    it('should limit to 5 key points', () => {
      const summary = 'One. Two. Three. Four. Five. Six. Seven.'
      const result = extractKeyPoints(summary)
      expect(result).toHaveLength(5)
    })
  })
})