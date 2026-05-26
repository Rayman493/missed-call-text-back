import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from '@/lib/supabase/admin';
import { db } from '@/lib/supabase/admin';
import { normalizePhoneNumber } from '@/lib/twilio';
import { requireTwilioAuth } from '@/lib/twilio/webhook';

export async function POST(request: NextRequest) {
  try {
    console.log('[VOICEMAIL] Recording callback received');
    
    // Read body exactly once to prevent "Body has already been read" error
    const rawBody = await request.text();
    const contentType = request.headers.get('content-type') || '';
    
    // Parse form data using URLSearchParams
    const params = new URLSearchParams(rawBody);
    
    // Defensive logging
    console.log('[VOICEMAIL] Request details:', {
      rawBodyLength: rawBody.length,
      paramKeys: Array.from(params.keys()),
      RecordingSid: params.get('RecordingSid'),
      RecordingUrl: params.get('RecordingUrl') ? '[URL_PRESENT]' : '[URL_MISSING]',
      CallSid: params.get('CallSid'),
      From: params.get('From'),
      To: params.get('To')
    });
    
    // Convert params to object for signature validation
    const paramsObject: Record<string, string> = {};
    params.forEach((value, key) => {
      paramsObject[key] = value;
    });
    
    // Validate Twilio signature with params object
    const isValid = requireTwilioAuth(request, paramsObject, rawBody.length, contentType);
    if (!isValid) {
      console.error('[VOICEMAIL] Invalid Twilio signature');
      return new NextResponse('Invalid signature', { status: 403 });
    }

    // Extract form data fields using params.get()
    const callSid = params.get('CallSid') as string;
    const recordingSid = params.get('RecordingSid') as string;
    const recordingUrl = params.get('RecordingUrl') as string;
    const recordingDuration = params.get('RecordingDuration') as string;
    const recordingStatus = params.get('RecordingStatus') as string;
    const from = params.get('From') as string;
    const to = params.get('To') as string;

    console.log('[VOICEMAIL] Recording data:', {
      callSid,
      recordingSid,
      recordingUrl: recordingUrl ? '[URL_PRESENT]' : '[URL_MISSING]',
      recordingDuration,
      recordingStatus,
      from,
      to
    });

    if (!callSid || !recordingSid || !recordingUrl || !from) {
      console.error('[VOICEMAIL] Missing required fields:', {
        hasCallSid: !!callSid,
        hasRecordingSid: !!recordingSid,
        hasRecordingUrl: !!recordingUrl,
        hasFrom: !!from
      });
      return new NextResponse('Missing required fields', { status: 400 });
    }

    // Find business by Twilio number
    console.log('[VOICEMAIL] Finding business for Twilio number:', to);
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, name')
      .eq('twilio_phone_number', to)
      .single();

    if (businessError || !business) {
      console.error('[VOICEMAIL] Business not found for Twilio number:', to);
      return new NextResponse('Business not found', { status: 404 });
    }

    console.log('[VOICEMAIL] Business found:', business.id, business.name);

    // Normalize caller phone number
    const normalizedCallerPhone = normalizePhoneNumber(from);
    console.log('[VOICEMAIL] Normalized caller phone:', normalizedCallerPhone);

    // Find or create lead
    console.log('[VOICEMAIL] Finding lead for phone:', normalizedCallerPhone);
    let lead = await db.getLeadByPhone(business.id, normalizedCallerPhone);
    
    if (!lead) {
      console.log('[VOICEMAIL] No existing lead found, creating new lead');
      lead = await db.createLead({
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        status: 'new',
        first_contact_at: new Date().toISOString(),
        last_message_at: null,
        last_reply_at: null,
        opted_out: false,
        is_demo: false,
      });

      if (!lead) {
        console.error('[VOICEMAIL] Failed to create lead');
        return new NextResponse('Failed to create lead', { status: 500 });
      }

      console.log('[VOICEMAIL] Lead created:', lead.id);
    } else {
      console.log('[VOICEMAIL] Using existing lead:', lead.id);
    }

    // Find or create conversation
    console.log('[VOICEMAIL] Finding conversation for lead:', lead.id);
    let conversation = await db.getOpenConversationForLead(lead.id, business.id);
    
    if (!conversation) {
      console.log('[VOICEMAIL] No existing conversation, creating new one');
      conversation = await db.createConversation({
        lead_id: lead.id,
        business_id: business.id,
        status: 'open',
        source: 'missed_call',
        started_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
      });

      if (!conversation) {
        console.error('[VOICEMAIL] Failed to create conversation');
        return new NextResponse('Failed to create conversation', { status: 500 });
      }

      console.log('[VOICEMAIL] Conversation created:', conversation.id);
    } else {
      console.log('[VOICEMAIL] Using existing conversation:', conversation.id);
    }

    // Insert voicemail recording
    console.log('[VOICEMAIL] Saving voicemail recording');
    const { data: voicemail, error: voicemailError } = await supabaseAdmin
      .from('voicemail_recordings')
      .insert({
        business_id: business.id,
        lead_id: lead.id,
        conversation_id: conversation.id,
        call_sid: callSid,
        recording_sid: recordingSid,
        recording_url: recordingUrl,
        recording_duration: recordingDuration ? parseInt(recordingDuration) : null,
        recording_status: recordingStatus || 'unknown',
        transcription_text: null,
        transcription_status: null,
        caller_phone: normalizedCallerPhone,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (voicemailError) {
      console.error('[VOICEMAIL] Failed to save voicemail recording:', voicemailError);
      return new NextResponse('Failed to save voicemail', { status: 500 });
    }

    console.log('[VOICEMAIL] Recording saved:', voicemail.id);

    // Return thank you TwiML
    const thankYouTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;

    console.log('[VOICEMAIL] Voicemail processing completed successfully');
    return new NextResponse(thankYouTwiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });

  } catch (error: any) {
    console.error('[VOICEMAIL] Unexpected error:', error);
    return new NextResponse('Internal server error', { status: 500 });
  }
}
