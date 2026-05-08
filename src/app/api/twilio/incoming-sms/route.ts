import { NextRequest } from 'next/server'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { processInboundSms } from '@/lib/sms-processing'

export async function POST(req: NextRequest) {
  try {
    console.log('[SYSTEM] [INCOMING-SMS] Received SMS');
    
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
    
    console.log('[SYSTEM] [INCOMING-SMS] Signature validation passed')
    
    const From = params.From
    const To = params.To
    const Body = params.Body
    const MessageSid = params.MessageSid
    
    if (!From || !To || !Body || !MessageSid) {
      console.error('[SYSTEM] [INCOMING-SMS] Missing required fields:', { From, To, Body, MessageSid })
      
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
    
    console.log('[INBOUND SMS] Processing inbound SMS:', {
      From,
      To,
      BodyLength: Body.length
    })
    
    // Process the inbound SMS using the shared function
    const result = await processInboundSms({
      messageSid: MessageSid,
      from: From,
      to: To,
      body: Body,
      source: 'twilio'
    })
    
    if (!result.success) {
      console.error('[INBOUND SMS] Processing failed:', result.error)
      return new Response(result.twiml, {
        status: 500,
        headers: {
          'Content-Type': 'text/xml'
        }
      })
    }
    
    console.log('[INBOUND SMS] Processing successful')
    
    // Add operational logs for successful processing
    if (result.lead) {
      console.log('[INBOUND SMS] Lead found/created:', result.lead.id)
    }
    
    if (result.conversation) {
      console.log('[INBOUND SMS] Conversation found/created:', result.conversation.id)
    }
    
    if (result.message) {
      console.log('[INBOUND SMS] Message inserted:', result.message.id)
    }
    
    // Return the TwiML response
    return new Response(result.twiml, {
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
