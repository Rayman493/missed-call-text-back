import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase/admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recordingSid: string }> }
) {
  try {
    const { recordingSid } = await params

    console.log('[VOICEMAIL PLAYBACK] Request received:', {
      recordingSid,
      timestamp: new Date().toISOString()
    })

    // Validate recording SID format
    if (!recordingSid || typeof recordingSid !== 'string' || !recordingSid.startsWith('RE')) {
      console.log('[VOICEMAIL PLAYBACK] Invalid recording SID format:', recordingSid)
      return NextResponse.json(
        { error: 'Invalid recording SID' },
        { status: 400 }
      )
    }

    // Create authenticated Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get user session from Authorization header
    const authHeader = request.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('[VOICEMAIL PLAYBACK] Authentication required - no Bearer token')
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      console.log('[VOICEMAIL PLAYBACK] Invalid authentication token:', {
        authError: authError?.message,
        hasUser: !!user
      })
      return NextResponse.json(
        { error: 'Invalid authentication token' },
        { status: 401 }
      )
    }

    console.log('[VOICEMAIL PLAYBACK] User authenticated:', {
      userId: user.id,
      userEmail: user.email
    })

    // Find the voicemail recording and verify business ownership
    const { data: recording, error: recordingError } = await supabaseAdmin
      .from('voicemail_recordings')
      .select(`
        *,
        businesses!inner (
          user_id
        )
      `)
      .eq('recording_sid', recordingSid)
      .eq('businesses.user_id', user.id)
      .single()

    if (recordingError || !recording) {
      console.log('[VOICEMAIL PLAYBACK] Recording not found or access denied:', {
        recordingSid,
        userId: user.id,
        recordingError: recordingError?.message,
        hasRecording: !!recording
      })

      // Debug: Log latest 5 recording_sid values if not found
      if (!recording) {
        console.log('[VOICEMAIL PLAYBACK] DEBUG: Fetching latest 5 recording_sid values for debugging')
        const { data: latestRecordings, error: latestError } = await supabaseAdmin
          .from('voicemail_recordings')
          .select('recording_sid, business_id, created_at')
          .order('created_at', { ascending: false })
          .limit(5)
        
        if (!latestError && latestRecordings) {
          console.log('[VOICEMAIL PLAYBACK] DEBUG: Latest 5 recording_sid values:', {
            recordings: latestRecordings.map(r => ({
              recordingSid: r.recording_sid,
              businessId: r.business_id,
              createdAt: r.created_at
            }))
          })
        } else {
          console.log('[VOICEMAIL PLAYBACK] DEBUG: Failed to fetch latest recordings:', latestError?.message)
        }
      }

      return NextResponse.json(
        { error: 'Recording not found or access denied' },
        { status: 404 }
      )
    }

    console.log('[VOICEMAIL PLAYBACK] Recording found and ownership verified:', {
      recordingSid,
      businessId: recording.business_id,
      leadId: recording.lead_id,
      recordingStatus: recording.recording_status
    })

    // Verify the recording has a valid URL
    if (!recording.recording_url) {
      return NextResponse.json(
        { error: 'Recording URL not available' },
        { status: 404 }
      )
    }

    // Fetch the recording from Twilio using server-side credentials
    const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN

    if (!twilioAccountSid || !twilioAuthToken) {
      console.log('[VOICEMAIL PLAYBACK] Twilio credentials not configured')
      return NextResponse.json(
        { error: 'Service configuration error' },
        { status: 500 }
      )
    }

    // Create Basic Auth header for Twilio API
    const credentials = Buffer.from(`${twilioAccountSid}:${twilioAuthToken}`).toString('base64')
    const twilioAuthHeader = `Basic ${credentials}`

    // Build Twilio URL directly for reliable access
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Recordings/${recordingSid}.mp3`
    
    console.log('[VOICEMAIL PLAYBACK] Fetching from Twilio:', {
      originalUrl: recording.recording_url,
      finalUrl: twilioUrl,
      recordingSid: recording.recording_sid,
      twilioAccountSid: twilioAccountSid.substring(0, 8) + '...' // Log partial SID for security
    })

    // Fetch the recording from Twilio with Basic Auth
    const recordingResponse = await fetch(twilioUrl, {
      method: 'GET',
      headers: {
        'Authorization': twilioAuthHeader,
        'User-Agent': 'ReplyFlow/1.0'
      }
    })

    console.log('[VOICEMAIL PLAYBACK] Twilio fetch status:', {
      status: recordingResponse.status,
      statusText: recordingResponse.statusText,
      contentType: recordingResponse.headers.get('content-type'),
      recordingSid: recording.recording_sid
    })

    if (!recordingResponse.ok) {
      console.log('[VOICEMAIL PLAYBACK] Failed to fetch recording from Twilio:', {
        status: recordingResponse.status,
        statusText: recordingResponse.statusText,
        recordingSid: recording.recording_sid,
        url: twilioUrl
      })
      return NextResponse.json(
        { error: 'Unable to load voicemail recording' },
        { status: 500 }
      )
    }

    // Get the audio data and content type
    const audioData = await recordingResponse.arrayBuffer()
    const contentType = recordingResponse.headers.get('content-type') || 'audio/mpeg'

    console.log('[VOICEMAIL PLAYBACK] Successfully fetched recording from Twilio:', {
      audioDataSize: audioData.byteLength,
      contentType: contentType,
      recordingSid: recording.recording_sid
    })

    // Log access for audit purposes
    console.log('[VOICEMAIL PLAYBACK] Recording accessed successfully:', {
      recordingSid,
      userId: user.id,
      businessId: recording.business_id,
      leadId: recording.lead_id,
      timestamp: new Date().toISOString()
    })

    // Stream the audio back to the browser with proper headers
    return new NextResponse(audioData, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=300', // Cache for 5 minutes
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      }
    })

  } catch (error) {
    console.error('Voicemail streaming error:', error)
    return NextResponse.json(
      { error: 'Unable to load voicemail recording' },
      { status: 500 }
    )
  }
}
