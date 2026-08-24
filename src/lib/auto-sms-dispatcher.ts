import { sendSms } from '@/lib/twilio'
import { supabaseAdmin, db } from '@/lib/supabase/admin'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'
import { isCompleteAIIntake } from '@/lib/ai-intake-completion'
import { generateSummaryFromExtractedInfo } from '@/lib/sms-processing'
import { normalizePhoneNumber } from '@/lib/twilio'

export type AutoSmsTrigger = 'call_finished' | 'ai_confirmation' | 'voicemail_completed' | 'recording_fallback'
export type AutoSmsOutcome = 'SUMMARY'
export type AutoSmsTemplate = 'ai_summary'

interface DispatchParams {
  trigger: AutoSmsTrigger
  callSid: string
  businessId: string
  leadId: string
  conversationId?: string
  callerPhone: string
  businessName?: string
  extractedInfo?: any
  aiOutcome?: string | null
  voicemailCompleted?: boolean
  aiCallRecord?: AiCallRecord
}

interface AiCallRecord {
  id: string
  call_sid: string
  business_id: string
  lead_id: string
  outcome: string
  extracted_info?: any
  summary?: string
  transcript?: string
  fields_collected_count?: number
  had_user_speech?: boolean
}

interface DispatchResult {
  success: boolean
  skipped?: boolean
  reason: string
  outcome?: AutoSmsOutcome
  template?: AutoSmsTemplate
  twilioMessageSid?: string | null
  messageId?: string | null
}

/**
 * Atomically claim the AI summary SMS for this call before sending to Twilio
 * This uses a dedicated claims table to prevent ghost messages in Customer Conversation UI
 * @returns { claimed: boolean, claimId: string | null, claimToken: string | null, reason: string }
 */
