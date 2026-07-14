import { db } from '@/lib/supabase/admin'
import { normalizePhoneNumber } from '@/lib/twilio'

// Default out of office message
const DEFAULT_OUT_OF_OFFICE_MESSAGE = 'Thank you for calling {{business_name}}. We are currently out of the office and will return on {{return_date}}. We will get back to you as soon as possible.'

// Default after hours message
const DEFAULT_AFTER_HOURS_MESSAGE = 'Thank you for calling {{business_name}}. We are currently outside business hours and will get back to you during our next business day.'

// Types for filtering decisions
export interface FilteringResult {
  allowed: boolean
  reason: string
  details?: any
  messageOverride?: string
}

export interface FilteringContext {
  businessId: string
  callerPhone: string
  callSid?: string
  business?: any // Business record with filtering settings
}

// Transcript spam detection result
export interface TranscriptSpamResult {
  isSpam: boolean
  reason?: string
  matchedPhrases?: string[]
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

    // Get automation settings with defaults (matching migration defaults)
    const automationSettings = business.automation_settings || {
      spamRepeatFilteringEnabled: false,
      ignoreRepeatCalls: false,
      repeatCallWindowMinutes: 30,
      ignoreBlockedPrivateNumbers: false,
      ignoreSuspectedSpamCallers: false,
      blockedNumbers: []
    }

    // Check if smart filtering is enabled
    if (!automationSettings.spamRepeatFilteringEnabled) {
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
      () => checkOutOfOffice(business),
      () => checkBusinessHours(business),
      () => checkRepeatCallProtection(context.businessId, normalizedPhone, automationSettings.repeatCallWindowMinutes || 15, business, automationSettings.ignoreRepeatCalls),
      () => checkBlockedPrivateCallers(normalizedPhone, automationSettings.ignoreBlockedPrivateNumbers),
      () => checkSuspectedSpamCallers(normalizedPhone, automationSettings.ignoreSuspectedSpamCallers),
    ]

