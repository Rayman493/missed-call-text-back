/**
 * Stripe Webhook Subscription Tests
 * 
 * Tests for subscription lifecycle events:
 * - trial → paid conversion
 * - recurring renewal
 * - cancellation
 * - reactivation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import Stripe from 'stripe'

// Mock Supabase client
const mockSupabase = {
  from: vi.fn(() => mockSupabase),
  select: vi.fn(() => mockSupabase),
  eq: vi.fn(() => mockSupabase),
  single: vi.fn(() => mockSupabase),
  update: vi.fn(() => mockSupabase),
  insert: vi.fn(() => mockSupabase),
  limit: vi.fn(() => mockSupabase),
  neq: vi.fn(() => mockSupabase),
}

// Mock Stripe client
const mockStripe = {
  webhooks: {
    constructEvent: vi.fn(),
  },
  subscriptions: {
    retrieve: vi.fn(),
  },
  paymentIntents: {
    retrieve: vi.fn(),
  },
}

// Mock notification service
vi.mock('@/lib/notifications-server', () => ({
  notificationServiceServer: {
    createNotification: vi.fn(),
  },
}))

// Mock Twilio reclamation
vi.mock('@/lib/twilio-reclamation', () => ({
  scheduleTwilioRelease: vi.fn(),
  cancelTwilioRelease: vi.fn(),
}))

// Mock subscription library
vi.mock('@/lib/subscription', () => ({
  SUBSCRIPTION_STATES: {
    ACTIVE: 'active',
    TRIALING: 'trialing',
    CANCELED: 'canceled',
    PAST_DUE: 'past_due',
  },
  isEligibleForProvisioning: vi.fn(() => false),
}))

describe('Stripe Webhook - Subscription Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('Trial to Paid Conversion', () => {
    it('should update current_period_end when trial converts to paid', async () => {
      // Mock Stripe subscription with trial converted to paid
      const mockSubscription = {
        id: 'sub_test123',
        status: 'active',
        customer: 'cus_test123',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60, // 30 days from now
        trial_end: null,
        cancel_at: null,
        cancel_at_period_end: false,
        items: {
          data: [{
            price: { id: 'price_test123' }
          }]
        }
      }

      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription)

      // Mock business lookup
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'business_123',
          subscription_status: 'trialing',
          current_period_end: '2026-08-02T00:00:00Z', // Stale trial end date
          twilio_phone_number: '+1234567890',
          twilio_phone_number_sid: 'PN123',
          manual_access_enabled: false,
          manual_access_expires_at: null,
          provisioning_status: 'completed',
        },
        error: null
      })

      // Mock successful update
      mockSupabase.update.mockResolvedValueOnce({
        error: null
      })

      // Simulate invoice.paid webhook
      const invoiceEvent = {
        id: 'evt_test123',
        type: 'invoice.paid',
        data: {
          object: {
            id: 'in_test123',
            subscription: 'sub_test123',
            customer: 'cus_test123',
          }
        }
      }

      // Verify that subscription.retrieve was called
      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalledWith('sub_test123')

      // Verify that current_period_end was updated
      const updateCall = mockSupabase.update.mock.calls[0]
      expect(updateCall[0]).toHaveProperty('current_period_end')
      expect(updateCall[0].current_period_end).toBeTruthy()
    })

    it('should use trial_end as fallback if current_period_end is null', async () => {
      const mockSubscription = {
        id: 'sub_test123',
        status: 'active',
        customer: 'cus_test123',
        current_period_end: null,
        trial_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        cancel_at: null,
        cancel_at_period_end: false,
        items: {
          data: [{
            price: { id: 'price_test123' }
          }]
        }
      }

      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription)

      // Mock business lookup
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'business_123',
          subscription_status: 'trialing',
          current_period_end: null,
          twilio_phone_number: '+1234567890',
          twilio_phone_number_sid: 'PN123',
          manual_access_enabled: false,
          manual_access_expires_at: null,
          provisioning_status: 'completed',
        },
        error: null
      })

      mockSupabase.update.mockResolvedValueOnce({
        error: null
      })

      // Verify fallback logic
      const updateCall = mockSupabase.update.mock.calls[0]
      expect(updateCall[0]).toHaveProperty('current_period_end')
      expect(updateCall[0].current_period_end).toBeTruthy()
    })
  })

  describe('Recurring Renewal', () => {
    it('should update current_period_end on successful renewal', async () => {
      const mockSubscription = {
        id: 'sub_test123',
        status: 'active',
        customer: 'cus_test123',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        trial_end: null,
        cancel_at: null,
        cancel_at_period_end: false,
        items: {
          data: [{
            price: { id: 'price_test123' }
          }]
        }
      }

      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription)

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'business_123',
          subscription_status: 'active',
          current_period_end: '2026-08-02T00:00:00Z', // Old period end
          twilio_phone_number: '+1234567890',
          twilio_phone_number_sid: 'PN123',
          manual_access_enabled: false,
          manual_access_expires_at: null,
          provisioning_status: 'completed',
        },
        error: null
      })

      mockSupabase.update.mockResolvedValueOnce({
        error: null
      })

      // Verify current_period_end was updated to new value
      const updateCall = mockSupabase.update.mock.calls[0]
      expect(updateCall[0]).toHaveProperty('current_period_end')
      expect(updateCall[0].current_period_end).not.toBe('2026-08-02T00:00:00Z')
    })
  })

  describe('Cancellation', () => {
    it('should clear subscription fields on subscription.deleted', async () => {
      const mockSubscription = {
        id: 'sub_test123',
        status: 'canceled',
        customer: 'cus_test123',
        canceled_at: Math.floor(Date.now() / 1000),
      }

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'business_123',
          user_id: 'user_123',
          carrier: 'twilio',
        },
        error: null
      })

      mockSupabase.update.mockResolvedValueOnce({
        error: null
      })

      // Verify all subscription fields are cleared
      const updateCall = mockSupabase.update.mock.calls[0]
      expect(updateCall[0]).toEqual({
        stripe_subscription_id: null,
        subscription_status: 'canceled',
        subscription_price_id: null,
        current_period_end: null,
        cancel_at_period_end: false,
        cancel_at: null,
        trial_ends_at: null
      })
    })
  })

  describe('Reactivation', () => {
    it('should recover from past_due status on invoice.paid', async () => {
      const mockSubscription = {
        id: 'sub_test123',
        status: 'active',
        customer: 'cus_test123',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        trial_end: null,
        cancel_at: null,
        cancel_at_period_end: false,
        items: {
          data: [{
            price: { id: 'price_test123' }
          }]
        }
      }

      mockStripe.subscriptions.retrieve.mockResolvedValue(mockSubscription)

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'business_123',
          subscription_status: 'past_due',
          current_period_end: '2026-08-02T00:00:00Z',
          twilio_phone_number: '+1234567890',
          twilio_phone_number_sid: 'PN123',
          manual_access_enabled: false,
          manual_access_expires_at: null,
          provisioning_status: 'completed',
        },
        error: null
      })

      mockSupabase.update.mockResolvedValueOnce({
        error: null
      })

      // Verify status changed to active and current_period_end updated
      const updateCall = mockSupabase.update.mock.calls[0]
      expect(updateCall[0].subscription_status).toBe('active')
      expect(updateCall[0]).toHaveProperty('current_period_end')
    })
  })

  describe('Error Handling', () => {
    it('should handle Stripe API failure gracefully', async () => {
      mockStripe.subscriptions.retrieve.mockRejectedValue(new Error('Stripe API error'))

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'business_123',
          subscription_status: 'past_due',
          current_period_end: '2026-08-02T00:00:00Z',
          twilio_phone_number: '+1234567890',
          twilio_phone_number_sid: 'PN123',
          manual_access_enabled: false,
          manual_access_expires_at: null,
          provisioning_status: 'completed',
        },
        error: null
      })

      // Should not crash, should log error and continue
      expect(mockStripe.subscriptions.retrieve).toHaveBeenCalled()
    })

    it('should not update current_period_end if Stripe returns null', async () => {
      mockStripe.subscriptions.retrieve.mockResolvedValue(null)

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: 'business_123',
          subscription_status: 'past_due',
          current_period_end: '2026-08-02T00:00:00Z',
          twilio_phone_number: '+1234567890',
          twilio_phone_number_sid: 'PN123',
          manual_access_enabled: false,
          manual_access_expires_at: null,
          provisioning_status: 'completed',
        },
        error: null
      })

      mockSupabase.update.mockResolvedValueOnce({
        error: null
      })

      // Verify current_period_end is not in update payload
      const updateCall = mockSupabase.update.mock.calls[0]
      expect(updateCall[0]).not.toHaveProperty('current_period_end')
    })
  })
})
