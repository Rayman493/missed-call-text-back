import { supabaseAdmin } from './supabase/admin'

/**
 * Validation result for Twilio number lifecycle mutations
 */
export interface LifecycleValidationResult {
  valid: boolean
  error?: string
  errorType?: 'protected_account' | 'subscription_active' | 'ownership_mismatch' | 'reference_mismatch' | 'invariant_violation'
  details?: {
    isProtectedAccount?: boolean
    protectedReason?: string | null
    subscriptionStatus?: string | null
    hasManualAccess?: boolean
    ownershipMismatch?: {
      expectedBusinessId?: string
      actualBusinessId?: string | null
      expectedSid?: string
      actualSid?: string | null
    }
    referenceMismatch?: {
      assignedNumberMismatch?: boolean
      phoneNumberMismatch?: boolean
      sidMismatch?: boolean
    }
  }
}

/**
 * Validation context for lifecycle mutations
 */
export interface LifecycleValidationContext {
  businessId: string
  phoneNumber?: string
  phoneNumberSid?: string
  twilioNumberId?: string
  operation: 'recycle' | 'retire' | 'detach' | 'reclaim'
  requireActiveSubscription?: boolean
}

/**
 * Validate Twilio number lifecycle mutation
 * 
 * Checks:
 * - Protected account status
 * - Subscription eligibility
 * - Business/number ownership agreement
 * - Number references across tables
 * - Expected status and SID/phone
 */
export async function validateTwilioNumberLifecycleMutation(
  context: LifecycleValidationContext
): Promise<LifecycleValidationResult> {
  const { businessId, phoneNumber, phoneNumberSid, twilioNumberId, operation, requireActiveSubscription = false } = context

  console.log('[LIFECYCLE VALIDATOR] Validating mutation:', { businessId, phoneNumber, operation })

  // Fetch business details
  const { data: business, error: businessError } = await supabaseAdmin
    .from('businesses')
    .select('id, name, is_protected_account, protected_reason, subscription_status, manual_access_granted_by, manual_access_granted_at, assigned_twilio_number_id, twilio_phone_number, twilio_phone_number_sid')
    .eq('id', businessId)
    .single()

  if (businessError || !business) {
    return {
      valid: false,
      error: 'Business not found',
      errorType: 'invariant_violation'
    }
  }

  // Check 1: Protected account guard
  if (business.is_protected_account) {
    console.error('[LIFECYCLE VALIDATOR] Protected account block:', {
      businessId,
      protectedReason: business.protected_reason,
      operation
    })
    return {
      valid: false,
      error: `Protected account cannot ${operation}. Reason: ${business.protected_reason || 'No reason specified'}`,
      errorType: 'protected_account',
      details: {
        isProtectedAccount: true,
        protectedReason: business.protected_reason
      }
    }
  }

  // Check 2: Subscription eligibility guard
  // For retirement/detachment, block if subscription is active or trialing
  if (operation === 'retire' || operation === 'detach') {
    if (business.subscription_status === 'active' || business.subscription_status === 'trialing') {
      console.error('[LIFECYCLE VALIDATOR] Active subscription block:', {
        businessId,
        subscriptionStatus: business.subscription_status,
        operation
      })
      return {
        valid: false,
        error: `Cannot ${operation} number from business with ${business.subscription_status} subscription`,
        errorType: 'subscription_active',
        details: {
          subscriptionStatus: business.subscription_status
        }
      }
    }
  }

  // Check 3: Manual access guard
  const hasManualAccess = !!(business.manual_access_granted_by && business.manual_access_granted_at)
  if (operation === 'retire' || operation === 'detach') {
    if (hasManualAccess) {
      console.error('[LIFECYCLE VALIDATOR] Manual access block:', {
        businessId,
        manualAccess: business.manual_access_granted_by,
        operation
      })
      return {
        valid: false,
        error: `Cannot ${operation} number from business with active manual access`,
        errorType: 'subscription_active',
        details: {
          hasManualAccess: true
        }
      }
    }
  }

  // Check 4: Ownership and reference validation (if phone number provided)
  if (phoneNumber && phoneNumberSid) {
    // Fetch twilio_number record
    const { data: twilioNumber, error: twilioError } = await supabaseAdmin
      .from('twilio_numbers')
      .select('id, phone_number, twilio_sid, business_id, status')
      .eq('twilio_sid', phoneNumberSid)
      .maybeSingle()

    if (twilioError) {
      return {
        valid: false,
        error: 'Failed to fetch Twilio number record',
        errorType: 'invariant_violation'
      }
    }

    if (!twilioNumber) {
      return {
        valid: false,
        error: 'Twilio number record not found',
        errorType: 'invariant_violation'
      }
    }

    // Check ownership agreement
    if (twilioNumber.business_id !== businessId) {
      console.error('[LIFECYCLE VALIDATOR] Ownership mismatch:', {
        businessId,
        expectedBusinessId: businessId,
        actualBusinessId: twilioNumber.business_id
      })
      return {
        valid: false,
        error: 'Twilio number business_id does not match target business',
        errorType: 'ownership_mismatch',
        details: {
          ownershipMismatch: {
            expectedBusinessId: businessId,
            actualBusinessId: twilioNumber.business_id
          }
        }
      }
    }

    // Check SID agreement
    if (twilioNumber.twilio_sid !== phoneNumberSid) {
      console.error('[LIFECYCLE VALIDATOR] SID mismatch:', {
        expectedSid: phoneNumberSid,
        actualSid: twilioNumber.twilio_sid
      })
      return {
        valid: false,
        error: 'Twilio number SID does not match expected SID',
        errorType: 'ownership_mismatch',
        details: {
          ownershipMismatch: {
            expectedSid: phoneNumberSid,
            actualSid: twilioNumber.twilio_sid
          }
        }
      }
    }

    // Check business references
    const referenceMismatches: any = {}

    if (business.assigned_twilio_number_id && business.assigned_twilio_number_id !== twilioNumber.id) {
      referenceMismatches.assignedNumberMismatch = true
    }

    if (business.twilio_phone_number && business.twilio_phone_number !== phoneNumber) {
      referenceMismatches.phoneNumberMismatch = true
    }

    if (business.twilio_phone_number_sid && business.twilio_phone_number_sid !== phoneNumberSid) {
      referenceMismatches.sidMismatch = true
    }

    if (Object.keys(referenceMismatches).length > 0) {
      console.error('[LIFECYCLE VALIDATOR] Reference mismatch:', {
        businessId,
        referenceMismatches
      })
      return {
        valid: false,
        error: 'Business references do not match Twilio number record',
        errorType: 'reference_mismatch',
        details: {
          referenceMismatch: referenceMismatches
        }
      }
    }
  }

  console.log('[LIFECYCLE VALIDATOR] Validation passed')
  return { valid: true }
}

/**
 * Mask phone number for logging
 */
export function maskPhoneNumber(phoneNumber: string): string {
  if (!phoneNumber || phoneNumber.length < 4) return phoneNumber
  return phoneNumber.slice(0, 2) + '***' + phoneNumber.slice(-2)
}
