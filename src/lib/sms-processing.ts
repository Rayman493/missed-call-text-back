import { db, supabaseAdmin } from '@/lib/supabase/admin'
import { normalizePhoneNumber } from '@/lib/twilio'
import { sendSms } from '@/lib/twilio'
import { sanitizeMessageContent } from '@/lib/security'
import { notificationServiceServer } from '@/lib/notifications-server'

export interface ProcessInboundSmsParams {
  messageSid: string
  from: string
  to: string
  body: string
  source: 'twilio' | 'dev_simulation'
  media?: Array<{
    url: string
    contentType: string
  }>
}

export async function processInboundSms(params: ProcessInboundSmsParams) {
  const { messageSid, from, to, body, source, media } = params
  
  console.log(`[SMS Processing] Processing inbound SMS from ${source}:`, {
    messageSid,
    from,
    to,
    body: body.substring(0, 100) + (body.length > 100 ? '...' : ''),
    mediaCount: media?.length || 0
  })
  
  // Normalize customer phone number
  const normalizedCustomerPhone = normalizePhoneNumber(from)
  
  // Check for opt-out keywords (case-insensitive)
  const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
  const originalBody = body.trim().toUpperCase()
  const isOptOut = optOutKeywords.some(keyword => originalBody === keyword)
  
  // Check for opt-in keywords (case-insensitive) - START, UNSTOP, YES
  const optInKeywords = ['START', 'UNSTOP', 'YES']
  const isOptIn = optInKeywords.some(keyword => originalBody === keyword)
  
  // Try to find existing lead across all businesses with this phone number
  const leadResult = await db.findLeadByPhoneAcrossBusinesses(normalizedCustomerPhone, to)
  
  let business: any
  let lead: any
  
  if (leadResult) {
    // Found existing lead, use its business
    business = leadResult.business
    lead = leadResult.lead
    console.log(`[SMS Processing] Found existing lead: ${lead.id} for business: ${business.id}`)
  } else {
    // No existing lead, get first business with this phone number
    business = await db.getBusinessByPhone(to)
    
    if (!business) {
      console.error(`[SMS Processing] Business not found for phone: ${to}`)
      return {
        success: false,
        error: 'Business not found',
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Service unavailable</Message>
</Response>`
      }
    }
    
    console.log(`[SMS Processing] Using business for new lead: ${business.id}`)
  }
  
  if (!lead) {
    // Create new lead with status 'contacted' since customer replied
    console.log(`[SMS Processing] No existing lead, creating new lead`)
    lead = await db.createLead({
      business_id: business.id,
      caller_phone: normalizedCustomerPhone,
      status: 'contacted', // Customer replied, so mark as contacted
      first_contact_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
      last_reply_at: new Date().toISOString(),
      opted_out: false,
      is_demo: source === 'dev_simulation', // Mark dev simulations as demo leads
    })
    
    if (!lead) {
      console.error(`[SMS Processing] Failed to create lead`)
      return {
        success: false,
        error: 'Failed to create lead',
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error processing message</Message>
</Response>`
      }
    }
    
    console.log(`[SMS Processing] Lead created:`, {
      lead_id: lead.id,
      business_id: lead.business_id,
      caller_phone: lead.caller_phone
    })
  } else if (lead) {
    // Update existing lead's status to 'replied' and track reply time
    const updatedLead = await db.updateLead(lead.id, {
      status: 'replied', // Customer replied, so mark as replied
      last_message_at: new Date().toISOString(),
      last_reply_at: new Date().toISOString(), // Track when customer replied
    })
    
    if (!updatedLead) {
      console.error(`[SMS Processing] Failed to update lead`)
    } else {
      console.log(`[SMS Processing] Updated lead: ${updatedLead.id}`)
      lead = updatedLead
    }
  }
  
  // Handle opt-in requests (START, UNSTOP, YES)
  if (isOptIn) {
    console.log(`[CONSENT] START received from: ${normalizedCustomerPhone}`)
    console.log(`[CONSENT] normalized caller phone: ${normalizedCustomerPhone}`)
    console.log(`[CONSENT] lead before update:`, {
      id: lead.id,
      opted_out: lead.opted_out,
      caller_phone: lead.caller_phone
    })
    
    // Update lead to set opted_out = false and update timestamps
    const updatedLead = await db.updateLead(lead.id, {
      opted_out: false,
      last_reply_at: new Date().toISOString(),
      last_message_at: new Date().toISOString(),
    })
    
    if (updatedLead) {
      console.log(`[CONSENT] lead after update:`, {
        id: updatedLead.id,
        opted_out: updatedLead.opted_out,
        caller_phone: updatedLead.caller_phone
      })
      lead = updatedLead
    } else {
      console.error(`[CONSENT] Failed to update lead opted_out status`)
    }
    
    // Send confirmation reply for real Twilio messages, not dev simulations
    if (source === 'twilio') {
      const confirmationMessage = "You have been re-subscribed. You will receive messages again."
      const messageSid = await sendSms(business, from, confirmationMessage, {
        lead_id: lead.id,
      })

      if (messageSid) {
        console.log(`[CONSENT] Sent opt-in confirmation: ${messageSid}`)
      } else {
        console.error(`[CONSENT] Failed to send opt-in confirmation`)
      }
    }
    
    // Return TwiML response for opt-in
    return {
      success: true,
      optIn: true,
      lead,
      twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been re-subscribed. You will receive messages again.</Message>
</Response>`
    }
  }
  
  // Handle opt-out requests
  if (isOptOut) {
    console.log(`[SMS Processing] Opt-out request from lead: ${lead.id}`)
    
    // Update lead to set opted_out = true
    const updatedLead = await db.updateLead(lead.id, { opted_out: true })
    
    if (updatedLead) {
      console.log(`[SMS Processing] Lead opted out: ${lead.id}`)
      lead = updatedLead
    } else {
      console.error(`[SMS Processing] Failed to update lead opted_out status`)
    }
    
    // Cancel all pending follow-up jobs for this lead
    const jobsCancelledCount = await db.cancelPendingFollowUpJobsForLead(lead.id, 'customer_opted_out')
    
    console.log(`[SMS Processing] Cancelled ${jobsCancelledCount} follow-up jobs for opted-out lead: ${lead.id}`)
    
    // Only send confirmation reply for real Twilio messages, not dev simulations
    if (source === 'twilio') {
      const confirmationMessage = "You have been unsubscribed. You will no longer receive messages."
      const messageSid = await sendSms(business, from, confirmationMessage, {
        lead_id: lead.id,
      })

      if (messageSid) {
        console.log(`[SMS Processing] Sent opt-out confirmation: ${messageSid}`)
      } else {
        console.error(`[SMS Processing] Failed to send opt-out confirmation`)
      }
    }
    
    // Return TwiML response for opt-out
    return {
      success: true,
      optOut: true,
      twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been unsubscribed. You will no longer receive messages.</Message>
</Response>`
    }
  }
  
  // Handle conversation logic - ALWAYS ensure a conversation exists
  let conversation = await db.getOpenConversationForLead(lead.id, business.id)
  
  if (!conversation) {
    // Create new conversation for SMS
    conversation = await db.createConversation({
      lead_id: lead.id,
      business_id: business.id,
      status: 'open',
      source: 'sms', // Use 'sms' as allowed value, not 'dev_simulation'
      started_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    })
    
    if (!conversation) {
      console.error(`[SMS Processing] Failed to create conversation`)
      return {
        success: false,
        error: 'Failed to create conversation',
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error processing message</Message>
</Response>`
      }
    }
    
    console.log(`[SMS Processing] Created conversation: ${conversation.id}`)
  } else {
    // Update existing conversation's last activity
    const updatedConversation = await db.updateConversation(conversation.id, {
      last_activity_at: new Date().toISOString(),
    })
    
    if (!updatedConversation) {
      console.error(`[SMS Processing] Failed to update conversation`)
    } else {
      console.log(`[SMS Processing] Updated conversation: ${updatedConversation.id}`)
      conversation = updatedConversation
    }
  }
  
  // Cancel all pending follow-ups for this conversation when customer replies
  if (conversation) {
    const cancelled = await db.cancelPendingFollowUpsForConversation(conversation.id)
    
    if (cancelled) {
      console.log(`[SMS Processing] Cancelled follow-ups for conversation: ${conversation.id}`)
    } else {
      console.error(`[SMS Processing] Failed to cancel follow-ups`)
    }
  }
  
  // Cancel all pending follow-up jobs for this lead when customer replies
  const jobsCancelledCount = await db.cancelPendingFollowUpJobsForLead(lead.id, 'customer_replied')
  
  console.log(`[SMS Processing] Cancelled ${jobsCancelledCount} follow-up jobs for lead: ${lead.id}`)
  
  // At this point, conversation is guaranteed to exist
  // Save inbound message linked to conversation
  const sanitizedBody = sanitizeMessageContent(body)
  const message = await db.createMessageWithConversation({
    lead_id: lead.id,
    conversation_id: conversation.id,
    direction: 'inbound',
    body: sanitizedBody,
    from_phone: normalizedCustomerPhone,
    to_phone: to,
    twilio_message_sid: messageSid,
    status: 'received',
    created_at: new Date().toISOString(),
  })
  
  if (!message) {
    console.error(`[SMS Processing] Failed to save message`)
  } else {
    console.log(`[SMS Processing] Saved inbound message: ${message.id}`)
    
    // Store media attachments if present
    if (media && media.length > 0) {
      console.log(`[MMS DEBUG] Storing ${media.length} media attachments for message: ${message.id}`)
      console.log(`[MMS DEBUG] Lead ID for tracing: ${lead.id}`)
      
      for (const mediaItem of media) {
        try {
          const { error: mediaError } = await supabaseAdmin
            .from('message_media')
            .insert({
              message_id: message.id,
              media_url: mediaItem.url,
              mime_type: mediaItem.contentType,
              created_at: new Date().toISOString(),
            })
          
          if (mediaError) {
            console.error(`[MMS DEBUG] Failed to store media attachment:`, mediaError)
          } else {
            console.log(`[MMS DEBUG] Successfully stored media: ${mediaItem.contentType}`)
          }
        } catch (error) {
          console.error(`[MMS DEBUG] Failed to store media attachment:`, error)
          // Continue with other media even if one fails
        }
      }
      console.log(`[MMS DEBUG] Media storage complete for message: ${message.id}`)
    } else {
      console.log(`[MMS DEBUG] No media attachments to store for message: ${message.id}`)
      console.log(`[MMS DEBUG] Lead ID for tracing: ${lead.id}`)
    }
    
    // Create notification for customer reply
    try {
      await notificationServiceServer.notifyCustomerReply(
        business.id,
        'Customer',
        sanitizedBody,
        lead.id
      );
      console.log('[SMS Processing] Notification created for customer reply');
    } catch (error) {
      console.error('[SMS Processing] Failed to create notification:', error);
    }
  }
  
  // Return success response
  return {
    success: true,
    lead,
    conversation,
    message,
    twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks - we received your message.</Message>
</Response>`
  }
}
