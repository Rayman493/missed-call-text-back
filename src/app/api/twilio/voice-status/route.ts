import { NextRequest } from 'next/server'
import { db, supabaseAdmin } from '@/lib/supabase'
import { sendSms, normalizePhoneNumber } from '@/lib/twilio'

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
    
    if (!From || !To) {
      console.error('[voice-status] Missing required fields:', { From, To })
      console.error('[voice-status] Early return: missing required fields')
      return new Response("OK", { status: 200 })
    }
    
    // Treat ALL inbound calls as valid leads, regardless of CallStatus
    console.log('[voice-status] Creating lead regardless of call status:', CallStatus)
    console.log(`[voice-status] Processing inbound call with status: ${CallStatus}`)
    
    // Find business by Twilio phone number - fetch all and match manually
    console.log(`[voice-status] Raw To from Twilio: ${To}`)
    const normalizedTo = normalizePhoneNumber(To)
    console.log(`[voice-status] Normalized To: ${normalizedTo}`)
    
    // Fetch all businesses to match manually
    const { data: businesses } = await supabaseAdmin
      .from('businesses')
      .select('*')
    
    console.log(`[voice-status] All businesses in DB:`, businesses?.map(b => ({
      id: b.id,
      name: b.name,
      phone: b.twilio_phone_number,
      normalized_phone: normalizePhoneNumber(b.twilio_phone_number)
    })))
    
    // Match business by normalized phone number
    const business = businesses?.find(b => normalizePhoneNumber(b.twilio_phone_number) === normalizedTo)
    
    if (!business) {
      console.error(`[voice-status] No business matched for To number: ${To} (normalized: ${normalizedTo})`)
      console.error(`[voice-status] Available normalized phones:`, businesses?.map(b => normalizePhoneNumber(b.twilio_phone_number)))
      console.error(`[voice-status] Early return: no business matched`)
      return new Response("OK", { status: 200 })
    }
    
    console.log(`[voice-status] Matched business: ${business.name} (id: ${business.id})`)
    console.log(`[voice-status] Business phone in DB: ${business.twilio_phone_number}`)
    console.log(`[voice-status] Normalized DB phone: ${normalizePhoneNumber(business.twilio_phone_number)}`)
    console.log(`[voice-status] Match confirmed: ${normalizePhoneNumber(business.twilio_phone_number)} === ${normalizedTo}`)
    
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
        console.error('[voice-status] Early return: lead creation failed')
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
      console.log(`[voice-status] Lead details:`, {
        lead_id: lead.id,
        business_id: lead.business_id,
        caller_phone: lead.caller_phone,
        status: lead.status,
        opted_out: lead.opted_out
      })
      
      // Update existing lead's first contact if this is their first missed call
      if (!lead.first_contact_at) {
        console.log(`[voice-status] Updating lead first_contact_at`)
        const updatedLead = await db.updateLead(lead.id, {
          first_contact_at: new Date().toISOString(),
        })
        
        if (!updatedLead) {
          console.error('[voice-status] Failed to update lead first_contact_at')
        } else {
          lead = updatedLead
          console.log(`[voice-status] Lead first_contact_at updated`)
        }
      } else {
        console.log(`[voice-status] Lead already has first_contact_at: ${lead.first_contact_at}`)
      }
    }
    
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
    
    let hasPendingJob = false
    
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
      
      hasPendingJob = !!existingJob
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
      console.log(`[voice-status] Updating conversation activity after outbound message`)
      await db.updateConversation(conversation.id, {
        last_activity_at: new Date().toISOString(),
      })
    }
    
    // Final summary log
    console.log(`[voice-status] === PROCESSING COMPLETE ===`)
    console.log(`[voice-status] Summary:`, {
      lead_created: leadWasCreated,
      lead_id: lead.id,
      conversation_created: conversationWasCreated,
      conversation_id: conversation?.id,
      auto_reply_sent: shouldSendAutoReply,
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
