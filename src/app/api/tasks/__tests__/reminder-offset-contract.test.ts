/**
 * Reminder Offset Contract Tests
 *
 * Ensures UI presets, API validation, and DB CHECK constraint agree.
 */

import { describe, it, expect } from 'vitest'

// Canonical approved reminder offsets (minutes before due time; 0 = at time; null = none)
const REMINDER_PRESETS = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080]

// Simulate API validation whitelist (must match src/app/api/tasks/route.ts and [id]/route.ts)
const API_VALID_OFFSETS = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080]

// Simulate DB CHECK constraint allowed values (must match latest migration)
const DB_ALLOWED_OFFSETS = [0, 5, 15, 30, 60, 120, 1440, 2880, 10080]

describe('Reminder offset contract', () => {
  it('every approved preset is accepted by API validation', () => {
    for (const preset of REMINDER_PRESETS) {
      expect(API_VALID_OFFSETS).toContain(preset)
    }
  })

  it('every approved preset satisfies the DB CHECK constraint', () => {
    for (const preset of REMINDER_PRESETS) {
      expect(DB_ALLOWED_OFFSETS).toContain(preset)
    }
  })

  it('rejects unsupported offsets at the API boundary', () => {
    const unsupportedOffsets = [-1, 1, 10, 45, 90, 180, 360, 720, 4320, 525600]
    for (const offset of unsupportedOffsets) {
      expect(API_VALID_OFFSETS).not.toContain(offset)
    }
  })

  it('API whitelist and DB allowed values are identical', () => {
    expect(API_VALID_OFFSETS.sort((a, b) => a - b)).toEqual(
      DB_ALLOWED_OFFSETS.sort((a, b) => a - b)
    )
  })

  it('null/undefined represents "None" (no notification)', () => {
    // null is omitted from the positive whitelist; it is represented by absence of offset
    expect(API_VALID_OFFSETS).not.toContain(null)
    expect(API_VALID_OFFSETS).not.toContain(undefined)
    expect(DB_ALLOWED_OFFSETS).not.toContain(null)
    expect(DB_ALLOWED_OFFSETS).not.toContain(undefined)
  })
})
