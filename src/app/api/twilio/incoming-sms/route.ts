import { NextRequest } from 'next/server'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { processInboundSms } from '@/lib/sms-processing'

export async function POST(req: NextRequest) {
  try {
    console.log('[SYSTEM] [INCOMING-SMS] Received SMS');
    
    const body = await req.text()
    
    // Validate Twilio webhook signature
    if (!requireTwilioAuth(req, body)) {
      console.error('[SYSTEM] [INCOMING-SMS] Invalid webhook signature')
      return new Response('Unauthorized', { status: 401 })
    }
    
    const params = new URLSearchParams(body)
    
    const From = params.get('From')
    const To = params.get('To')
    const Body = params.get('Body')
    const MessageSid = params.get('MessageSid')
    
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
    
    // Process the inbound SMS using the shared function
    const result = await processInboundSms({
      messageSid: MessageSid,
      from: From,
      to: To,
      body: Body,
      source: 'twilio'
    })
    
    if (!result.success) {
      console.error('[SYSTEM] [INCOMING-SMS] Processing failed:', result.error)
      return new Response(result.twiml, {
        status: 500,
        headers: {
          'Content-Type': 'text/xml',
        },
      })
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
