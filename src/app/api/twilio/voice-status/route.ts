import { NextRequest } from 'next/server'
import { db } from '@/lib/supabase'
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
    console.log("CallStatus:", CallStatus)
    console.log("From:", From)
    console.log("To:", To)
    
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
    const business = await db.getBusinessByPhone(To)
    if (!business) {
      console.error(`[voice-status] Business not found for phone: ${To}`)
      return new Response("OK", { status: 200 })
    }
    
    console.log(`[voice-status] Found business: ${business.name} (${business.id})`)
    
    // Log resolved business details
    console.log(`[voice-status] Resolved business:`, {
      id: business.id,
      name: business.name,
      phone_number: business.twilio_phone_number
    })
    
    // Normalize customer phone number
    const normalizedCallerPhone = normalizePhoneNumber(From)
    
    // Find or create lead for this customer
    let lead = await db.getLeadByPhone(business.id, normalizedCallerPhone)
    let leadWasCreated = false
    
    if (!lead) {
      // Create new lead with status 'new' for missed call
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
      console.log(`[voice-status] Created new lead: ${lead.id}`)
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
      const messageSid = await sendSms(business, From, business.auto_reply_message)

      if (messageSid) {
        console.log(`[voice-status] Sent auto-reply SMS: ${messageSid}`)

        // Insert outbound message record linked to conversation
        if (conversation) {
          outboundMessage = await db.createMessageWithConversation({
            lead_id: lead.id,
            conversation_id: conversation.id,
            direction: 'outbound',
            body: business.auto_reply_message,
            from_phone: business.twilio_phone_number,
            to_phone: normalizedCallerPhone,
            twilio_message_sid: messageSid,
            status: 'queued',
            created_at: new Date().toISOString(),
          })

          if (!outboundMessage) {
            console.error('[voice-status] Failed to save outbound message')
          } else {
            console.log(`[voice-status] Saved outbound message: ${outboundMessage.id} with SID: ${messageSid}`)
          }
        } else {
          console.error('[voice-status] No conversation available for outbound message')
        }
      } else {
        console.error('[voice-status] Failed to send auto-reply SMS')
      }
    } else {
      console.log(`[voice-status] Auto-reply skipped - lead status is not 'new' (status: ${lead.status})`)
    }
    
    // ========================================
    // NEW FOLLOW-UP LOGIC (INDEPENDENT OF LEAD STATUS)
    // ========================================
    
    // ALWAYS attempt follow-up creation for missed calls, regardless of lead status
    if (conversation) {
      console.log(`[voice-status] Attempting follow-up creation for conversation: ${conversation.id}`)
      
      // Check for existing pending follow-up to prevent duplicates
      const hasPendingFollowUp = await db.hasPendingFollowUpForConversation(conversation.id, 'missed_call_followup_1')
      
      console.log(`[voice-status] Has existing pending follow-up: ${hasPendingFollowUp}`)
      
      if (!hasPendingFollowUp) {
        // Schedule follow-up for 1 hour later
        const scheduledFor = new Date(Date.now() + 60 * 60 * 1000).toISOString()
        
        console.log(`[voice-status] Inserting follow-up scheduled for: ${scheduledFor}`)
        
        const followUp = await db.createFollowUp({
          conversation_id: conversation.id,
          lead_id: lead.id,
          business_id: business.id,
          kind: 'missed_call_followup_1',
          status: 'pending',
          scheduled_for: scheduledFor,
          message_body: `Hi, this is ${business.name || 'ReplyFlow'}. Sorry we missed your call—how can we help? Reply STOP to opt out.`,
        })
        
        if (!followUp) {
          console.error('[voice-status] Follow-up insert failed - no data returned')
        } else {
          console.log(`[voice-status] Follow-up insert successful: ${followUp.id}`)
        }
      } else {
        console.log(`[voice-status] Follow-up insert skipped - existing pending follow-up for conversation ${conversation.id}`)
      }
    } else {
      console.error('[voice-status] No conversation available for follow-up creation')
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
