import { describe, it, expect, vi } from 'vitest'
import * as routeModule from '../route'

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} }))
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no session' } }))
    }
  }))
}))

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: { from: vi.fn() }
}))

vi.mock('@/lib/server-subscription-guard', () => ({
  requireSubscriptionAccessWithClient: vi.fn()
}))

/**
 * PI-T1a: POST /api/personal-voicemails previously had no authentication and
 * inserted caller-controlled rows (including recording_url) via supabaseAdmin.
 * There is no legitimate caller — the live Twilio path is the
 * signature-validated /api/twilio/personal-voicemail webhook — so the handler
 * was removed entirely. Next.js answers missing method exports with 405.
 */
describe('POST /api/personal-voicemails (removed)', () => {
  it('does not export a POST handler', () => {
    expect((routeModule as any).POST).toBeUndefined()
  })

  it('does not export any other write handlers', () => {
    expect((routeModule as any).PUT).toBeUndefined()
    expect((routeModule as any).DELETE).toBeUndefined()
    expect((routeModule as any).PATCH).toBeUndefined()
  })
})

describe('GET /api/personal-voicemails (preserved)', () => {
  it('still exports a GET handler', () => {
    expect(typeof (routeModule as any).GET).toBe('function')
  })

  it('rejects unauthenticated reads', async () => {
    const request = new Request('http://localhost/api/personal-voicemails')
    const response = await routeModule.GET(request as any)
    expect(response.status).toBe(401)
  })
})
