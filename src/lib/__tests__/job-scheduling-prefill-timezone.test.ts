import { describe, it, expect } from 'vitest'
import { deriveJobSchedulingPrefill } from '../job-scheduling-prefill'

describe('Job scheduling prefill timezone handling', () => {
  it('resolves "tomorrow" using the supplied business timezone', () => {
    const result = deriveJobSchedulingPrefill('Tomorrow', undefined, 'America/New_York')
    expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(result.dateWasResolved).toBe(true)
  })

  it('parses explicit ISO dates without timezone interference', () => {
    const result = deriveJobSchedulingPrefill('2026-03-20', undefined, 'America/New_York')
    expect(result.date).toBe('2026-03-20')
    expect(result.dateWasResolved).toBe(true)
  })
})
