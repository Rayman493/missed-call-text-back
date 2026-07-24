import { describe, it, expect } from 'vitest'
import { normalizeAddress } from '../ai-intake-formatter'

describe('normalizeAddress - leading spoken number words', () => {
  const cases: Array<[string | null | undefined, string]> = [
    ["Sixteen thirty-two South Pines Drive", "1632 South Pines Drive"],
    ["one thousand six hundred thirty-two South Pine Drive", "1632 South Pine Drive"],
    ["Sixteen hundred thirty-two South Pine Drive", "1632 South Pine Drive"],
    ["One twenty-five Main Street", "125 Main Street"],
    ["Five hundred Main Street", "500 Main Street"],
    ["Twenty-One Oak Avenue", "21 Oak Avenue"],
    ["sixteen thirty-two south pines drive", "1632 south pines drive"],
    ["sixteen thirty-two, South Pines Drive", "1632 South Pines Drive"],
    ["uh, sixteen thirty-two South Pines Drive", "Uh, sixteen thirty-two South Pines Drive"], // capitalization may apply; no filler stripping
    ["1632 South Pine Drive", "1632 South Pine Drive"],
    ["16 32 South Pines Drive", "1632 South Pines Drive"],
    ["12 34th Street", "12 34th Street"],
    ["Route 16 32", "Route 16 32"],
    ["1632 South Pine Drive Apt 4", "1632 South Pine Drive Apt 4"],
    ["1632 South Pine Drive, Pittsburgh, PA 15236", "1632 South Pine Drive, Pittsburgh, PA 15236"],
    ["Oneida Street", "Oneida Street"],
    ["Four Seasons Drive", "Four Seasons Drive"],
    ["Seven Springs Road", "Seven Springs Road"],
    ["Thirty-Second Street", "Thirty-Second Street"],
    ["West Fifth Avenue", "West Fifth Avenue"],
    ["Route Sixty-Six", "Route Sixty-Six"],
    ["Apartment Two", "Apartment Two"],
    ["Unit Four", "Unit Four"],
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
