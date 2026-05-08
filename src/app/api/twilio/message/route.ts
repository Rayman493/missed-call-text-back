import { NextRequest } from 'next/server'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { processInboundSms } from '@/lib/sms-processing'

export async function POST(req: NextRequest) {
  try {
    console.log('[INBOUND SMS] Webhook hit')
    
    const body = await req.text()
    
    // Validate Twilio webhook signature - support both header formats
    if (!requireTwilioAuth(req, body)) {
      console.error('[INBOUND SMS] Invalid webhook signature')
      return new Response('Unauthorized', { status: 401 })
    }
    
    console.log('[INBOUND SMS] Signature validation passed')
    
    const params = new URLSearchParams(body)
    
    const From = params.get('From')
    const To = params.get('To')
    const Body = params.get('Body')
    const MessageSid = params.get('MessageSid')
    
    if (!From || !To || !Body || !MessageSid) {
      console.error('[INBOUND SMS] Missing required fields:', { From, To, Body, MessageSid })
      
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Service unavailable</Message>
</Response>`
      
      return new Response(errorTwiml, {
        status: 500,
        headers: {
          'Content-Type': 'text/xml'
        }
      })
    }
    
    console.log('[INBOUND SMS] Processing message:', {
      MessageSid,
      From,
      To,
      BodyLength: Body.length
    })
    
    // Process inbound SMS using the same shared function as incoming-sms
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
    
    return new Response(result.twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml'
      }
    })
    
  } catch (error) {
    console.error('[INBOUND SMS] Unexpected error:', error)
    
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Service unavailable</Message>
</Response>`
    
    return new Response(errorTwiml, {
      status: 500,
      headers: {
        'Content-Type': 'text/xml'
      }
    })
  }
}
