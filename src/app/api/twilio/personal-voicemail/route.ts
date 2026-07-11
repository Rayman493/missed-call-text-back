import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { normalizePhoneNumberForStorage } from '@/lib/supabase/admin';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { notificationServiceServer } from '@/lib/notifications-server';
import { formatPhoneNumber } from '@/lib/utils';

// POST /api/twilio/personal-voicemail - Handle personal voicemail recording from ignored contacts
// This is completely separate from the customer system
// No lead, no conversation, no AI, no SMS, no follow-ups
export async function POST(request: NextRequest) {
  console.log('[PERSONAL VOICEMAIL WEBHOOK] Starting personal voicemail processing');
  
  try {
    const rawBody = await request.text();
    const contentType = request.headers.get('content-type') || '';
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    
    console.log('[PERSONAL VOICEMAIL WEBHOOK] Params:', {
      CallSid: params.CallSid,
      From: params.From,
      RecordingUrl: params.RecordingUrl,
      RecordingSid: params.RecordingSid,
      RecordingDuration: params.RecordingDuration,
    });
    
    // Validate Twilio signature
    const isValid = requireTwilioAuth(request, params, rawBody.length, contentType);
    if (!isValid) {
      console.error('[PERSONAL VOICEMAIL WEBHOOK] Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    const CallSid = params.CallSid;
    const From = params.From;
    const RecordingUrl = params.RecordingUrl;
    const RecordingSid = params.RecordingSid;
    const RecordingDuration = params.RecordingDuration;
    
    if (!From || !RecordingUrl || !RecordingSid || !RecordingDuration) {
      console.error('[PERSONAL VOICEMAIL WEBHOOK] Missing required fields');
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    
    // Find business by looking up the call event
    const { data: callEvent, error: callEventError } = await supabaseAdmin
      .from('call_events')
      .select('business_id, caller_phone')
      .eq('twilio_call_sid', CallSid)
      .single();
    
    if (callEventError || !callEvent) {
      console.error('[PERSONAL VOICEMAIL WEBHOOK] Call event not found:', callEventError);
      return NextResponse.json({ error: 'Call event not found' }, { status: 404 });
    }
    
    console.log('[PERSONAL VOICEMAIL WEBHOOK] Found call event:', {
      businessId: callEvent.business_id,
      callerPhone: callEvent.caller_phone,
    });
    
    // Create personal voicemail record
    const { data: voicemail, error: voicemailError } = await supabaseAdmin
      .from('personal_voicemails')
      .insert({
        business_id: callEvent.business_id,
        caller_phone: normalizePhoneNumberForStorage(From),
        caller_name: null, // Can be enhanced later with CNAM lookup
        recording_url: RecordingUrl,
        recording_sid: RecordingSid,
        duration_seconds: parseInt(RecordingDuration, 10),
        transcription: null, // Will be added via recording-status callback
      })
      .select()
      .single();
    
    if (voicemailError) {
      console.error('[PERSONAL VOICEMAIL WEBHOOK] Error creating voicemail:', voicemailError);
      return NextResponse.json({ error: 'Failed to create voicemail' }, { status: 500 });
    }
    
    console.log('[PERSONAL VOICEMAIL WEBHOOK] Voicemail created successfully:', {
      voicemailId: voicemail.id,
      businessId: voicemail.business_id,
      callerPhone: voicemail.caller_phone,
    });

    // Create notification for new personal voicemail
    try {
      await notificationServiceServer.createNotification(
        voicemail.business_id,
        'personal_voicemail',
        `Voicemail from ${formatPhoneNumber(voicemail.caller_phone)}`,
        { callerPhone: voicemail.caller_phone, voicemailId: voicemail.id },
        '/dashboard/personal-voicemail',
        'Listen'
      );
      console.log('[PERSONAL VOICEMAIL WEBHOOK] Notification created');
    } catch (notificationError) {
      console.error('[PERSONAL VOICEMAIL WEBHOOK] Error creating notification:', notificationError);
      // Don't fail the webhook if notification fails
    }
    
    // Return empty TwiML to hang up
    const twiml = `<Response><Hangup/></Response>`;
    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
    
  } catch (error) {
    console.error('[PERSONAL VOICEMAIL WEBHOOK] Exception:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
