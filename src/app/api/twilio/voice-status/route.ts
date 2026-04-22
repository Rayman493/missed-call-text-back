import { NextRequest } from 'next/server'
import { db } from '@/lib/supabase'
import { sendSms, normalizePhoneNumber } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params = new URLSearchParams(body)
    
    const From = params.get('From')
    const To = params.get('To')
    const CallStatus = params.get('CallStatus')
    
    if (!From || !To || !CallStatus) {
      console.error('[voice-status] Missing required fields:', { From, To, CallStatus })
      return new Response("OK", { status: 200 })
    }
    
    console.log(`[voice-status] From: ${From}, To: ${To}, CallStatus: ${CallStatus}`)
    
    // Only process missed calls
    if (CallStatus !== 'no-answer' && CallStatus !== 'busy' && CallStatus !== 'failed') {
      console.log(`[voice-status] Not a missed call, ignoring: ${CallStatus}`)
      return new Response("OK", { status: 200 })
    }
    
    // Find business by Twilio phone number
    const business = await db.getBusinessByPhone(To)
    if (!business) {
      console.error(`[voice-status] Business not found for phone: ${To}`)
      return new Response("OK", { status: 200 })
    }
    
    console.log(`[voice-status] Found business: ${business.name} (${business.id})`)
    
    // Normalize customer phone number
    const normalizedCallerPhone = normalizePhoneNumber(From)
    
    // Find or create lead for this customer
    let lead = await db.getLeadByPhone(business.id, normalizedCallerPhone)
    
    if (!lead) {
      // Create new lead with status 'new' for missed call
      lead = await db.createLead({
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        status: 'new', // New missed call, not contacted yet
        first_contact_at: new Date().toISOString(),
        last_message_at: null, // No messages yet
      })
      
      if (!lead) {
        console.error('[voice-status] Failed to create lead')
        return new Response("OK", { status: 200 })
      }
      
      console.log(`[voice-status] Created new lead: ${lead.id}`)
    } else {
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
      } else {
        console.log(`[voice-status] Created new conversation: ${conversation.id}`)
      }
    } else {
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
    }
    
    // Send auto-reply SMS if lead is still 'new' (no previous contact)
    if (lead.status === 'new') {
      const messageSid = await sendSms(From, business.auto_reply_message)
      
      if (messageSid) {
        console.log(`[voice-status] Sent auto-reply SMS: ${messageSid}`)
        
        // Insert outbound message record linked to conversation
        if (conversation) {
          const outboundMessage = await db.createMessageWithConversation({
            lead_id: lead.id,
            conversation_id: conversation.id,
            direction: 'outbound',
            body: business.auto_reply_message,
            from_phone: business.twilio_phone_number,
            to_phone: normalizedCallerPhone,
            created_at: new Date().toISOString(),
          })
          
          if (!outboundMessage) {
            console.error('[voice-status] Failed to save outbound message')
          } else {
            console.log(`[voice-status] Saved outbound message: ${outboundMessage.id}`)
          }
        } else {
          console.error('[voice-status] No conversation available for outbound message')
        }
        
        // Update conversation activity
        if (conversation) {
          await db.updateConversation(conversation.id, {
            last_activity_at: new Date().toISOString(),
          })
        }
      } else {
        console.error('[voice-status] Failed to send auto-reply SMS')
      }
    } else {
      console.log(`[voice-status] Lead already contacted, not sending auto-reply`)
    }
    
    return new Response("OK", { status: 200 })
    
  } catch (error) {
    console.error('[voice-status] Error:', error)
    return new Response("OK", { status: 200 })
  }
}
