import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase/admin'
import { sendSms, normalizePhoneNumber } from '@/lib/twilio'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { checkVoiceStatusRateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
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
    } catch (businessError) {
      console.error('[Twilio Voice Status Webhook] Error looking up business:', businessError)
      business = null
    }
    
    if (!business) {
      console.error('[Twilio Voice Status Webhook] No business match found for phone:', normalizedTo)
      console.error('[Twilio Voice Status Webhook] Early return: no business matched')
      return new Response("OK", { status: 200 })
    }
    
    // Normalize customer phone number
    const normalizedCallerPhone = normalizePhoneNumber(From)
    console.log(`[Twilio Voice Status Webhook] Normalized caller phone: ${normalizedCallerPhone}`)
    
    // First try to find existing lead with safe error handling
    let existingLead = null
    try {
      const { data: leadData, error: leadError } = await supabase
        .from("leads")
        .select("id, status")
        .eq("business_id", business.id)
        .eq("caller_phone", normalizedCallerPhone)
        .maybeSingle()
      
      if (leadError && leadError.code !== 'PGRST116') { // Not found error
        console.error('[Twilio Voice Status Webhook] Error finding existing lead:', leadError)
      } else {
        existingLead = leadData
        console.log('[Twilio Voice Status Webhook] Existing lead lookup result:', existingLead ? {
          id: existingLead.id,
          status: existingLead.status,
          found: true
        } : {
          found: false
        })
      }
    } catch (leadLookupError) {
      console.error('[Twilio Voice Status Webhook] Exception during lead lookup:', leadLookupError)
    }

    let lead = null

    if (existingLead) {
      // Use existing lead
      lead = existingLead
      console.log("[Twilio Voice Status Webhook] Using existing lead:", lead.id)
    } else {
      // Insert new lead with safe error handling
      console.log(`[Twilio Voice Status Webhook] Creating new lead for business_id: ${business.id}, caller_phone: ${normalizedCallerPhone}`)
      
      try {
        const { data: newLead, error: leadInsertError } = await supabase
          .from("leads")
          .insert([{
            business_id: business.id,
            caller_phone: normalizedCallerPhone,
            status: 'new',
            first_contact_at: new Date().toISOString(),
            last_message_at: new Date().toISOString()
          }])
          .select("id, status")
          .single()

        if (leadInsertError) {
          console.error("[Twilio Voice Status Webhook] Lead insert failed:", leadInsertError)
          // Continue with processing even if lead creation fails
        } else {
          lead = newLead
          console.log("[Twilio Voice Status Webhook] New lead created:", lead.id)
        }
      } catch (leadInsertException) {
        console.error("[Twilio Voice Status Webhook] Exception during lead insert:", leadInsertException)
        // Continue with processing even if lead creation fails
      }
    }

    // If we still don't have a lead, continue with processing but log the issue
    if (!lead) {
      console.error('[Twilio Voice Status Webhook] No lead available after creation attempt')
      // Continue with processing - don't return early
    } else {
      console.log("[Twilio Voice Status Webhook] Lead id for processing:", lead.id)
    }
    
    // Handle conversation logic for missed calls
    let conversation = null
    let conversationWasCreated = false
    
    if (lead) {
      try {
        conversation = await db.getOpenConversationForLead(lead.id, business.id)
        
        if (!conversation) {
          // Create new conversation for missed call
          console.log(`[Twilio Voice Status Webhook] Creating new conversation for lead: ${lead.id}`)
          conversation = await db.createConversation({
            lead_id: lead.id,
            business_id: business.id,
            status: 'open',
            source: 'missed_call',
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          })
          
          if (!conversation) {
            console.error('[Twilio Voice Status Webhook] Failed to create conversation')
          } else {
            conversationWasCreated = true
            console.log(`[Twilio Voice Status Webhook] Created new conversation: ${conversation.id}`)
          }
        } else {
          console.log(`[Twilio Voice Status Webhook] Found existing conversation: ${conversation.id}`)
          console.log(`[Twilio Voice Status Webhook] Conversation details:`, {
            conversation_id: conversation.id,
            lead_id: conversation.lead_id,
            business_id: conversation.business_id,
            status: conversation.status,
            source: conversation.source
          })
          
          // Update existing conversation's last activity
          console.log(`[Twilio Voice Status Webhook] Updating conversation last_activity_at`)
          const updatedConversation = await db.updateConversation(conversation.id, {
            last_activity_at: new Date().toISOString(),
          })
          
          if (!updatedConversation) {
            console.error('[Twilio Voice Status Webhook] Failed to update conversation')
          } else {
            console.log(`[Twilio Voice Status Webhook] Updated conversation: ${updatedConversation.id}`)
            conversation = updatedConversation
          }
        }
      } catch (conversationError) {
        console.error('[Twilio Voice Status Webhook] Error handling conversation:', conversationError)
        conversation = null
      }
    } else {
      console.error('[Twilio Voice Status Webhook] No lead available for conversation creation')
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
      
      // Use business auto_reply_message or fallback
      const autoReplyMessage = business.auto_reply_message || 
        `Hi, this is ${business.name || 'My Business'}. Sorry we missed your call-how can we help? Reply STOP to opt out.`
      
      console.log(`[Twilio Voice Status Webhook] Auto-reply message: ${autoReplyMessage}`)
      console.log(`[Twilio Voice Status Webhook] Business phone: ${business.twilio_phone_number}`)
      console.log(`[Twilio Voice Status Webhook] Business has messaging_service_sid: ${!!business.twilio_messaging_service_sid}`)
      
      try {
        messageSid = await sendSms(business, From, autoReplyMessage, {
          lead_id: lead.id,
          conversation_id: conversation?.id,
        })

        if (messageSid) {
          console.log(`[Twilio Voice Status Webhook] Auto-reply SMS sent successfully - Twilio SID: ${messageSid}`)
          autoReplySent = true

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
            
            // Calculate follow-up times
            const now = new Date()
            const followUp1Time = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour later
            const followUp2Time = new Date(now)
            followUp2Time.setDate(followUp2Time.getDate() + 1) // Tomorrow
            followUp2Time.setHours(9, 0, 0, 0) // 9:00 AM
            
            // Create follow-up messages with business name
            const businessName = business.name || 'My Business'
            const followUp1Message = `Just following up - did you still need help from ${businessName}?`
            const followUp2Message = `Good morning, this is ${businessName}. Just checking if you still needed help. Happy to assist.`
            
            // Create idempotency keys to prevent duplicates
            const callSid = params.CallSid || 'unknown'
            const idempotencyKey1 = `lead:${lead.id}:call:${callSid}:followup:1`
            const idempotencyKey2 = `lead:${lead.id}:call:${callSid}:followup:2`
            
            // Schedule Follow-up #1 (1 hour later)
            console.log(`[followups] Scheduling follow-up 1 for ${followUp1Time.toISOString()}`)
            const { data: followUp1, error: error1 } = await supabase
              .from('follow_up_jobs')
              .insert([{
                lead_id: lead.id,
                business_id: business.id,
                conversation_id: conversation.id,
                message_body: followUp1Message,
                scheduled_for: followUp1Time.toISOString(),
                status: "pending"
              }])
              .select()
              .single()
            
            if (error1) {
              console.error(`[followups] Failed to schedule follow-up 1:`, error1)
            } else {
              console.log(`[followups] Scheduled follow-up 1: ${followUp1?.id}`)
            }
            
            // Schedule Follow-up #2 (next morning 9 AM)
            console.log(`[followups] Scheduling follow-up 2 for ${followUp2Time.toISOString()}`)
            const { data: followUp2, error: error2 } = await supabase
              .from('follow_up_jobs')
              .insert([{
                lead_id: lead.id,
                business_id: business.id,
                conversation_id: conversation.id,
                message_body: followUp2Message,
                scheduled_for: followUp2Time.toISOString(),
                status: "pending"
              }])
              .select()
              .single()
            
            if (error2) {
              console.error(`[followups] Failed to schedule follow-up 2:`, error2)
            } else {
              console.log(`[followups] Scheduled follow-up 2: ${followUp2?.id}`)
            }
            
            if (!error1 && !error2) {
              console.log(`[followups] Both follow-ups scheduled successfully for lead: ${lead.id}`)
            }
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
      follow_up_job_created: lead?.id ? !hasPendingJob : false,
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
