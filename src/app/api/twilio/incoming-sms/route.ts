import { NextRequest } from 'next/server'
import { db } from '@/lib/supabase'
import { normalizePhoneNumber } from '@/lib/twilio'
import { sendSms } from '@/lib/twilio'

export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const params = new URLSearchParams(body)
    
    const From = params.get('From')
    const To = params.get('To')
    const Body = params.get('Body')
    
    if (!From || !To || !Body) {
      console.error('[incoming-sms] Missing required fields:', { From, To, Body })
      
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
    
    console.log(`[incoming-sms] From: ${From}, To: ${To}, Body: ${Body}`)
    
    // Find business by Twilio phone number
    const business = await db.getBusinessByPhone(To)
    
    // Log resolved business details
    if (business) {
      console.log(`[incoming-sms] Resolved business:`, {
        id: business.id,
        name: business.name,
        phone_number: business.twilio_phone_number
      })
    }
    if (!business) {
      console.error(`[incoming-sms] Business not found for phone: ${To}`)
      
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
    
    console.log(`[incoming-sms] Found business: ${business.name} (${business.id})`)
    
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
        console.error('[incoming-sms] Failed to create lead')
        
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
      
      console.log(`[incoming-sms] Created new lead: ${lead.id}`)
    } else if (lead) {
      // Update existing lead's status to 'replied' and track reply time
      const updatedLead = await db.updateLead(lead.id, {
        status: 'replied', // Customer replied, so mark as replied
        last_message_at: new Date().toISOString(),
        last_reply_at: new Date().toISOString(), // Track when customer replied
      })
      
      if (!updatedLead) {
        console.error('[incoming-sms] Failed to update lead')
      } else {
        console.log(`[incoming-sms] Updated existing lead: ${updatedLead.id}`)
        lead = updatedLead
      }
    }
    
    // Handle opt-out requests
    if (isOptOut) {
      console.log(`[incoming-sms] Opt-out request received from lead: ${lead.id}`)
      
      // Update lead to set opted_out = true
      const updatedLead = await db.updateLead(lead.id, { opted_out: true })
      
      if (updatedLead) {
        console.log(`[incoming-sms] Lead opted out: ${lead.id}`)
        lead = updatedLead
      } else {
        console.error('[incoming-sms] Failed to update lead opted_out status')
      }
      
      // Cancel all pending follow-up jobs for this lead
      const jobsCancelled = await db.cancelPendingFollowUpJobsForLead(lead.id)
      
      if (jobsCancelled) {
        console.log(`[incoming-sms] Cancelled pending follow-up jobs for opted-out lead: ${lead.id}`)
      } else {
        console.error('[incoming-sms] Failed to cancel follow-up jobs for opted-out lead')
      }
      
      // Send confirmation reply SMS
      const confirmationMessage = "You have been unsubscribed. You will no longer receive messages."
      const messageSid = await sendSms(business, From, confirmationMessage)
      
      if (messageSid) {
        console.log(`[incoming-sms] Sent opt-out confirmation SMS: ${messageSid}`)
      } else {
        console.error('[incoming-sms] Failed to send opt-out confirmation SMS')
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
        console.error('[incoming-sms] Failed to create conversation')
        
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
      
      console.log(`[incoming-sms] Created new conversation: ${conversation.id}`)
    } else {
      // Update existing conversation's last activity
      const updatedConversation = await db.updateConversation(conversation.id, {
        last_activity_at: new Date().toISOString(),
      })
      
      if (!updatedConversation) {
        console.error('[incoming-sms] Failed to update conversation')
      } else {
        console.log(`[incoming-sms] Updated conversation: ${updatedConversation.id}`)
        conversation = updatedConversation
      }
    }
    
    // Cancel all pending follow-ups for this conversation when customer replies
    if (conversation) {
      const cancelled = await db.cancelPendingFollowUpsForConversation(conversation.id)
      
      if (cancelled) {
        console.log(`[incoming-sms] Cancelled pending follow-ups for conversation: ${conversation.id}`)
      } else {
        console.error('[incoming-sms] Failed to cancel follow-ups')
      }
    }
    
    // Cancel all pending follow-up jobs for this lead when customer replies
    const jobsCancelled = await db.cancelPendingFollowUpJobsForLead(lead.id)
    
    if (jobsCancelled) {
      console.log(`[incoming-sms] Cancelled pending follow-up jobs for lead: ${lead.id}`)
    } else {
      console.error('[incoming-sms] Failed to cancel follow-up jobs')
    }
    
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
      console.error('[incoming-sms] Failed to save message')
    } else {
      console.log(`[incoming-sms] Saved inbound message: ${message.id}`)
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
    console.error('[incoming-sms] Unexpected error:', error)
    
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
