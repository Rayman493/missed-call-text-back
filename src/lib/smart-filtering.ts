import { db } from '@/lib/supabase/admin'
import { normalizePhoneNumber } from '@/lib/twilio'

// Types for filtering decisions
export interface FilteringResult {
  allowed: boolean
  reason: string
  details?: any
}

export interface FilteringContext {
  businessId: string
  callerPhone: string
  callSid?: string
  business?: any // Business record with filtering settings
}

// Spam detection patterns
const SPAM_PATTERNS = {
  INVALID_LENGTH: /^(\d{1,4}|\d{12,})$/, // Too short or too long numbers
  REPEATED_DIGITS: /^(\d)\1+$/, // 111111111, 222222222, etc.
  OBVIOUS_SPAM: /^(900|800|888|877|866|855|844|833)/, // Premium/US toll-free
  ANONYMOUS: /^(anonymous|private|blocked|restricted)$/i,
  MALFORMED: /[^\d+\-\s\(\)]/, // Contains non-phone characters
}

// TODO: Future advanced filtering features
// - Twilio Lookup API spam scoring
// - Third-party spam detection services (Truecaller, Hiya, etc.)
// - AI-powered spam detection using ML models
// - Area code filtering and geographic restrictions
// - Repeat caller behavior scoring and pattern analysis
// - Contact syncing with CRM systems (Salesforce, HubSpot, etc.)
// - Voicemail transcription and intent classification
// - Time-based caller frequency analysis
// - Custom business rule engine for complex filtering logic

/**
 * Main filtering pipeline - determines if a call should trigger auto-text
 */
export async function shouldSendAutoText(context: FilteringContext): Promise<FilteringResult> {
  try {
    console.log('[Smart Filtering] Starting filtering pipeline for:', {
      businessId: context.businessId,
      callerPhone: context.callerPhone,
      callSid: context.callSid
    })

    // Get business with filtering settings
    const business = context.business || await db.getBusiness(context.businessId)
    if (!business) {
      console.log('[Smart Filtering] Business not found, allowing by default')
      return { allowed: true, reason: 'business_not_found' }
    }

    // Check if smart filtering is enabled
    if (!business.smart_filtering_enabled) {
      console.log('[Smart Filtering] Smart filtering disabled, allowing')
      return { allowed: true, reason: 'filtering_disabled' }
    }

    // Normalize phone number for consistent comparison
    const normalizedPhone = normalizePhoneNumber(context.callerPhone)

    // Run filtering checks in order
    const checks = [
      () => checkSpamNumber(normalizedPhone),
      () => checkBlacklist(context.businessId, normalizedPhone),
      () => checkPersonalContacts(context.businessId, normalizedPhone),
      () => checkBusinessHours(business),
      () => checkRepeatCallProtection(context.businessId, normalizedPhone, business.repeat_call_cooldown_hours || 24, business),
      () => checkUnknownCallersOnly(context.businessId, normalizedPhone, business.only_text_unknown_callers),
    ]

    for (const check of checks) {
      const result = await check()
      if (!result.allowed) {
        await logFilteringDecision(context.businessId, context.callerPhone, context.callSid, 'blocked', result.reason, result.details)
        console.log('[Smart Filtering] Blocked:', result.reason, result.details)
        return result
      }
    }

    // All checks passed
    await logFilteringDecision(context.businessId, context.callerPhone, context.callSid, 'allowed', 'all_checks_passed')
    console.log('[Smart Filtering] Allowed: All checks passed')
    return { allowed: true, reason: 'all_checks_passed' }

  } catch (error) {
    console.error('[Smart Filtering] Error in filtering pipeline:', error)
    // Fail safely - allow the message if filtering logic fails
    return { allowed: true, reason: 'filtering_error', details: { error: error instanceof Error ? error.message : String(error) } }
  }
}

/**
 * Check for obvious spam/invalid numbers
 */
