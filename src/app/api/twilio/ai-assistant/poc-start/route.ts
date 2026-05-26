import { NextRequest, NextResponse } from 'next/server'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { db } from '@/lib/supabase/admin'
import { checkAllGuards } from '@/lib/ai-call-assistant/config'
import { createAISession, failAISession } from '@/lib/ai-call-assistant/session'

/**
 * AI Assistant POC Start Route (Phase 1A)
 * 
 * Purpose: Route calls to Fly.io WebSocket service for technical proof-of-concept
 * 
 * This route:
 * 1. Validates feature flags
 * 2. Creates session record
 * 3. Returns TwiML with WebSocket URL for Fly.io service
 * 4. Falls back to voicemail on any error
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[AI POC] POC start route hit')

    // Read body for Twilio params
    const rawBody = await request.text()
    const contentType = request.headers.get('content-type') || ''
    const params = Object.fromEntries(new URLSearchParams(rawBody))

    // Validate Twilio signature
    const isValid = requireTwilioAuth(request, params, rawBody.length, contentType)
    if (!isValid) {
      console.log('[AI POC] Invalid Twilio signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const From = params.From
    const To = params.To
    const CallSid = params.CallSid

    if (!From || !To || !CallSid) {
      console.log('[AI POC] Missing required params')
      return generateFallbackTwiML('missing_params')
    }

    // Lookup business
    const business = await db.getBusinessByTwilioNumber(To)
    if (!business || !business.business) {
      console.log('[AI POC] Business not found')
      return generateFallbackTwiML('business_not_found')
    }

    console.log('[AI POC] Business found', {
      business_id: business.business.id,
      business_name: business.business.name
    })

    // Check all guards
    const guardResult = checkAllGuards(business.business.id)
    if (!guardResult.passed) {
      console.log('[AI POC] Guard failed, falling back to voicemail', {
        reason: guardResult.reason
      })
      return generateFallbackTwiML(`guard_failed_${guardResult.reason}`)
    }

    // Create AI session
    const session = await createAISession({
      business_id: business.business.id,
      lead_id: null, // Phase 1A: no lead creation yet
      call_sid: CallSid,
    })

    if (!session) {
      console.log('[AI POC] Failed to create session, falling back')
      return generateFallbackTwiML('session_creation_failed')
    }

    console.log('[AI POC] Session created', {
      session_id: session.id,
      call_sid: session.call_sid
    })

    // Get Fly.io WebSocket URL from environment
    const flyWsUrl = process.env.AI_VOICE_FLY_WS_URL || 'wss://replyflow-ai-voice.fly.dev/stream'

    console.log('[AI POC] Routing to Fly.io WebSocket service', {
      ws_url: flyWsUrl,
      session_id: session.id
    })

    // Return TwiML with Media Stream to Fly.io
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${flyWsUrl}">
      <Parameter name="session_id" value="${session.id}" />
      <Parameter name="business_id" value="${business.business.id}" />
      <Parameter name="call_sid" value="${CallSid}" />
    </Stream>
  </Connect>
</Response>`

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
        'X-AI-POC': 'phase-1a'
      },
    })

  } catch (error) {
    console.error('[AI POC] Error in POC start route:', error)
    return generateFallbackTwiML('unexpected_error')
  }
}

/**
 * Generate fallback TwiML to redirect to existing voicemail flow
 */
function generateFallbackTwiML(reason: string): NextResponse {
  console.log('[AI POC] Generating fallback TwiML', { reason })

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>/api/twilio/voice</Redirect>
</Response>`

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
      'X-AI-POC-Fallback-Reason': reason
    },
  })
}
