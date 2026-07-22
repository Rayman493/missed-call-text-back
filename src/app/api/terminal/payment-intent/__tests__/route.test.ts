import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'
import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import getStripe from '@/lib/stripe'
import { db } from '@/lib/supabase/admin'

// Mock dependencies
vi.mock('@supabase/supabase-js')
vi.mock('@/lib/stripe')
vi.mock('@/lib/supabase/admin')

describe('POST /api/terminal/payment-intent', () => {
  let mockSupabase: any
  let mockStripe: any

  beforeEach(() => {
    vi.clearAllMocks()
    
    // Mock Supabase client
    mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { user: { id: 'user-123' } } },
          error: null,
        }),
      },
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(),
      insert: vi.fn().mockResolvedValue({ error: null }),
    }
    
    vi.mocked(createClient).mockReturnValue(mockSupabase)
    
    // Mock Stripe
    mockStripe = {
      paymentIntents: {
        create: vi.fn().mockResolvedValue({
          id: 'pi_123',
          client_secret: 'pi_123_secret_abc',
        }),
      },
    }
    
    vi.mocked(getStripe).mockReturnValue(mockStripe)
    
    // Mock db
    vi.mocked(db).getBusinessByUserId = vi.fn().mockResolvedValue({
      found: true,
      reason: 'found',
      business: {
        id: 'business-123',
        name: 'Test Business',
        twilio_phone_number: '+1234567890',
        auto_reply_message: 'Auto reply',
        created_at: new Date().toISOString(),
        stripe_connect_account_id: 'acct_123',
        stripe_connect_status: 'connected',
        stripe_charges_enabled: true,
      },
    })
  })

  it('rejects unauthenticated requests', async () => {
    vi.mocked(mockSupabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: { message: 'Not authenticated' },
    })

    const request = new NextRequest('http://localhost/api/terminal/payment-intent', {
      method: 'POST',
      body: JSON.stringify({ amountCents: 1000 }),
    })

    const response = await POST(request)
    expect(response.status).toBe(401)
  })

  it('rejects invalid amount', async () => {
    const request = new NextRequest('http://localhost/api/terminal/payment-intent', {
      method: 'POST',
      body: JSON.stringify({ amountCents: -100 }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('rejects requests from users without business', async () => {
    vi.mocked(db).getBusinessByUserId.mockResolvedValue({
      found: false,
      reason: 'not_found',
      business: null,
    })

    const request = new NextRequest('http://localhost/api/terminal/payment-intent', {
      method: 'POST',
      body: JSON.stringify({ amountCents: 1000 }),
    })

    const response = await POST(request)
    expect(response.status).toBe(404)
  })

  it('rejects requests from businesses without connected Stripe account', async () => {
    vi.mocked(db).getBusinessByUserId.mockResolvedValue({
      found: true,
      reason: 'found',
      business: {
        id: 'business-123',
        name: 'Test Business',
        twilio_phone_number: '+1234567890',
        auto_reply_message: 'Auto reply',
        created_at: new Date().toISOString(),
        stripe_connect_account_id: null,
        stripe_connect_status: 'not_connected',
        stripe_charges_enabled: false,
      },
    })

    const request = new NextRequest('http://localhost/api/terminal/payment-intent', {
      method: 'POST',
      body: JSON.stringify({ amountCents: 1000 }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('creates PaymentIntent with correct parameters', async () => {
    const request = new NextRequest('http://localhost/api/terminal/payment-intent', {
      method: 'POST',
      body: JSON.stringify({
        amountCents: 1000,
        currency: 'usd',
        leadId: 'lead-123',
        description: 'Test payment',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 1000,
        currency: 'usd',
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        metadata: expect.objectContaining({
          business_id: 'business-123',
          user_id: 'user-123',
          lead_id: 'lead-123',
          payment_method_type: 'card_present',
        }),
      }),
      expect.objectContaining({
        stripeAccount: 'acct_123',
        idempotencyKey: expect.stringMatching(/^terminal-/),
      })
    )
  })

  it('validates lead ownership when leadId is provided', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'lead-123', business_id: 'other-business' },
      error: null,
    })

    const request = new NextRequest('http://localhost/api/terminal/payment-intent', {
      method: 'POST',
      body: JSON.stringify({
        amountCents: 1000,
        leadId: 'lead-123',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(403)
  })

  it('prevents duplicate payments within 5 minutes', async () => {
    mockSupabase.maybeSingle.mockResolvedValueOnce({
      data: { id: 'payment-123', status: 'pending' },
      error: null,
    })

    const request = new NextRequest('http://localhost/api/terminal/payment-intent', {
      method: 'POST',
      body: JSON.stringify({
        amountCents: 1000,
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(409)
  })

  it('returns paymentIntentId and clientSecret on success', async () => {
    const request = new NextRequest('http://localhost/api/terminal/payment-intent', {
      method: 'POST',
      body: JSON.stringify({
        amountCents: 1000,
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.paymentIntentId).toBe('pi_123')
    expect(data.clientSecret).toBe('pi_123_secret_abc')
    expect(data.localPaymentId).toBeDefined()
  })
})
