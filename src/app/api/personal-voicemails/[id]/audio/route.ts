import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAdmin } from '@/lib/supabase/admin';

// GET /api/personal-voicemails/[id]/audio - Secure audio proxy for personal voicemail playback
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const voicemailId = params.id;
    
    // Validate voicemail ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(voicemailId)) {
      console.log('[PERSONAL VOICEMAIL AUDIO] Invalid voicemail ID format');
      return NextResponse.json({ error: 'Invalid voicemail ID' }, { status: 400 });
    }

    // Authenticate user
    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.log('[PERSONAL VOICEMAIL AUDIO] Unauthorized access attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's business
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id')
      .eq('user_id', user.id)
      .single();

    if (businessError || !business) {
      console.log('[PERSONAL VOICEMAIL AUDIO] Business not found for user');
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Fetch voicemail and verify ownership
    const { data: voicemail, error: voicemailError } = await supabaseAdmin
      .from('personal_voicemails')
      .select('id, business_id, recording_url, recording_sid, deleted_at')
      .eq('id', voicemailId)
      .single();

    if (voicemailError || !voicemail) {
      console.log('[PERSONAL VOICEMAIL AUDIO] Voicemail not found:', voicemailId);
      return NextResponse.json({ error: 'Voicemail not found' }, { status: 404 });
    }

    // Verify voicemail belongs to user's business
    if (voicemail.business_id !== business.id) {
      console.log('[PERSONAL VOICEMAIL AUDIO] Unauthorized access: voicemail belongs to different business');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if voicemail is deleted
    if (voicemail.deleted_at) {
      console.log('[PERSONAL VOICEMAIL AUDIO] Voicemail is deleted:', voicemailId);
      return NextResponse.json({ error: 'Voicemail not found' }, { status: 404 });
    }

    // Validate Twilio recording URL
    const recordingUrl = voicemail.recording_url;
    if (!recordingUrl) {
      console.log('[PERSONAL VOICEMAIL AUDIO] No recording URL for voicemail:', voicemailId);
      return NextResponse.json({ error: 'Recording not available' }, { status: 404 });
    }

    const url = new URL(recordingUrl);
    // Validate URL is from Twilio's API domain
    if (!url.hostname.includes('api.twilio.com') && !url.hostname.includes('twilio.com')) {
      console.log('[PERSONAL VOICEMAIL AUDIO] Invalid recording URL hostname:', url.hostname);
      return NextResponse.json({ error: 'Invalid recording URL' }, { status: 400 });
    }

    // Validate URL path contains recording
    if (!url.pathname.includes('Recording')) {
      console.log('[PERSONAL VOICEMAIL AUDIO] Invalid recording URL path:', url.pathname);
      return NextResponse.json({ error: 'Invalid recording URL' }, { status: 400 });
    }

    // Check for Twilio credentials
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
      console.error('[PERSONAL VOICEMAIL AUDIO] Missing Twilio credentials');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    // Fetch audio from Twilio with Basic Auth
    const recordingSidPrefix = voicemail.recording_sid.substring(0, 8);
    console.log('[PERSONAL VOICEMAIL AUDIO] Fetching recording:', {
      voicemailId,
      recordingSidPrefix,
      hostname: url.hostname,
    });

    const twilioResponse = await fetch(recordingUrl, {
      headers: {
        'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      },
    });

    if (!twilioResponse.ok) {
      console.log('[PERSONAL VOICEMAIL AUDIO] Twilio fetch failed:', {
        status: twilioResponse.status,
        recordingSidPrefix,
      });
      
      if (twilioResponse.status === 401 || twilioResponse.status === 403) {
        return NextResponse.json({ error: 'Recording authentication failed' }, { status: 502 });
      }
      if (twilioResponse.status === 404) {
        return NextResponse.json({ error: 'Recording not found on Twilio' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Failed to fetch recording' }, { status: 502 });
    }

    // Get content type from Twilio response
    const contentType = twilioResponse.headers.get('content-type') || 'audio/mpeg';
    
    // Get audio data
    const audioBuffer = await twilioResponse.arrayBuffer();
    
    console.log('[PERSONAL VOICEMAIL AUDIO] Recording fetched successfully:', {
      voicemailId,
      recordingSidPrefix,
      contentType,
      size: audioBuffer.byteLength,
    });

    // Stream audio to client with appropriate headers
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': audioBuffer.byteLength.toString(),
        'Cache-Control': 'private, max-age=3600',
        'Accept-Ranges': 'bytes',
      },
    });

  } catch (error) {
    console.error('[PERSONAL VOICEMAIL AUDIO] Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
