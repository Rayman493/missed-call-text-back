import { NextRequest, NextResponse } from 'next/server'
import { requireTwilioAuth } from '@/lib/twilio/webhook'
import { db } from '@/lib/supabase/admin'
import { normalizePhoneNumber } from '@/lib/twilio'
import { checkAllGuards } from '@/lib/ai-call-assistant/config'
import { createAISession, failAISession } from '@/lib/ai-call-assistant/session'
import { getGreeting } from '@/lib/ai-call-assistant/prompts'

/**
 * AI Call Assistant Start Route (Phase 0 - QA Only)
 * 
 * This route initializes an AI call session and returns TwiML.
 * 
 * PHASE 0 LIMITATION:
 * Vercel serverless functions may not support persistent WebSocket connections
 * required for Twilio Media Streams + OpenAI Realtime API.
 * 
 * For Phase 0, this route:
 * 1. Validates all feature flags
 * 2. Creates session record
 * 3. Falls back to voicemail (documents WebSocket limitation)
 * 
 * Full WebSocket implementation requires:
 * - Dedicated WebSocket server (e.g., Node.js, Go)
 * - Separate infrastructure from Vercel
 * - Persistent connections
 * 
 * This still proves the guard system and session creation works.
 */
export async function POST(request: NextRequest) {
  try {
    console.log('[AI CALL ASSISTANT] Start route hit')

    // Read body for Twilio params
    const rawBody = await request.text()
    const contentType = request.headers.get('content-type') || ''
    const params = Object.fromEntries(new URLSearchParams(rawBody))

    // Validate Twilio signature
    const isValid = requireTwilioAuth(request, params, rawBody.length, contentType)
    if (!isValid) {
      console.log('[AI CALL ASSISTANT] Invalid Twilio signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const From = params.From
    const To = params.To
    const CallSid = params.CallSid

    if (!From || !To || !CallSid) {
      console.log('[AI CALL ASSISTANT] Missing required params')
      return generateFallbackTwiML('missing_params')
    }

    // Lookup business
    const business = await db.getBusinessByTwilioNumber(To)
    if (!business || !business.business) {
      console.log('[AI CALL ASSISTANT] Business not found')
      return generateFallbackTwiML('business_not_found')
    }

    console.log('[AI CALL ASSISTANT] Business found', {
      business_id: business.business.id,
      business_name: business.business.name
    })

    // Check all guards
    const guardResult = checkAllGuards(business.business.id)
    if (!guardResult.passed) {
      console.log('[AI CALL ASSISTANT] Guard failed, falling back to voicemail', {
        reason: guardResult.reason
      })
      return generateFallbackTwiML(`guard_failed_${guardResult.reason}`)
    }

    // Create AI session
    const normalizedCallerPhone = normalizePhoneNumber(From)
    
    // Check for existing lead
    const lead = await db.getLeadByPhone(business.business.id, normalizedCallerPhone)

    const session = await createAISession({
      business_id: business.business.id,
      lead_id: lead?.id || null,
      call_sid: CallSid,
    })

    if (!session) {
      console.log('[AI CALL ASSISTANT] Failed to create session, falling back')
      return generateFallbackTwiML('session_creation_failed')
    }

    console.log('[AI CALL ASSISTANT] Session created', {
      session_id: session.id,
      call_sid: session.call_sid
    })

    // PHASE 0 LIMITATION: Vercel WebSocket support
    // For Phase 0, we document the limitation and fall back to voicemail
    // Full implementation requires dedicated WebSocket server infrastructure
    console.log('[AI CALL ASSISTANT] PHASE 0 LIMITATION: Vercel WebSocket support required for Media Streams')
    console.log('[AI CALL ASSISTANT] Falling back to voicemail - WebSocket infrastructure not yet deployed')

    await failAISession(session.id, 'websocket_connect', 'PHASE 0: WebSocket infrastructure not deployed - requires dedicated server')

    return generateFallbackTwiML('phase0_websocket_limitation')

  } catch (error) {
    console.error('[AI CALL ASSISTANT] Error in start route:', error)
    return generateFallbackTwiML('unexpected_error')
  }
}

/**
 * Generate fallback TwiML to redirect to existing voicemail flow
 */
function generateFallbackTwiML(reason: string): NextResponse {
  console.log('[AI CALL ASSISTANT] Generating fallback TwiML', { reason })

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Redirect>/api/twilio/voice</Redirect>
</Response>`

  return new NextResponse(twiml, {
    status: 200,
    headers: {
      'Content-Type': 'text/xml',
      'X-AI-Assistant-Fallback-Reason': reason
    },
  })
}
