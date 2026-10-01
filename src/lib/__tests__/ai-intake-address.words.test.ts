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

describe('normalizeAddress - mixed digit+word street number composition', () => {
  const cases: Array<[string, string]> = [
    ["500 and three Spacebar Avenue", "503 Spacebar Avenue"],
    ["500 and three spacebar avenue", "503 spacebar avenue"],
    ["700 and twelve Oak Drive", "712 Oak Drive"],
    ["200 and five Main Street", "205 Main Street"],
    // already-correct or ambiguous forms stay untouched
    ["503 Spacebar Avenue", "503 Spacebar Avenue"],
    ["500 and three", "500 and three"],
    ["500 West and three oaks lane", "500 West and three oaks lane"],
  ];
  for (const [input, expected] of cases) {
    it(`"${input}" -> "${expected}"`, () => {
      expect(normalizeAddress(input)).toBe(expected);
    });
  }
});
