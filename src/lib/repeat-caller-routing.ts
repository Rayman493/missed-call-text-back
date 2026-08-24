/**
 * Request-Aware Repeat Caller Routing Service
 * 
 * Determines the appropriate routing path for inbound missed calls based on:
 * - Customer existence
 * - Latest AI intake status
 * - Request status (active vs closed)
 * - Retry window for immediate follow-ups
 */

// Retry window constants (in minutes)
export const INCOMPLETE_RETRY_COOLDOWN_MINUTES = 5; // Allow AI retry after 5 minutes for incomplete/failed

// Canonical routing result types
export type RepeatCallerRoute = 
  | 'ai_intake_new_request'
  | 'ai_intake_retry'
  | 'update_voicemail_active_request'
  | 'ignored_customer_existing_behavior'
  | 'fallback_voicemail'
  | 'error_fallback';

// Canonical routing reasons
export type RepeatCallerReason = 
  | 'no_existing_customer'
  | 'no_prior_completed_intake'
  | 'active_request_exists'
  | 'latest_request_closed'
  | 'incomplete_intake_retry'
  | 'retry_window_expired'
  | 'ignored_customer'
  | 'missing_metadata'
  | 'error_fallback';

// Canonical status values (matches database schema from 20260804000000_sync_canonical_customer_statuses.sql)
export type LeadStatus = 'new' | 'needs_reply' | 'active' | 'scheduled' | 'payment_requested' | 'paid' | 'completed' | 'ignored' | 'lost';
export type ConversationStatus = 'active' | 'closed' | 'archived';
export type AICallOutcome = 'completed' | 'caller_hung_up' | 'ai_failed' | 'voicemail_fallback' | 'incomplete';

// Active/unresolved lead statuses
const ACTIVE_LEAD_STATUSES: LeadStatus[] = ['new', 'needs_reply', 'active', 'scheduled', 'payment_requested', 'paid'];

// Closed/resolved lead statuses
const CLOSED_LEAD_STATUSES: LeadStatus[] = ['completed', 'ignored', 'lost'];

// Failed/incomplete AI outcomes that allow retry
const RETRYABLE_AI_OUTCOMES: AICallOutcome[] = ['incomplete', 'caller_hung_up', 'ai_failed', 'voicemail_fallback'];

/**
 * Routing result interface
 */
export interface RepeatCallerRoutingResult {
  route: RepeatCallerRoute;
  reason: RepeatCallerReason;
  leadId?: string;
  conversationId?: string;
  latestAICallRecordId?: string;
  leadStatus?: LeadStatus;
  aiOutcome?: AICallOutcome;
  minutesSinceLastIntake?: number;
  canRetryAI?: boolean;
}

/**
 * Determine the appropriate routing path for a repeat caller
 *
 * Decision order:
 * 1. No existing canonical customer → AI intake new request
 * 2. Ignored customer → Preserve existing behavior
 * 3. Existing customer with no completed AI intake → AI intake new request
 * 4. Existing customer with closed/resolved request → AI intake new request (checked BEFORE AI outcome)
 * 5. Existing customer with incomplete/failed intake + ACTIVE lead status → AI retry after cooldown
 * 6. Existing customer with active unresolved request → Update voicemail
 * 7. Unknown status → Safe fallback
 */
