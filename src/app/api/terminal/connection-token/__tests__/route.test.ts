/**
 * Tests for /api/terminal/connection-token endpoint
 * 
 * Tests authentication, business lookup, Stripe Connect account resolution,
 * and ConnectionToken creation.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { POST } from '../route'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import getStripe from '@/lib/stripe'
import { db } from '@/lib/supabase/admin'

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

// Mock Stripe client
vi.mock('@/lib/stripe', () => ({
  __esModule: true,
  default: vi.fn(),
}))

// Mock Supabase admin
vi.mock('@/lib/supabase/admin', () => ({
  db: {
    getBusinessByUserId: vi.fn(),
  },
}))

describe('POST /api/terminal/connection-token', () => {
  let mockSupabaseClient: any
  let mockStripe: any

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks()

    // Setup mock Supabase client
    mockSupabaseClient = {
      auth: {
        getSession: vi.fn(),
      },
    }
    ;(createClient as any).mockReturnValue(mockSupabaseClient)

    // Setup mock Stripe client
    mockStripe = {
      terminal: {
        connectionTokens: {
          create: vi.fn(),
        },
      },
    }
    ;(getStripe as any).mockReturnValue(mockStripe)
  })

  it('should return 401 when no session is provided', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })

    const request = new NextRequest('http://localhost/api/terminal/connection-token', {
      method: 'POST',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 401 when session has error', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid token' },
    })

    const request = new NextRequest('http://localhost/api/terminal/connection-token', {
      method: 'POST',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
  })

  it('should return 404 when user has no business', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    })

    vi.mocked(db.getBusinessByUserId).mockResolvedValue({
      found: false,
      business: null,
      reason: 'not_found',
    })

    const request = new NextRequest('http://localhost/api/terminal/connection-token', {
      method: 'POST',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Business not found')
    expect(db.getBusinessByUserId).toHaveBeenCalledWith('user-123')
  })

  it('should return 400 when business has no connected Stripe account', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    })

    vi.mocked(db.getBusinessByUserId).mockResolvedValue({
      found: true,
      business: {
        id: 'business-123',
        name: 'Test Business',
        twilio_phone_number: null,
        auto_reply_message: null,
        created_at: new Date().toISOString(),
        stripe_connect_account_id: null,
        stripe_connect_status: 'not_connected',
      },
      reason: 'found',
    })

    const request = new NextRequest('http://localhost/api/terminal/connection-token', {
      method: 'POST',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Stripe Connect account not configured')
  })

  it('should return 400 when Stripe Connect account is not in connected state', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    })

    vi.mocked(db.getBusinessByUserId).mockResolvedValue({
      found: true,
      business: {
        id: 'business-123',
        name: 'Test Business',
        twilio_phone_number: null,
        auto_reply_message: null,
        created_at: new Date().toISOString(),
        stripe_connect_account_id: 'acct_123',
        stripe_connect_status: 'pending',
      },
      reason: 'found',
    })

    const request = new NextRequest('http://localhost/api/terminal/connection-token', {
      method: 'POST',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Stripe Connect account not ready')
  })

  it('should return 503 when Stripe client fails to initialize', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    })

    vi.mocked(db.getBusinessByUserId).mockResolvedValue({
      found: true,
      business: {
        id: 'business-123',
        name: 'Test Business',
        twilio_phone_number: null,
        auto_reply_message: null,
        created_at: new Date().toISOString(),
        stripe_connect_account_id: 'acct_123',
        stripe_connect_status: 'connected',
      },
      reason: 'found',
    })

    vi.mocked(getStripe).mockReturnValue(null)

    const request = new NextRequest('http://localhost/api/terminal/connection-token', {
      method: 'POST',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(503)
    expect(data.error).toBe('Payment service unavailable')
  })

  it('should create ConnectionToken scoped to connected account and return secret', async () => {
    mockSupabaseClient.auth.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-123' } } },
      error: null,
    })

    vi.mocked(db.getBusinessByUserId).mockResolvedValue({
      found: true,
      business: {
        id: 'business-123',
        name: 'Test Business',
        twilio_phone_number: null,
        auto_reply_message: null,
        created_at: new Date().toISOString(),
        stripe_connect_account_id: 'acct_123',
        stripe_connect_status: 'connected',
      },
      reason: 'found',
    })

    mockStripe.terminal.connectionTokens.create.mockResolvedValue({
      secret: 'tok_secret_123',
    })

    const request = new NextRequest('http://localhost/api/terminal/connection-token', {
      method: 'POST',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.secret).toBe('tok_secret_123')
    expect(mockStripe.terminal.connectionTokens.create).toHaveBeenCalledWith(
      {},
      { stripeAccount: 'acct_123' }
    )

    // Verify cache headers
    expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, proxy-revalidate')
    expect(response.headers.get('Pragma')).toBe('no-cache')
  })

  it('should return 500 on unexpected errors', async () => {
    mockSupabaseClient.auth.getSession.mockRejectedValue(new Error('Database connection failed'))

    const request = new NextRequest('http://localhost/api/terminal/connection-token', {
      method: 'POST',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Internal server error')
  })
})
