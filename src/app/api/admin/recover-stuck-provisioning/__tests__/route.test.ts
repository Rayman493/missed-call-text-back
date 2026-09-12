/**
 * Focused tests for /api/admin/recover-stuck-provisioning
 *
 * Tests:
 * - GET (Vercel Cron) with valid CRON_SECRET succeeds
 * - GET without auth is rejected (401)
 * - POST (manual/admin) with valid CRON_SECRET succeeds (backward compat)
 * - Recovery implementation is called exactly once per request
 * - Unrelated admin methods (PUT/DELETE) are not exported
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock dependencies before importing the route
vi.mock('@/lib/cron-auth', () => ({
  verifyCronRequest: vi.fn(),
}))

vi.mock('@/lib/twilio-provisioning-service', () => ({
  recoverStuckProvisioning: vi.fn(),
}))

vi.mock('@/lib/admin', () => ({
  isAdmin: vi.fn(),
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: { message: 'no session' } }),
    },
  })),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(() => Promise.resolve({ getAll: () => [], setAll: () => {} })),
}))

// Import after mocks are set up
import * as routeModule from '../route'
import { verifyCronRequest } from '@/lib/cron-auth'
import { recoverStuckProvisioning } from '@/lib/twilio-provisioning-service'

const { GET, POST } = routeModule

function makeRequest(headers: Record<string, string> = {}): any {
  return {
    headers: new Map(Object.entries(headers)),
    url: 'http://localhost/api/admin/recover-stuck-provisioning',
    method: 'GET',
  } as any
}

describe('GET /api/admin/recover-stuck-provisioning (Vercel Cron)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('succeeds with valid CRON_SECRET', async () => {
    vi.mocked(verifyCronRequest).mockReturnValue({ authorized: true })
    vi.mocked(recoverStuckProvisioning).mockResolvedValue({
      success: true,
      recovered: 2,
      failed: 0,
      skipped: 1,
      errors: [],
      recoveryRunId: 'test-run-1',
    } as any)

    const req = makeRequest({ 'x-vercel-cron-secret': 'valid-secret' })
    const res = await GET(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.recovered).toBe(2)
  })

  it('calls recoverStuckProvisioning exactly once', async () => {
    vi.mocked(verifyCronRequest).mockReturnValue({ authorized: true })
    vi.mocked(recoverStuckProvisioning).mockResolvedValue({
      success: true,
      recovered: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      recoveryRunId: 'test-run-2',
    } as any)

    const req = makeRequest({ 'x-vercel-cron-secret': 'valid-secret' })
    await GET(req)

    expect(recoverStuckProvisioning).toHaveBeenCalledTimes(1)
  })

  it('rejects without auth (401)', async () => {
    vi.mocked(verifyCronRequest).mockReturnValue({
      authorized: false,
      error: 'Unauthorized',
      status: 401,
    })

    const req = makeRequest()
    const res = await GET(req)

    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.ok).toBe(false)
    expect(body.error).toBe('Unauthorized')
    expect(recoverStuckProvisioning).not.toHaveBeenCalled()
  })

  it('returns 500 when recovery fails', async () => {
    vi.mocked(verifyCronRequest).mockReturnValue({ authorized: true })
    vi.mocked(recoverStuckProvisioning).mockResolvedValue({
      success: false,
      recovered: 0,
      failed: 1,
      skipped: 0,
      errors: ['timeout'],
      recoveryRunId: 'test-run-3',
    } as any)

    const req = makeRequest({ 'x-vercel-cron-secret': 'valid-secret' })
    const res = await GET(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.ok).toBe(false)
  })
})

describe('POST /api/admin/recover-stuck-provisioning (manual/admin)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('succeeds with valid CRON_SECRET (backward compat)', async () => {
    vi.mocked(verifyCronRequest).mockReturnValue({ authorized: true })
    vi.mocked(recoverStuckProvisioning).mockResolvedValue({
      success: true,
      recovered: 1,
      failed: 0,
      skipped: 0,
      errors: [],
      recoveryRunId: 'test-run-4',
    } as any)

    const req = makeRequest({ Authorization: 'Bearer valid-secret' })
    req.method = 'POST'
    const res = await POST(req)

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.recovered).toBe(1)
  })

  it('calls recoverStuckProvisioning exactly once', async () => {
    vi.mocked(verifyCronRequest).mockReturnValue({ authorized: true })
    vi.mocked(recoverStuckProvisioning).mockResolvedValue({
      success: true,
      recovered: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      recoveryRunId: 'test-run-5',
    } as any)

    const req = makeRequest({ Authorization: 'Bearer valid-secret' })
    await POST(req)

    expect(recoverStuckProvisioning).toHaveBeenCalledTimes(1)
  })

  it('rejects without auth (401)', async () => {
    vi.mocked(verifyCronRequest).mockReturnValue({
      authorized: false,
      error: 'Unauthorized',
      status: 401,
    })

    const req = makeRequest()
    const res = await POST(req)

    expect(res.status).toBe(401)
    expect(recoverStuckProvisioning).not.toHaveBeenCalled()
  })
})

describe('Unrelated admin methods are not exported', () => {
  it('does not export PUT', () => {
    expect((routeModule as any).PUT).toBeUndefined()
  })

  it('does not export DELETE', () => {
    expect((routeModule as any).DELETE).toBeUndefined()
  })

  it('does not export PATCH', () => {
    expect((routeModule as any).PATCH).toBeUndefined()
  })
})
