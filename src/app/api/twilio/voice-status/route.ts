import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase/admin'
import { normalizePhoneNumber } from '@/lib/twilio'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { checkVoiceStatusRateLimit } from '@/lib/rate-limit'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { createFollowUpJobs } from '@/lib/follow-ups'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'
import { hasAiSummaryBeenSent } from '@/lib/sms-decision'
import { dispatchAutomaticCustomerSms } from '@/lib/auto-sms-dispatcher'
import { isCompleteAIIntake } from '@/lib/ai-intake-completion'
import { isAutomatedTranscriptSpam } from '@/lib/smart-filtering'
import { detectPersonalVoicemailFromUrl } from '@/lib/personal-voicemail-detector'

console.log('[VOICE STATUS MODULE LOADED] =========================================');
console.log('[VOICE STATUS MODULE LOADED] timestamp:', new Date().toISOString());
console.log('[VOICE STATUS MODULE LOADED] =========================================');

// CALL TRACE logging function
function logCallTrace(data: {
  route: string
  action: string
  callSid?: string
  from?: string
  to?: string
  forwardedFrom?: string
  businessId?: string
  businessName?: string
  leadId?: string
  conversationId?: string
  messageId?: string
  aiCallRecordId?: string
  existingOrCreated?: 'existing' | 'created' | 'updated'
  reason?: string
}) {
  console.log('[CALL TRACE]', JSON.stringify(data))
}

