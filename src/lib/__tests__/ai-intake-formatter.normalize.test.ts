import { describe, it, expect } from 'vitest'
import { normalizeServiceReason, normalizeAddress } from '../ai-intake-formatter'

describe('normalizeServiceReason', () => {
  const cases: Array<[string | null | undefined, string]> = [
    ["And I'd like to get my grass cut", "Get my grass cut"],
    ["I'd like to get my grass cut", "Get my grass cut"],
    ["I would like to schedule an inspection", "Schedule an inspection"],
    ["I want to replace my roof", "Replace my roof"],
    ["I need to repair my sink", "Repair my sink"],
    ["I'm calling to get an estimate", "Get an estimate"],
    ["I was hoping to have my driveway sealed", "Have my driveway sealed"],
    ["And I need landscaping work", "Landscaping work"],
    ["I'm calling about a leaking faucet", "A leaking faucet"],
    ["Grass cutting", "Grass cutting"],
    ["Repair my furnace", "Repair my furnace"],
    ["Anderson Landscaping", "Anderson Landscaping"],
    ["Candy shop repair", "Candy shop repair"],
    ["", 'Not collected'],
    [null, 'Not collected'],
    [undefined, 'Not collected'],
  ]

  for (const [input, expected] of cases) {
    it(`normalizes service reason: ${String(input)}`, () => {
      expect(normalizeServiceReason(input)).toBe(expected)
    })
  }
})

describe('normalizeAddress', () => {
  const cases: Array<[string | null | undefined, string]> = [
    ["16 32 South Pines Drive", "1632 South Pines Drive"],
    ["1 632 South Pine Drive", "1632 South Pine Drive"],
    ["1632 South Pine Drive", "1632 South Pine Drive"],
    ["12 34th Street", "12 34th Street"],
    ["Route 16 32", "Route 16 32"],
    ["  1632   South   Pine   Drive  ", "1632   South   Pine   Drive"],
    ["", 'Not collected'],
    [null, 'Not collected'],
    [undefined, 'Not collected'],
  ]

  for (const [input, expected] of cases) {
    it(`normalizes address: ${String(input)}`, () => {
      expect(normalizeAddress(input)).toBe(expected)
    })
  }
})
