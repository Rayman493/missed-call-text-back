import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock token retrieval before importing the client to avoid real Supabase init
vi.mock('../src/lib/google/token', () => ({
  getGoogleAccessToken: vi.fn(async () => ({ accessToken: 'test-token', scope: '', expiresAt: null }))
}))

// Import after mocks so the client uses the mocked token module
const importClient = async () => await import('../src/lib/google/meet-client')

let originalFetch: any

beforeEach(() => {
  originalFetch = globalThis.fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch as any
  vi.clearAllMocks()
})

describe('GoogleMeetClientImpl URL construction', () => {
  it('listTranscripts preserves resource hierarchy and slashes', async () => {
    const { GoogleMeetClientImpl } = await importClient()

    let requestedUrl = ''
    globalThis.fetch = vi.fn(async (url: any) => {
      requestedUrl = String(url)
      return { ok: false, status: 400, json: async () => ({}) } as any
    })

    const client = new GoogleMeetClientImpl('biz1')
    await client.listTranscripts('conferenceRecords/abc')

    expect(requestedUrl).toContain('https://meet.googleapis.com/v2/conferenceRecords/abc/transcripts')
    expect(requestedUrl).toContain('pageSize=100')
    expect(requestedUrl).not.toContain('%2F')
  })

  it('listTranscriptEntries preserves transcript hierarchy and slashes', async () => {
    const { GoogleMeetClientImpl } = await importClient()

    let requestedUrl = ''
    globalThis.fetch = vi.fn(async (url: any) => {
      requestedUrl = String(url)
      return { ok: false, status: 400, json: async () => ({}) } as any
    })

    const client = new GoogleMeetClientImpl('biz1')
    await client.listTranscriptEntries('conferenceRecords/abc/transcripts/def')

    expect(requestedUrl).toContain('https://meet.googleapis.com/v2/conferenceRecords/abc/transcripts/def/entries')
    expect(requestedUrl).toContain('pageSize=100')
    expect(requestedUrl).not.toContain('%2F')
  })
})