// Shared processing function for voice status callbacks
async function processVoiceStatusCallback(params: any, method: string, requestUrl?: string) {
  console.log('[VOICE STATUS PROCESS START] =========================================');
  console.log('[VOICE STATUS PROCESS START] method:', method);
  console.log('[VOICE STATUS PROCESS START] timestamp:', new Date().toISOString());
  console.log('[VOICE STATUS PROCESS START] =========================================');

  console.log('[VOICE STATUS PROCESS PARAMS] =========================================');
  console.log('[VOICE STATUS PROCESS PARAMS] CallSid:', params.CallSid);
  console.log('[VOICE STATUS PROCESS PARAMS] From:', params.From);
  console.log('[VOICE STATUS PROCESS PARAMS] To:', params.To);
  console.log('[VOICE STATUS PROCESS PARAMS] CallStatus:', params.CallStatus);
  console.log('[VOICE STATUS PROCESS PARAMS] Duration:', params.Duration || params.CallDuration);
  console.log('[VOICE STATUS PROCESS PARAMS] Timestamp:', new Date().toISOString());
  console.log('[VOICE STATUS PROCESS PARAMS] =========================================');

  // Extract params
  const CallSid = params.CallSid
  let From = params.From
  const To = params.To
  const CallStatus = params.CallStatus
  const Duration = params.Duration || params.CallDuration
  const Direction = params.Direction

  // EARLY GUARD: Ignore Twilio Media Stream status callbacks
  // StreamEvent callbacks (start/stop) are NOT final call-status callbacks
  // They should NOT trigger SMS dispatch, lead creation, or follow-up jobs
  if (params.StreamEvent || !CallStatus) {
    console.log('[VOICE STATUS] =========================================');
    console.log('[VOICE STATUS] Ignoring Twilio stream status callback');
    console.log('[VOICE STATUS] StreamEvent:', params.StreamEvent || 'not present');
    console.log('[VOICE STATUS] CallStatus:', CallStatus || 'undefined');
    console.log('[VOICE STATUS] CallSid:', CallSid);
    console.log('[VOICE STATUS] Reason: StreamEvent callbacks are not final call-status callbacks');
    console.log('[VOICE STATUS] =========================================');
    return { success: true, reason: 'stream_event_ignored' };
  }

  // Only process final call lifecycle callbacks
  const allowedCallStatuses = ['completed', 'busy', 'failed', 'no-answer', 'canceled'];
  if (CallStatus && !allowedCallStatuses.includes(CallStatus)) {
    console.log('[VOICE STATUS] =========================================');
    console.log('[VOICE STATUS] Ignoring non-final call status');
    console.log('[VOICE STATUS] CallStatus:', CallStatus);
    console.log('[VOICE STATUS] CallSid:', CallSid);
    console.log('[VOICE STATUS] Reason: Only final call statuses trigger processing');
    console.log('[VOICE STATUS] =========================================');
    return { success: true, reason: 'non_final_call_status_ignored' };
  }

  // Rate limiting check (CallSid-based to allow Twilio retries)
  const rateLimitResult = await checkVoiceStatusRateLimit(CallSid);
  if (!rateLimitResult.success) {
    console.warn('[Voice Status] Rate limit exceeded for CallSid:', CallSid);
    return { success: false, reason: 'rate_limit_exceeded' };
  }

  // === PERSONAL VOICEMAIL DETECTION ===
  // Check if this is a Personal Voicemail call before any AI processing
  // Personal Voicemail calls are completely independent of the AI/customer pipeline
  if (requestUrl) {
    const personalVoicemailDetection = detectPersonalVoicemailFromUrl(requestUrl);
    if (personalVoicemailDetection.isPersonalVoicemail) {
      console.log('[VOICE STATUS PERSONAL VOICEMAIL] =========================================');
      console.log('[VOICE STATUS PERSONAL VOICEMAIL] Detected personal voicemail call');
      console.log('[VOICE STATUS PERSONAL VOICEMAIL] CallSid:', CallSid);
      console.log('[VOICE STATUS PERSONAL VOICEMAIL] businessId:', personalVoicemailDetection.businessId);
      console.log('[VOICE STATUS PERSONAL VOICEMAIL] callerPhone:', personalVoicemailDetection.callerPhone);
      console.log('[VOICE STATUS PERSONAL VOICEMAIL] Bypassing all AI processing');
      console.log('[VOICE STATUS PERSONAL VOICEMAIL] =========================================');
      
      // Personal voicemail calls have no AI processing, no leads, no conversations
      // The recording-status callback handles transcription independently
      // Nothing to do here - return success immediately
      return { success: true, reason: 'personal_voicemail_bypass' };
    }
  }

  // Create fresh Supabase client for this request
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('[VOICE STATUS CALL STATUS] =========================================');
  console.log('[VOICE STATUS CALL STATUS] CallSid:', CallSid);
  console.log('[VOICE STATUS CALL STATUS] CallStatus:', CallStatus);
  console.log('[VOICE STATUS CALL STATUS] Duration:', Duration);
  console.log('[VOICE STATUS CALL STATUS] Direction:', Direction);
  console.log('[VOICE STATUS CALL STATUS] Timestamp:', new Date().toISOString());
  console.log('[VOICE STATUS CALL STATUS] =========================================');

  console.log('[VOICE STATUS START]', {
    callSid: CallSid,
    callStatus: CallStatus,
    businessId: null
  })

  // Check for AI call record with retry logic to handle race condition
  console.log('[AI RECORD LOOKUP TABLE]', {
    table: 'ai_call_records',
    callSid: CallSid
  })

  let aiCallRecord = null
  // Give the AI service more time to finalize the simple-mode completion
  // (lead upsert, conversation creation, ai_call_record insert, lead metadata update, SMS send).
  // Increased delays to total 29 seconds to account for AI completion + SMS sending.
  const retryDelays = [0, 1000, 2000, 3000, 5000, 8000, 10000]

  for (let i = 0; i < retryDelays.length; i++) {
    const delay = retryDelays[i]
    if (delay > 0) {
      console.log('[AI RECORD LOOKUP RETRY]', {
        callSid: CallSid,
        attempt: i + 1,
        delay: delay
      })
      await new Promise(resolve => setTimeout(resolve, delay))
    }

    const { data: record } = await supabase
      .from('ai_call_records')
      .select('id, lead_id, conversation_id, caller_phone, call_sid, business_id, outcome, extracted_info, summary')
      .eq('call_sid', CallSid)
      .maybeSingle()

    if (record) {
      aiCallRecord = record
      if (i > 0) {
        console.log('[AI RECORD FOUND AFTER RETRY]', {
          callSid: CallSid,
          attempt: i + 1,
          totalDelay: delay,
          aiCallRecordId: aiCallRecord.id,
          outcome: aiCallRecord.outcome
        })
      }
      break
    }
  }

  console.log('[AI RECORD LOOKUP RESULT]', {
    found: !!aiCallRecord,
    id: aiCallRecord?.id,
    outcome: aiCallRecord?.outcome,
    lead_id: aiCallRecord?.lead_id,
    conversation_id: aiCallRecord?.conversation_id,
    callSid: CallSid
  })

  console.log('[VOICE STATUS AI CALL FOUND] =========================================');
  console.log('[VOICE STATUS AI CALL FOUND] CallSid:', CallSid);
  console.log('[VOICE STATUS AI CALL FOUND] aiCallRecordFound:', !!aiCallRecord);
  console.log('[VOICE STATUS AI CALL FOUND] aiCallRecordId:', aiCallRecord?.id);
  console.log('[VOICE STATUS AI CALL FOUND] outcome:', aiCallRecord?.outcome);
  console.log('[VOICE STATUS AI CALL FOUND] lead_id:', aiCallRecord?.lead_id);
  console.log('[VOICE STATUS AI CALL FOUND] conversation_id:', aiCallRecord?.conversation_id);
  console.log('[VOICE STATUS AI CALL FOUND] Timestamp:', new Date().toISOString());
  console.log('[VOICE STATUS AI CALL FOUND] =========================================');

  // CRITICAL: Perform final refresh before declaring ai_failed
  // The AI service may have finished persisting data during the retry window
  // Check BOTH ai_call_records AND lead.raw_metadata for extracted info
  if (aiCallRecord && aiCallRecord.outcome === 'incomplete') {
    console.log('[FINAL REFRESH] AI call record still incomplete after retries - performing final refresh', {
      callSid: CallSid,
      aiCallRecordId: aiCallRecord.id,
      currentOutcome: aiCallRecord.outcome,
      totalRetries: retryDelays.length
    });

    // Final refresh: Reload ai_call_records
    const { data: refreshedAiCallRecord } = await supabase
      .from('ai_call_records')
      .select('id, lead_id, conversation_id, caller_phone, call_sid, business_id, outcome, extracted_info, summary')
      .eq('call_sid', CallSid)
      .maybeSingle();

    if (refreshedAiCallRecord) {
      aiCallRecord = refreshedAiCallRecord;
      console.log('[FINAL REFRESH] Reloaded ai_call_records', {
        callSid: CallSid,
        newOutcome: aiCallRecord.outcome,
        hasExtractedInfo: !!aiCallRecord.extracted_info,
        extractedInfoKeys: aiCallRecord.extracted_info ? Object.keys(aiCallRecord.extracted_info) : []
      });
    }

    // Final refresh: Reload lead to check raw_metadata for extracted info
    if (aiCallRecord?.lead_id) {
      const { data: refreshedLead } = await supabase
        .from('leads')
        .select('id, raw_metadata')
        .eq('id', aiCallRecord.lead_id)
        .maybeSingle();

      if (refreshedLead?.raw_metadata) {
        const leadExtractedInfo = refreshedLead.raw_metadata.extracted_info || refreshedLead.raw_metadata;
        const hasLeadExtractedInfo = leadExtractedInfo && Object.keys(leadExtractedInfo).length > 0;

        console.log('[FINAL REFRESH] Reloaded lead metadata', {
          callSid: CallSid,
          leadId: aiCallRecord.lead_id,
          hasRawMetadata: !!refreshedLead.raw_metadata,
          hasExtractedInfo: hasLeadExtractedInfo,
          leadExtractedInfoKeys: hasLeadExtractedInfo ? Object.keys(leadExtractedInfo) : []
        });

        // If lead metadata has extracted info but ai_call_records doesn't, merge it
        if (hasLeadExtractedInfo && (!aiCallRecord.extracted_info || Object.keys(aiCallRecord.extracted_info).length === 0)) {
          console.log('[FINAL REFRESH] Merging extracted info from lead metadata into ai_call_records');
          aiCallRecord.extracted_info = leadExtractedInfo;
          // Update ai_call_records with the merged extracted_info for consistency
          try {
            await supabase
              .from('ai_call_records')
              .update({ extracted_info: leadExtractedInfo })
              .eq('id', aiCallRecord.id);
            console.log('[FINAL REFRESH] Updated ai_call_records with merged extracted info');
          } catch (mergeError) {
            console.error('[FINAL REFRESH] Failed to update ai_call_records with merged extracted info:', mergeError);
          }
        }
      }
    }

    // Only mark ai_failed if BOTH sources are still empty
    const hasAiCallRecordExtractedInfo = aiCallRecord.extracted_info && Object.keys(aiCallRecord.extracted_info).length > 0;
    const aiCallRecordStillIncomplete = aiCallRecord.outcome === 'incomplete';

    if (aiCallRecordStillIncomplete && !hasAiCallRecordExtractedInfo) {
      console.log('[FALLBACK] Both ai_call_records and lead metadata are empty after final refresh - marking ai_failed', {
        callSid: CallSid,
        aiCallRecordId: aiCallRecord.id,
        action: 'Updating outcome to ai_failed to trigger fallback SMS'
      });

      try {
        const { error: updateError } = await supabase
          .from('ai_call_records')
          .update({ outcome: 'ai_failed' })
          .eq('id', aiCallRecord.id);

        if (updateError) {
          console.error('[FALLBACK] Failed to update ai_call_records outcome:', updateError);
        } else {
          console.log('[FALLBACK] Successfully updated ai_call_records outcome to ai_failed');
          aiCallRecord.outcome = 'ai_failed';
        }
      } catch (updateException) {
        console.error('[FALLBACK] Exception updating ai_call_records outcome:', updateException);
      }
    } else {
      console.log('[FINAL REFRESH] Extracted info found after final refresh - NOT marking ai_failed', {
        callSid: CallSid,
        aiCallRecordId: aiCallRecord.id,
        hasExtractedInfo: hasAiCallRecordExtractedInfo,
        outcome: aiCallRecord.outcome
      });
    }

    // AI OUTCOME SYNC: Check if intake is complete after final refresh
    // If complete, update outcome to 'completed' for internal state consistency
    if (aiCallRecord.outcome === 'incomplete' && hasAiCallRecordExtractedInfo) {
      const normalizedExtractedInfo = normalizeExtractedInfo(aiCallRecord.extracted_info || {});
      const isComplete = isCompleteAIIntake(normalizedExtractedInfo);

      console.log('[AI OUTCOME SYNC] =========================================');
      console.log('[AI OUTCOME SYNC] Checking completion after final refresh');
      console.log('[AI OUTCOME SYNC] callSid:', CallSid);
      console.log('[AI OUTCOME SYNC] previousOutcome:', aiCallRecord.outcome);
      console.log('[AI OUTCOME SYNC] completionCheck:', isComplete);
      console.log('[AI OUTCOME SYNC] extractedInfoKeys:', Object.keys(normalizedExtractedInfo));
      console.log('[AI OUTCOME SYNC] =========================================');

      if (isComplete) {
        console.log('[AI OUTCOME SYNC] Intake is complete - updating outcome to completed');
        
        try {
          const { error: outcomeUpdateError } = await supabase
            .from('ai_call_records')
            .update({ 
              outcome: 'completed',
              extraction_failed: false
            })
            .eq('id', aiCallRecord.id);

          if (outcomeUpdateError) {
            console.error('[AI OUTCOME SYNC] Failed to update outcome to completed:', outcomeUpdateError);
          } else {
            console.log('[AI OUTCOME SYNC] =========================================');
            console.log('[AI OUTCOME SYNC] previousOutcome: incomplete');
            console.log('[AI OUTCOME SYNC] completionCheck: true');
            console.log('[AI OUTCOME SYNC] newOutcome: completed');
            console.log('[AI OUTCOME SYNC] reason: final_refresh_detected_complete_intake');
            console.log('[AI OUTCOME SYNC] =========================================');
            aiCallRecord.outcome = 'completed';
          }
        } catch (outcomeUpdateException) {
          console.error('[AI OUTCOME SYNC] Exception updating outcome to completed:', outcomeUpdateException);
        }
      } else {
        console.log('[AI OUTCOME SYNC] =========================================');
        console.log('[AI OUTCOME SYNC] outcome remains incomplete');
        const missingFields = Object.keys(normalizedExtractedInfo).filter(k => {
          const value = (normalizedExtractedInfo as any)[k];
          return !value || value === 'Not collected';
        });
        console.log('[AI OUTCOME SYNC] missingFields:', missingFields);
        console.log('[AI OUTCOME SYNC] =========================================');
      }
    }
  }

  if (!aiCallRecord) {
    console.log('[AI RECORD NOT FOUND AFTER RETRIES]', {
      callSid: CallSid,
      totalAttempts: retryDelays.length
    })
  } else {
    console.log('[VOICE STATUS AI RECORD CHECK]', {
      callSid: CallSid,
      aiCallRecordFound: true,
      aiCallRecordId: aiCallRecord.id,
      aiConversationId: aiCallRecord.conversation_id,
      aiLeadId: aiCallRecord.lead_id,
      outcome: aiCallRecord.outcome
    })
  }

  // Log essential call status details for production monitoring
  console.log('[voice-status] Call status update:', {
    CallSid,
    CallStatus,
    Duration,
    Direction
  })

  if (!From || !To) {
    // Twilio Stream status callbacks do not include From/To.
    // If we already found an ai_call_record, use its fields as the source of truth
    // so incomplete AI calls can still receive the structured summary SMS.
    if (aiCallRecord && aiCallRecord.caller_phone) {
      console.log('[VOICE STATUS] From/To missing but ai_call_record found — using ai_call_record fields', {
        callSid: CallSid,
        callerPhone: aiCallRecord.caller_phone,
        businessId: aiCallRecord.business_id,
        outcome: aiCallRecord.outcome
      });
      From = aiCallRecord.caller_phone;
    } else {
      console.log('[VOICE STATUS EARLY RETURN] =========================================');
      console.log('[VOICE STATUS EARLY RETURN] reason: missing required fields and no ai_call_record');
      console.log('[VOICE STATUS EARLY RETURN] From:', From);
      console.log('[VOICE STATUS EARLY RETURN] To:', To);
      console.log('[VOICE STATUS EARLY RETURN] Timestamp:', new Date().toISOString());
      console.log('[VOICE STATUS EARLY RETURN] =========================================');
      console.error('[voice-status] Missing required fields:', { From, To })
      console.error('[voice-status] Early return: missing required fields')
      return { success: false, reason: 'missing_required_fields' };
    }
  }

  // Treat ALL inbound calls as valid leads, regardless of CallStatus
  console.log('[voice-status] Creating lead regardless of call status:', CallStatus)
  console.log(`[voice-status] Processing inbound call with status: ${CallStatus}`)

  // Find business by Twilio phone number - exact match
  const to = To
  const normalizedTo = to?.trim()

  console.log('[Twilio Voice Status Webhook] Looking up business with phone:', normalizedTo)

  logCallTrace({
    route: 'voice-status',
    action: 'business_lookup_start',
    callSid: CallSid,
    from: From,
    to: To,
    reason: 'Looking up business by Twilio phone number'
  })

  let business = null
  try {
    // If To is missing (Stream callback) but we have an ai_call_record with business_id,
    // look up the business by ID rather than by Twilio phone number.
    const businessQuery = (!To && aiCallRecord?.business_id)
      ? supabase.from('businesses').select('*').eq('id', aiCallRecord.business_id).single()
      : supabase.from('businesses').select('*').eq('twilio_phone_number', normalizedTo!).single()

    const { data: businessData } = await businessQuery

    business = businessData
    console.log('[Twilio Voice Status Webhook] Business lookup result:', business ? {
      id: business.id,
      name: business.name,
      found: true
    } : {
      found: false
    })

    if (business) {
      logCallTrace({
        route: 'voice-status',
        action: 'business_lookup_success',
        callSid: CallSid,
        from: From,
        to: To,
        businessId: business.id,
        businessName: business.name,
        existingOrCreated: 'existing',
        reason: 'Found business by Twilio phone number'
      })
    }
  } catch (businessError) {
    console.error('[Twilio Voice Status Webhook] Error looking up business:', businessError)
    business = null

    logCallTrace({
      route: 'voice-status',
      action: 'business_lookup_failed',
      callSid: CallSid,
      from: From,
      to: To,
      reason: `Error looking up business: ${businessError}`
    })
  }

  if (!business) {
    console.log('[VOICE STATUS EARLY RETURN] =========================================');
    console.log('[VOICE STATUS EARLY RETURN] reason: no business matched');
    console.log('[VOICE STATUS EARLY RETURN] normalizedTo:', normalizedTo);
    console.log('[VOICE STATUS EARLY RETURN] Timestamp:', new Date().toISOString());
    console.log('[VOICE STATUS EARLY RETURN] =========================================');
    console.error('[Twilio Voice Status Webhook] No business match found for phone:', normalizedTo)
    console.error('[Twilio Voice Status Webhook] Early return: no business matched')
    return { success: false, reason: 'no_business_matched' };
  }

  // TEST SETUP: Update test_call_received_at for businesses in pending_test or incomplete setup
  const isTestSetup = business.onboarding_status === 'pending_test' ||
                      (business.call_forwarding_enabled && !business.forwarding_verified)

  if (isTestSetup) {
    console.log('[TEST SETUP] Test call received for business in test setup', {
      businessId: business.id,
      onboarding_status: business.onboarding_status,
      call_forwarding_enabled: business.call_forwarding_enabled,
      forwarding_verified: business.forwarding_verified
    })

    try {
      const { error: testUpdateError } = await supabase
        .from('businesses')
        .update({
          test_call_received_at: new Date().toISOString(),
          // Keep forwarding_verified if already set
          forwarding_verified: business.forwarding_verified || undefined
        })
        .eq('id', business.id)

      if (testUpdateError) {
        console.error('[TEST SETUP] Failed to update test_call_received_at:', testUpdateError)
      } else {
        console.log('[TEST SETUP] Successfully set test_call_received_at for business:', business.id)
      }
    } catch (testUpdateException) {
      console.error('[TEST SETUP] Exception updating test_call_received_at:', testUpdateException)
    }
  }

  // Normalize customer phone number
  const normalizedCallerPhone = normalizePhoneNumber(From)
  console.log(`[Twilio Voice Status Webhook] Normalized caller phone: ${normalizedCallerPhone}`)

  // CRITICAL FIX: If AI call record exists but has no lead_id, create lead now
  // This happens when AI intake finalizes after the voice webhook created the session without early lead
  // Handle both complete and incomplete intakes - create lead with whatever data is available
  if (aiCallRecord && !aiCallRecord.lead_id) {
    console.log('[AI INTAKE FINALIZE] Creating lead after AI intake finalized', {
      callSid: CallSid,
      aiCallRecordId: aiCallRecord.id,
      outcome: aiCallRecord.outcome,
      hasExtractedInfo: !!aiCallRecord.extracted_info,
      extractedInfo: aiCallRecord.extracted_info
    })

    const normalizedPhone = normalizePhoneNumber(From)
    
    // Check for existing lead by phone
    const { data: existingLeadForAI } = await supabase
      .from('leads')
      .select('id, status')
      .eq('business_id', business.id)
      .eq('caller_phone', normalizedPhone)
      .maybeSingle()

    let leadId: string | null = null
    let isNewLead = false

    if (existingLeadForAI) {
      // Reuse existing lead
      leadId = existingLeadForAI.id
      isNewLead = false
      console.log('[AI INTAKE FINALIZE] Reusing existing lead for AI intake:', leadId)
    } else {
      // Create new lead with extracted info from AI (may be partial or missing for incomplete intakes)
      // Normalize extracted_info to canonical field names so getLeadAIIntake works downstream.
      const extractedRaw = aiCallRecord.extracted_info || {}
      const extracted = normalizeExtractedInfo(extractedRaw)
      const leadName = extracted.callerName || null
      const leadReason = extracted.reasonForCalling || null
      const leadUrgency = extracted.desiredCompletionTime || null
      const leadAddress = extracted.addressOrLocation || null
      const leadCallbackTime = extracted.preferredCallbackTime || null
      const leadDetails = extracted.importantDetails || null

      // For incomplete intakes, mark status appropriately
      const isCompleteIntake = aiCallRecord.outcome === 'completed_intake' || aiCallRecord.outcome === 'completed'
      const leadStatus = isCompleteIntake ? 'new' : 'new' // Keep as 'new' even for incomplete - will be updated by follow-up

      const { data: newLead, error: leadCreateError } = await supabase
        .from('leads')
        .insert({
          business_id: business.id,
          caller_phone: normalizedPhone,
          status: leadStatus,
          name: leadName,
          reason_for_call: leadReason,
          urgency: leadUrgency,
          raw_metadata: { 
            source: 'ai_intake', 
            callSid: CallSid,
            ai_call_record_id: aiCallRecord.id,
            ai_outcome: aiCallRecord.outcome,
            extracted_info: extracted,
            // Canonical top-level fields for getLeadAIIntake fallback
            customerName: leadName,
            serviceRequested: leadReason,
            serviceAddress: leadAddress,
            desiredCompletion: leadUrgency,
            callbackTime: leadCallbackTime,
            additionalDetails: leadDetails,
          }
        })
        .select()
        .single()

      if (leadCreateError || !newLead) {
        console.error('[AI INTAKE FINALIZE] Failed to create lead:', leadCreateError)
      } else {
        leadId = newLead.id
        isNewLead = true
        console.log('[AI INTAKE FINALIZE] Created lead from AI intake (may be incomplete):', {
          leadId: newLead.id,
          name: leadName,
          reason: leadReason,
          urgency: leadUrgency,
          outcome: aiCallRecord.outcome,
          isCompleteIntake
        })
      }
    }

    // Create conversation for this lead using shared helper with canonical selection
    let conversationId: string | null = null
    if (leadId) {
      try {
        const result = await db.getOrCreateConversation(leadId, business.id)
        conversationId = result.conversationId
        console.log('[AI INTAKE FINALIZE] Conversation handled:', {
          conversationId,
          isNew: result.isNew,
          leadId
        })
      } catch (error) {
        console.error('[AI INTAKE FINALIZE] Failed to get or create conversation:', error)
      }
    }

    // Update ai_call_record with lead_id and conversation_id
    if (leadId && conversationId) {
      const { error: updateError } = await supabase
        .from('ai_call_records')
        .update({
          lead_id: leadId,
          conversation_id: conversationId
        })
        .eq('id', aiCallRecord.id)

      if (updateError) {
        console.error('[AI INTAKE FINALIZE] Failed to update ai_call_record:', updateError)
      } else {
        console.log('[AI INTAKE FINALIZE] Updated ai_call_record with lead and conversation:', {
          aiCallRecordId: aiCallRecord.id,
          leadId: leadId,
          conversationId: conversationId
        })

        // Update call_events with conversation_id
        await supabase
          .from('call_events')
          .update({ conversation_id: conversationId })
          .eq('twilio_call_sid', CallSid)

        console.log('[AI INTAKE FINALIZE] Updated call_events with conversation_id')
      }
    }

    // Update the aiCallRecord variable with the new lead/conversation IDs
    aiCallRecord.lead_id = leadId
    aiCallRecord.conversation_id = conversationId
  }

  // Store canonical conversationId from helper
  let canonicalConversationId: string | null = null

  let lead = null

  // CRITICAL FIX: If AI call record has lead_id, use it as the authoritative source
  // This prevents the phone-based lookup from failing for newly created leads
  if (aiCallRecord && aiCallRecord.lead_id) {
    console.log('[VOICE STATUS USING AI CALL RECORD LEAD]', {
      callSid: CallSid,
      aiCallRecordId: aiCallRecord.id,
      aiLeadId: aiCallRecord.lead_id,
      aiConversationId: aiCallRecord.conversation_id,
      outcome: aiCallRecord.outcome,
      reason: 'Using ai_call_records as authoritative source'
    })

    // Fetch the lead from ai_call_records
    const { data: leadFromAiRecord, error: aiLeadError } = await supabase
      .from("leads")
      .select("id, status")
      .eq("id", aiCallRecord.lead_id)
      .single()

    if (aiLeadError || !leadFromAiRecord) {
      console.error('[VOICE STATUS AI LEAD LOOKUP FAILED]', {
        aiCallRecordId: aiCallRecord.id,
        aiLeadId: aiCallRecord.lead_id,
        error: aiLeadError
      })
      // Fall through to phone-based lookup
    } else {
      lead = leadFromAiRecord
      console.log('[VOICE STATUS AI LEAD LOOKUP SUCCESS]', {
        leadId: lead.id,
        status: lead.status,
        source: 'ai_call_records'
      })

      logCallTrace({
        route: 'voice-status',
        action: 'lead_lookup_success',
        callSid: CallSid,
        from: From,
        to: To,
        businessId: business.id,
        businessName: business.name,
        leadId: lead.id,
        existingOrCreated: 'existing',
        reason: 'Used ai_call_records lead_id as authoritative source'
      })
    }
  }

  // Only do phone-based lookup if we don't have a lead from ai_call_records
  if (!lead) {
    // First try to find existing lead with safe error handling
    let existingLead = null
    try {
      logCallTrace({
        route: 'voice-status',
        action: 'lead_lookup_start',
        callSid: CallSid,
        from: From,
        to: To,
        businessId: business.id,
        businessName: business.name,
        reason: 'Looking up existing lead by caller phone (fallback)'
      })

      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select("id, status")
        .eq("business_id", business.id)
        .eq("caller_phone", normalizedCallerPhone)
        .maybeSingle()

      if (leadError && leadError.code !== 'PGRST116') { // Not found error
        console.error('[Twilio Voice Status Webhook] Error finding existing lead:', leadError)

        logCallTrace({
          route: 'voice-status',
          action: 'lead_lookup_failed',
          callSid: CallSid,
          from: From,
          to: To,
          businessId: business.id,
          businessName: business.name,
          reason: `Error finding existing lead: ${leadError}`
        })
      } else {
        existingLead = leadData
        console.log('[Twilio Voice Status Webhook] Existing lead lookup result:', existingLead ? {
          id: existingLead.id,
          status: existingLead.status,
          found: true
        } : {
          found: false
        })

        console.log('[VOICE STATUS LEAD LOOKUP]', {
          leadId: existingLead?.id || null,
          existingOrCreated: existingLead ? 'existing' : 'created'
        })

        if (existingLead) {
          logCallTrace({
            route: 'voice-status',
            action: 'lead_lookup_success',
            callSid: CallSid,
            from: From,
            to: To,
            businessId: business.id,
            businessName: business.name,
            leadId: existingLead.id,
            existingOrCreated: 'existing',
            reason: 'Found existing lead by phone'
          })
        }
      }
    } catch (leadLookupError) {
      console.error('[Twilio Voice Status Webhook] Exception during lead lookup:', leadLookupError)

      logCallTrace({
        route: 'voice-status',
        action: 'lead_lookup_failed',
        callSid: CallSid,
        from: From,
        to: To,
        businessId: business.id,
        businessName: business.name,
        reason: `Exception during lead lookup: ${leadLookupError}`
      })
    }

    if (existingLead) {
      // Use existing lead
      lead = existingLead
      console.log("[Twilio Voice Status Webhook] Using existing lead:", lead.id)
    } else {
      // CRITICAL FIX: Do NOT create leads from status callbacks
      // Status callbacks are for updating existing call events, not creating new leads
      // Only the voice webhook should create leads when a call actually arrives
      console.error('[PHANTOM LEAD PREVENTED] voice-status webhook attempting to create lead without existing lead')
      console.error('[PHANTOM LEAD PREVENTED]', {
        callSid: CallSid,
        businessId: business.id,
        callerPhone: normalizedCallerPhone,
        callStatus: CallStatus,
        reason: 'voice-status webhook cannot create leads - only the voice webhook can create leads for actual calls'
      })

      console.log('[VOICE STATUS EARLY RETURN] =========================================');
      console.log('[VOICE STATUS EARLY RETURN] reason: phantom lead prevention');
      console.log('[VOICE STATUS EARLY RETURN] callSid:', CallSid);
      console.log('[VOICE STATUS EARLY RETURN] businessId:', business.id);
      console.log('[VOICE STATUS EARLY RETURN] Timestamp:', new Date().toISOString());
      console.log('[VOICE STATUS EARLY RETURN] =========================================');

      logCallTrace({
        route: 'voice-status',
        action: 'lead_creation_blocked',
        callSid: CallSid,
        from: From,
        to: To,
        businessId: business.id,
        businessName: business.name,
        reason: 'voice-status webhook blocked from creating new lead - status callbacks cannot create leads'
      })

      // Return early without creating lead - this prevents phantom leads
      return { success: false, reason: 'phantom_lead_prevention' };
    }
  }

  // If we still don't have a lead, continue with processing but log the issue
  if (!lead) {
    console.error('[Twilio Voice Status Webhook] No lead available after creation attempt')
    // Continue with processing - don't return early
  } else {
    console.log("[Twilio Voice Status Webhook] Lead id for processing:", lead.id)
  }

  // Use conversation from AI call record if available, otherwise use canonical conversationId
  let conversation = null
  let conversationWasCreated = false

  // For AI calls, use the conversation_id from the AI call record
  if (aiCallRecord && aiCallRecord.conversation_id) {
    console.log('[VOICE STATUS USING AI CONVERSATION]', {
      aiConversationId: aiCallRecord.conversation_id,
      aiLeadId: aiCallRecord.lead_id,
      callSid: CallSid,
      businessId: business.id
    })

    conversation = { id: aiCallRecord.conversation_id } as any
    conversationWasCreated = false
  } else if (canonicalConversationId) {
    console.log('[VOICE STATUS USING CANONICAL CONVERSATION]', {
      canonicalConversationId: canonicalConversationId,
      leadId: lead?.id,
      businessId: business.id,
      callSid: CallSid
    })

    conversation = { id: canonicalConversationId } as any
    conversationWasCreated = false
  } else {
    console.error('[VOICE STATUS NO CONVERSATION]', {
      callSid: CallSid,
      leadId: lead?.id,
      businessId: business.id,
      aiCallRecord: !!aiCallRecord,
      aiCallRecordConversationId: aiCallRecord?.conversation_id,
      canonicalConversationId: canonicalConversationId
    })
  }

  // Update or create call event linked to conversation
  if (conversation) {
    const callSid = params.CallSid
    console.log(`[voice-status] Looking for existing call event with CallSid: ${callSid}`)

    // First try to find existing call event
    const { data: existingCallEvent } = await supabase
      .from('call_events')
      .select('id')
      .eq('twilio_call_sid', callSid)
      .maybeSingle()

    if (existingCallEvent) {
      // Update existing call event with conversation_id and latest status
      console.log(`[call_events] Updating existing call event: ${existingCallEvent.id}`)
      const { error: updateError } = await supabase
        .from('call_events')
        .update({
          conversation_id: conversation.id,
          call_status: CallStatus || 'unknown',
          raw_payload: Object.fromEntries(Object.entries(params)),
        })
        .eq('id', existingCallEvent.id)

      if (updateError) {
        console.error('[call_events] Failed to update call event:', updateError)
      } else {
        console.log(`[call_events] Updated call status to: ${CallStatus || 'unknown'}`)
      }
    } else {
      // Create new call event (should only happen if voice webhook didn't create one)
      console.log(`[call_events] Creating new call event for conversation: ${conversation.id}`)
      const callEvent = await db.createCallEventWithConversation({
        business_id: business.id,
        conversation_id: conversation.id,
        caller_phone: normalizedCallerPhone,
        call_status: CallStatus || 'unknown',
        twilio_call_sid: callSid,
        raw_payload: Object.fromEntries(Object.entries(params)),
        created_at: new Date().toISOString(),
      })

      if (!callEvent) {
        console.error('[voice-status] Failed to save call event')
      } else {
        console.log(`[call_events] Created call event: ${callEvent.id}`)
      }
    }
  } else {
    console.error('[voice-status] No conversation available for call event')
    console.error('[voice-status] Early return: no conversation for call event')
    return { success: false, reason: 'no_conversation' };
  }

  let autoReplySent = false

  // TRANSCRIPT SPAM FILTERING: Check for automated robocall transcripts before SMS dispatch
  let isTranscriptSpam = false
  let transcriptSpamReason = ''
  let transcriptSpamMatchedPhrases: string[] = []

  if (aiCallRecord && (aiCallRecord.extracted_info || aiCallRecord.summary)) {
    // Extract transcript from AI call record
    const extractedInfo = aiCallRecord.extracted_info || {}
    const summary = aiCallRecord.summary || ''
    
    // Build combined transcript from available sources
    const transcriptParts: string[] = []
    
    // Check for transcript in extracted_info
    if (extractedInfo.rawTranscript) {
      transcriptParts.push(extractedInfo.rawTranscript)
    }
    if (extractedInfo.capturedAnswer) {
      transcriptParts.push(extractedInfo.capturedAnswer)
    }
    if (extractedInfo.transcript) {
      transcriptParts.push(extractedInfo.transcript)
    }
    
    // Add summary if available
    if (summary) {
      transcriptParts.push(summary)
    }
    
    const combinedTranscript = transcriptParts.join(' ')
    
    if (combinedTranscript) {
      console.log('[TRANSCRIPT SPAM FILTER] Checking transcript for automated robocall patterns', {
        callSid: CallSid,
        transcriptLength: combinedTranscript.length,
        transcriptPreview: combinedTranscript.substring(0, 200)
      })
      
      const spamResult = isAutomatedTranscriptSpam(combinedTranscript)
      
      if (spamResult.isSpam) {
        isTranscriptSpam = true
        transcriptSpamReason = spamResult.reason || 'automated_prompt'
        transcriptSpamMatchedPhrases = spamResult.matchedPhrases || []
        
        console.log('[TRANSCRIPT SPAM FILTER] ==========================================')
        console.log('[TRANSCRIPT SPAM FILTER] callSid=', CallSid)
        console.log('[TRANSCRIPT SPAM FILTER] caller=', From)
        console.log('[TRANSCRIPT SPAM FILTER] isSpam=true')
        console.log('[TRANSCRIPT SPAM FILTER] reason=', transcriptSpamReason)
        console.log('[TRANSCRIPT SPAM FILTER] matchedPhrases=', transcriptSpamMatchedPhrases)
        console.log('[TRANSCRIPT SPAM FILTER] action=suppressed_lead_sms_followups')
        console.log('[TRANSCRIPT SPAM FILTER] ==========================================')
        
        // Mark lead as ignored/spam using raw_metadata flags
        if (lead) {
          try {
            const { error: updateError } = await supabase
              .from('leads')
              .update({
                status: 'ignored',
                raw_metadata: {
                  ...((lead as any).raw_metadata || {}),
                  ai_intake_ignored: true,
                  ignored_reason: 'automated_transcript',
                  automated_spam_detected: true,
                  automated_spam_matched_phrases: transcriptSpamMatchedPhrases,
                  automated_spam_reason: transcriptSpamReason,
                  automated_spam_detected_at: new Date().toISOString()
                }
              })
              .eq('id', lead.id)
            
            if (updateError) {
              console.error('[TRANSCRIPT SPAM FILTER] Failed to mark lead as ignored:', updateError)
            } else {
              console.log('[TRANSCRIPT SPAM FILTER] Successfully marked lead as ignored:', lead.id)
            }
          } catch (updateException) {
            console.error('[TRANSCRIPT SPAM FILTER] Exception marking lead as ignored:', updateException)
          }
        }
        
        // Update AI call record with spam detection
        if (aiCallRecord) {
          try {
            const { error: aiUpdateError } = await supabase
              .from('ai_call_records')
              .update({
                raw_metadata: {
                  ...((aiCallRecord as any).raw_metadata || {}),
                  automated_spam_detected: true,
                  automated_spam_reason: transcriptSpamReason,
                  automated_spam_matched_phrases: transcriptSpamMatchedPhrases
                }
              })
              .eq('id', aiCallRecord.id)
            
            if (aiUpdateError) {
              console.error('[TRANSCRIPT SPAM FILTER] Failed to update ai_call_record:', aiUpdateError)
            } else {
              console.log('[TRANSCRIPT SPAM FILTER] Successfully updated ai_call_record')
            }
          } catch (aiUpdateException) {
            console.error('[TRANSCRIPT SPAM FILTER] Exception updating ai_call_record:', aiUpdateException)
          }
        }
      } else {
        console.log('[TRANSCRIPT SPAM FILTER] Transcript does not contain automated robocall patterns')
      }
    }
  }

  // SMS DISPATCH CODE PATH OWNERSHIP:
  // - ALL automatic customer SMS messages are sent from this voice-status webhook after the call ends
  // - This is the centralized post-call dispatch point for complete, incomplete, and failed AI intakes
  // - Complete AI intake: sends summary with all captured fields
  // - Incomplete AI intake: sends summary with partial captured fields (missing fields show "Not collected")
  // - Immediate hangup/no info: sends summary-style SMS with mostly "Not collected" fields
  // - Idempotency guard (hasAutomaticSmsForCall) prevents duplicate SMS from retry/close/status callbacks
  //
  // The AI voice service does NOT send SMS - it only handles the call and persists data.
  // SMS timing is centralized here to ensure consistent behavior across all call outcomes.

  if (lead && conversation && From) {
    // Skip SMS if transcript spam was detected
    if (isTranscriptSpam) {
      console.log('[TRANSCRIPT SPAM FILTER] SMS dispatch skipped - automated robocall detected', {
        callSid: CallSid,
        leadId: lead.id,
        reason: transcriptSpamReason,
        matchedPhrases: transcriptSpamMatchedPhrases
      })
    } else {
      const dispatchResult = await dispatchAutomaticCustomerSms({
        trigger: 'call_finished',
        callSid: CallSid,
        businessId: business.id,
        leadId: lead.id,
        conversationId: conversation.id,
        callerPhone: From,
        businessName: business.name,
        extractedInfo: aiCallRecord?.extracted_info,
        aiOutcome: aiCallRecord?.outcome
      })

      autoReplySent = !!dispatchResult.twilioMessageSid

      console.log('[Twilio Voice Status Webhook] Automatic SMS dispatch result', {
        callSid: CallSid,
        leadId: lead.id,
        conversationId: conversation.id,
        success: dispatchResult.success,
        skipped: dispatchResult.skipped,
        reason: dispatchResult.reason,
        outcome: dispatchResult.outcome,
        template: dispatchResult.template,
        twilioMessageSid: dispatchResult.twilioMessageSid
      })
    }
  } else {
    console.log('[Twilio Voice Status Webhook] Automatic SMS dispatch skipped - missing required call context', {
      hasLead: !!lead,
      hasConversation: !!conversation,
      hasFrom: !!From,
      callSid: CallSid
    })
  }

  // ========================================
  // NEW FOLLOW-UP JOB LOGIC (INDEPENDENT OF LEAD STATUS)
  // ========================================

  console.log('[VOICE STATUS COMPLETED BRANCH] =========================================');
  console.log('[VOICE STATUS COMPLETED BRANCH] Entering follow-up creation logic');
  console.log('[VOICE STATUS COMPLETED BRANCH] leadId:', lead?.id);
  console.log('[VOICE STATUS COMPLETED BRANCH] conversationId:', conversation?.id);
  console.log('[VOICE STATUS COMPLETED BRANCH] aiCallRecord:', !!aiCallRecord);
  console.log('[VOICE STATUS COMPLETED BRANCH] aiOutcome:', aiCallRecord?.outcome);
  console.log('[VOICE STATUS COMPLETED BRANCH] Timestamp:', new Date().toISOString());
  console.log('[VOICE STATUS COMPLETED BRANCH] =========================================');

  let hasPendingJob = false
  let jobsCreated: any[] = []

  // Guard: ensure lead.id exists before creating follow-up jobs
  if (!lead?.id) {
    console.error("[Twilio Voice Status Webhook] No valid lead id, skipping follow-up creation");
    // Continue to final summary instead of returning early
  } else if (isTranscriptSpam) {
    // Skip follow-up creation for automated robocall transcripts
    console.log('[TRANSCRIPT SPAM FILTER] Follow-up creation skipped - automated robocall detected', {
      callSid: CallSid,
      leadId: lead.id,
      reason: transcriptSpamReason,
      matchedPhrases: transcriptSpamMatchedPhrases
    })
  } else {
    // Check lead status before creating follow-up jobs
    // Only create follow-ups for new or active leads
    const currentStatus = (lead as any).status || (lead as any).lead_status || 'new'
    const shouldCreateFollowUp = currentStatus === 'new' || currentStatus === 'active'

    console.log(`[Twilio Voice Status Webhook] Lead status: ${currentStatus}, should create follow-up: ${shouldCreateFollowUp}`)

    if (!shouldCreateFollowUp) {
      console.log(`[Twilio Voice Status Webhook] Skipping follow-up creation for lead with status: ${currentStatus}`)
    } else if (conversation) {
      console.log(`[Twilio Voice Status Webhook] Attempting follow-up job creation for conversation: ${conversation.id}`)

      try {
        // Check for existing pending follow-up job to prevent duplicates
        const { data: existingJob } = await supabase
          .from('follow_up_jobs')
          .select('id')
          .eq('lead_id', lead.id)
          .eq('status', 'pending')
          .maybeSingle()

        if (existingJob) {
          console.log(`[followups] Pending follow-up job already exists for lead: ${lead.id}`)
          hasPendingJob = true
        } else {
          console.log('[followups] No pending follow-up jobs found, creating new jobs')
        }
      } catch (existingJobError) {
        console.error('[followups] Error checking for existing follow-up jobs:', existingJobError)
      }

      if (!hasPendingJob) {
        console.log('[Twilio Voice Status Webhook] Attempting follow-up job creation', {
          route: '/api/twilio/voice-status',
          aiCallRecord: !!aiCallRecord,
          aiCallRecordId: aiCallRecord?.id,
          aiOutcome: aiCallRecord?.outcome,
          leadId: lead.id,
          callSid: CallSid
        })

        // Suppress follow-up creation for completed AI intake calls
        // Check for both 'completed_intake' (from outcome classifier) and 'completed' (legacy/compatibility)
        if (aiCallRecord && (aiCallRecord.outcome === 'completed_intake' || aiCallRecord.outcome === 'completed')) {
          console.log('[FOLLOWUP SKIP REASON] =========================================');
          console.log('[FOLLOWUP SKIP REASON] businessId:', business.id);
          console.log('[FOLLOWUP SKIP REASON] leadId:', lead.id);
          console.log('[FOLLOWUP SKIP REASON] reason: ai_intake_completed');
          console.log('[FOLLOWUP SKIP REASON] aiCallRecordId:', aiCallRecord.id);
          console.log('[FOLLOWUP SKIP REASON] Timestamp:', new Date().toISOString());
          console.log('[FOLLOWUP SKIP REASON] =========================================');
          jobsCreated = []
          hasPendingJob = false

          // Optional cleanup: cancel any pending follow-up jobs that may have been created earlier
          try {
            const { data: pendingJobs, error: pendingJobsError } = await supabase
              .from('follow_up_jobs')
              .select('id')
              .eq('lead_id', lead.id)
              .eq('status', 'pending')

            if (pendingJobsError) {
              console.error('[AI FOLLOWUPS CLEANUP] Error fetching pending jobs:', pendingJobsError)
            } else if (pendingJobs && pendingJobs.length > 0) {
              const jobIds = pendingJobs.map(j => j.id)
              const { error: cancelError } = await supabase
                .from('follow_up_jobs')
                .update({
                  status: 'cancelled',
                  cancelled_reason: 'ai_intake_completed',
                  cancelled_at: new Date().toISOString()
                })
                .in('id', jobIds)

              if (cancelError) {
                console.error('[AI FOLLOWUPS CLEANUP] Error cancelling pending jobs:', cancelError)
              } else {
                console.log('[AI FOLLOWUPS CLEANUP] Cancelled pending jobs for completed AI intake:', {
                  leadId: lead.id,
                  jobCount: jobIds.length,
                  jobIds
                })
              }
            }
          } catch (cleanupError) {
            console.error('[AI FOLLOWUPS CLEANUP] Exception during cleanup:', cleanupError)
          }
        } else {
          console.log('[FOLLOWUP CREATE CHECK] =========================================');
          console.log('[FOLLOWUP CREATE CHECK] route: voice-status');
          console.log('[FOLLOWUP CREATE CHECK] businessId:', business.id);
          console.log('[FOLLOWUP CREATE CHECK] leadId:', lead.id);
          console.log('[FOLLOWUP CREATE CHECK] conversationId:', conversation.id);
          console.log('[FOLLOWUP CREATE CHECK] aiCallRecord:', !!aiCallRecord);
          console.log('[FOLLOWUP CREATE CHECK] aiOutcome:', aiCallRecord?.outcome);
          console.log('[FOLLOWUP CREATE CHECK] Timestamp:', new Date().toISOString());
          console.log('[FOLLOWUP CREATE CHECK] =========================================');
          // Use centralized createFollowUpJobs function to respect business settings
          try {
            const jobs = await createFollowUpJobs({
              businessId: business.id,
              leadId: lead.id,
              conversationId: conversation.id,
              businessName: business.name
            })

            jobsCreated = jobs

            console.log(`[followups] Created ${jobs.length} follow-up jobs for lead: ${lead.id}`)
            console.log('[VOICE STATUS FOLLOWUP CREATE]', {
              conversationId: conversation.id,
              leadId: lead.id,
              jobCount: jobs.length
            })
          } catch (followUpError) {
            console.error('[followups] Failed to create follow-up jobs:', followUpError)
          }
        }
      } else {
        console.log(`[followups] Follow-ups already exist for lead: ${lead.id}`)
      }
    }
  }

  // Update conversation activity if outbound message was sent
  if (autoReplySent && conversation) {
    console.log(`[Twilio Voice Status Webhook] Updating conversation activity after outbound message`)
    try {
      await db.updateConversation(conversation.id, {
        last_activity_at: new Date().toISOString(),
      })
    } catch (conversationUpdateError) {
      console.error('[Twilio Voice Status Webhook] Error updating conversation activity:', conversationUpdateError)
    }
  }

  // Final summary log
  console.log(`[Twilio Voice Status Webhook] === PROCESSING COMPLETE ===`)
  console.log(`[Twilio Voice Status Webhook] Summary:`, {
    lead_id: lead?.id,
    conversation_created: conversationWasCreated,
    conversation_id: conversation?.id,
    auto_reply_sent: autoReplySent,
    follow_up_job_created: jobsCreated.length > 0,
    follow_up_jobs_created_count: jobsCreated.length,
    business_id: business.id,
    caller_phone: normalizedCallerPhone,
    call_status: CallStatus,
    call_sid: CallSid,
    duration: Duration
  })

  console.log('[VOICE STATUS PROCESS COMPLETE] =========================================');
  console.log('[VOICE STATUS PROCESS COMPLETE] method:', method);
  console.log('[VOICE STATUS PROCESS COMPLETE] leadId:', lead?.id);
  console.log('[VOICE STATUS PROCESS COMPLETE] jobsCreated:', jobsCreated.length);
  console.log('[VOICE STATUS PROCESS COMPLETE] Timestamp:', new Date().toISOString());
  console.log('[VOICE STATUS PROCESS COMPLETE] =========================================');

  return {
    success: true,
    leadId: lead?.id,
    conversationId: conversation?.id,
    jobsCreated: jobsCreated.length,
    autoReplySent
  };
}