function checkSpamNumber(phoneNumber: string): FilteringResult {
  console.log('[Smart Filtering] Checking spam patterns for:', phoneNumber)

  // Check for invalid length
  if (SPAM_PATTERNS.INVALID_LENGTH.test(phoneNumber)) {
    return { allowed: false, reason: 'blocked_invalid_number', details: { pattern: 'invalid_length' } }
  }

  // Check for repeated digits (common spam pattern)
  if (SPAM_PATTERNS.REPEATED_DIGITS.test(phoneNumber)) {
    return { allowed: false, reason: 'blocked_invalid_number', details: { pattern: 'repeated_digits' } }
  }

  // Check for premium/toll-free numbers (often spam)
  if (SPAM_PATTERNS.OBVIOUS_SPAM.test(phoneNumber)) {
    return { allowed: false, reason: 'blocked_spam_pattern', details: { pattern: 'premium_toll_free' } }
  }

  // Check for anonymous/private numbers
  if (SPAM_PATTERNS.ANONYMOUS.test(phoneNumber)) {
    return { allowed: false, reason: 'blocked_anonymous_number', details: { pattern: 'anonymous' } }
  }

  // Check for malformed numbers
  if (SPAM_PATTERNS.MALFORMED.test(phoneNumber)) {
    return { allowed: false, reason: 'blocked_invalid_number', details: { pattern: 'malformed' } }
  }

  return { allowed: true, reason: 'passed_spam_check' }
}

/**
 * Check if number is in blacklist
 */
async function checkBlacklist(businessId: string, phoneNumber: string): Promise<FilteringResult> {
  console.log('[Smart Filtering] Checking blacklist for:', phoneNumber)

  try {
    const blockedNumber = await db.getBlockedNumber(businessId, phoneNumber)
    if (blockedNumber) {
      return { 
        allowed: false, 
        reason: 'blocked_blacklist', 
        details: { 
          blockedId: blockedNumber.id,
          notes: blockedNumber.notes,
          blockedAt: blockedNumber.created_at
        } 
      }
    }
  } catch (error) {
    console.error('[Smart Filtering] Error checking blacklist:', error)
    // Continue with other checks if blacklist lookup fails
  }

  return { allowed: true, reason: 'not_in_blacklist' }
}

/**
 * Check if number is in personal contacts
 */
async function checkPersonalContacts(businessId: string, phoneNumber: string): Promise<FilteringResult> {
  console.log('[Smart Filtering] Checking personal contacts for:', phoneNumber)

  try {
    const personalContact = await db.getPersonalContactNumber(businessId, phoneNumber)
    if (personalContact) {
      return { 
        allowed: false, 
        reason: 'blocked_personal_contact', 
        details: { 
          contactId: personalContact.id,
          name: personalContact.name,
          notes: personalContact.notes
        } 
      }
    }
  } catch (error) {
    console.error('[Smart Filtering] Error checking personal contacts:', error)
    // Continue with other checks if personal contacts lookup fails
  }

  return { allowed: true, reason: 'not_in_personal_contacts' }
}

/**
 * Check if call is within business hours
 */
function checkBusinessHours(business: any): FilteringResult {
  if (!business.business_hours_enabled) {
    console.log('[Smart Filtering] Business hours filtering disabled')
    return { allowed: true, reason: 'business_hours_disabled' }
  }

  console.log('[Smart Filtering] Checking business hours')

  try {
    const now = new Date()
    
    // Get current time in business's timezone
    const timeZone = business.business_hours_timezone || 'America/New_York'
    const businessTime = new Date(now.toLocaleString("en-US", { timeZone }))
    
    const currentTime = businessTime.toTimeString().slice(0, 5) // HH:MM format
    const startTime = business.business_hours_start?.slice(0, 5) || '09:00'
    const endTime = business.business_hours_end?.slice(0, 5) || '17:00'
    
    console.log('[Smart Filtering] Time check:', {
      currentTime,
      startTime,
      endTime,
      timeZone,
      dayOfWeek: businessTime.getDay()
    })

    // Check if current time is within business hours
    if (currentTime >= startTime && currentTime <= endTime) {
      return { allowed: true, reason: 'within_business_hours', details: { currentTime, startTime, endTime, timeZone } }
    } else {
      return { allowed: false, reason: 'blocked_after_hours', details: { currentTime, startTime, endTime, timeZone } }
    }
  } catch (error) {
    console.error('[Smart Filtering] Error checking business hours:', error)
    // Fail safely - allow if time check fails
    return { allowed: true, reason: 'business_hours_error', details: { error: error instanceof Error ? error.message : String(error) } }
  }
}

