import { NextRequest } from 'next/server'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { processInboundSms } from '@/lib/sms-processing'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client for idempotency check
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  console.log('[INBOUND SMS WEBHOOK HIT]')
  console.log('[INBOUND SMS REQUEST]', {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  })

  try {
    // Read raw body exactly once for validation
    const rawBody = await req.text();
    const contentType = req.headers.get('content-type') || '';

    // Parse body into params using URLSearchParams
    const params = Object.fromEntries(new URLSearchParams(rawBody));

    // Validate Twilio signature with params object
    const isValid = requireTwilioAuth(req, params, rawBody.length, contentType);
    if (!isValid) {
      console.error('[INBOUND SMS SIGNATURE INVALID]', {
        url: req.url,
        contentType
      })
      return new Response('Unauthorized', { status: 401 });
    }

    console.log('[INBOUND SMS SIGNATURE VALID]')

    const From = params.From
    const To = params.To
    const Body = params.Body
    const MessageSid = params.MessageSid

    if (!From || !To || !Body || !MessageSid) {
      console.error('[INBOUND SMS ERROR]', {
        error: 'Missing required fields',
        From,
        To,
        BodyLength: Body?.length || 0,
        MessageSid
      })

      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Service unavailable</Message>
</Response>`

      return new Response(errorTwiml, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml'
        }
      })
    }

    // Database-backed idempotency check using Twilio MessageSid
    // Prevents replay attacks across server instances and deployments
    const { data: existingMessage, error: idempotencyError } = await supabase
      .from('messages')
      .select('id')
      .eq('twilio_message_sid', MessageSid)
      .maybeSingle()

    if (existingMessage) {
      console.log('[INBOUND SMS IDEMPOTENCY] Message already processed', {
        MessageSid,
        existing_message_id: existingMessage.id
      })
      // Return success to prevent Twilio retries
      return new Response('ok', { status: 200 })
    }

    if (idempotencyError && idempotencyError.code !== 'PGRST116') {
      console.error('[INBOUND SMS IDEMPOTENCY] Error checking message:', idempotencyError)
      // Continue with processing on error (don't block legitimate messages)
    }

    console.log('[INBOUND SMS BUSINESS LOOKUP START]', { to: To })
    console.log('[INBOUND SMS LEAD LOOKUP START]', { from: From })

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
      console.error('[INBOUND SMS ERROR]', {
        error: result.error,
        from: From,
        to: To
      })
      return new Response(result.twiml, {
        status: 200,
        headers: {
          'Content-Type': 'text/xml'
        }
      })
    }
    
    console.log('[INBOUND SMS SUCCESS]', {
      leadId: result.lead?.id,
      conversationId: result.conversation?.id,
      messageId: result.message?.id,
      from: From,
      to: To
    })
    
    if (result.lead) {
      console.log('[INBOUND SMS LEAD LOOKUP RESULT]', { leadId: result.lead.id })
    }
    
    if (result.conversation) {
      console.log('[INBOUND SMS CONVERSATION LOOKUP RESULT]', { conversationId: result.conversation.id })
    }
    
    if (result.message) {
      console.log('[INBOUND SMS MESSAGE INSERT SUCCESS]', { messageId: result.message.id })
    }
    
    return new Response(result.twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml'
      }
    })
    
  } catch (error) {
    console.error('[INBOUND SMS ERROR]', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    })
    
    // Defensive fallback: always respond with 200 to prevent Twilio retries
    return new Response('ok', { status: 200 })
  }
}