export async function POST(req: NextRequest) {
  console.log('[VOICE STATUS POST RECEIVED] =========================================');
  console.log('[VOICE STATUS POST RECEIVED] method: POST');
  console.log('[VOICE STATUS POST RECEIVED] url:', req.url);
  console.log('[VOICE STATUS POST RECEIVED] timestamp:', new Date().toISOString());
  console.log('[VOICE STATUS POST RECEIVED] =========================================');

  try {
    // Read raw body exactly once for validation
    const rawBody = await req.text();
    const contentType = req.headers.get('content-type') || '';

    console.log('[VOICE STATUS BODY PARSED] =========================================');
    console.log('[VOICE STATUS BODY PARSED] bodyLength:', rawBody.length);
    console.log('[VOICE STATUS BODY PARSED] contentType:', contentType);
    console.log('[VOICE STATUS BODY PARSED] timestamp:', new Date().toISOString());
    console.log('[VOICE STATUS BODY PARSED] =========================================');

    // Parse body into params using URLSearchParams
    const params = Object.fromEntries(new URLSearchParams(rawBody));

    console.log('[VOICE STATUS VALIDATION START] =========================================');
    console.log('[VOICE STATUS VALIDATION START] CallSid:', params.CallSid);
    console.log('[VOICE STATUS VALIDATION START] timestamp:', new Date().toISOString());
    console.log('[VOICE STATUS VALIDATION START] =========================================');

    // Validate Twilio signature with params object
    const isValid = requireTwilioAuth(req, params, rawBody.length, contentType);

    console.log('[VOICE STATUS VALIDATION PASSED] =========================================');
    console.log('[VOICE STATUS VALIDATION PASSED] isValid:', isValid);
    console.log('[VOICE STATUS VALIDATION PASSED] timestamp:', new Date().toISOString());
    console.log('[VOICE STATUS VALIDATION PASSED] =========================================');

    if (!isValid) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Call shared processing function with request URL for personal voicemail detection
    await processVoiceStatusCallback(params, 'POST', req.url);

    return new Response("OK", { status: 200 });

  } catch (error) {
    console.error('[Twilio Voice Status Webhook] Error:', error)
    // Always return 200 to Twilio even on error to prevent webhook retries
    return new Response("OK", { status: 200 })
  }
}

