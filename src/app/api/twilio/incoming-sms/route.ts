import { NextRequest } from 'next/server'
import { db } from '@/lib/supabase/admin'
import { normalizePhoneNumber } from '@/lib/twilio'
import { sendSms } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  try {
    console.log('[SYSTEM] [INCOMING-SMS] Received SMS');
    
    const body = await req.text()
    const params = new URLSearchParams(body)
    
    const From = params.get('From')
    const To = params.get('To')
    const Body = params.get('Body')
    
    if (!From || !To || !Body) {
      console.error('[SYSTEM] [INCOMING-SMS] Missing required fields:', { From, To, Body })
      
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error: Missing required fields</Message>
</Response>`

      return new Response(errorTwiml, {
        status: 400,
        headers: {
          'Content-Type': 'text/xml',
        },
      })
    }
    
    console.log('[SYSTEM] [INCOMING-SMS] From:', From, 'To:', To, 'Body:', Body)
    
    // Find business by Twilio phone number
    const business = await db.getBusinessByPhone(To)
    
    // Log resolved business details
    if (business) {
      console.log('[SYSTEM] [INCOMING-SMS] Resolved business:', {
        id: business.id,
        name: business.name,
        phone_number: business.twilio_phone_number
      })
    }
    if (!business) {
      console.error('[SYSTEM] [INCOMING-SMS] Business not found for phone:', To)
      
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Service unavailable</Message>
</Response>`

      return new Response(errorTwiml, {
        status: 404,
        headers: {
          'Content-Type': 'text/xml',
        },
      })
    }
    
    console.log('[SYSTEM] [INCOMING-SMS] Found business:', business.name, '(', business.id, ')')
    
    // Normalize customer phone number
    const normalizedCustomerPhone = normalizePhoneNumber(From)
    
    // Check for opt-out keywords (case-insensitive)
    const optOutKeywords = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']
    const normalizedBody = Body.trim().toUpperCase()
    const isOptOut = optOutKeywords.some(keyword => normalizedBody === keyword)
    
    // Find or create lead for this customer
    let lead = await db.getLeadByPhone(business.id, normalizedCustomerPhone)
    
    if (!lead) {
      // Create new lead with status 'contacted' since customer replied
      console.log('[SYSTEM] [INCOMING-SMS] No existing lead, creating new lead')
      console.log('[SYSTEM] [INCOMING-SMS] Inserting lead...', {
        business_id: business.id,
        caller_phone: normalizedCustomerPhone,
        status: 'contacted'
      })
      lead = await db.createLead({
        business_id: business.id,
        caller_phone: normalizedCustomerPhone,
        status: 'contacted', // Customer replied, so mark as contacted
        first_contact_at: new Date().toISOString(),
        last_message_at: new Date().toISOString(),
        last_reply_at: new Date().toISOString(),
        opted_out: false,
      })
      
      if (!lead) {
        console.error('[SYSTEM] [INCOMING-SMS] Failed to create lead')
        
        const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error processing message</Message>
</Response>`

        return new Response(errorTwiml, {
          status: 500,
          headers: {
            'Content-Type': 'text/xml',
          },
        })
      }
      
      console.log('[SYSTEM] [INCOMING-SMS] Lead created:', {
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
        console.error('[SYSTEM] [INCOMING-SMS] Failed to update lead')
      } else {
        console.log('[SYSTEM] [INCOMING-SMS] Updated lead:', updatedLead.id)
        lead = updatedLead
      }
    }
    
    // Handle opt-out requests
    if (isOptOut) {
      console.log('[SYSTEM] [INCOMING-SMS] Opt-out request from lead:', lead.id)
      
      // Update lead to set opted_out = true
      const updatedLead = await db.updateLead(lead.id, { opted_out: true })
      
      if (updatedLead) {
        console.log('[SYSTEM] [INCOMING-SMS] Lead opted out:', lead.id)
        lead = updatedLead
      } else {
        console.error('[SYSTEM] [INCOMING-SMS] Failed to update lead opted_out status')
      }
      
      // Cancel all pending follow-up jobs for this lead
      const jobsCancelledCount = await db.cancelPendingFollowUpJobsForLead(lead.id, 'customer_opted_out')
      
      console.log('[SYSTEM] [INCOMING-SMS] Cancelled', jobsCancelledCount, 'follow-up jobs for opted-out lead:', lead.id)
      
      // Send confirmation reply SMS
      const confirmationMessage = "You have been unsubscribed. You will no longer receive messages."
      const messageSid = await sendSms(business, From, confirmationMessage, {
        lead_id: lead.id,
      })

      if (messageSid) {
        console.log('[SYSTEM] [INCOMING-SMS] Sent opt-out confirmation:', messageSid)
      } else {
        console.error('[SYSTEM] [INCOMING-SMS] Failed to send opt-out confirmation')
      }
      
      // Return TwiML response for opt-out
      const optOutTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>You have been unsubscribed. You will no longer receive messages.</Message>
</Response>`

      return new Response(optOutTwiml, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml',
        },
      })
    }
    
    // Handle conversation logic - ALWAYS ensure a conversation exists
    let conversation = await db.getOpenConversationForLead(lead.id, business.id)
    
    if (!conversation) {
      // Create new conversation for SMS
      conversation = await db.createConversation({
        lead_id: lead.id,
        business_id: business.id,
        status: 'open',
        source: 'sms',
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      })
      
      if (!conversation) {
        console.error('[SYSTEM] [INCOMING-SMS] Failed to create conversation')
        
        const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error processing message</Message>
</Response>`

        return new Response(errorTwiml, {
          status: 500,
          headers: {
            'Content-Type': 'text/xml',
          },
        })
      }
      
      console.log('[SYSTEM] [INCOMING-SMS] Created conversation:', conversation.id)
    } else {
      // Update existing conversation's last activity
      const updatedConversation = await db.updateConversation(conversation.id, {
        last_activity_at: new Date().toISOString(),
      })
      
      if (!updatedConversation) {
        console.error('[SYSTEM] [INCOMING-SMS] Failed to update conversation')
      } else {
        console.log('[SYSTEM] [INCOMING-SMS] Updated conversation:', updatedConversation.id)
        conversation = updatedConversation
      }
    }
    
    // Cancel all pending follow-ups for this conversation when customer replies
    if (conversation) {
      const cancelled = await db.cancelPendingFollowUpsForConversation(conversation.id)
      
      if (cancelled) {
        console.log('[SYSTEM] [INCOMING-SMS] Cancelled follow-ups for conversation:', conversation.id)
      } else {
        console.error('[SYSTEM] [INCOMING-SMS] Failed to cancel follow-ups')
      }
    }
    
    // Cancel all pending follow-up jobs for this lead when customer replies
    const jobsCancelledCount = await db.cancelPendingFollowUpJobsForLead(lead.id, 'customer_replied')
    
    console.log('[SYSTEM] [INCOMING-SMS] Cancelled', jobsCancelledCount, 'follow-up jobs for lead:', lead.id)
    
    // At this point, conversation is guaranteed to exist
    // Save inbound message linked to conversation
    const message = await db.createMessageWithConversation({
      lead_id: lead.id,
      conversation_id: conversation.id,
      direction: 'inbound',
      body: Body,
      from_phone: normalizedCustomerPhone,
      to_phone: business.twilio_phone_number,
      created_at: new Date().toISOString(),
    })
    
    if (!message) {
      console.error('[SYSTEM] [INCOMING-SMS] Failed to save message')
    } else {
      console.log('[SYSTEM] [INCOMING-SMS] Saved inbound message:', message.id)
    }
    
    // Return simple TwiML response
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thanks - we received your message.</Message>
</Response>`

    return new Response(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    })
    
  } catch (error) {
    console.error('[SYSTEM] [INCOMING-SMS] Unexpected error:', error)
    
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error processing message</Message>
</Response>`

    return new Response(errorTwiml, {
      status: 500,
      headers: {
        'Content-Type': 'text/xml',
      },
    })
  }
}
