import { NextRequest, NextResponse } from 'next/server'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { db } from '@/lib/supabase/admin'
import { checkAllGuards } from '@/lib/ai-call-assistant/config'
import { createAISession, failAISession } from '@/lib/ai-call-assistant/session'
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse'

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
 * 
 * Supports both POST (direct from Twilio) and GET (redirect from /api/twilio/voice)
 */
async function handlePOCStart(request: NextRequest, method: string) {
  try {
    console.log('[AI POC START] method:', method)

    // Read Twilio params from searchParams (GET) or body (POST)
    let params: Record<string, string>
    let rawBody = ''
    let contentType = ''

    if (method === 'GET') {
      // GET: read from URL searchParams
      const url = new URL(request.url)
      params = Object.fromEntries(url.searchParams)
    } else {
      // POST: read from body
      rawBody = await request.text()
      contentType = request.headers.get('content-type') || ''
      params = Object.fromEntries(new URLSearchParams(rawBody))
    }

    // Validate Twilio signature (skip for GET redirects - already validated at source)
    let isValid = true
    if (method === 'POST') {
      isValid = requireTwilioAuth(request, params, rawBody.length, contentType)
    }
    
    if (!isValid) {
      console.log('[AI POC START] Invalid Twilio signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const From = params.From
    const To = params.To
    const CallSid = params.CallSid

    console.log('[AI POC START] callSid:', CallSid)

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

    console.log('[AI POC START] fly websocket url:', flyWsUrl)

    // Return TwiML with Media Stream to Fly.io using VoiceResponse builder
    const response = new VoiceResponse()
    const connect = response.connect()
    const stream = connect.stream({ url: flyWsUrl })
    stream.parameter({ name: 'session_id', value: session.id })
    stream.parameter({ name: 'business_id', value: business.business.id })
    stream.parameter({ name: 'call_sid', value: CallSid })

    console.log('[AI POC START] returning TwiML')

    return new NextResponse(response.toString(), {
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

export async function GET(request: NextRequest) {
  return handlePOCStart(request, 'GET')
}

export async function POST(request: NextRequest) {
  return handlePOCStart(request, 'POST')
}

/**
 * Generate fallback TwiML to redirect to existing voicemail flow
 */
function generateFallbackTwiML(reason: string): NextResponse {
  console.log('[AI POC] Generating fallback TwiML', { reason })

  // Use Twilio's VoiceResponse builder for automatic XML escaping
  const response = new VoiceResponse()
  response.redirect('/api/twilio/voice')

  return new NextResponse(response.toString(), {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
      'X-AI-POC-Fallback-Reason': reason
    },
  })
}
