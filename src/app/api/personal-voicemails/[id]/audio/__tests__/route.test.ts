import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '../route'

const h = vi.hoisted(() => ({
  voicemail: null as null | Record<string, any>,
  fetchMock: vi.fn()
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} }))
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null }))
    }
  }))
}))

vi.mock('@/lib/team-access', () => ({
  resolveBusinessForUser: vi.fn(async () => ({ business: { id: 'biz-1' } }))
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: h.voicemail,
            error: h.voicemail ? null : { message: 'not found' }
          }))
        }))
      }))
    }))
  }
}))

const VOICEMAIL_ID = '11111111-2222-3333-4444-555555555555'

function makeRequest() {
  return new Request(`http://localhost/api/personal-voicemails/${VOICEMAIL_ID}/audio`)
}

function makeParams() {
  return { params: Promise.resolve({ id: VOICEMAIL_ID }) }
}

function useRecordingUrl(recordingUrl: string) {
  h.voicemail = {
    id: VOICEMAIL_ID,
    business_id: 'biz-1',
    recording_url: recordingUrl,
    recording_sid: 'RE1234567890abcdef',
    deleted_at: null
  }
}

/**
 * PI-T1b: the audio proxy used to accept any hostname containing 'twilio.com'
 * and then fetched it with `Authorization: Basic <ACCOUNT_SID>:<AUTH_TOKEN>`.
 * It must now require https + an exact Twilio hostname allowlist + a
 * /Recordings/ path before any credentials are attached.
 */
describe('GET /api/personal-voicemails/[id]/audio — recording URL validation', () => {
  beforeEach(() => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC_test_sid')
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test_auth_token')
    h.voicemail = null
    h.fetchMock.mockReset()
    h.fetchMock.mockResolvedValue(
      new Response(new ArrayBuffer(4), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' }
      })
    )
    vi.stubGlobal('fetch', h.fetchMock)
  })

  it('rejects attacker lookalike host twilio.com.attacker.example and sends no credentials', async () => {
    useRecordingUrl('https://twilio.com.attacker.example/Recordings/RE123')
    const response = await GET(makeRequest() as any, makeParams())
    expect(response.status).toBe(400)
    expect(h.fetchMock).not.toHaveBeenCalled()
  })

  it('rejects nottwilio.com and sends no credentials', async () => {
    useRecordingUrl('https://nottwilio.com/Recording/RE123')
    const response = await GET(makeRequest() as any, makeParams())
    expect(response.status).toBe(400)
    expect(h.fetchMock).not.toHaveBeenCalled()
  })

  it('rejects evil-twilio.com and sends no credentials', async () => {
    useRecordingUrl('https://evil-twilio.com/Recordings/RE123')
    const response = await GET(makeRequest() as any, makeParams())
    expect(response.status).toBe(400)
    expect(h.fetchMock).not.toHaveBeenCalled()
  })

  it('rejects api.twilio.com.evil.example subdomain spoof', async () => {
    useRecordingUrl('https://api.twilio.com.evil.example/Recordings/RE123')
    const response = await GET(makeRequest() as any, makeParams())
    expect(response.status).toBe(400)
    expect(h.fetchMock).not.toHaveBeenCalled()
  })

  it('rejects plain-http Twilio URLs', async () => {
    useRecordingUrl('http://api.twilio.com/2010-04-01/Accounts/AC1/Recordings/RE123')
    const response = await GET(makeRequest() as any, makeParams())
    expect(response.status).toBe(400)
    expect(h.fetchMock).not.toHaveBeenCalled()
  })

  it('rejects Twilio host with non-recording path', async () => {
    useRecordingUrl('https://api.twilio.com/2010-04-01/Accounts/AC1/Messages')
    const response = await GET(makeRequest() as any, makeParams())
    expect(response.status).toBe(400)
    expect(h.fetchMock).not.toHaveBeenCalled()
  })

  it('fetches a valid api.twilio.com recording URL with Basic credentials', async () => {
    const url = 'https://api.twilio.com/2010-04-01/Accounts/AC_test_sid/Recordings/RE1234567890abcdef'
    useRecordingUrl(url)
    const response = await GET(makeRequest() as any, makeParams())
    expect(response.status).toBe(200)
    expect(h.fetchMock).toHaveBeenCalledTimes(1)
    const [calledUrl, init] = h.fetchMock.mock.calls[0]
    expect(calledUrl).toBe(url)
    expect(init.headers.Authorization).toBe(
      `Basic ${Buffer.from('AC_test_sid:test_auth_token').toString('base64')}`
    )
  })

  it('credentials are only attached after host/protocol/path validation succeeds', async () => {
    useRecordingUrl('https://twilio.com.attacker.example/Recordings/RE123')
    await GET(makeRequest() as any, makeParams())
    expect(h.fetchMock).not.toHaveBeenCalled()
  })
})
