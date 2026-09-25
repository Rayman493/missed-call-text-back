/**
 * Production gate for dev-only Twilio test endpoints.
 *
 * /api/test/twilio-account, /api/test/twilio-env and
 * /api/test/twilio-messaging-service exposed Twilio account data and
 * business information without any authentication. They are now gated to
 * development only — anonymous requests in production receive 404 before
 * any Twilio or service-role access runs.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const root = process.cwd()
const read = (p: string) => readFileSync(path.join(root, p), 'utf8')

const routes = [
  'src/app/api/test/twilio-account/route.ts',
  'src/app/api/test/twilio-env/route.ts',
  'src/app/api/test/twilio-messaging-service/route.ts',
]

describe('dev-only gate is the first statement of every test GET handler', () => {
  for (const r of routes) {
    it(`${r} returns 404 unless NODE_ENV is development`, () => {
      const src = read(r)
      expect(src).toContain("process.env.NODE_ENV !== 'development'")
      // The gate must run before any Twilio/service-role work: it appears
      // inside the GET handler before the try block.
      const getIdx = src.indexOf('export async function GET')
      const gateIdx = src.indexOf("process.env.NODE_ENV !== 'development'")
      expect(getIdx).toBeGreaterThanOrEqual(0)
      expect(gateIdx).toBeGreaterThan(getIdx)
      // Gate must be the first statement — before any Twilio/service-role work.
      expect(gateIdx - getIdx).toBeLessThan(200)
    })
  }
})

describe('anonymous production requests receive 404', () => {
  beforeAll(() => {
    vi.stubEnv('NODE_ENV', 'production')
    // Route module creates a service client at import time.
    process.env.NEXT_PUBLIC_SUPABASE_URL ||= 'http://localhost'
    process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-key'
    process.env.TWILIO_ACCOUNT_SID ||= 'ACtest'
    process.env.TWILIO_AUTH_TOKEN ||= 'test-token'
  })
  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('twilio-account GET', async () => {
    const { GET } = await import('@/app/api/test/twilio-account/route')
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('twilio-env GET', async () => {
    const { GET } = await import('@/app/api/test/twilio-env/route')
    const res = await GET()
    expect(res.status).toBe(404)
  })

  it('twilio-messaging-service GET', async () => {
    const { GET } = await import('@/app/api/test/twilio-messaging-service/route')
    const res = await GET()
    expect(res.status).toBe(404)
  })
})