// GET handler - support Twilio calling with GET method
export async function GET(req: NextRequest) {
  console.log('[VOICE STATUS WEBHOOK GET] Handling GET request');
  console.log('[VOICE STATUS WEBHOOK GET KEY PARAMS]', {
    method: 'GET',
    url: req.url
  });

  // Extract params from query string
  const url = new URL(req.url);
  const params = Object.fromEntries(url.searchParams.entries());

  console.log('[VOICE STATUS WEBHOOK GET] Params:', {
    CallSid: params.CallSid || 'not_present',
    From: params.From || 'not_present',
    To: params.To || 'not_present',
    CallStatus: params.CallStatus || 'not_present'
  });

  // For actual callback GETs with CallSid and CallStatus, validate signature before processing.
  // For simple health/debug GETs without these params, return OK.
  if (params.CallSid && params.CallStatus) {
    const isValid = requireTwilioAuth(req, params, 0, 'querystring');

    if (!isValid) {
      console.error('[VOICE STATUS WEBHOOK GET] Invalid Twilio signature');
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('[VOICE STATUS WEBHOOK GET] Processing callback with shared function');
    await processVoiceStatusCallback(params, 'GET', req.url);
  } else {
    console.log('[VOICE STATUS WEBHOOK GET] Returning OK for non-callback GET request');
  }

  return new Response("OK", { status: 200 });
}
