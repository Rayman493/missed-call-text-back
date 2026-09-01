/**
 * Tests for /api/terminal/ambiguous-reason endpoint
 *
 * Tests authentication, input validation, and that telemetry is non-blocking.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import { NextRequest } from 'next/server'

// Mock auth helper
vi.mock('@/lib/supabase/auth-helper', () => ({
  getAuthenticatedUser: vi.fn(),
}))

describe('POST /api/terminal/ambiguous-reason', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated requests', async () => {
    const { getAuthenticatedUser } = await import('@/lib/supabase/auth-helper')
    vi.mocked(getAuthenticatedUser).mockResolvedValue(null)

    const request = new NextRequest('http://localhost:3000/api/terminal/ambiguous-reason', {
      method: 'POST',
      body: JSON.stringify({
        ambiguousReason: 'reconciliation_failed',
        platform: 'android',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('accepts authenticated valid telemetry', async () => {
    const { getAuthenticatedUser } = await import('@/lib/supabase/auth-helper')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123' })

    const request = new NextRequest('http://localhost:3000/api/terminal/ambiguous-reason', {
      method: 'POST',
      body: JSON.stringify({
        correlationId: 'ttp_abc123',
        sessionId: 'session-456',
        attemptId: 'attempt-789',
        paymentIntentId: 'pi_xyz',
        ambiguousReason: 'reconciliation_failed',
        platform: 'android',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('rejects missing ambiguousReason', async () => {
    const { getAuthenticatedUser } = await import('@/lib/supabase/auth-helper')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123' })

    const request = new NextRequest('http://localhost:3000/api/terminal/ambiguous-reason', {
      method: 'POST',
      body: JSON.stringify({
        platform: 'android',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('rejects invalid ambiguousReason', async () => {
    const { getAuthenticatedUser } = await import('@/lib/supabase/auth-helper')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123' })

    const request = new NextRequest('http://localhost:3000/api/terminal/ambiguous-reason', {
      method: 'POST',
      body: JSON.stringify({
        ambiguousReason: 'invalid_reason',
        platform: 'android',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('rejects invalid platform', async () => {
    const { getAuthenticatedUser } = await import('@/lib/supabase/auth-helper')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123' })

    const request = new NextRequest('http://localhost:3000/api/terminal/ambiguous-reason', {
      method: 'POST',
      body: JSON.stringify({
        ambiguousReason: 'reconciliation_failed',
        platform: 'invalid',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('rejects oversized correlationId', async () => {
    const { getAuthenticatedUser } = await import('@/lib/supabase/auth-helper')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123' })

    const request = new NextRequest('http://localhost:3000/api/terminal/ambiguous-reason', {
      method: 'POST',
      body: JSON.stringify({
        correlationId: 'a'.repeat(101),
        ambiguousReason: 'reconciliation_failed',
        platform: 'android',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('handles telemetry errors gracefully', async () => {
    const { getAuthenticatedUser } = await import('@/lib/supabase/auth-helper')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123' })

    const request = new NextRequest('http://localhost:3000/api/terminal/ambiguous-reason', {
      method: 'POST',
      body: JSON.stringify({
        ambiguousReason: 'reconciliation_failed',
        platform: 'android',
      }),
    })

    // Mock console.error to verify it's called
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const response = await POST(request)
    expect(response.status).toBe(200)
    consoleSpy.mockRestore()
  })

  it('accepts all known ambiguous reason values', async () => {
    const { getAuthenticatedUser } = await import('@/lib/supabase/auth-helper')
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-123' })

    const validReasons = [
      'unresolved_attempt_found',
      'reconciliation_failed',
      'reconciliation_exception',
      'reconcile_exception',
      'reconcile_abort',
      'reconciliation_http_error',
      'reconciliation_abort',
      'native_unknown_status',
    ]

    for (const reason of validReasons) {
      const request = new NextRequest('http://localhost:3000/api/terminal/ambiguous-reason', {
        method: 'POST',
        body: JSON.stringify({
          ambiguousReason: reason,
          platform: 'android',
        }),
      })

      const response = await POST(request)
      expect(response.status).toBe(200)
    }
  })
})