export async function determineRepeatCallerRoute(params: {
  businessId: string;
  callerPhone: string;
  lead: any; // Existing lead if found, null otherwise
  latestAICallRecord: any; // Latest AI call record if found, null otherwise
}): Promise<RepeatCallerRoutingResult> {
  const { businessId, callerPhone, lead, latestAICallRecord } = params;

  try {
    console.log('[REPEAT CALLER ROUTING] Starting routing decision', {
      businessId,
      callerPhone,
      leadId: lead?.id,
      latestAICallRecordId: latestAICallRecord?.id,
      leadStatus: lead?.status,
      aiOutcome: latestAICallRecord?.outcome
    });

    // Case 1: No existing canonical customer
    if (!lead) {
      console.log('[REPEAT CALLER ROUTING] No existing customer - AI intake for new request');
      return {
        route: 'ai_intake_new_request',
        reason: 'no_existing_customer'
      };
    }

    // Case 2: Ignored customer - preserve existing behavior
    if (lead.status === 'ignored' || lead.opted_out === true) {
      console.log('[REPEAT CALLER ROUTING] Ignored customer - preserve existing behavior');
      return {
        route: 'ignored_customer_existing_behavior',
        reason: 'ignored_customer',
        leadId: lead.id
      };
    }

    // Case 3: No prior completed AI intake
    if (!latestAICallRecord) {
      console.log('[REPEAT CALLER ROUTING] No prior completed AI intake - AI intake for new request');
      return {
        route: 'ai_intake_new_request',
        reason: 'no_prior_completed_intake',
        leadId: lead.id
      };
    }

    // Calculate time since last intake
    const now = new Date();
    const lastIntakeTime = new Date(latestAICallRecord.created_at);
    const minutesSinceLastIntake = (now.getTime() - lastIntakeTime.getTime()) / (1000 * 60);

    console.log('[REPEAT CALLER ROUTING] Time since last intake', {
      minutesSinceLastIntake: Math.round(minutesSinceLastIntake),
      lastIntakeTime: lastIntakeTime.toISOString(),
      aiOutcome: latestAICallRecord.outcome,
      leadStatus: lead.status
    });

    // Case 4: Closed/resolved request - AI intake for new request
    // Check lead status BEFORE AI outcome to ensure completed customers start fresh
    if (CLOSED_LEAD_STATUSES.includes(lead.status as LeadStatus)) {
      console.log('[REPEAT CALLER ROUTING] Closed request - AI intake for new request');
      return {
        route: 'ai_intake_new_request',
        reason: 'latest_request_closed',
        leadId: lead.id,
        latestAICallRecordId: latestAICallRecord.id,
        leadStatus: lead.status,
        aiOutcome: latestAICallRecord.outcome,
        minutesSinceLastIntake: Math.round(minutesSinceLastIntake)
      };
    }

    // Case 5: Incomplete/failed intake with ACTIVE lead status - allow AI retry after cooldown
    // Only apply cooldown logic when the lead is still active (not completed)
    if (RETRYABLE_AI_OUTCOMES.includes(latestAICallRecord.outcome as AICallOutcome)) {
      if (minutesSinceLastIntake >= INCOMPLETE_RETRY_COOLDOWN_MINUTES) {
        console.log('[REPEAT CALLER ROUTING] Incomplete intake with active lead - AI retry after cooldown');
        return {
          route: 'ai_intake_retry',
          reason: 'incomplete_intake_retry',
          leadId: lead.id,
          conversationId: latestAICallRecord.conversation_id,
          latestAICallRecordId: latestAICallRecord.id,
          leadStatus: lead.status,
          aiOutcome: latestAICallRecord.outcome,
          minutesSinceLastIntake: Math.round(minutesSinceLastIntake),
          canRetryAI: true
        };
      } else {
        console.log('[REPEAT CALLER ROUTING] Incomplete intake with active lead - still in cooldown, use voicemail');
        return {
          route: 'update_voicemail_active_request',
          reason: 'retry_window_expired',
          leadId: lead.id,
          conversationId: latestAICallRecord.conversation_id,
          latestAICallRecordId: latestAICallRecord.id,
          leadStatus: lead.status,
          aiOutcome: latestAICallRecord.outcome,
          minutesSinceLastIntake: Math.round(minutesSinceLastIntake),
          canRetryAI: false
        };
      }
    }

    // Case 6: Active unresolved request - ALWAYS route to update voicemail
    // No retry window for completed intake - customers should leave updates, not repeat entire intake
    if (ACTIVE_LEAD_STATUSES.includes(lead.status as LeadStatus)) {
      console.log('[REPEAT CALLER ROUTING] Active unresolved request - update voicemail');
      return {
        route: 'update_voicemail_active_request',
        reason: 'active_request_exists',
        leadId: lead.id,
        conversationId: latestAICallRecord.conversation_id,
        latestAICallRecordId: latestAICallRecord.id,
        leadStatus: lead.status,
        aiOutcome: latestAICallRecord.outcome,
        minutesSinceLastIntake: Math.round(minutesSinceLastIntake),
        canRetryAI: false
      };
    }

    // Case 7: Unknown status - safe fallback
    console.log('[REPEAT CALLER ROUTING] Unknown lead status - safe fallback to update voicemail');
    return {
      route: 'update_voicemail_active_request',
      reason: 'missing_metadata',
      leadId: lead.id,
      conversationId: latestAICallRecord.conversation_id,
      latestAICallRecordId: latestAICallRecord.id,
      leadStatus: lead.status,
      aiOutcome: latestAICallRecord.outcome,
      minutesSinceLastIntake: Math.round(minutesSinceLastIntake)
    };

  } catch (error) {
    console.error('[REPEAT CALLER ROUTING] Error in routing decision:', error);
    return {
      route: 'error_fallback',
      reason: 'error_fallback',
      leadId: lead?.id
    };
  }
}

/**
 * Check if a lead status is considered active/unresolved
 */
export function isActiveLeadStatus(status: string): boolean {
  return ACTIVE_LEAD_STATUSES.includes(status as LeadStatus);
}

/**
 * Check if a lead status is considered closed/resolved
 */
export function isClosedLeadStatus(status: string): boolean {
  return CLOSED_LEAD_STATUSES.includes(status as LeadStatus);
}

/**
 * Check if an AI outcome allows retry
 */
export function isRetryableAIOutcome(outcome: string): boolean {
  return RETRYABLE_AI_OUTCOMES.includes(outcome as AICallOutcome);
}
