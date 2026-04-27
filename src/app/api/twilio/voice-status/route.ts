import { NextRequest } from 'next/server'
import { db, supabaseAdmin } from '@/lib/supabase'
import { sendSms, normalizePhoneNumber } from '@/lib/twilio'

// Define all missed call statuses that Twilio can send
const MISSED_CALL_STATUSES = ["no-answer", "busy", "failed"]

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params = new URLSearchParams(body)
    
    const From = params.get('From')
    const To = params.get('To')
    const CallStatus = params.get('CallStatus')
    
    // Log request details
    console.log('[voice-status] Incoming webhook:')
    console.log('[voice-status]   CallStatus:', CallStatus)
    console.log('[voice-status]   From:', From)
    console.log('[voice-status]   To:', To)
    console.log('[voice-status]   CallSid:', params.get('CallSid'))
    
    if (!From || !To || !CallStatus) {
      console.error('[voice-status] Missing required fields:', { From, To, CallStatus })
      return new Response("OK", { status: 200 })
    }
    
    // Determine if this is a missed call
    const isMissedCall = MISSED_CALL_STATUSES.includes(CallStatus)
    console.log("Treated as missed call:", isMissedCall)
    
    if (!isMissedCall) {
      console.log(`[voice-status] Not a missed call (status: ${CallStatus}), ignoring`)
      return new Response("OK", { status: 200 })
    }
    
    console.log(`[voice-status] Processing missed call with status: ${CallStatus}`)
    
    // Find business by Twilio phone number
    console.log(`[voice-status] Looking up business by phone: ${To}`)
    const business = await db.getBusinessByPhone(To)
    if (!business) {
      console.error(`[voice-status] No business found for To number: ${To}`)
      return new Response("OK", { status: 200 })
    }
    
    console.log(`[voice-status] Matched business: ${business.name} (id: ${business.id})`)
    console.log(`[voice-status] Business phone: ${business.twilio_phone_number}`)
    
    // Normalize customer phone number
    const normalizedCallerPhone = normalizePhoneNumber(From)
    console.log(`[voice-status] Normalized caller phone: ${normalizedCallerPhone}`)
    
    // Find or create lead for this customer
    console.log(`[voice-status] Looking up lead for business_id: ${business.id}, caller_phone: ${normalizedCallerPhone}`)
    let lead = await db.getLeadByPhone(business.id, normalizedCallerPhone)
    let leadWasCreated = false
    
    if (!lead) {
      // Create new lead with status 'new' for missed call
      console.log(`[voice-status] No existing lead found, creating new lead`)
      console.log(`[voice-status] Inserting lead...`, {
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        status: 'new'
      })
      lead = await db.createLead({
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        status: 'new', // New missed call, not contacted yet
        first_contact_at: new Date().toISOString(),
        last_message_at: null, // No messages yet
        last_reply_at: null, // No replies yet
        opted_out: false,
      })
      
      if (!lead) {
        console.error('[voice-status] Failed to create lead')
        return new Response("OK", { status: 200 })
      }
      
      leadWasCreated = true
      console.log(`[voice-status] Lead inserted successfully:`, {
        lead_id: lead.id,
        business_id: lead.business_id,
        caller_phone: lead.caller_phone
      })
    } else {
      console.log(`[voice-status] Found existing lead: ${lead.id} (status: ${lead.status})`)
      
      // Update existing lead's first contact if this is their first missed call
      if (!lead.first_contact_at) {
        const updatedLead = await db.updateLead(lead.id, {
          first_contact_at: new Date().toISOString(),
        })
        
        if (!updatedLead) {
          console.error('[voice-status] Failed to update lead first_contact_at')
        } else {
          lead = updatedLead
        }
      }
    }
    
    // Handle conversation logic for missed calls
    let conversation = await db.getOpenConversationForLead(lead.id, business.id)
    let conversationWasCreated = false
    
    if (!conversation) {
      // Create new conversation for missed call
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
        return new Response("OK", { status: 200 })
      }
      
      conversationWasCreated = true
      console.log(`[voice-status] Created new conversation: ${conversation.id}`)
    } else {
      console.log(`[voice-status] Found existing conversation: ${conversation.id}`)
      
      // Update existing conversation's last activity
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
      const callEvent = await db.createCallEventWithConversation({
        business_id: business.id,
        conversation_id: conversation.id,
        caller_phone: normalizedCallerPhone,
        call_status: CallStatus,
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
      return new Response("OK", { status: 200 })
    }
    
    // Determine if auto-reply should be sent (only for new leads)
    const shouldSendAutoReply = lead.status === 'new'
    console.log(`[voice-status] Should send auto-reply: ${shouldSendAutoReply} (lead status: ${lead.status})`)
    
    let outboundMessage = null
    
    // Send auto-reply SMS only if lead is 'new'
    if (shouldSendAutoReply) {
      const messageSid = await sendSms(business, From, business.auto_reply_message, {
        lead_id: lead.id,
        conversation_id: conversation?.id,
      })

      if (messageSid) {
        console.log(`[voice-status] Sent auto-reply SMS: ${messageSid}`)
      } else {
        console.error('[voice-status] Failed to send auto-reply SMS')
      }
    } else {
      console.log(`[voice-status] Auto-reply skipped - lead status is not 'new' (status: ${lead.status})`)
    }
    
    // ========================================
    // NEW FOLLOW-UP JOB LOGIC (INDEPENDENT OF LEAD STATUS)
    // ========================================
    
    // ALWAYS attempt follow-up job creation for missed calls, regardless of lead status
    if (conversation) {
      console.log(`[voice-status] Attempting follow-up job creation for conversation: ${conversation.id}`)
      
      // Check for existing pending follow-up job to prevent duplicates
      const { data: existingJob } = await supabaseAdmin
        .from('follow_up_jobs')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('status', 'pending')
        .limit(1)
        .single()
      
      const hasPendingJob = !!existingJob
      console.log(`[voice-status] Has existing pending follow-up job: ${hasPendingJob}`)
      
      if (!hasPendingJob) {
        // Schedule follow-up job for 1 hour later
        const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        
        // Use business's auto-reply message if available, otherwise use fallback
        const messageBody = business.auto_reply_message || 
          `Hi, this is ${business.name || 'ReplyFlow'}. Sorry we missed your call—how can we help? Reply STOP to opt out.`
        
        console.log(`[voice-status] Inserting follow-up job scheduled for: ${scheduledFor}`)
        console.log(`[voice-status] Message body: ${messageBody}`)
        
        const { data: followUpJob, error: jobError } = await supabaseAdmin
          .from('follow_up_jobs')
          .insert({
            lead_id: lead.id,
            business_id: business.id,
            message_body: messageBody,
            status: 'pending',
            scheduled_for: scheduledFor,
            attempt_count: 0,
            max_attempts: 3,
          })
          .select('id')
          .single()
        
        if (jobError) {
          console.error('[voice-status] Follow-up job insert failed:', jobError)
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
    if (outboundMessage && conversation) {
      await db.updateConversation(conversation.id, {
        last_activity_at: new Date().toISOString(),
      })
    }
    
    // Return 200 response quickly (Twilio requires this)
    return new Response("OK", { status: 200 })
    
  } catch (error) {
    console.error('[voice-status] Error:', error)
    return new Response("OK", { status: 200 })
  }
}