async function claimAiSummarySms(
  businessId: string,
  leadId: string,
  conversationId: string,
  callSid: string
): Promise<{ claimed: boolean; claimId: string | null; claimToken: string | null; reason: string }> {
  console.log('[AI SMS CLAIM] Attempting to claim AI summary SMS for call:', callSid);

  // Generate a unique claim token for ownership tracking
  const claimToken = `claim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const claimPayload = {
    business_id: businessId,
    call_sid: callSid,
    claim_token: claimToken,
    status: 'claimed',
    lead_id: leadId,
    conversation_id: conversationId,
    claimed_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const { data: claimedClaim, error: claimError } = await supabaseAdmin
    .from('ai_summary_sms_claims')
    .insert(claimPayload)
    .select('id')
    .single();

  if (claimError) {
    // Check if this is a unique constraint violation (duplicate claim)
    if (claimError.code === '23505') {
      console.log('[AI SMS CLAIM] Duplicate claim detected - another handler already claimed this call', {
        callSid,
        businessId,
        errorCode: claimError.code,
        errorMessage: claimError.message
      });
      return { claimed: false, claimId: null, claimToken: null, reason: 'duplicate_claim' };
    }

    // Other error - log but allow retry
    console.error('[AI SMS CLAIM] Failed to claim AI summary SMS', {
      callSid,
      businessId,
      errorCode: claimError.code,
      errorMessage: claimError.message
    });
    return { claimed: false, claimId: null, claimToken: null, reason: 'claim_failed' };
  }

  console.log('[AI SMS CLAIM] Successfully claimed AI summary SMS', {
    claimId: claimedClaim.id,
    callSid,
    businessId,
    claimToken
  });

  return { claimed: true, claimId: claimedClaim.id, claimToken: claimToken, reason: 'claimed' };
}

/**
 * Mark the claim as sent after successful Twilio send
 * Includes ownership guard to prevent stale workers from overwriting newer owners
 */
async function markClaimSent(
  claimId: string,
  twilioMessageSid: string,
  claimToken: string
): Promise<void> {
  console.log('[AI SMS CLAIM] Marking claim as sent with Twilio result', {
    claimId,
    twilioMessageSid,
    claimToken
  });

  const updateQuery = supabaseAdmin
    .from('ai_summary_sms_claims')
    .update({
      status: 'sent',
      twilio_message_sid: twilioMessageSid,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claimId)
    .eq('claim_token', claimToken);

  const { error: updateError } = await updateQuery;

  if (updateError) {
    console.error('[AI SMS CLAIM] Failed to mark claim as sent', {
      claimId,
      twilioMessageSid,
      errorCode: updateError.code,
      errorMessage: updateError.message,
      ownershipGuard: true
    });
    // Non-fatal - message was sent to Twilio, just claim status update failed
  }
}

/**
 * Mark the claim as failed (ambiguous or definitive)
 * Includes ownership guard to prevent stale workers from overwriting newer owners
 */
async function markClaimFailed(
  claimId: string,
  status: 'failed_ambiguous' | 'failed_definitive',
  claimToken: string
): Promise<void> {
  console.log('[AI SMS CLAIM] Marking claim as failed', {
    claimId,
    status,
    claimToken
  });

  const updateQuery = supabaseAdmin
    .from('ai_summary_sms_claims')
    .update({
      status: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', claimId)
    .eq('claim_token', claimToken);

  const { error: updateError } = await updateQuery;

  if (updateError) {
    console.error('[AI SMS CLAIM] Failed to mark claim as failed', {
      claimId,
      status,
      errorCode: updateError.code,
      errorMessage: updateError.message,
      ownershipGuard: true
    });
  }
}

/**
 * Attempt to reclaim a stale pending claim using compare-and-set semantics
 * This allows recovery from crashed processes without permitting concurrent winners
 * @returns { reclaimed: boolean, claimId: string | null, claimToken: string | null }
 */
async function reclaimStaleClaim(
  businessId: string,
  callSid: string,
  staleThresholdMinutes: number = 5
): Promise<{ reclaimed: boolean; claimId: string | null; claimToken: string | null }> {
  console.log('[AI SMS CLAIM] Attempting to reclaim stale claim for call:', callSid);

  const staleThreshold = new Date(Date.now() - staleThresholdMinutes * 60 * 1000).toISOString();
  const newClaimToken = `reclaim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // First, check for a stale pending claim
  const { data: staleClaim } = await supabaseAdmin
    .from('ai_summary_sms_claims')
    .select('id, claim_token, status, claimed_at')
    .eq('business_id', businessId)
    .eq('call_sid', callSid)
    .eq('status', 'claimed')
    .lt('claimed_at', staleThreshold)
    .maybeSingle();

  if (!staleClaim) {
    console.log('[AI SMS CLAIM] No stale claim found for reclamation', { callSid });
    return { reclaimed: false, claimId: null, claimToken: null };
  }

  const oldClaimToken = staleClaim.claim_token;

  console.log('[AI SMS CLAIM] Found stale claim, attempting compare-and-set reclamation', {
    claimId: staleClaim.id,
    callSid,
    claimed_at: staleClaim.claimed_at,
    oldClaimToken
  });

  // Attempt atomic compare-and-set: UPDATE only if status is still 'claimed' AND claim_token matches
  const { data: updatedClaim, error: updateError } = await supabaseAdmin
    .from('ai_summary_sms_claims')
    .update({
      claim_token: newClaimToken,
      claimed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', staleClaim.id)
    .eq('status', 'claimed')
    .eq('claim_token', oldClaimToken)
    .select('id')
    .single();

  if (updateError) {
    console.error('[AI SMS CLAIM] Failed to reclaim stale claim (likely concurrent reclamation)', {
      claimId: staleClaim.id,
      errorCode: updateError.code,
      errorMessage: updateError.message
    });
    return { reclaimed: false, claimId: null, claimToken: null };
  }

  if (!updatedClaim) {
    console.log('[AI SMS CLAIM] Compare-and-set failed - another process already reclaimed', {
      claimId: staleClaim.id,
      oldClaimToken,
      newClaimToken
    });
    return { reclaimed: false, claimId: null, claimToken: null };
  }

  console.log('[AI SMS CLAIM] Successfully reclaimed stale claim with new token', {
    claimId: updatedClaim.id,
    callSid,
    newClaimToken
  });

  return { reclaimed: true, claimId: updatedClaim.id, claimToken: newClaimToken };
}

async function getConversationId(leadId: string, businessId: string, conversationId?: string): Promise<string | undefined> {
  if (conversationId) return conversationId

  let conversation = await db.getOpenConversationForLead(leadId, businessId)
  if (!conversation) {
    conversation = await db.createConversation({
      lead_id: leadId,
      business_id: businessId,
      status: 'open',
      source: 'missed_call',
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
  }

  return conversation?.id
}

async function getAiCallRecord(callSid: string, leadId: string): Promise<AiCallRecord | null> {
  const { data } = await supabaseAdmin
    .from('ai_call_records')
    .select('id, call_sid, outcome, extracted_info, summary, transcript, fields_collected_count, had_user_speech')
    .eq('lead_id', leadId)
    .eq('call_sid', callSid)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data as AiCallRecord | null
}

// Merge extracted info from multiple sources with priority
// Priority: params.extractedInfo > aiCallRecord.extracted_info
// CRITICAL: Do NOT merge lead.raw_metadata - it contains historical intake data
// that should not be used to determine current-call completion or populate current SMS
function mergeExtractedInfo(params: any, aiCallRecord: any): any {
  const paramsExtracted = params.extractedInfo || {};
  const aiCallRecordExtracted = aiCallRecord?.extracted_info || {};

  // Start with params (highest priority)
  const merged = { ...paramsExtracted };

  // Merge from ai_call_record only (current call data)
  Object.keys(aiCallRecordExtracted).forEach(key => {
    if (!merged[key] || merged[key] === 'Not collected') {
      merged[key] = aiCallRecordExtracted[key];
    }
  });

  // Do NOT merge from lead.raw_metadata - historical data must not contaminate current call

  return merged;
}

async function hasAutomaticSmsForCall(conversationId: string | undefined, businessId: string, callSid: string): Promise<boolean> {
  // CRITICAL: This is now call-scoped to ensure exactly one automatic SMS per call
  // Previous calls should NOT suppress future calls' automatic SMS
  // Deduplication strategy: call_sid (in structured_data) for call-specific messages
  console.log('[AUTO SMS IDEMPOTENCY CHECK] =========================================');
  console.log('[AUTO SMS IDEMPOTENCY CHECK] Checking for existing automatic SMS');
  console.log('[AUTO SMS IDEMPOTENCY CHECK] callSid:', callSid);
  console.log('[AUTO SMS IDEMPOTENCY CHECK] conversationId:', conversationId);
  console.log('[AUTO SMS IDEMPOTENCY CHECK] businessId:', businessId);
  console.log('[AUTO SMS IDEMPOTENCY CHECK] scoping: Call-Specific (call_sid in structured_data)');
  console.log('[AUTO SMS IDEMPOTENCY CHECK] Timestamp:', new Date().toISOString());
  console.log('[AUTO SMS IDEMPOTENCY CHECK] =========================================');

  // Verify a message with a valid Twilio SID exists for this specific call
  // This prevents false positives from failed attempts that set metadata flags
  // Deduplication strategy: call_sid in structured_data (call-specific)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: existingMessage } = await supabaseAdmin
    .from('messages')
    .select('id, conversation_id, business_id, twilio_message_sid, status, error_code, is_manual, structured_data')
    .contains('structured_data', { call_sid: callSid })
    .eq('business_id', businessId)
    .eq('direction', 'outbound')
    .eq('is_manual', false)
    .not('twilio_message_sid', 'is', null)
    .not('twilio_message_sid', 'eq', 'NOT_CALLED')
    .not('twilio_message_sid', 'like', 'SIM_%')
    .not('twilio_message_sid', 'eq', 'CLAIMED')
    .gte('created_at', oneHourAgo)
    .maybeSingle()

  if (existingMessage) {
    // Only block if the message was actually sent to Twilio (valid SID) and not failed
    const wasTwilioCalled = existingMessage.twilio_message_sid && existingMessage.twilio_message_sid !== 'NOT_CALLED'
    const hasError = existingMessage.error_code
    const isFailedStatus = existingMessage.status === 'failed' || existingMessage.status === 'undelivered'

    if (wasTwilioCalled && !hasError && !isFailedStatus) {
      console.log('[AUTO SMS IDEMPOTENCY] Valid SMS already sent for call:', {
        callSid,
        businessId,
        messageId: existingMessage.id,
        twilioMessageSid: existingMessage.twilio_message_sid,
        status: existingMessage.status
      })
      console.log('[AUTO SMS IDEMPOTENCY CHECK RESULT] =========================================');
      console.log('[AUTO SMS IDEMPOTENCY CHECK RESULT] hasSms: true');
      console.log('[AUTO SMS IDEMPOTENCY CHECK RESULT] existingMessageId:', existingMessage.id);
      console.log('[AUTO SMS IDEMPOTENCY CHECK RESULT] Timestamp:', new Date().toISOString());
      console.log('[AUTO SMS IDEMPOTENCY CHECK RESULT] =========================================');
      return true
    }
  }

  console.log('[AUTO SMS IDEMPOTENCY CHECK RESULT] =========================================');
  console.log('[AUTO SMS IDEMPOTENCY CHECK RESULT] hasSms: false');
  console.log('[AUTO SMS IDEMPOTENCY CHECK RESULT] Timestamp:', new Date().toISOString());
  console.log('[AUTO SMS IDEMPOTENCY CHECK RESULT] =========================================');
  return false
}

// Spam detection patterns
const SPAM_PATTERNS = {
  INVALID_LENGTH: /^(\d{1,4}|\d{12,})$/, // Too short or too long numbers
  REPEATED_DIGITS: /^(\d)\1+$/, // 111111111, 222222222, etc.
  OBVIOUS_SPAM: /^(900|800|888|877|866|855|844|833)/, // Premium/US toll-free
  ANONYMOUS: /^(anonymous|private|blocked|restricted)$/i,
  MALFORMED: /[^\d+\-\s\(\)]/, // Contains non-phone characters
}

// Check for obvious spam/invalid numbers
function checkSpamNumber(phoneNumber: string): { blocked: boolean; reason: string } {
  if (SPAM_PATTERNS.INVALID_LENGTH.test(phoneNumber)) {
    return { blocked: true, reason: 'blocked_invalid_number' }
  }
  if (SPAM_PATTERNS.REPEATED_DIGITS.test(phoneNumber)) {
    return { blocked: true, reason: 'blocked_repeated_digits' }
  }
  if (SPAM_PATTERNS.OBVIOUS_SPAM.test(phoneNumber)) {
    return { blocked: true, reason: 'blocked_spam_pattern' }
  }
  if (SPAM_PATTERNS.ANONYMOUS.test(phoneNumber)) {
    return { blocked: true, reason: 'blocked_anonymous_number' }
  }
  if (SPAM_PATTERNS.MALFORMED.test(phoneNumber)) {
    return { blocked: true, reason: 'blocked_malformed' }
  }
  return { blocked: false, reason: '' }
}

// Check for repeat call protection (user-configured, separate from idempotency)
async function checkRepeatCallProtection(
  businessId: string,
  phoneNumber: string,
  cooldownMinutes: number
): Promise<{ blocked: boolean; reason: string }> {
  const cooldownStart = new Date(Date.now() - (cooldownMinutes * 60 * 1000))
  
  const recentDecision = await db.getRecentFilteringDecision(businessId, phoneNumber, cooldownStart)
  if (recentDecision && recentDecision.decision === 'allowed') {
    return {
      blocked: true,
      reason: 'blocked_repeat_caller'
    }
  }
  
  return { blocked: false, reason: '' }
}

// Check if caller is blocked/private
function checkBlockedPrivateCallers(phoneNumber: string, enabled: boolean): { blocked: boolean; reason: string } {
  if (!enabled) {
    return { blocked: false, reason: '' }
  }
  
  if (SPAM_PATTERNS.ANONYMOUS.test(phoneNumber)) {
    return { blocked: true, reason: 'blocked_private_number' }
  }
  
  return { blocked: false, reason: '' }
}

// Check if caller is suspected spam
function checkSuspectedSpamCallers(phoneNumber: string, enabled: boolean): { blocked: boolean; reason: string } {
  if (!enabled) {
    return { blocked: false, reason: '' }
  }
  
  if (SPAM_PATTERNS.INVALID_LENGTH.test(phoneNumber)) {
    return { blocked: true, reason: 'blocked_suspected_spam' }
  }
  if (SPAM_PATTERNS.REPEATED_DIGITS.test(phoneNumber)) {
    return { blocked: true, reason: 'blocked_suspected_spam' }
  }
  if (SPAM_PATTERNS.OBVIOUS_SPAM.test(phoneNumber)) {
    return { blocked: true, reason: 'blocked_suspected_spam' }
  }
  
  return { blocked: false, reason: '' }
}

// Log filtering decision for analytics
async function logFilteringDecision(
  businessId: string,
  callerPhone: string,
  callSid: string,
  decision: string,
  reason: string
): Promise<void> {
  try {
    await supabaseAdmin
      .from('filtering_decisions')
      .insert({
        business_id: businessId,
        caller_phone: callerPhone,
        call_sid: callSid,
        decision,
        reason,
        created_at: new Date().toISOString()
      })
  } catch (error) {
    console.error('[AUTO SMS] Failed to log filtering decision:', error)
  }
}

// Helper function to check if SMS error is transient (worth retrying)
function isTransientSmsError(error: any): boolean {
  if (!error) return false
  const permanentErrors = [
    '21610', // Unsubscribed number
    '21611', // Invalid phone number
    '21612', // Cannot route to this number
    '21614', // 'To' number is not a valid mobile number
    '21615', // Phone number is incapable of receiving SMS
    '21408', // Permission denied
  ]
  const errorCode = error.code || error.status
  const errorMessage = error.message || ''
  
  // Check for permanent error codes
  if (permanentErrors.includes(String(errorCode))) {
    return false
  }
  
  // Check for permanent error messages
  if (errorMessage.includes('unsubscribed') || 
      errorMessage.includes('invalid number') ||
      errorMessage.includes('blocked') ||
      errorMessage.includes('permission denied')) {
    return false
  }
  
  // Assume all other errors are transient (network, timeout, rate limit, etc.)
  return true
}

export async function dispatchAutomaticCustomerSms(params: DispatchParams): Promise<DispatchResult> {
  const { trigger, callSid, businessId, leadId, conversationId, callerPhone } = params

  const { data: business, error: businessError } = await supabaseAdmin
    .from('businesses')
    .select('*')
    .eq('id', businessId)
    .single()

  if (businessError || !business) {
    return { success: false, skipped: true, reason: 'business_not_found' }
  }

  // Get automation settings with defaults
  const automationSettings = business.automation_settings || {
    spamRepeatFilteringEnabled: false,
    ignoreRepeatCalls: false,
    repeatCallWindowMinutes: 30,
    ignoreBlockedPrivateNumbers: false,
    ignoreSuspectedSpamCallers: false,
    blockedNumbers: []
  }

  // Normalize phone number for filtering checks
  const normalizedPhone = normalizePhoneNumber(callerPhone)

  // Personal contacts check (independent of master toggle)
  if (await isIgnoredContact(businessId, callerPhone)) {
    await logFilteringDecision(businessId, normalizedPhone, callSid, 'suppressed', 'ignored_contact')
    return { success: true, skipped: true, reason: 'ignored_contact' }
  }

  // Idempotency check (webhook/call level, separate from user-configured repeat suppression)
  if (await hasAutomaticSmsForCall(conversationId, businessId, callSid)) {
    return { success: true, skipped: true, reason: 'automatic_sms_already_dispatched_for_call' }
  }

  // Apply spam/repeat filtering only to instant-response SMS
  // Do not filter AI recaps, payment requests, manual messages, or follow-ups
  const isInstantResponse = trigger === 'call_finished' || trigger === 'voicemail_completed' || trigger === 'recording_fallback'
  const isAiRecap = trigger === 'ai_confirmation'
  
  if (isInstantResponse && automationSettings.spamRepeatFilteringEnabled) {
    // Check for repeat call protection (user-configured)
    if (automationSettings.ignoreRepeatCalls) {
      const repeatCheck = await checkRepeatCallProtection(
        businessId,
        normalizedPhone,
        automationSettings.repeatCallWindowMinutes || 30
      )
      if (repeatCheck.blocked) {
        await logFilteringDecision(businessId, normalizedPhone, callSid, 'suppressed', repeatCheck.reason)
        console.log('[AUTO SMS FILTERING] Blocked by repeat call protection', {
          businessId,
          callerPhone: normalizedPhone,
          callSid,
          windowMinutes: automationSettings.repeatCallWindowMinutes
        })
        return { success: true, skipped: true, reason: repeatCheck.reason }
      }
    }

    // Check for blocked/private callers
    if (automationSettings.ignoreBlockedPrivateNumbers) {
      const privateCheck = checkBlockedPrivateCallers(normalizedPhone, true)
      if (privateCheck.blocked) {
        await logFilteringDecision(businessId, normalizedPhone, callSid, 'suppressed', privateCheck.reason)
        console.log('[AUTO SMS FILTERING] Blocked by private caller check', {
          businessId,
          callerPhone: normalizedPhone,
          callSid
        })
        return { success: true, skipped: true, reason: privateCheck.reason }
      }
    }

    // Check for suspected spam callers
    if (automationSettings.ignoreSuspectedSpamCallers) {
      const spamCheck = checkSuspectedSpamCallers(normalizedPhone, true)
      if (spamCheck.blocked) {
        await logFilteringDecision(businessId, normalizedPhone, callSid, 'suppressed', spamCheck.reason)
        console.log('[AUTO SMS FILTERING] Blocked by suspected spam check', {
          businessId,
          callerPhone: normalizedPhone,
          callSid
        })
        return { success: true, skipped: true, reason: spamCheck.reason }
      }
    }
  }

  const businessName = params.businessName || business.name || 'My Business'

  // Use the authoritative aiCallRecord if provided from voice-status webhook
  // This avoids redundant database queries and ensures the refreshed record is used
  let aiCallRecord: AiCallRecord | null = params.aiCallRecord || null
  if (!aiCallRecord) {
    // Fallback to database query if not provided (for other code paths)
    aiCallRecord = await getAiCallRecord(callSid, leadId)
  }

  // Diagnostic logging before summary SMS decision
  console.log('[SUMMARY SMS RECORD SOURCE]', {
    currentCallSid: callSid,
    businessId: businessId,
    source: aiCallRecord ? 'passed_from_webhook' : 'database_query',
    recordId: aiCallRecord?.id,
    recordCallSid: aiCallRecord?.call_sid,
    recordBusinessId: aiCallRecord?.business_id,
    outcome: aiCallRecord?.outcome,
    transcriptPresent: !!aiCallRecord?.transcript && aiCallRecord.transcript.length > 0,
    extractedInfoPresent: !!aiCallRecord?.extracted_info && Object.keys(aiCallRecord.extracted_info).length > 0,
    summaryPresent: !!aiCallRecord?.summary && aiCallRecord.summary.length > 0,
    callSidMatch: aiCallRecord?.call_sid === callSid,
    businessMatch: aiCallRecord?.business_id === businessId,
    timestamp: new Date().toISOString()
  })

  // HARD GUARDS: Validate exact current call record before proceeding
  const callSidMatch = aiCallRecord?.call_sid === callSid
  const businessMatch = aiCallRecord?.business_id === businessId
  const transcriptPresent = !!aiCallRecord?.transcript && aiCallRecord.transcript.length > 0
  const extractedInfoPresent = !!aiCallRecord?.extracted_info && Object.keys(aiCallRecord.extracted_info).length > 0
  const summaryPresent = !!aiCallRecord?.summary && aiCallRecord.summary.length > 0
  const alreadySent = await hasAutomaticSmsForCall(conversationId, businessId, callSid)

  // NEW POLICY: Send SMS for any call that reached ReplyFlow AI (has ai_call_record)
  // SMS eligibility does NOT depend on: outcome completion, captured fields, or meaningful data
  // Valid skip reasons only: no AI record (never reached ReplyFlow), already sent, or destination issues
  const reachedReplyFlowAI = !!aiCallRecord && callSidMatch && businessMatch

  // Skip if any guard fails
  let skipReason = null
  if (!reachedReplyFlowAI) {
    skipReason = 'call_did_not_reach_replyflow_ai'
  } else if (alreadySent) {
    skipReason = 'already_sent'
  }

  // Structured decision log with all required fields
  console.log('[SUMMARY SMS DECISION]', {
    currentCallSid: callSid,
    selectedAiCallRecordId: aiCallRecord?.id,
    selectedRecordCallSid: aiCallRecord?.call_sid,
    selectedRecordOutcome: aiCallRecord?.outcome,
    transcriptPresent,
    extractedInfoPresent,
    summaryPresent,
    reachedReplyFlowAI,
    alreadySent,
    decision: skipReason ? 'skip' : 'send',
    skipReason,
    timestamp: new Date().toISOString()
  })

  // Structured SMS decision log with all required fields
  const capturedFields = {
    customerName: extractedInfoPresent ? (extractedInfoPresent ? 'present' : 'absent') : 'absent',
    request: extractedInfoPresent ? 'present' : 'absent',
    location: extractedInfoPresent ? 'present' : 'absent',
    completionTime: extractedInfoPresent ? 'present' : 'absent',
    callbackTime: extractedInfoPresent ? 'present' : 'absent'
  }
  
  console.log('[SMS DECISION STRUCTURED]', {
    callSid,
    reachedReplyFlowAI,
    terminalEvent: trigger,
    smsEnabled: true,
    destinationAvailable: true,
    alreadySent,
    capturedFields,
    dispatchDecision: skipReason ? 'skip' : 'send',
    dispatchReason: skipReason || 'all_checks_passed',
    twilioMessageSid: null,
    twilioStatus: null,
    timestamp: new Date().toISOString()
  })

  // Content eligibility diagnostic log
  console.log('[SUMMARY SMS CONTENT ELIGIBILITY]', {
    transcriptPresent,
    extractedInfoPresent,
    summaryPresent,
    templateSource: extractedInfoPresent ? 'extracted_info' : (summaryPresent ? 'summary' : 'transcript'),
    timestamp: new Date().toISOString()
  })

  if (skipReason) {
    console.log('[SUMMARY SMS SKIPPED]', {
      reason: skipReason,
      callSid,
      aiCallRecordId: aiCallRecord?.id
    })
    return { success: true, skipped: true, reason: skipReason }
  }

  // Merge extracted info from multiple sources to handle race conditions
  // Priority: params.extractedInfo > aiCallRecord.extracted_info
  // CRITICAL: lead.raw_metadata is NOT merged - it contains historical intake data
  const mergedExtractedInfo = mergeExtractedInfo(params, aiCallRecord)
  const extracted = normalizeExtractedInfo(mergedExtractedInfo)
  const aiOutcome = params.aiOutcome || aiCallRecord?.outcome || null
  const intakeComplete = isCompleteAIIntake(extracted, (business as any)?.service_location_type || 'onsite')
  const outcome: AutoSmsOutcome = 'SUMMARY'
  const template: AutoSmsTemplate = 'ai_summary'
  const reason = intakeComplete || aiOutcome === 'completed_intake' || aiOutcome === 'completed'
    ? 'ai_intake_completed'
    : params.voicemailCompleted || trigger === 'voicemail_completed'
      ? 'post_call_structured_summary'
      : 'post_call_structured_summary'
  let messageBody = generateSummaryFromExtractedInfo(
    extracted,
    callerPhone,
    businessName,
    '',
    { 
      serviceLocationType: 
        (extracted as any)?.serviceLocationType || 
        (business as any)?.service_location_type || 
        'onsite' 
    }
  )

  // Out of Office notice is handled centrally by sendSms via appendBusinessAvailabilityNote
  // Do not append here to avoid duplication

  const resolvedConversationId = await getConversationId(leadId, businessId, params.conversationId)

  console.log('[AUTO SMS DISPATCH]', {
    callSid,
    leadId,
    conversationId: resolvedConversationId,
    trigger,
    Outcome: outcome,
    SelectedTemplate: template,
    Reason: reason
  })

  console.log(`[AUTO SMS DISPATCH] Sending template: ${template}`)

  // Log structured decision event
  console.log('[AUTO SMS DECISION]', {
    businessId,
    callSid,
    callerPhone: normalizedPhone,
    decision: 'send',
    trigger,
    filteringEnabled: automationSettings.spamRepeatFilteringEnabled,
    repeatProtectionEnabled: automationSettings.ignoreRepeatCalls,
    repeatWindowMinutes: automationSettings.repeatCallWindowMinutes,
    timestamp: new Date().toISOString()
  })

  await logFilteringDecision(businessId, normalizedPhone, callSid, 'allowed', 'all_checks_passed')

  // RETRY LOGIC: Bounded retry for transient Twilio failures
  const retryDelays = [60000, 300000, 1800000] // 1min, 5min, 30min
  const maxRetries = retryDelays.length
  let twilioMessageSid: string | null = null
  let messageId: string | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Business availability text should only apply to instant-response SMS
    // AI recaps, payment requests, manual messages, and follow-ups should not receive availability text
    const shouldAppendAvailability = isInstantResponse

    // Claim the message before sending to Twilio (atomic claim)
    // Only claim on first attempt to avoid re-claiming on retry
    let claimId: string | null = null
    let claimToken: string | null = null
    if (attempt === 0) {
      // First, attempt to reclaim any stale pending claim
      const reclaimResult = await reclaimStaleClaim(
        businessId,
        callSid
      )

      if (reclaimResult.reclaimed) {
        claimId = reclaimResult.claimId
        claimToken = reclaimResult.claimToken
        console.log('[SMS RETRY] Reclaimed stale claim, proceeding to send', { claimId, claimToken })
      } else {
        // No stale claim, attempt new claim
        const claimResult = await claimAiSummarySms(
          businessId,
          leadId,
          resolvedConversationId!,
          callSid
        )

        if (!claimResult.claimed) {
          // Another handler already claimed this call - return as idempotent skip
          console.log('[SMS RETRY SKIPPED]', {
            reason: claimResult.reason,
            callSid,
            leadId,
            timestamp: new Date().toISOString()
          })
          return { success: false, skipped: true, reason: `duplicate_claim: ${claimResult.reason}` }
        }

        claimId = claimResult.claimId
        claimToken = claimResult.claimToken
      }
    }

    const sendResult = await sendSms(business, callerPhone, messageBody, {
      lead_id: leadId,
      conversation_id: resolvedConversationId,
      source: 'ai_summary',
      reason,
      skipBusinessAvailabilityAppend: !shouldAppendAvailability,
      callSid: callSid
    })

    twilioMessageSid = sendResult.sid

    if (sendResult.idempotentSkip) {
      // SMS skipped due to idempotency (same call already sent) - do not retry
      console.log('[SMS RETRY SKIPPED]', {
        reason: 'idempotent_skip',
        callSid,
        leadId,
        timestamp: new Date().toISOString()
      })
      break
    }

    if (twilioMessageSid) {
      // SMS sent successfully - mark claim as sent
      if (claimId && claimToken) {
        await markClaimSent(claimId, twilioMessageSid, claimToken)
      }
      break
    }

    // SMS failed, check if we should retry
    if (attempt === maxRetries) {
      // Max retries reached
      console.error('[SMS SEND FAILED]', {
        leadId,
        callSid,
        attempt: attempt + 1,
        maxRetries: maxRetries + 1,
        timestamp: new Date().toISOString()
      })

      // Classify failure type to determine claim behavior
      // CONSERVATIVE DEFAULT: Treat all failures as AMBIGUOUS to prevent duplicate SMS
      const isDefinitiveFailure = false // Conservative: assume ambiguous by default
      const isAmbiguousFailure = !isDefinitiveFailure

      if (claimId && claimToken) {
        if (isDefinitiveFailure) {
          // Safe to mark as failed_definitive for retry
          await markClaimFailed(claimId, 'failed_definitive', claimToken)
          console.log('[SMS DEFINITIVE FAILURE] Claim marked as failed_definitive for retry', {
            claimId,
            callSid
          })
        } else if (isAmbiguousFailure) {
          // Preserve claim as failed_ambiguous to prevent duplicate SMS
          await markClaimFailed(claimId, 'failed_ambiguous', claimToken)
          console.log('[SMS AMBIGUOUS FAILURE] Claim preserved as failed_ambiguous to prevent duplicate SMS', {
            claimId,
            callSid,
            claimToken
          })
        }
      }
      break
    }

    // Log retry attempt
    console.log('[SMS RETRY]', {
      attempt: attempt + 1,
      leadId,
      callSid,
      reason: 'SMS sending returned null sid',
      nextRetryDelay: retryDelays[attempt]
    })

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]))

    // Re-check idempotency after delay (SMS may have been sent by another process)
    if (await hasAutomaticSmsForCall(resolvedConversationId, businessId, callSid)) {
      console.log('[IDEMPOTENCY]', {
        existingSmsFound: true,
        callSid,
        businessId,
        action: 'skipping_sms_already_sent'
      })
      // Mark as success since SMS was already sent
      twilioMessageSid = 'already_sent'
      break
    }
  }

  if (twilioMessageSid) {
    const { data: leadForMetadata } = await supabaseAdmin
      .from('leads')
      .select('raw_metadata')
      .eq('id', leadId)
      .maybeSingle()

    const dispatchedAt = new Date().toISOString()
    const rawMetadata = {
      ...(leadForMetadata?.raw_metadata || {}),
      auto_sms_dispatch_call_sid: callSid,
      auto_sms_dispatch_template: template,
      auto_sms_dispatch_outcome: outcome,
      auto_sms_dispatch_message_sid: twilioMessageSid,
      auto_sms_dispatch_sent_at: dispatchedAt,
      ...(template === 'ai_summary' ? {
        ai_summary_sms_sent: true,
        ai_confirmation_sms_sent: true,
        ai_summary_sms_call_sid: callSid,
        ai_summary_sms_message_sid: twilioMessageSid,
        ai_summary_sms_sent_at: dispatchedAt,
      } : {})
    }

    await supabaseAdmin
      .from('leads')
      .update({
        status: 'contacted',
        raw_metadata: rawMetadata
      })
      .eq('id', leadId)

    await supabaseAdmin
      .from('call_events')
      .update({
        sms_sent_at: new Date().toISOString(),
        sms_message_sid: twilioMessageSid,
        sms_pending: false
      })
      .eq('twilio_call_sid', callSid)
  }

  return {
    success: !!twilioMessageSid,
    skipped: false,
    reason,
    outcome,
    template,
    twilioMessageSid,
    messageId,
  }
}