    for (const check of checks) {
      const result = await check()
      if (!result.allowed) {
        console.log('[SPAM FILTER]', {
          reason: result.reason,
          caller: context.callerPhone,
          action: 'ignored',
          details: result.details
        })
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
 * Check if out of office mode is active
 */
function checkOutOfOffice(business: any): FilteringResult {
  if (!business.out_of_office_enabled) {
    console.log('[Smart Filtering] Out of office disabled')
    return { allowed: true, reason: 'out_of_office_disabled' }
  }

  const now = new Date()
  const start = business.out_of_office_start ? new Date(business.out_of_office_start) : null
  const end = business.out_of_office_end ? new Date(business.out_of_office_end) : null

  if (!start || !end) {
    console.log('[Smart Filtering] Out of office enabled but missing start/end dates')
    return { allowed: true, reason: 'out_of_office_missing_dates' }
  }

  // Check if current time is within the out of office window
  if (now >= start && now <= end) {
    const message = business.out_of_office_message || DEFAULT_OUT_OF_OFFICE_MESSAGE
    console.log('[Smart Filtering] Out of office active, using custom message')
    return { 
      allowed: true, 
      reason: 'out_of_office_active', 
      messageOverride: message,
      details: { start, end, message }
    }
  }

  // Check if out of office hasn't started yet
  if (now < start) {
    console.log('[Smart Filtering] Out of office scheduled but not started yet')
    return { allowed: true, reason: 'out_of_office_not_started' }
  }

  // Out of office has expired
  console.log('[Smart Filtering] Out of office expired, normal behavior')
  return { allowed: true, reason: 'out_of_office_expired' }
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
      // Outside business hours - return after-hours message
      const message = business.after_hours_message || DEFAULT_AFTER_HOURS_MESSAGE
      return { 
        allowed: true, 
        reason: 'after_hours', 
        messageOverride: message,
        details: { currentTime, startTime, endTime, timeZone, message } 
      }
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
async function checkRepeatCallProtection(businessId: string, phoneNumber: string, cooldownMinutes: number, business: any, ignoreRepeatCalls: boolean): Promise<FilteringResult> {
  if (!ignoreRepeatCalls) {
    console.log('[Smart Filtering] Repeat call protection disabled')
    return { allowed: true, reason: 'repeat_call_protection_disabled' }
  }

  console.log('[Smart Filtering] Checking repeat call protection for:', phoneNumber, 'cooldown:', cooldownMinutes, 'minutes')

  try {
    // Check if this caller received an auto-text within the cooldown period
    const cooldownStart = new Date(Date.now() - (cooldownMinutes * 60 * 1000))
    
    const recentDecision = await db.getRecentFilteringDecision(businessId, phoneNumber, cooldownStart)
    if (recentDecision && recentDecision.decision === 'allowed') {
      return { 
        allowed: false, 
        reason: 'blocked_repeat_caller', 
        details: { 
          cooldownMinutes,
          lastTextAt: recentDecision.created_at,
          lastDecisionId: recentDecision.id
        } 
      }
    }
  } catch (error) {
    console.error('[Smart Filtering] Error checking repeat calls:', error)
    // Continue with other checks if repeat call check fails
  }

  return { allowed: true, reason: 'no_recent_text', details: { cooldownMinutes } }
}

/**
 * Check if caller is a blocked or private number
 */
function checkBlockedPrivateCallers(phoneNumber: string, enabled: boolean): FilteringResult {
  if (!enabled) {
    console.log('[Smart Filtering] Blocked/private caller filtering disabled')
    return { allowed: true, reason: 'blocked_private_disabled' }
  }

  console.log('[Smart Filtering] Checking for blocked/private number:', phoneNumber)

  // Check for anonymous/private numbers
  if (SPAM_PATTERNS.ANONYMOUS.test(phoneNumber)) {
    return { allowed: false, reason: 'blocked_private_number', details: { pattern: 'anonymous' } }
  }

  return { allowed: true, reason: 'not_blocked_private' }
}

/**
 * Check if caller is a suspected spam number
 */
function checkSuspectedSpamCallers(phoneNumber: string, enabled: boolean): FilteringResult {
  if (!enabled) {
    console.log('[Smart Filtering] Suspected spam filtering disabled')
    return { allowed: true, reason: 'suspected_spam_disabled' }
  }

  console.log('[Smart Filtering] Checking for suspected spam patterns:', phoneNumber)

  // Check for obvious spam patterns (toll-free, repeated digits, invalid length)
  if (SPAM_PATTERNS.INVALID_LENGTH.test(phoneNumber)) {
    return { allowed: false, reason: 'blocked_suspected_spam', details: { pattern: 'invalid_length' } }
  }

  if (SPAM_PATTERNS.REPEATED_DIGITS.test(phoneNumber)) {
    return { allowed: false, reason: 'blocked_suspected_spam', details: { pattern: 'repeated_digits' } }
  }

  if (SPAM_PATTERNS.OBVIOUS_SPAM.test(phoneNumber)) {
    return { allowed: false, reason: 'blocked_suspected_spam', details: { pattern: 'premium_toll_free' } }
  }

  return { allowed: true, reason: 'not_suspected_spam' }
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

/**
 * Detect automated robocall transcripts using deterministic phrase rules
 * Uses conservative matching to avoid false positives
 */
export function isAutomatedTranscriptSpam(transcript: string): TranscriptSpamResult {
  if (!transcript || typeof transcript !== 'string') {
    return { isSpam: false }
  }

  const lowerTranscript = transcript.toLowerCase()
  const matchedPhrases: string[] = []

  // Very strong automated call indicators (single phrase is enough)
  const veryStrongPhrases = [
    'this is an automated',
    'this is a prerecorded',
    'this is a pre-recorded',
    'pre-recorded message',
    'prerecorded message',
    'do not hang up'
  ]

  // Strong robocall phrases
  const strongPhrases = [
    'press 1',
    'press one',
    'press 2',
    'press two',
    'press 3',
    'press three',
    'to opt out',
    'opt out',
    'stay on the line',
    'to speak with a representative',
  ]

  // Google/business listing phrases
  const googleListingPhrases = [
    'your google business profile',
    'google voice searches',
    'your business not displayed',
    'business not displayed on google',
    'your listing',
    'verify your listing',
    'claim your listing'
  ]

  // Check for very strong phrases (single match is enough)
  for (const phrase of veryStrongPhrases) {
    if (lowerTranscript.includes(phrase)) {
      matchedPhrases.push(phrase)
      return {
        isSpam: true,
        reason: 'automated_prompt_very_strong',
        matchedPhrases
      }
    }
  }

  // Check for strong phrases
  for (const phrase of strongPhrases) {
    if (lowerTranscript.includes(phrase)) {
      matchedPhrases.push(phrase)
    }
  }

  // Check for Google listing phrases
  for (const phrase of googleListingPhrases) {
    if (lowerTranscript.includes(phrase)) {
      matchedPhrases.push(phrase)
    }
  }

  // Check for "representative" alone (not enough by itself)
  if (lowerTranscript.includes('representative')) {
    matchedPhrases.push('representative')
  }

  // Determine if spam based on matched phrases
  if (matchedPhrases.length === 0) {
    return { isSpam: false }
  }

  // Rule A: Very strong phrase already handled above

  // Rule B: At least two robocall indicators
  if (matchedPhrases.length >= 2) {
    return {
      isSpam: true,
      reason: 'automated_prompt_multiple_indicators',
      matchedPhrases
    }
  }

  // Rule C: Google listing phrase + opt-out/press phrase
  const hasGooglePhrase = googleListingPhrases.some(phrase => lowerTranscript.includes(phrase))
  const hasOptOutOrPress = strongPhrases.some(phrase => lowerTranscript.includes(phrase))

  if (hasGooglePhrase && hasOptOutOrPress) {
    return {
      isSpam: true,
      reason: 'automated_prompt_google_listing',
      matchedPhrases
    }
  }

  // Single "representative" alone is not enough
  if (matchedPhrases.length === 1 && matchedPhrases[0] === 'representative') {
    return { isSpam: false }
  }

  // Single strong phrase is not enough (unless it's very strong, handled above)
  return { isSpam: false }
}
