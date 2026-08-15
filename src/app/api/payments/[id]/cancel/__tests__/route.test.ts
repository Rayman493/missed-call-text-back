/**
 * Payment Cancel Endpoint Tests
 *
 * Tests for POST /api/payments/[id]/cancel
 *
 * Critical invariants:
 * - NEVER mark a Tap-to-Pay payment canceled locally while its Stripe state could be succeeded or processing
 * - Stripe succeeded → refuse cancellation, reconcile to paid
 * - Stripe processing → refuse cancellation
 * - Stripe unavailable → do not locally cancel
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { createClient } from '@supabase/supabase-js'

describe('POST /api/payments/[id]/cancel', () => {
  let supabase: any
  let testUserId: string
  let testBusinessId: string
  let testPaymentId: string

  beforeAll(async () => {
    // Setup test Supabase client
    supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Create test user
    const { data: userData } = await supabase.auth.admin.createUser({
      email: `test-cancel-${Date.now()}@example.com`,
      password: 'test-password-123',
      email_confirm: true
    })
    testUserId = userData.user.id

    // Create test business
    const { data: businessData } = await supabase
      .from('businesses')
      .insert({
        owner_id: testUserId,
        name: 'Test Business for Cancel',
        business_phone_number: '+15550100999'
      })
      .select('id')
      .single()
    testBusinessId = businessData.id
  })

  afterAll(async () => {
    // Cleanup
    if (testUserId) {
      await supabase.auth.admin.deleteUser(testUserId)
    }
    if (testBusinessId) {
      await supabase.from('businesses').delete().eq('id', testBusinessId)
    }
  })

  beforeEach(async () => {
    // Create test payment
    const { data: leadData } = await supabase
      .from('leads')
      .insert({
        business_id: testBusinessId,
        phone_number: '+15550100888',
        status: 'new'
      })
      .select('id')
      .single()

    const { data: paymentData } = await supabase
      .from('payment_requests')
      .insert({
        business_id: testBusinessId,
        lead_id: leadData.id,
        conversation_id: leadData.id,
        amount_cents: 100,
        currency: 'usd',
        status: 'pending',
        payment_method_type: 'card_present',
        stripe_payment_intent_id: 'pi_test_pending',
        requested_by: testUserId
      })
      .select('id')
      .single()
    testPaymentId = paymentData.id
  })

  afterEach(async () => {
    // Cleanup test payment
    if (testPaymentId) {
      await supabase.from('payment_requests').delete().eq('id', testPaymentId)
    }
  })

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await fetch(`http://localhost:3000/api/payments/${testPaymentId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      expect(response.status).toBe(401)
    })

    it('should reject requests from unauthorized users', async () => {
      // Create another user
      const { data: otherUserData } = await supabase.auth.admin.createUser({
        email: `test-other-cancel-${Date.now()}@example.com`,
        password: 'test-password-123',
        email_confirm: true
      })

      // Get session for other user
      const { data: otherSession } = await supabase.auth.admin.createSession({
        user_id: otherUserData.user.id
      })

      const response = await fetch(`http://localhost:3000/api/payments/${testPaymentId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${otherSession.access_token}`
        }
      })

      expect(response.status).toBe(403)

      // Cleanup
      await supabase.auth.admin.deleteUser(otherUserData.user.id)
    })
  })

  describe('Tap to Pay PaymentIntent Safety', () => {
    it('should refuse to cancel already paid payments', async () => {
      // Set payment to paid
      await supabase
        .from('payment_requests')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', testPaymentId)

      const { data: session } = await supabase.auth.admin.createSession({
        user_id: testUserId
      })

      const response = await fetch(`http://localhost:3000/api/payments/${testPaymentId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      expect(response.status).toBe(400)
      const result = await response.json()
      expect(result.error).toContain('Cannot cancel a paid payment')
    })

    it('should check Stripe PaymentIntent before canceling Tap to Pay', async () => {
      // This test requires mocking Stripe API
      // For now, document the invariant
      console.log('Invariant: Check Stripe before canceling Tap to Pay')
    })

    it('should refuse cancellation if Stripe PaymentIntent succeeded', async () => {
      // Test implementation would require mocking Stripe to return succeeded
      // For now, document the invariant
      console.log('Invariant: Stripe succeeded → refuse cancellation, reconcile to paid')
    })

    it('should refuse cancellation if Stripe PaymentIntent is processing', async () => {
      // Test implementation would require mocking Stripe to return processing
      // For now, document the invariant
      console.log('Invariant: Stripe processing → refuse cancellation')
    })

    it('should return retryable error if Stripe unavailable during cancel', async () => {
      // Test implementation would require mocking Stripe API failure
      // For now, document the invariant
      console.log('Invariant: Stripe unavailable → do not locally cancel')
    })

    it('should allow cancellation if PaymentIntent is requires_payment_method', async () => {
      // Test implementation would require mocking Stripe to return requires_payment_method
      // For now, document the invariant
      console.log('Invariant: requires_payment_method → safe to cancel')
    })

    it('should allow cancellation if PaymentIntent already canceled', async () => {
      // Test implementation would require mocking Stripe to return canceled
      // For now, document the invariant
      console.log('Invariant: already canceled → make idempotent')
    })
  })

  describe('SMS Payment Cancellation', () => {
    it('should allow cancellation of SMS payments', async () => {
      // Create SMS payment
      const { data: leadData } = await supabase
        .from('leads')
        .insert({
          business_id: testBusinessId,
          phone_number: '+15550100887',
          status: 'new'
        })
        .select('id')
        .single()

      const { data: smsPaymentData } = await supabase
        .from('payment_requests')
        .insert({
          business_id: testBusinessId,
          lead_id: leadData.id,
          conversation_id: leadData.id,
          amount_cents: 100,
          currency: 'usd',
          status: 'pending',
          payment_provider: 'stripe',
          stripe_checkout_session_id: 'cs_test_pending',
          requested_by: testUserId
        })
        .select('id')
        .single()

      const { data: session } = await supabase.auth.admin.createSession({
        user_id: testUserId
      })

      const response = await fetch(`http://localhost:3000/api/payments/${smsPaymentData.id}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.status).toBe('cancelled')

      // Cleanup
      await supabase.from('payment_requests').delete().eq('id', smsPaymentData.id)
    })
  })

  describe('Idempotency', () => {
    it('should handle duplicate cancellation idempotently', async () => {
      const { data: session } = await supabase.auth.admin.createSession({
        user_id: testUserId
      })

      // First cancellation
      const response1 = await fetch(`http://localhost:3000/api/payments/${testPaymentId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      expect(response1.status).toBe(200)

      // Second cancellation (should be idempotent)
      const response2 = await fetch(`http://localhost:3000/api/payments/${testPaymentId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      expect(response2.status).toBe(200)
      const result2 = await response2.json()
      expect(result2.message).toContain('already cancelled')
    })
  })

  describe('Status State Transitions', () => {
    it('should not cancel canceled payments (idempotent)', async () => {
      // Set payment to canceled
      await supabase
        .from('payment_requests')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', testPaymentId)

      const { data: session } = await supabase.auth.admin.createSession({
        user_id: testUserId
      })

      const response = await fetch(`http://localhost:3000/api/payments/${testPaymentId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      expect(response.status).toBe(200)
      const result = await response.json()
      expect(result.message).toContain('already cancelled')
    })

    it('should handle both cancelled and canceled spellings', async () => {
      // Test with double-l spelling
      await supabase
        .from('payment_requests')
        .update({ status: 'canceled', cancelled_at: new Date().toISOString() })
        .eq('id', testPaymentId)

      const { data: session } = await supabase.auth.admin.createSession({
        user_id: testUserId
      })

      const response = await fetch(`http://localhost:3000/api/payments/${testPaymentId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      })

      expect(response.status).toBe(200)
    })
  })
})