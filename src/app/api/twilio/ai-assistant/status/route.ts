import { NextRequest, NextResponse } from 'next/server'
import { getAISessionByCallSid } from '@/lib/ai-call-assistant/session'

/**
 * AI Call Assistant Status Route (Phase 0 - QA Only)
 * 
 * Returns the status of an AI call session for debugging/monitoring
 * 
 * SECURITY: Requires INTERNAL_API_SECRET for server-to-server authentication
 * to prevent unauthorized access to sensitive call session information.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify INTERNAL_API_SECRET for server-to-server authentication
    const authHeader = request.headers.get('authorization')
    const internalApiSecret = process.env.INTERNAL_API_SECRET

    if (!internalApiSecret) {
      console.error('[AI CALL ASSISTANT STATUS] INTERNAL_API_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[AI CALL ASSISTANT STATUS] Missing or invalid authorization header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    if (token !== internalApiSecret) {
      console.error('[AI CALL ASSISTANT STATUS] Invalid INTERNAL_API_SECRET')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const callSid = searchParams.get('call_sid')

    if (!callSid) {
      return NextResponse.json({ error: 'Missing call_sid parameter' }, { status: 400 })
    }

    console.log('[AI CALL ASSISTANT] Status check', { call_sid: callSid })

    const session = await getAISessionByCallSid(callSid)

    if (!session) {
      return NextResponse.json({
        error: 'Session not found',
        call_sid: callSid
      }, { status: 404 })
    }

    console.log('[AI CALL ASSISTANT] Session status', {
      session_id: session.id,
      status: session.status,
      fallback_stage: session.fallback_stage
    })

    return NextResponse.json({
      session_id: session.id,
      business_id: session.business_id,
      lead_id: session.lead_id,
      call_sid: session.call_sid,
      status: session.status,
      fallback_stage: session.fallback_stage,
      started_at: session.started_at,
      ended_at: session.ended_at,
      duration_seconds: session.duration_seconds,
      caller_name: session.caller_name,
      reason_for_call: session.reason_for_call,
      urgency: session.urgency,
      callback_number: session.callback_number,
      error_message: session.error_message,
    })

  } catch (error) {
    console.error('[AI CALL ASSISTANT] Error in status route:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
