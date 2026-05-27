import { NextRequest } from 'next/server'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { processInboundSms } from '@/lib/sms-processing'
import { checkIncomingSmsRateLimit } from '@/lib/rate-limit'
import { notificationService } from '@/lib/notifications'

export async function POST(req: NextRequest) {
  // CRITICAL: Log IMMEDIATELY to verify route is being hit
  console.log('[INCOMING SMS WEBHOOK HIT]')
  console.log('[INCOMING SMS METHOD]', req.method)
  console.log('[INCOMING SMS URL]', req.url)
  
  try {
    // Read raw body BEFORE any processing
    const rawBody = await req.text();
    console.log('[INCOMING SMS RAW BODY]', rawBody)
    console.log('[INCOMING SMS HEADERS]', Object.fromEntries(req.headers.entries()))
    
    const contentType = req.headers.get('content-type') || '';
    console.log('[MMS DEBUG] content-type', contentType)
    console.log('[MMS DEBUG] raw body length', rawBody.length)
    
    // Parse body using URLSearchParams
    const params = Object.fromEntries(new URLSearchParams(rawBody))
    
    console.log('[INCOMING SMS NUMMEDIA]', params['NumMedia'])
    console.log('[INCOMING SMS MEDIA URL 0]', params['MediaUrl0'])
    console.log('[INCOMING SMS CONTENT TYPE 0]', params['MediaContentType0'])
    
    // TEMPORARILY DISABLE signature validation for debugging
    // const isValid = requireTwilioAuth(req, params, rawBody.length, contentType);
    // if (!isValid) {
    //   console.error('[MMS DEBUG] signature validation failed')
    //   return new Response('Unauthorized', { status: 401 });
    // }
    console.log('[MMS DEBUG] signature validation DISABLED for debugging')
    
    // Parse body using formData for proper form data handling
    const formData = new FormData()
    
    // Populate FormData with params for backward compatibility
    for (const [key, value] of Object.entries(params)) {
      formData.append(key, value as string)
    }
    
    // Extract fields using formData
    const From = formData.get('From')?.toString() || ''
    const To = formData.get('To')?.toString() || ''
    const Body = formData.get('Body')?.toString() || ''
    const MessageSid = formData.get('MessageSid')?.toString() || ''
    const NumMedia = Number(formData.get('NumMedia') || 0)
    
    console.log('[MMS DEBUG] From', From)
    console.log('[MMS DEBUG] To', To)
    console.log('[MMS DEBUG] Body', Body)
    console.log('[MMS DEBUG] MessageSid', MessageSid)
    console.log('[MMS DEBUG] NumMedia', NumMedia)
    
    // Extract MMS media if present
    const media: Array<{ url: string; contentType: string }> = []
    if (NumMedia > 0) {
      for (let i = 0; i < NumMedia; i++) {
        const mediaUrl = params[`MediaUrl${i}`]
        const mediaContentType = params[`MediaContentType${i}`]
        if (mediaUrl && mediaContentType) {
          media.push({ url: mediaUrl, contentType: mediaContentType })
          console.log(`[MMS DEBUG] Media ${i}: url=${mediaUrl.substring(0, 30)}..., type=${mediaContentType}`)
        } else {
          console.log(`[MMS DEBUG] Media ${i}: missing url or contentType`)
        }
      }
      console.log('[MMS DEBUG] Total media extracted:', media.length)
    }
    
    // Rate limiting check (phone number-based)
    const rateLimitResult = await checkIncomingSmsRateLimit(From);
    if (!rateLimitResult.success) {
      console.warn('[Incoming SMS] Rate limit exceeded for phone:', From);
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Too many requests</Message>
</Response>`
      return new Response(errorTwiml, {
        status: 429,
        headers: {
          'Content-Type': 'text/xml',
          'Retry-After': rateLimitResult.reset.toString(),
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
        },
      })
    }
    
    // Validate required fields - allow empty body if media is present
    const hasContent = (Body && Body.length > 0) || (media && media.length > 0)
    console.log('[MMS DEBUG] hasContent check', { hasContent, BodyLength: Body.length, MediaCount: media.length })
    
    if (!From || !To || !MessageSid || !hasContent) {
      console.error('[SYSTEM] [INCOMING-SMS] Missing required fields or no content:', { 
        From, 
        To, 
        BodyLength: Body?.length || 0,
        MediaCount: media?.length || 0,
        MessageSid 
      })
      
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Error: Missing required fields or no content</Message>
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
      source: 'twilio',
      media: media.length > 0 ? media : undefined
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
      console.log('[MMS DEBUG] Lead ID for tracing:', result.lead.id)
    }
    
    if (result.conversation) {
      console.log('[INBOUND SMS] Conversation found/created:', result.conversation.id)
    }
    
    if (result.message) {
      console.log('[INBOUND SMS] Message inserted:', result.message.id)
      console.log('[MMS DEBUG] Message ID for tracing:', result.message.id)
      
      // Create notification for customer reply
      if (result.lead && result.lead.business_id) {
        try {
          await notificationService.notifyCustomerReply(
            result.lead.business_id,
            result.lead.caller_phone || 'Unknown',
            Body || 'Media message',
            result.lead.id
          );
          console.log('[INBOUND SMS] Notification created for customer reply');
        } catch (error) {
          console.error('[INBOUND SMS] Error creating notification:', error);
        }
      }
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
    
    // Defensive fallback: always respond with 200 to prevent Twilio retries
    return new Response('ok', { status: 200 })
  }
}
