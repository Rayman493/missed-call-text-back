import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { db } from '@/lib/supabase/admin'
import { sendSms, normalizePhoneNumber } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  try {
    // Create fresh Supabase client for this request
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const body = await req.text()
    const params = new URLSearchParams(body)
    
    console.log("TWILIO BODY:", body)
    
    const From = params.get('From')
    const To = params.get('To')
    const CallStatus = params.get('CallStatus')
    
    // Log request details
    console.log('[voice-status] Incoming webhook:')
    console.log('[voice-status]   CallStatus:', CallStatus)
    console.log('[voice-status]   From:', From)
    console.log('[voice-status]   To:', To)
    console.log('[voice-status]   CallSid:', params.get('CallSid'))
    
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
    
    console.log("Looking up business with:", normalizedTo)
    
    const { data: business } = await supabase
      .from('businesses')
      .select('*')
      .eq('twilio_phone_number', normalizedTo)
      .single()
    
    console.log("Business found:", business)
    
    if (!business) {
      console.error("NO BUSINESS MATCH FOUND")
      console.error('[voice-status] Early return: no business matched')
      return new Response("OK", { status: 200 })
    }
    
    // Normalize customer phone number
    const normalizedCallerPhone = normalizePhoneNumber(From)
    console.log(`[voice-status] Normalized caller phone: ${normalizedCallerPhone}`)
    
    // First try to find existing lead
    const { data: existingLead, error: existingLeadError } = await supabase
      .from("leads")
      .select("id, status")
      .eq("business_id", business.id)
      .eq("caller_phone", normalizedCallerPhone)
      .maybeSingle();

    let lead;

    if (existingLead) {
      // Use existing lead
      lead = existingLead;
      console.log("[voice-status] Existing lead found:", lead.id);
    } else {
      // Insert new lead
      console.log(`[voice-status] No existing lead found, inserting new lead for business_id: ${business.id}, caller_phone: ${normalizedCallerPhone}`);
      
      const { data: newLead, error: leadInsertError } = await supabase
        .from("leads")
        .insert([{
          business_id: business.id,
          caller_phone: normalizedCallerPhone
        }])
        .select("id, status")
        .single();

      if (leadInsertError) {
        console.error("[voice-status] Lead insert failed:", leadInsertError);
        return new Response("OK", { status: 200 });
      }

      lead = newLead;
      console.log("[voice-status] New lead inserted:", lead.id);
    }

    console.log("[voice-status] Lead id used for follow-up job:", lead.id);
    
    // Handle conversation logic for missed calls
    let conversation = await db.getOpenConversationForLead(lead.id, business.id)
    let conversationWasCreated = false
    
    if (!conversation) {
      // Create new conversation for missed call
      console.log(`[voice-status] Creating new conversation for lead: ${lead.id}`)
      conversation = await db.createConversation({
        lead_id: lead.id,
        business_id: business.id,
        status: 'open',
        source: 'missed_call',
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      
      if (!conversation) {
        console.error('[voice-status] Failed to create conversation')
        console.error('[voice-status] Early return: conversation creation failed')
        return new Response("OK", { status: 200 })
      }
      
      conversationWasCreated = true
      console.log(`[voice-status] Created new conversation: ${conversation.id}`)
    } else {
      console.log(`[voice-status] Found existing conversation: ${conversation.id}`)
      console.log(`[voice-status] Conversation details:`, {
        conversation_id: conversation.id,
        lead_id: conversation.lead_id,
        business_id: conversation.business_id,
        status: conversation.status,
        source: conversation.source
      })
      
      // Update existing conversation's last activity
      console.log(`[voice-status] Updating conversation last_activity_at`)
      const updatedConversation = await db.updateConversation(conversation.id, {
        last_activity_at: new Date().toISOString(),
      })
      
      if (!updatedConversation) {
        console.error('[voice-status] Failed to update conversation')
      } else {
        console.log(`[voice-status] Updated conversation: ${updatedConversation.id}`)
        conversation = updatedConversation
      }
    }
    
    // Save call event linked to conversation
    if (conversation) {
      console.log(`[voice-status] Creating call event for conversation: ${conversation.id}`)
      const callEvent = await db.createCallEventWithConversation({
        business_id: business.id,
        conversation_id: conversation.id,
        caller_phone: normalizedCallerPhone,
        call_status: CallStatus || 'unknown',
        twilio_call_sid: params.get('CallSid'),
        raw_payload: Object.fromEntries(params.entries()),
        created_at: new Date().toISOString(),
      })
      
      if (!callEvent) {
        console.error('[voice-status] Failed to save call event')
      } else {
        console.log(`[voice-status] Saved call event: ${callEvent.id}`)
      }
    } else {
      console.error('[voice-status] No conversation available for call event')
      console.error('[voice-status] Early return: no conversation for call event')
      return new Response("OK", { status: 200 })
    }
    
    // Check for recent outbound messages to avoid spam
    const hasRecentOutbound = await db.hasRecentOutboundMessage(lead.id, 10)
    console.log(`[voice-status] Lead ID: ${lead.id}`)
    console.log(`[voice-status] Recent outbound message found (last 10 min): ${hasRecentOutbound}`)
    
    let autoReplySent = false
    let messageSid = null
    
    // Send auto-reply SMS if no recent outbound message exists
    if (!hasRecentOutbound) {
      console.log(`[voice-status] Auto-reply send attempt - no recent outbound found`)
      
      // Use business auto_reply_message or fallback
      const autoReplyMessage = business.auto_reply_message || 
        `Hi, this is ${business.name || 'ReplyFlow'}. Sorry we missed your call—how can we help?`
      
      console.log(`[voice-status] Auto-reply message: ${autoReplyMessage}`)
      console.log(`[voice-status] Business phone: ${business.twilio_phone_number}`)
      console.log(`[voice-status] Business has messaging_service_sid: ${!!business.twilio_messaging_service_sid}`)
      
      try {
        messageSid = await sendSms(business, From, autoReplyMessage, {
          lead_id: lead.id,
          conversation_id: conversation?.id,
        })

        if (messageSid) {
          console.log(`[voice-status] Auto-reply SMS sent successfully - Twilio SID: ${messageSid}`)
          autoReplySent = true

          // Update lead status to contacted after SMS sent
          const { error: updateError } = await supabase
            .from('leads')
            .update({ status: 'contacted' })
            .eq('id', lead.id)

          if (updateError) {
            console.error('[voice-status] Failed to update lead status:', updateError)
          } else {
            console.log(`[voice-status] Lead status updated to 'contacted': ${lead.id}`)
          }
        } else {
          console.error('[voice-status] Failed to send auto-reply SMS - no SID returned')
        }
      } catch (smsError) {
        console.error('[voice-status] Exception during SMS send:', smsError)
      }
    } else {
      console.log(`[voice-status] Auto-reply skipped - recent outbound message found for lead: ${lead.id}`)
    }
    
    // ========================================
    // NEW FOLLOW-UP JOB LOGIC (INDEPENDENT OF LEAD STATUS)
    // ========================================
    
    // Guard: ensure lead.id exists before creating follow-up jobs
    if (!lead?.id) {
      console.error("[voice-status] No valid lead id, skipping follow-up creation");
      return new Response("OK", { status: 200 });
    }
    
    let hasPendingJob = false
    
    // ALWAYS attempt follow-up job creation for missed calls, regardless of lead status
    if (conversation) {
      console.log(`[voice-status] Attempting follow-up job creation for conversation: ${conversation.id}`)
      
      // Check for existing pending follow-up job to prevent duplicates
      const { data: existingJob } = await supabase
        .from('follow_up_jobs')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'pending')
        .limit(1)
        .single()
      
      hasPendingJob = !!existingJob
      console.log(`[voice-status] Has existing pending follow-up job: ${hasPendingJob}`)
      
      if (!hasPendingJob) {
        // Schedule follow-up job for 1 hour later
        const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        
        // Use business's auto-reply message if available, otherwise use fallback
        const messageBody = business.auto_reply_message || 
          `Hi, this is ${business.name || 'ReplyFlow'}. Sorry we missed your call—how can we help? Reply STOP to opt out.`
        
        console.log("INSERTING FOLLOW UP:", {
          business_id: business.id,
          lead_id: lead.id
        })
        
        console.log("FOLLOW UP INSERT ATTEMPT")
        
        const { data: followUpJob, error: jobError } = await supabase
          .from('follow_up_jobs')
          .insert([{
            lead_id: lead.id,
            message_body: "Test follow-up",
            scheduled_for: new Date().toISOString(),
            status: "pending"
          }])
          .select()
          .single()
        
        if (jobError) {
          console.error("FOLLOW UP INSERT ERROR:", jobError)
        } else {
          console.log(`[voice-status] Follow-up job insert successful: ${followUpJob?.id}`)
          console.log(`[voice-status] Follow-up job details:`, {
            job_id: followUpJob?.id,
            lead_id: lead.id,
            business_id: business.id,
            scheduled_for: scheduledFor,
            message_body: messageBody
          })
        }
      } else {
        console.log(`[voice-status] Follow-up job insert skipped - existing pending job for lead ${lead.id}`)
      }
    } else {
      console.error('[voice-status] No conversation available for follow-up job creation')
    }
    
    // Update conversation activity if outbound message was sent
    if (autoReplySent && conversation) {
      console.log(`[voice-status] Updating conversation activity after outbound message`)
      await db.updateConversation(conversation.id, {
        last_activity_at: new Date().toISOString(),
      })
    }
    
    // Final summary log
    console.log(`[voice-status] === PROCESSING COMPLETE ===`)
    console.log(`[voice-status] Summary:`, {
      lead_id: lead.id,
      conversation_created: conversationWasCreated,
      conversation_id: conversation?.id,
      auto_reply_sent: autoReplySent,
      follow_up_job_created: !hasPendingJob,
      business_id: business.id,
      caller_phone: normalizedCallerPhone
    })
    
    // Return 200 response quickly (Twilio requires this)
    return new Response("OK", { status: 200 })
    
  } catch (error) {
    console.error('[voice-status] Error:', error)
    return new Response("OK", { status: 200 })
  }
}
