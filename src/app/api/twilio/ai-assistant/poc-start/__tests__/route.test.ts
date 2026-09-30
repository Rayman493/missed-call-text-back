import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as routeModule from '../route'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { db } from '@/lib/supabase/admin'
import { checkAllGuards } from '@/lib/ai-call-assistant/config'
import { createAISession } from '@/lib/ai-call-assistant/session'

vi.mock('@/lib/twilio/webhook', () => ({
  requireTwilioAuth: vi.fn()
}))

vi.mock('@/lib/supabase/admin', () => ({
  db: {
    getBusinessByTwilioNumber: vi.fn()
  }
}))

vi.mock('@/lib/ai-call-assistant/config', () => ({
  checkAllGuards: vi.fn()
}))

vi.mock('@/lib/ai-call-assistant/session', () => ({
  createAISession: vi.fn(),
  failAISession: vi.fn()
}))

function makePostRequest() {
  const body = new URLSearchParams({
    From: '+15551234567',
    To: '+15559876543',
    CallSid: 'CA_attacker_controlled'
  }).toString()
  return new Request('http://localhost/api/twilio/ai-assistant/poc-start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
}

/**
 * PI-T2: GET /api/twilio/ai-assistant/poc-start previously skipped Twilio
 * signature validation entirely, letting an unauthenticated caller forge
 * ai_call_sessions with arbitrary From/To/CallSid. Nothing calls this route
 * via GET (production voice redirects to /api/twilio/ai-assistant/start), so
 * the GET export was removed and POST always validates the signature.
 */
describe('/api/twilio/ai-assistant/poc-start', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(db.getBusinessByTwilioNumber).mockResolvedValue({
      business: { id: 'biz-1', name: 'Test Biz' }
    } as any)
    vi.mocked(checkAllGuards).mockReturnValue({ passed: true } as any)
    vi.mocked(createAISession).mockResolvedValue({ id: 'sess-1', call_sid: 'CA_attacker_controlled' } as any)
  })

  it('no longer exports a GET handler (unsigned GET cannot forge sessions)', () => {
    expect((routeModule as any).GET).toBeUndefined()
  })

  it('rejects POST with invalid Twilio signature before creating a session', async () => {
    vi.mocked(requireTwilioAuth).mockReturnValue(false)

    const response = await routeModule.POST(makePostRequest() as any)

    expect(response.status).toBe(401)
    expect(db.getBusinessByTwilioNumber).not.toHaveBeenCalled()
    expect(createAISession).not.toHaveBeenCalled()
  })

  it('signed POST still creates the AI session and returns stream TwiML', async () => {
    vi.mocked(requireTwilioAuth).mockReturnValue(true)

    const response = await routeModule.POST(makePostRequest() as any)

    expect(response.status).toBe(200)
    expect(response.headers.get('X-AI-POC')).toBe('phase-1a')
    const text = await response.text()
    expect(text).toContain('<Stream')
    expect(createAISession).toHaveBeenCalledWith(
      expect.objectContaining({ call_sid: 'CA_attacker_controlled', business_id: 'biz-1' })
    )
  })

  it('signature validation runs for every POST (no method carve-out)', async () => {
    vi.mocked(requireTwilioAuth).mockReturnValue(false)
    await routeModule.POST(makePostRequest() as any)
    expect(requireTwilioAuth).toHaveBeenCalledTimes(1)
  })
})
