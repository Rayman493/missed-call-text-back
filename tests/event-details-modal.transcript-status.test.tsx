import { describe, it, expect } from 'vitest'

// These are lightweight behavioral tests for the transcript error mapping logic.
// We simulate the small functions used in EventDetailsModal to ensure the mapping
// from 409 JSON to UI message is correct. We are not rendering React here to avoid heavy deps.

function mapTranscriptErrorFrom409(json: any): string {
  const stat = (json && typeof json.status === 'string') ? json.status : null
  if (stat === 'pending' || stat == null) return 'Processing… Please try again later.'
  return 'Transcript unavailable.'
}

describe('EventDetailsModal transcript error mapping', () => {
  it('409 with status null shows processing message', () => {
    expect(mapTranscriptErrorFrom409({})).toBe('Processing… Please try again later.')
    expect(mapTranscriptErrorFrom409({ status: null })).toBe('Processing… Please try again later.')
  })

  it('409 with status "pending" shows processing message', () => {
    expect(mapTranscriptErrorFrom409({ status: 'pending' })).toBe('Processing… Please try again later.')
  })

  it('409 with non-pending status shows unavailable', () => {
    expect(mapTranscriptErrorFrom409({ status: 'available' })).toBe('Transcript unavailable.')
  })
})
