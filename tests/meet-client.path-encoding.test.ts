import { describe, it, expect, vi, beforeAll } from 'vitest'
vi.mock('../src/lib/google/token', () => ({
  getGoogleAccessToken: vi.fn(async () => ({ accessToken: 'test-token', scope: '', expiresAt: null }))
}))

let clientMod: any
beforeAll(async () => {
  clientMod = await import('../src/lib/google/meet-client')
})

describe('encodePathPreservingSlashes', () => {
  it('preserves slashes for conference record path', () => {
    const input = 'conferenceRecords/abc'
    const out = clientMod.encodePathPreservingSlashes(input)
    expect(out).toBe('conferenceRecords/abc')
  })

  it('preserves slashes for transcript path', () => {
    const input = 'conferenceRecords/abc/transcripts/def'
    const out = clientMod.encodePathPreservingSlashes(input)
    expect(out).toBe('conferenceRecords/abc/transcripts/def')
  })

  it('encodes special characters per segment', () => {
    const input = 'conferenceRecords/a b@c/transcripts/d#e'
    const out = clientMod.encodePathPreservingSlashes(input)
    expect(out).toBe('conferenceRecords/a%20b%40c/transcripts/d%23e')
  })
})
