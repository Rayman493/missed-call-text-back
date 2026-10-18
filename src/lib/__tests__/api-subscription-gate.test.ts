import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const withClientMock = vi.fn()
const bearerMock = vi.fn()

vi.mock('../server-subscription-guard', () => ({
  requireSubscriptionAccessWithClient: (...args: any[]) => withClientMock(...args),
  requireSubscriptionAccess: (...args: any[]) => bearerMock(...args),
}))

import { enforceApiSubscription } from '../api-subscription-gate'

function makeRequest(pathname: string, method = 'GET'): NextRequest {
  return new NextRequest(new URL(`https://app.replyflowhq.com${pathname}`), { method })
}

const fakeSupabase = { marker: 'supabase-client' }

beforeEach(() => {
  withClientMock.mockReset()
  bearerMock.mockReset()
})

describe('enforceApiSubscription', () => {
  it('passes exempt billing/webhook/public paths through without any guard call', async () => {
    for (const path of [
      '/api/stripe/webhook',
      '/api/twilio/voice',
      '/api/booking/public/acme',
      '/api/stripe/create-portal-session',
      '/api/business/get-or-create',
      '/api/team/members',
      '/api/apple/verify-transaction',
    ]) {
      const res = await enforceApiSubscription(makeRequest(path), fakeSupabase, { id: 'u1' })
      expect(res, path).toBeNull()
    }
    expect(withClientMock).not.toHaveBeenCalled()
    expect(bearerMock).not.toHaveBeenCalled()
  })

  it('ignores non-API paths', async () => {
    const res = await enforceApiSubscription(makeRequest('/dashboard/leads'), fakeSupabase, null)
    expect(res).toBeNull()
    expect(withClientMock).not.toHaveBeenCalled()
    expect(bearerMock).not.toHaveBeenCalled()
  })

  it('ignores OPTIONS preflight on protected paths (no auth headers present)', async () => {
    const res = await enforceApiSubscription(makeRequest('/api/leads', 'OPTIONS'), fakeSupabase, null)
    expect(res).toBeNull()
    expect(bearerMock).not.toHaveBeenCalled()
  })

  it('protected path + cookie user → WithClient guard, allowed on success', async () => {
    withClientMock.mockResolvedValue({ success: true, business: { id: 'b1' }, role: 'owner' })
    const res = await enforceApiSubscription(makeRequest('/api/leads'), fakeSupabase, { id: 'u1' })
    expect(res).toBeNull()
    expect(withClientMock).toHaveBeenCalledWith(fakeSupabase, 'u1')
    expect(bearerMock).not.toHaveBeenCalled()
  })

  it.each(['active', 'trialing', 'beta', 'comped'])(
    'protected path allowed when business subscription_status=%s',
    async (status) => {
      withClientMock.mockResolvedValue({
        success: true,
        business: { id: 'b1', subscription_status: status },
        role: 'owner',
      })
      const res = await enforceApiSubscription(makeRequest('/api/payments/create'), fakeSupabase, { id: 'u1' })
      expect(res).toBeNull()
    }
  )

  it('protected path + lapsed business → 403 SUBSCRIPTION_REQUIRED', async () => {
    withClientMock.mockResolvedValue({
      success: false,
      error: 'Subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
      statusCode: 403,
    })
    const res = await enforceApiSubscription(makeRequest('/api/payments/create'), fakeSupabase, { id: 'u1' })
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    const body = await res!.json()
    expect(body).toEqual({ error: 'Subscription required', code: 'SUBSCRIPTION_REQUIRED' })
  })

  it('protected path + no session → Bearer-token guard → 401 on bad/absent token', async () => {
    bearerMock.mockResolvedValue({
      success: false,
      error: 'Unauthorized',
      code: 'UNAUTHORIZED',
      statusCode: 401,
    })
    const req = makeRequest('/api/leads')
    const res = await enforceApiSubscription(req, fakeSupabase, null)
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    expect(bearerMock).toHaveBeenCalledWith(req)
    expect(withClientMock).not.toHaveBeenCalled()
  })

  it('protected path + valid Bearer token (native client) → allowed', async () => {
    bearerMock.mockResolvedValue({ success: true, business: { id: 'b1' }, role: 'owner' })
    const res = await enforceApiSubscription(makeRequest('/api/tasks'), fakeSupabase, null)
    expect(res).toBeNull()
  })

  it('team member hits the same business-level gate (member cannot bypass)', async () => {
    withClientMock.mockResolvedValue({
      success: false,
      error: 'Subscription required',
      code: 'SUBSCRIPTION_REQUIRED',
      statusCode: 403,
    })
    const res = await enforceApiSubscription(makeRequest('/api/leads'), fakeSupabase, { id: 'member-1' })
    expect(res!.status).toBe(403)
    // Membership-aware resolution is used — role resolution happens inside the guard
    expect(withClientMock).toHaveBeenCalledWith(fakeSupabase, 'member-1')
  })

  it('business not found → 404 propagated', async () => {
    withClientMock.mockResolvedValue({
      success: false,
      error: 'Business not found',
      code: 'BUSINESS_NOT_FOUND',
      statusCode: 404,
    })
    const res = await enforceApiSubscription(makeRequest('/api/leads'), fakeSupabase, { id: 'u1' })
    expect(res!.status).toBe(404)
  })
})
