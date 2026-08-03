import { describe, it, expect, vi, beforeEach } from 'vitest'
import { validateTwilioNumberLifecycleMutation } from '../twilio-lifecycle-validator'

// Mock supabaseAdmin
vi.mock('../supabase/admin', () => ({
  supabaseAdmin: {
    from: vi.fn()
  }
}))

describe('validateTwilioNumberLifecycleMutation', () => {
  const { supabaseAdmin } = require('../supabase/admin')

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Safety Hard-Blocking Tests', () => {
    it('should block on ownership mismatch (business_id mismatch)', async () => {
      supabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'biz-1',
                is_protected_account: false,
                subscription_status: 'canceled',
                manual_access_granted_by: null,
                assigned_twilio_number_id: 'tn-1',
                twilio_phone_number: '+15551234567',
                twilio_phone_number_sid: 'PN123'
              },
              error: null
            })
          }
        }
        if (table === 'twilio_numbers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'tn-1',
                phone_number: '+15551234567',
                twilio_sid: 'PN123',
                business_id: 'biz-2', // Different business
                status: 'assigned'
              },
              error: null
            })
          }
        }
        return { select: vi.fn().mockReturnThis() }
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'recycle'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('ownership_mismatch')
    })

    it('should block on SID mismatch', async () => {
      supabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'biz-1',
                is_protected_account: false,
                subscription_status: 'canceled',
                manual_access_granted_by: null,
                assigned_twilio_number_id: 'tn-1',
                twilio_phone_number: '+15551234567',
                twilio_phone_number_sid: 'PN123'
              },
              error: null
            })
          }
        }
        if (table === 'twilio_numbers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'tn-1',
                phone_number: '+15551234567',
                twilio_sid: 'PN456', // Different SID
                business_id: 'biz-1',
                status: 'assigned'
              },
              error: null
            })
          }
        }
        return { select: vi.fn().mockReturnThis() }
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'recycle'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('ownership_mismatch')
    })

    it('should block on missing number record', async () => {
      supabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'biz-1',
                is_protected_account: false,
                subscription_status: 'canceled',
                manual_access_granted_by: null,
                assigned_twilio_number_id: 'tn-1',
                twilio_phone_number: '+15551234567',
                twilio_phone_number_sid: 'PN123'
              },
              error: null
            })
          }
        }
        if (table === 'twilio_numbers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: null, // Number not found
              error: null
            })
          }
        }
        return { select: vi.fn().mockReturnThis() }
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'recycle'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('invariant_violation')
      expect(result.error).toContain('not found')
    })

    it('should block on assigned_twilio_number_id mismatch', async () => {
      supabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'biz-1',
                is_protected_account: false,
                subscription_status: 'canceled',
                manual_access_granted_by: null,
                assigned_twilio_number_id: 'tn-2', // Different ID
                twilio_phone_number: '+15551234567',
                twilio_phone_number_sid: 'PN123'
              },
              error: null
            })
          }
        }
        if (table === 'twilio_numbers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'tn-1',
                phone_number: '+15551234567',
                twilio_sid: 'PN123',
                business_id: 'biz-1',
                status: 'assigned'
              },
              error: null
            })
          }
        }
        return { select: vi.fn().mockReturnThis() }
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'recycle'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('reference_mismatch')
    })
  })

  describe('Protected Account Guard', () => {
    it('should block recycling for protected account', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'biz-1',
            is_protected_account: true,
            protected_reason: 'Test protected account',
            subscription_status: 'canceled'
          },
          error: null
        })
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'recycle'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('protected_account')
      expect(result.details?.isProtectedAccount).toBe(true)
      expect(result.details?.protectedReason).toBe('Test protected account')
    })

    it('should block retiring for protected account', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'biz-1',
            is_protected_account: true,
            protected_reason: 'System account',
            subscription_status: 'active'
          },
          error: null
        })
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'retire'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('protected_account')
    })
  })

  describe('Subscription Guard', () => {
    it('should block retiring for active subscription', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'biz-1',
            is_protected_account: false,
            subscription_status: 'active',
            manual_access_granted_by: null
          },
          error: null
        })
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'retire'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('subscription_active')
      expect(result.details?.subscriptionStatus).toBe('active')
    })

    it('should block retiring for trialing subscription', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'biz-1',
            is_protected_account: false,
            subscription_status: 'trialing',
            manual_access_granted_by: null
          },
          error: null
        })
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'retire'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('subscription_active')
      expect(result.details?.subscriptionStatus).toBe('trialing')
    })

    it('should allow retiring for canceled subscription', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'biz-1',
            is_protected_account: false,
            subscription_status: 'canceled',
            manual_access_granted_by: null
          },
          error: null
        })
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'retire'
      })

      expect(result.valid).toBe(true)
    })
  })

  describe('Manual Access Guard', () => {
    it('should block retiring for business with manual access', async () => {
      supabaseAdmin.from.mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            id: 'biz-1',
            is_protected_account: false,
            subscription_status: 'canceled',
            manual_access_granted_by: 'admin-1',
            manual_access_granted_at: new Date().toISOString()
          },
          error: null
        })
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'retire'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('subscription_active')
      expect(result.details?.hasManualAccess).toBe(true)
    })
  })

  describe('Ownership Validation', () => {
    it('should block when business_id does not match', async () => {
      // Mock business fetch
      supabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'biz-1',
                is_protected_account: false,
                subscription_status: 'canceled',
                manual_access_granted_by: null,
                assigned_twilio_number_id: 'tn-1',
                twilio_phone_number: '+15551234567',
                twilio_phone_number_sid: 'PN123'
              },
              error: null
            })
          }
        }
        if (table === 'twilio_numbers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'tn-1',
                phone_number: '+15551234567',
                twilio_sid: 'PN123',
                business_id: 'biz-2', // Different business
                status: 'assigned'
              },
              error: null
            })
          }
        }
        return { select: vi.fn().mockReturnThis() }
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'recycle'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('ownership_mismatch')
      expect(result.details?.ownershipMismatch?.expectedBusinessId).toBe('biz-1')
      expect(result.details?.ownershipMismatch?.actualBusinessId).toBe('biz-2')
    })

    it('should block when SID does not match', async () => {
      // Mock business fetch
      supabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'biz-1',
                is_protected_account: false,
                subscription_status: 'canceled',
                manual_access_granted_by: null,
                assigned_twilio_number_id: 'tn-1',
                twilio_phone_number: '+15551234567',
                twilio_phone_number_sid: 'PN123'
              },
              error: null
            })
          }
        }
        if (table === 'twilio_numbers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'tn-1',
                phone_number: '+15551234567',
                twilio_sid: 'PN456', // Different SID
                business_id: 'biz-1',
                status: 'assigned'
              },
              error: null
            })
          }
        }
        return { select: vi.fn().mockReturnThis() }
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'recycle'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('ownership_mismatch')
      expect(result.details?.ownershipMismatch?.expectedSid).toBe('PN123')
      expect(result.details?.ownershipMismatch?.actualSid).toBe('PN456')
    })

    it('should block when assigned_twilio_number_id does not match', async () => {
      // Mock business fetch
      supabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'biz-1',
                is_protected_account: false,
                subscription_status: 'canceled',
                manual_access_granted_by: null,
                assigned_twilio_number_id: 'tn-2', // Different number ID
                twilio_phone_number: '+15551234567',
                twilio_phone_number_sid: 'PN123'
              },
              error: null
            })
          }
        }
        if (table === 'twilio_numbers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'tn-1',
                phone_number: '+15551234567',
                twilio_sid: 'PN123',
                business_id: 'biz-1',
                status: 'assigned'
              },
              error: null
            })
          }
        }
        return { select: vi.fn().mockReturnThis() }
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'recycle'
      })

      expect(result.valid).toBe(false)
      expect(result.errorType).toBe('reference_mismatch')
      expect(result.details?.referenceMismatch?.assignedNumberMismatch).toBe(true)
    })
  })

  describe('Happy Path', () => {
    it('should allow valid recycling operation', async () => {
      // Mock business fetch
      supabaseAdmin.from.mockImplementation((table: string) => {
        if (table === 'businesses') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                id: 'biz-1',
                is_protected_account: false,
                subscription_status: 'canceled',
                manual_access_granted_by: null,
                assigned_twilio_number_id: 'tn-1',
                twilio_phone_number: '+15551234567',
                twilio_phone_number_sid: 'PN123'
              },
              error: null
            })
          }
        }
        if (table === 'twilio_numbers') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: 'tn-1',
                phone_number: '+15551234567',
                twilio_sid: 'PN123',
                business_id: 'biz-1',
                status: 'assigned'
              },
              error: null
            })
          }
        }
        return { select: vi.fn().mockReturnThis() }
      })

      const result = await validateTwilioNumberLifecycleMutation({
        businessId: 'biz-1',
        phoneNumber: '+15551234567',
        phoneNumberSid: 'PN123',
        operation: 'recycle'
      })

      expect(result.valid).toBe(true)
    })
  })
})
