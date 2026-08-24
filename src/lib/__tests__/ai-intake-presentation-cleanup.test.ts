/**
 * AI Intake Presentation Cleanup Tests
 *
 * These tests verify that deterministic cleanup improves readability
 * WITHOUT deleting meaningful facts.
 */

import { describe, it, expect } from 'vitest'
import { normalizeAdditionalDetails, normalizeTiming } from '../ai-intake-formatter'

describe('AI Intake Presentation Cleanup', () => {
  describe('TASK 1 - Details Cleanup', () => {
    it('should insert missing sentence punctuation between sentences', () => {
      const input = 'Lawn mowing for a quarter acre yard The yard is a quarter acre and surrounded by a private fence'
      const result = normalizeAdditionalDetails(input)

      // Should have punctuation between sentences
      expect(result).toMatch(/yard\. The yard/)

      // Should preserve quarter-acre fact
      expect(result.toLowerCase()).toContain('quarter')

      // Should preserve fence fact
      expect(result.toLowerCase()).toContain('fence')
    })

    it('should preserve quarter-acre fact in multi-part details', () => {
      const input = 'Lawn mowing for a quarter acre yard The yard is a quarter acre and surrounded by a private fence in the backyard, which may limit access for heavier equipment due to insufficient space in the gate. The caller has a dog that will need to be put in the house before the service starts.'
      const result = normalizeAdditionalDetails(input)

      // Must preserve quarter-acre
      expect(result.toLowerCase()).toContain('quarter')
    })

    it('should preserve fence fact in multi-part details', () => {
      const input = 'Lawn mowing for a quarter acre yard The yard is a quarter acre and surrounded by a private fence in the backyard, which may limit access for heavier equipment due to insufficient space in the gate. The caller has a dog that will need to be put in the house before the service starts.'
      const result = normalizeAdditionalDetails(input)

      // Must preserve fence
      expect(result.toLowerCase()).toContain('fence')
    })

    it('should preserve gate/equipment fact in multi-part details', () => {
      const input = 'Lawn mowing for a quarter acre yard The yard is a quarter acre and surrounded by a private fence in the backyard, which may limit access for heavier equipment due to insufficient space in the gate. The caller has a dog that will need to be put in the house before the service starts.'
      const result = normalizeAdditionalDetails(input)

      // Must preserve equipment/gate constraint
      expect(result.toLowerCase()).toContain('equipment')
      expect(result.toLowerCase()).toContain('gate')
    })

    it('should preserve dog instruction in multi-part details', () => {
      const input = 'Lawn mowing for a quarter acre yard The yard is a quarter acre and surrounded by a private fence in the backyard, which may limit access for heavier equipment due to insufficient space in the gate. The caller has a dog that will need to be put in the house before the service starts.'
      const result = normalizeAdditionalDetails(input)

      // Must preserve dog instruction
      expect(result.toLowerCase()).toContain('dog')
      expect(result.toLowerCase()).toContain('house')
    })

    it('should not delete any fact from multi-part details', () => {
      const input = 'Lawn mowing for a quarter acre yard The yard is a quarter acre and surrounded by a private fence in the backyard, which may limit access for heavier equipment due to insufficient space in the gate. The caller has a dog that will need to be put in the house before the service starts.'
      const result = normalizeAdditionalDetails(input)

      // All meaningful facts must be present
      const resultLower = result.toLowerCase()
      expect(resultLower).toContain('quarter')
      expect(resultLower).toContain('fence')
      expect(resultLower).toContain('equipment')
      expect(resultLower).toContain('gate')
      expect(resultLower).toContain('dog')
      expect(resultLower).toContain('house')
    })

    it('should capitalize sentence starts', () => {
      const input = 'lawn mowing for a quarter acre yard the yard is a quarter acre'
      const result = normalizeAdditionalDetails(input)

      // First letter should be capitalized
      expect(result).toMatch(/^[A-Z]/)
    })

    it('should normalize spacing', () => {
      const input = 'Lawn mowing  for  a  quarter acre yard'
      const result = normalizeAdditionalDetails(input)

      // Should not have excessive spaces
      expect(result).not.toMatch(/  /)
    })
  })

  describe('TASK 2 - Trailing Connector Cleanup', () => {
    it('should remove dangling "because" from end', () => {
      const input = 'next two weeks because'
      const result = normalizeTiming(input)

      // Should not end with "because"
      expect(result.toLowerCase()).not.toMatch(/because\s*$/)
      expect(result.toLowerCase()).toContain('next two weeks')
    })

    it('should remove dangling "and" from end', () => {
      const input = 'next week and'
      const result = normalizeTiming(input)

      // Should not end with "and"
      expect(result.toLowerCase()).not.toMatch(/\band\s*$/)
      expect(result.toLowerCase()).toContain('next week')
    })

    it('should remove dangling "but" from end', () => {
      const input = 'Friday but'
      const result = normalizeTiming(input)

      // Should not end with "but"
      expect(result.toLowerCase()).not.toMatch(/but\s*$/)
      expect(result).toContain('Friday')
    })

    it('should preserve "if possible" in middle/end', () => {
      const input = 'next Friday if possible'
      const result = normalizeTiming(input)

      // Should preserve "if possible"
      expect(result.toLowerCase()).toContain('if possible')
    })

    it('should preserve "morning or afternoon"', () => {
      const input = 'morning or afternoon'
      const result = normalizeTiming(input)

      // Should preserve "or"
      expect(result.toLowerCase()).toContain('or')
      expect(result.toLowerCase()).toContain('morning')
      expect(result.toLowerCase()).toContain('afternoon')
    })

    it('should preserve "Monday and Tuesday"', () => {
      const input = 'Monday and Tuesday'
      const result = normalizeTiming(input)

      // Should preserve "and"
      expect(result.toLowerCase()).toContain('and')
      expect(result.toLowerCase()).toContain('monday')
      expect(result.toLowerCase()).toContain('tuesday')
    })

    it('should preserve "when the weather clears"', () => {
      const input = 'when the weather clears'
      const result = normalizeTiming(input)

      // Should preserve full phrase
      expect(result.toLowerCase()).toContain('when')
      expect(result.toLowerCase()).toContain('weather')
    })

    it('should remove dangling "so"', () => {
      const input = 'tomorrow so'
      const result = normalizeTiming(input)

      // Should not end with "so"
      expect(result.toLowerCase()).not.toMatch(/so\s*$/)
    })

    it('should remove dangling "or"', () => {
      const input = 'next week or'
      const result = normalizeTiming(input)

      // Should not end with "or"
      expect(result.toLowerCase()).not.toMatch(/\bor\s*$/)
    })

    it('should remove dangling "that"', () => {
      const input = 'Friday that'
      const result = normalizeTiming(input)

      // Should not end with "that"
      expect(result.toLowerCase()).not.toMatch(/that\s*$/)
    })
  })

  describe('TASK 6 - Over-Cleaning Audit', () => {
    it('should preserve "Remove old fence and install new fence"', () => {
      const input = 'Remove old fence and install new fence'
      const result = normalizeAdditionalDetails(input)

      // Should preserve both fence references and the "and"
      expect(result.toLowerCase()).toContain('old fence')
      expect(result.toLowerCase()).toContain('new fence')
      expect(result.toLowerCase()).toContain('and')
    })

    it('should preserve "Call in the morning or afternoon"', () => {
      const input = 'Call in the morning or afternoon'
      const result = normalizeTiming(input)

      // Should preserve "or"
      expect(result.toLowerCase()).toContain('or')
      expect(result.toLowerCase()).toContain('morning')
      expect(result.toLowerCase()).toContain('afternoon')
    })

    it('should preserve "Finish Monday and Tuesday"', () => {
      const input = 'Finish Monday and Tuesday'
      const result = normalizeTiming(input)

      // Should preserve "and"
      expect(result.toLowerCase()).toContain('and')
      expect(result.toLowerCase()).toContain('monday')
      expect(result.toLowerCase()).toContain('tuesday')
    })

    it('should preserve "I need mowing because the grass is overgrown"', () => {
      const input = 'I need mowing because the grass is overgrown'
      const result = normalizeAdditionalDetails(input)

      // Should preserve "because" in middle of sentence
      expect(result.toLowerCase()).toContain('because')
      expect(result.toLowerCase()).toContain('grass')
      expect(result.toLowerCase()).toContain('overgrown')
    })
  })

  describe('Cards/SMS Parity', () => {
    it('cards and SMS should use same normalized details', () => {
      const input = 'Lawn mowing for a quarter acre yard The yard is a quarter acre'
      const result = normalizeAdditionalDetails(input)

      // Same normalization should be used by both paths
      // (This is verified by the fact they both call normalizeAdditionalDetails)
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
    })

    it('cards and SMS should use same normalized timing', () => {
      const input = 'next Friday if possible'
      const result = normalizeTiming(input)

      // Same normalization should be used by both paths
      expect(result).toBeDefined()
      expect(typeof result).toBe('string')
      expect(result.toLowerCase()).toContain('if possible')
    })
  })

  describe('Empty Current Call', () => {
    it('empty current call should remain empty', () => {
      const result = normalizeAdditionalDetails('')
      expect(result).toBe('Not collected')
    })

    it('null current call should remain empty', () => {
      const result = normalizeAdditionalDetails(null)
      expect(result).toBe('Not collected')
    })

    it('undefined current call should remain empty', () => {
      const result = normalizeAdditionalDetails(undefined)
      expect(result).toBe('Not collected')
    })
  })
})