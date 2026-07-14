import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'

/**
 * AI Assistant Transcript Append Route
 * 
 * Receives structured transcript turns from the AI service and appends them to ai_call_records.
 * This ensures chronological conversation persistence for future AI calls.
 * 
 * SECURITY: Requires INTERNAL_API_SECRET for server-to-server authentication
 */

interface TranscriptTurn {
  role: 'assistant' | 'caller' | 'user'
  text: string
  timestamp: string
}

interface TranscriptAppendRequest {
  call_sid: string
  turns: TranscriptTurn[]
}

export async function POST(req: NextRequest) {
  try {
    // Verify INTERNAL_API_SECRET for server-to-server authentication
    const authHeader = req.headers.get('authorization')
    const internalApiSecret = process.env.INTERNAL_API_SECRET

    if (!internalApiSecret) {
      console.error('[AI TRANSCRIPT APPEND] INTERNAL_API_SECRET not configured')
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[AI TRANSCRIPT APPEND] Missing or invalid authorization header')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.replace('Bearer ', '')
    if (token !== internalApiSecret) {
      console.error('[AI TRANSCRIPT APPEND] Invalid INTERNAL_API_SECRET')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse request body
    const body: TranscriptAppendRequest = await req.json()
    const { call_sid, turns } = body

    if (!call_sid || !turns || !Array.isArray(turns)) {
      console.error('[AI TRANSCRIPT APPEND] Missing required fields', { call_sid, turns })
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    console.log('[AI TRANSCRIPT APPEND] Appending transcript turns', {
      call_sid,
      turnCount: turns.length
    })

    // Get existing AI call record
    const { data: existingRecord, error: lookupError } = await supabaseAdmin
      .from('ai_call_records')
      .select('id, transcript')
      .eq('call_sid', call_sid)
      .single()

    if (lookupError) {
      console.error('[AI TRANSCRIPT APPEND] Failed to lookup AI call record', lookupError)
      return NextResponse.json({ error: 'AI call record not found' }, { status: 404 })
    }

    // Parse existing transcript or start with empty array
    let existingTranscript: TranscriptTurn[] = []
    if (existingRecord.transcript && Array.isArray(existingRecord.transcript)) {
      existingTranscript = existingRecord.transcript
    }

    // Append new turns in chronological order
    const updatedTranscript = [...existingTranscript, ...turns]

    // Update the record
    const { error: updateError } = await supabaseAdmin
      .from('ai_call_records')
      .update({
        transcript: updatedTranscript,
        updated_at: new Date().toISOString()
      })
      .eq('id', existingRecord.id)

    if (updateError) {
      console.error('[AI TRANSCRIPT APPEND] Failed to update transcript', updateError)
      return NextResponse.json({ error: 'Failed to update transcript' }, { status: 500 })
    }

    console.log('[AI TRANSCRIPT APPEND] Successfully appended transcript turns', {
      call_sid,
      previousTurnCount: existingTranscript.length,
      newTurnCount: updatedTranscript.length
    })

    return NextResponse.json({
      success: true,
      totalTurns: updatedTranscript.length
    })

  } catch (error) {
    console.error('[AI TRANSCRIPT APPEND] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
