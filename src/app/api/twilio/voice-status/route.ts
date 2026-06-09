import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase/admin'
import { sendSms, normalizePhoneNumber } from '@/lib/twilio'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { checkVoiceStatusRateLimit } from '@/lib/rate-limit'
import { isIgnoredContact } from '@/lib/ignored-contacts'
import { createFollowUpJobs } from '@/lib/follow-ups'
import { normalizeExtractedInfo } from '@/lib/ai-field-mapping'

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

export async function POST(req: NextRequest) {
  console.log('[ROUTE HIT - TWILIO VOICE-STATUS]')
  
  try {
    // Read raw body exactly once for validation
    const rawBody = await req.text();
    const contentType = req.headers.get('content-type') || '';
    
    // Parse body into params using URLSearchParams
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    
    // Validate Twilio signature with params object
    const isValid = requireTwilioAuth(req, params, rawBody.length, contentType);
    if (!isValid) {
      return new Response('Unauthorized', { status: 401 });
    }
    
    const CallSid = params.CallSid
    
    // Rate limiting check (CallSid-based to allow Twilio retries)
    const rateLimitResult = await checkVoiceStatusRateLimit(CallSid);
    if (!rateLimitResult.success) {
      console.warn('[Voice Status] Rate limit exceeded for CallSid:', CallSid);
      return new Response('OK', { 
        status: 200,
        headers: {
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        }
      })
    }
    
    // Create fresh Supabase client for this request
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const From = params.From
    const To = params.To
    const CallStatus = params.CallStatus
    const Duration = params.Duration
    const Direction = params.Direction
    
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
    const retryDelays = [0, 1000, 2000, 3000]

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
        .select('id, lead_id, conversation_id, caller_phone, call_sid, outcome, extracted_info, summary')
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
      console.error('[voice-status] Missing required fields:', { From, To })
      console.error('[voice-status] Early return: missing required fields')
      return new Response("OK", { status: 200 })
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
      const { data: businessData } = await supabase
        .from('businesses')
        .select('*')
        .eq('twilio_phone_number', normalizedTo)
        .single()
      
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
      console.error('[Twilio Voice Status Webhook] No business match found for phone:', normalizedTo)
      console.error('[Twilio Voice Status Webhook] Early return: no business matched')
      return new Response("OK", { status: 200 })
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
    
    // Store canonical conversationId from helper
    let canonicalConversationId: string | null = null
    
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
        reason: 'Looking up existing lead by caller phone'
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
            reason: 'Found existing lead'
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

    let lead = null

    if (existingLead) {
      // Use existing lead
      lead = existingLead
      console.log("[Twilio Voice Status Webhook] Using existing lead:", lead.id)
    } else {
      // Check if caller is in ignored contacts before creating lead
      console.log('[IGNORED CONTACT CHECK VOICE-STATUS]', {
        businessId: business.id,
        callerPhone: normalizedCallerPhone,
        timestamp: new Date().toISOString()
      })
      
      const isIgnored = await isIgnoredContact(business.id, normalizedCallerPhone)
      
      if (isIgnored) {
        console.log('[IGNORED CONTACT BLOCKED DB WRITE]', {
          businessId: business.id,
          phoneNumber: normalizedCallerPhone,
          source: 'voice-status',
          timestamp: new Date().toISOString()
        })
        
        // Return success without creating lead or any other database writes
        return new Response("OK", { status: 200 })
      }
      
      // Insert new lead with safe error handling - use shared helper for canonical records
      console.log(`[Twilio Voice Status Webhook] Using shared helper for canonical lead/conversation`)
      console.log('[DB WRITE ATTEMPT - LEADS]', {
        route: '/api/twilio/voice-status',
        businessId: business.id,
        fromPhone: normalizedCallerPhone,
        toPhone: normalizedTo,
        callSid: CallSid,
        timestamp: new Date().toISOString()
      })
      
      logCallTrace({
        route: 'voice-status',
        action: 'call_intake_start',
        callSid: CallSid,
        from: From,
        to: To,
        businessId: business.id,
        businessName: business.name,
        reason: 'Getting/creating canonical lead and conversation for voice-status webhook'
      })
      
      try {
        const intakeRecords = await db.getOrCreateCallIntakeRecords({
          callSid: CallSid,
          businessId: business.id,
          callerPhone: normalizedCallerPhone,
          to: To
        })
        
        if (!intakeRecords.leadId || !intakeRecords.conversationId) {
          console.error("[Twilio Voice Status Webhook] Failed to get or create intake records")
          
          logCallTrace({
            route: 'voice-status',
            action: 'call_intake_failed',
            callSid: CallSid,
            from: From,
            to: To,
            businessId: business.id,
            businessName: business.name,
            reason: 'Failed to get or create intake records'
          })
        } else {
          console.log('[Twilio Voice Status Webhook] Intake records obtained:', {
            leadId: intakeRecords.leadId,
            conversationId: intakeRecords.conversationId,
            isNew: intakeRecords.isNew
          })
          
          logCallTrace({
            route: 'voice-status',
            action: 'call_intake_success',
            callSid: CallSid,
            from: From,
            to: To,
            businessId: business.id,
            businessName: business.name,
            leadId: intakeRecords.leadId,
            conversationId: intakeRecords.conversationId,
            existingOrCreated: intakeRecords.isNew ? 'created' : 'existing',
            reason: 'Successfully obtained canonical lead and conversation'
          })
          
          lead = { id: intakeRecords.leadId, status: 'new' } as any
          canonicalConversationId = intakeRecords.conversationId
        }
      } catch (intakeError) {
        console.error("[Twilio Voice Status Webhook] Exception during intake:", intakeError)
        
        logCallTrace({
          route: 'voice-status',
          action: 'call_intake_failed',
          callSid: CallSid,
          from: From,
          to: To,
          businessId: business.id,
          businessName: business.name,
          reason: `Exception during intake: ${intakeError}`
        })
      }
    }

    // If we still don't have a lead, continue with processing but log the issue
    if (!lead) {
      console.error('[Twilio Voice Status Webhook] No lead available after creation attempt')
      // Continue with processing - don't return early
    } else {
      console.log("[Twilio Voice Status Webhook] Lead id for processing:", lead.id)
    }
    
    // Use canonical conversationId from helper - NO legacy conversation lookup/create
    let conversation = null
    let conversationWasCreated = false
    
    if (canonicalConversationId) {
      console.log('[VOICE STATUS USING CANONICAL CONVERSATION]', {
        canonicalConversationId: canonicalConversationId,
        leadId: lead?.id,
        businessId: business.id,
        callSid: CallSid
      })
      
      conversation = { id: canonicalConversationId } as any
      conversationWasCreated = false
    } else {
      console.error('[VOICE STATUS NO CANONICAL CONVERSATION]', {
        callSid: CallSid,
        leadId: lead?.id,
        businessId: business.id
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
      return new Response("OK", { status: 200 })
    }
    
    // Check for recent outbound messages to avoid spam
    let hasRecentOutbound = false
    if (lead) {
      try {
        hasRecentOutbound = await db.hasRecentOutboundMessage(lead.id, 10)
        console.log(`[Twilio Voice Status Webhook] Lead ID: ${lead.id}`)
        console.log(`[Twilio Voice Status Webhook] Recent outbound message found (last 10 min): ${hasRecentOutbound}`)
      } catch (recentOutboundError) {
        console.error('[Twilio Voice Status Webhook] Error checking recent outbound messages:', recentOutboundError)
        hasRecentOutbound = false // Default to no recent outbound on error
      }
    } else {
      console.log('[Twilio Voice Status Webhook] No lead available for recent outbound check')
    }
    
    let autoReplySent = false
    let messageSid = null
    
    // Send auto-reply SMS if no recent outbound message exists and we have a lead
    if (!hasRecentOutbound && lead) {
      console.log(`[Twilio Voice Status Webhook] Auto-reply send attempt - no recent outbound found`)

      console.log('[STANDARD SMS DECISION]', {
        callSid: CallSid,
        leadId: lead?.id,
        conversationId: conversation?.id,
        aiCallRecordExists: !!aiCallRecord,
        aiCallRecordOutcome: aiCallRecord?.outcome,
        hasRecentOutbound,
        leadExists: !!lead
      })

      // Log SMS path based on AI call record
      if (aiCallRecord) {
        console.log('[SMS PATH AI SUMMARY]', {
          callSid: CallSid,
          aiCallRecordId: aiCallRecord.id,
          leadId: lead.id,
          reason: 'AI call record found, sending AI summary SMS'
        })
      } else {
        console.log('[SMS PATH MISSED CALL]', {
          callSid: CallSid,
          leadId: lead.id,
          reason: 'No AI call record, sending missed-call SMS'
        })
      }
      
      // Business hours check
      const businessHoursEnabled = business.business_hours_enabled || false
      const businessHoursStart = business.business_hours_start || '09:00'
      const businessHoursEnd = business.business_hours_end || '17:00'
      const businessTimezone = business.business_hours_timezone || 'America/New_York'
      const afterHoursMessage = business.after_hours_message || ''
      
      let withinBusinessHours = true
      let nowLocal = ''
      let dayOfWeek = ''
      
      if (businessHoursEnabled) {
        // Get current time in business timezone
        const now = new Date()
        const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: businessTimezone }))
        
        nowLocal = nowInTimezone.toISOString()
        dayOfWeek = nowInTimezone.toLocaleDateString('en-US', { weekday: 'long' })
        
        // Parse business hours (format: "HH:MM")
        const [startHour, startMin] = businessHoursStart.split(':').map(Number)
        const [endHour, endMin] = businessHoursEnd.split(':').map(Number)
        
        const currentHour = nowInTimezone.getHours()
        const currentMin = nowInTimezone.getMinutes()
        const currentTimeInMinutes = currentHour * 60 + currentMin
        const startTimeInMinutes = startHour * 60 + startMin
        const endTimeInMinutes = endHour * 60 + endMin
        
        // Check if current time is within business hours (Monday-Friday only)
        const dayIndex = nowInTimezone.getDay() // 0 = Sunday, 6 = Saturday
        const isWeekday = dayIndex >= 1 && dayIndex <= 5
        
        withinBusinessHours = isWeekday && currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes
        
        console.log('[BUSINESS HOURS CHECK]', {
          businessId: business.id,
          timezone: businessTimezone,
          openTime: businessHoursStart,
          closeTime: businessHoursEnd,
          nowLocal,
          dayOfWeek,
          businessHoursEnabled,
          withinBusinessHours,
          isWeekday,
          currentTimeInMinutes,
          startTimeInMinutes,
          endTimeInMinutes
        })
      } else {
        console.log('[BUSINESS HOURS CHECK]', {
          businessId: business.id,
          businessHoursEnabled,
          withinBusinessHours: true,
          reason: 'Business hours disabled'
        })
      }
      
      // Select message based on call type (AI completed vs missed call) and business hours
      let autoReplyMessage
      let messageTemplate = 'unknown'

      // Check if AI completed intake - Fly.io service handles AI confirmation SMS via /api/ai-confirmation-sms
      // Skip sending duplicate SMS from voice-status webhook
      if (aiCallRecord && aiCallRecord.outcome === 'completed') {
        console.log('[AI SUMMARY SMS SKIPPED]', {
          aiCallRecordId: aiCallRecord.id,
          reason: 'Fly.io AI voice service handles AI confirmation SMS via /api/ai-confirmation-sms'
        })
        autoReplyMessage = null
        messageTemplate = 'ai_intake_skipped'
      } else if (businessHoursEnabled && !withinBusinessHours && afterHoursMessage) {
        autoReplyMessage = afterHoursMessage
        messageTemplate = 'after_hours'
        console.log('[AFTER HOURS MESSAGE SELECTED]', {
          template: messageTemplate,
          businessId: business.id,
          messageBody: autoReplyMessage
        })
      } else {
        autoReplyMessage = business.auto_reply_message ||
          `Hi, this is {{business_name}}. Sorry we missed your call-how can we help? Reply STOP to opt out.`
        messageTemplate = 'missed_call'
        console.log('[NORMAL MISSED CALL MESSAGE SELECTED]', {
          template: messageTemplate,
          businessId: business.id,
          messageBody: autoReplyMessage
        })
      }
      
      // Substitute {{business_name}} token with actual business name for both normal and after-hours messages
      const personalizedMessage = autoReplyMessage ? autoReplyMessage.replace('{{business_name}}', business.name || 'My Business') : null

      console.log(`[Twilio Voice Status Webhook] Auto-reply message: ${personalizedMessage}`)
      console.log(`[Twilio Voice Status Webhook] Business phone: ${business.twilio_phone_number}`)
      console.log(`[Twilio Voice Status Webhook] Business has messaging_service_sid: ${!!business.twilio_messaging_service_sid}`)

      // Skip SMS send if autoReplyMessage is null (AI completed intake - handled by Fly.io service)
      if (!autoReplyMessage) {
        console.log('[SMS SEND SKIPPED]', {
          reason: 'autoReplyMessage is null (AI completed intake handled by Fly.io service)',
          messageTemplate
        })
      } else {
        try {
          console.log('[SMS SEND ATTEMPT]', {
            route: '/api/twilio/voice-status',
            businessId: business.id,
            fromPhone: From,
            toPhone: To,
            callSid: CallSid,
            messageBody: autoReplyMessage?.substring(0, 100) + '...',
            timestamp: new Date().toISOString()
          })

        if (messageTemplate === 'ai_intake_summary') {
          console.log('[AI SUMMARY SMS FINAL BODY]', {
            template: messageTemplate,
            businessId: business.id,
            aiCallRecordId: aiCallRecord?.id,
            leadId: lead.id,
            finalMessageBody: personalizedMessage
          })
        }

        // Final suppression check: Ensure no standard missed-call SMS is sent after AI intake completed
        // This check must be placed directly before sendSms() for the standard missed-call auto-reply
        if (messageTemplate === 'missed_call' || messageTemplate === 'after_hours') {
          console.log('[STANDARD SMS SUPPRESSION CHECK]', {
            callSid: CallSid,
            leadId: lead.id,
            conversationId: conversation?.id,
            messageTemplate
          })

          // Find AI call record by CallSid, lead_id, or conversation_id
          const { data: finalAiCheck } = await supabase
            .from('ai_call_records')
            .select('id, outcome, call_sid, lead_id, conversation_id')
            .or(`call_sid.eq.${CallSid},lead_id.eq.${lead.id},conversation_id.eq.${conversation?.id}`)
            .limit(1)
            .maybeSingle()

          if (finalAiCheck && finalAiCheck.outcome === 'completed') {
            console.log('[STANDARD SMS SUPPRESSED AI COMPLETED]', {
              callSid: CallSid,
              leadId: lead.id,
              conversationId: conversation?.id,
              aiCallRecordId: finalAiCheck.id,
              reason: 'ai_intake_completed'
            })
            autoReplyMessage = null
          }
        }

        messageSid = await sendSms(business, From, personalizedMessage, {
          lead_id: lead.id,
          conversation_id: conversation?.id,
        })

        if (messageSid) {
          console.log(`[Twilio Voice Status Webhook] Auto-reply SMS sent successfully - Twilio SID: ${messageSid}`)
          autoReplySent = true

          // Log AI summary SMS sent
          if (messageTemplate === 'ai_intake_summary') {
            console.log('[AI SUMMARY SMS SENT]', {
              template: messageTemplate,
              businessId: business.id,
              aiCallRecordId: aiCallRecord?.id,
              leadId: lead.id,
              twilioSid: messageSid
            })
          }
          console.log('[VOICE STATUS SMS SEND]', {
            conversationId: conversation?.id,
            leadId: lead.id
          })

          // TEST SETUP: Update test_sms_sent_at for businesses in test setup
          if (isTestSetup) {
            console.log('[TEST SETUP] Test SMS sent for business in test setup', {
              businessId: business.id
            })

            try {
              const { error: testSmsUpdateError } = await supabase
                .from('businesses')
                .update({
                  test_sms_sent_at: new Date().toISOString()
                })
                .eq('id', business.id)

              if (testSmsUpdateError) {
                console.error('[TEST SETUP] Failed to update test_sms_sent_at:', testSmsUpdateError)
              } else {
                console.log('[TEST SETUP] Successfully set test_sms_sent_at for business:', business.id)

                // TEST SETUP: Check if both test flags are set, then mark onboarding complete
                const { data: updatedBusiness } = await supabase
                  .from('businesses')
                  .select('test_call_received_at, test_sms_sent_at, call_forwarding_enabled')
                  .eq('id', business.id)
                  .single()

                if (updatedBusiness && 
                    updatedBusiness.test_call_received_at && 
                    updatedBusiness.test_sms_sent_at &&
                    updatedBusiness.call_forwarding_enabled) {
                  console.log('[TEST SETUP] Both test flags set, marking onboarding complete', {
                    businessId: business.id,
                    test_call_received_at: updatedBusiness.test_call_received_at,
                    test_sms_sent_at: updatedBusiness.test_sms_sent_at
                  })

                  try {
                    const { error: completeError } = await supabase
                      .from('businesses')
                      .update({
                        forwarding_verified: true,
                        forwarding_verified_at: new Date().toISOString(),
                        onboarding_status: 'completed',
                        setup_completed: true,
                        setup_completed_at: new Date().toISOString()
                      })
                      .eq('id', business.id)

                    if (completeError) {
                      console.error('[TEST SETUP] Failed to mark onboarding complete:', completeError)
                    } else {
                      console.log('[TEST SETUP] Successfully marked onboarding complete for business:', business.id)
                    }
                  } catch (completeException) {
                    console.error('[TEST SETUP] Exception marking onboarding complete:', completeException)
                  }
                }
              }
            } catch (testSmsUpdateException) {
              console.error('[TEST SETUP] Exception updating test_sms_sent_at:', testSmsUpdateException)
            }
          }

          // Update lead status to contacted after SMS sent
          try {
            const { error: updateError } = await supabase
              .from('leads')
              .update({ status: 'contacted' })
              .eq('id', lead.id)

            if (updateError) {
              console.error('[Twilio Voice Status Webhook] Failed to update lead status:', updateError)
            } else {
              console.log(`[Twilio Voice Status Webhook] Lead status updated to 'contacted': ${lead.id}`)
            }
          } catch (statusUpdateError) {
            console.error('[Twilio Voice Status Webhook] Exception updating lead status:', statusUpdateError)
          }
        } else {
          console.error('[Twilio Voice Status Webhook] Failed to send auto-reply SMS - no SID returned')
        }
      } catch (smsError) {
        console.error('[Twilio Voice Status Webhook] Exception during SMS send:', smsError)
      }
      }
    } else {
      if (hasRecentOutbound) {
        console.log(`[Twilio Voice Status Webhook] Auto-reply skipped - recent outbound message found for lead: ${lead?.id}`)
      } else if (!lead) {
        console.log(`[Twilio Voice Status Webhook] Auto-reply skipped - no lead available`)
      }
    }
    
    // ========================================
    // NEW FOLLOW-UP JOB LOGIC (INDEPENDENT OF LEAD STATUS)
    // ========================================

    let hasPendingJob = false
    let jobsCreated: any[] = []

    // Guard: ensure lead.id exists before creating follow-up jobs
    if (!lead?.id) {
      console.error("[Twilio Voice Status Webhook] No valid lead id, skipping follow-up creation");
      // Continue to final summary instead of returning early
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
            .limit(1)
            .single()

          hasPendingJob = !!existingJob
          console.log(`[Twilio Voice Status Webhook] Has existing pending follow-up job: ${hasPendingJob}`)

          if (!hasPendingJob) {
            console.log(`[followups] No existing follow-ups, scheduling follow-ups for lead: ${lead.id}`)

            console.log('[FOLLOWUP CREATION SOURCE]', {
              route: '/api/twilio/voice-status',
              businessId: business.id,
              leadId: lead.id,
              conversationId: conversation.id,
              callSid: CallSid,
              timestamp: new Date().toISOString()
            })

            console.log('[FOLLOWUP CREATION AI CHECK]', {
              route: '/api/twilio/voice-status',
              aiCallRecord: !!aiCallRecord,
              aiCallRecordId: aiCallRecord?.id,
              aiOutcome: aiCallRecord?.outcome,
              leadId: lead.id,
              callSid: CallSid
            })

            // Suppress follow-up creation for completed AI intake calls
            if (aiCallRecord && aiCallRecord.outcome === 'completed') {
              console.log('[AI FOLLOWUPS SUPPRESSED]', {
                reason: 'ai_intake_completed',
                callSid: CallSid,
                leadId: lead.id,
                conversationId: conversation.id,
                aiCallRecordId: aiCallRecord.id
              })
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
            } // Close else block for non-AI calls
          } else {
            console.log(`[followups] Follow-ups already exist for lead: ${lead.id}`)
          }
        } catch (followUpError) {
          console.error('[Twilio Voice Status Webhook] Error during follow-up job creation:', followUpError)
        }
      } else {
        console.error('[Twilio Voice Status Webhook] No conversation available for follow-up job creation')
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
    
    // Return 200 response quickly (Twilio requires this)
    return new Response("OK", { status: 200 })
    
  } catch (error) {
    console.error('[Twilio Voice Status Webhook] Error:', error)
    // Always return 200 to Twilio even on error to prevent webhook retries
    return new Response("OK", { status: 200 })
  }
}
