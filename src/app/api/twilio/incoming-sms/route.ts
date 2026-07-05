import { NextRequest } from 'next/server'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { processInboundSms } from '@/lib/sms-processing'
import { checkIncomingSmsRateLimit } from '@/lib/rate-limit'
import { notificationServiceServer } from '@/lib/notifications-server'

export async function POST(req: NextRequest) {
  try {
    // Read raw body BEFORE any processing
    const rawBody = await req.text();
    const contentType = req.headers.get('content-type') || '';

    // Parse body using URLSearchParams
    const params = Object.fromEntries(new URLSearchParams(rawBody))

    // Signature validation
    const isValid = requireTwilioAuth(req, params, rawBody.length, contentType);

    if (!isValid) {
      console.error('[INBOUND SMS] Signature validation failed');
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Unauthorized: Invalid signature</Message>
</Response>`
      return new Response(errorTwiml, {
        status: 401,
        headers: {
          'Content-Type': 'text/xml',
        },
      })
    }
    
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

    // Check for Twilio opt-in event metadata
    const SmsStatus = formData.get('SmsStatus')?.toString() || ''
    const SmsDirection = formData.get('SmsDirection')?.toString() || ''

    // Extract MMS media if present
    const media: Array<{ url: string; contentType: string }> = []
    if (NumMedia > 0) {
      for (let i = 0; i < NumMedia; i++) {
        const mediaUrl = params[`MediaUrl${i}`]
        const mediaContentType = params[`MediaContentType${i}`]
        if (mediaUrl && mediaContentType) {
          media.push({ url: mediaUrl, contentType: mediaContentType })
        }
      }
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

    if (!From || !To || !MessageSid || !hasContent) {
      console.error('[INBOUND SMS] Missing required fields or no content:', {
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
    console.error('[INBOUND SMS] Unexpected error:', error)

    // Defensive fallback: always respond with 200 to prevent Twilio retries
    return new Response('ok', { status: 200 })
  }
}