/**
 * Check for repeat call protection
 */
async function checkRepeatCallProtection(businessId: string, phoneNumber: string, cooldownHours: number, business: any): Promise<FilteringResult> {
  if (!business.repeat_call_protection_enabled) {
    console.log('[Smart Filtering] Repeat call protection disabled')
    return { allowed: true, reason: 'repeat_call_protection_disabled' }
  }

  console.log('[Smart Filtering] Checking repeat call protection for:', phoneNumber, 'cooldown:', cooldownHours, 'hours')

  try {
    // Check if this caller received an auto-text within the cooldown period
    const cooldownStart = new Date(Date.now() - (cooldownHours * 60 * 60 * 1000))
    
    const recentDecision = await db.getRecentFilteringDecision(businessId, phoneNumber, cooldownStart)
    if (recentDecision && recentDecision.decision === 'allowed') {
      return { 
        allowed: false, 
        reason: 'blocked_repeat_caller', 
        details: { 
          cooldownHours,
          lastTextAt: recentDecision.created_at,
          lastDecisionId: recentDecision.id
        } 
      }
    }
  } catch (error) {
    console.error('[Smart Filtering] Error checking repeat calls:', error)
    // Continue with other checks if repeat call check fails
  }

  return { allowed: true, reason: 'no_recent_text', details: { cooldownHours } }
}

/**
 * Check if caller is unknown (not in approved contacts)
 */
async function checkUnknownCallersOnly(businessId: string, phoneNumber: string, enabled: boolean): Promise<FilteringResult> {
  if (!enabled) {
    console.log('[Smart Filtering] Unknown callers only filtering disabled')
    return { allowed: true, reason: 'unknown_callers_disabled' }
  }

  console.log('[Smart Filtering] Checking if caller is unknown for:', phoneNumber)

  try {
    // Check if number is in approved contacts (whitelist)
    const allowedNumber = await db.getAllowedNumber(businessId, phoneNumber)
    if (allowedNumber) {
      return { 
        allowed: false, 
        reason: 'blocked_known_contact', 
        details: { 
          allowedId: allowedNumber.id,
          notes: allowedNumber.notes
        } 
      }
    }

    // Also check if they're an existing lead (known customer)
    const existingLead = await db.getLeadByPhone(businessId, phoneNumber)
    if (existingLead) {
      return { 
        allowed: false, 
        reason: 'blocked_existing_lead', 
        details: { 
          leadId: existingLead.id,
          status: existingLead.status,
          firstContactAt: existingLead.first_contact_at
        } 
      }
    }
  } catch (error) {
    console.error('[Smart Filtering] Error checking unknown callers:', error)
    // Continue with other checks if unknown caller check fails
  }

  return { allowed: true, reason: 'unknown_caller_allowed' }
}

/**
 * Log filtering decisions for debugging and analytics
 */
async function logFilteringDecision(
  businessId: string, 
  callerPhone: string, 
  callSid: string | undefined, 
  decision: string, 
  reason: string, 
  details?: any
): Promise<void> {
  try {
    await db.createFilteringDecisionLog({
      business_id: businessId,
      phone: callerPhone,
      call_sid: callSid,
      decision,
      reason,
      filter_details: details || {}
    })
    
    console.log('[Smart Filtering] Decision logged:', {
      businessId,
      callerPhone,
      decision,
      reason,
      details
    })
  } catch (error) {
    console.error('[Smart Filtering] Error logging decision:', error)
    // Don't throw - logging failure shouldn't break the flow
  }
}
