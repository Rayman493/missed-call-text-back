import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { isIgnoredContact } from '@/lib/ignored-contacts';
import { normalizePhoneNumber } from '@/lib/twilio';

export async function POST(request: NextRequest) {
  console.log('[RECORDING STATUS ROUTE HIT]')
  
  try {
    console.log('[RECORDING STATUS] Recording status callback received');
    
    // Read body exactly once to prevent "Body has already been read" error
    const rawBody = await request.text();
    const contentType = request.headers.get('content-type') || '';
    
    // Parse form data using URLSearchParams
    const params = new URLSearchParams(rawBody);
    
    // Defensive logging
    console.log('[RECORDING STATUS] Request details:', {
      rawBodyLength: rawBody.length,
      paramKeys: Array.from(params.keys()),
      RecordingSid: params.get('RecordingSid'),
      RecordingUrl: params.get('RecordingUrl') ? '[URL_PRESENT]' : '[URL_MISSING]',
      CallSid: params.get('CallSid'),
      AccountSid: params.get('AccountSid') ? '[PRESENT]' : '[MISSING]'
    });
    
    // Convert params to object for signature validation
    const paramsObject: Record<string, string> = {};
    params.forEach((value, key) => {
      paramsObject[key] = value;
    });
    
    // Validate Twilio signature with params object
    const isValid = requireTwilioAuth(request, paramsObject, rawBody.length, contentType);
    if (!isValid) {
      console.error('[RECORDING STATUS] Invalid Twilio signature');
      return new NextResponse('Invalid signature', { status: 403 });
    }

    // Extract recording status data using params.get()
    const recordingSid = params.get('RecordingSid') as string;
    const recordingStatus = params.get('RecordingStatus') as string;
    const recordingUrl = params.get('RecordingUrl') as string;
    const recordingDuration = params.get('RecordingDuration') as string;
    const callSid = params.get('CallSid') as string;
    const accountSid = params.get('AccountSid') as string;

    console.log('[RECORDING STATUS] Recording status data:', {
      recordingSid,
      recordingStatus,
      recordingUrl: recordingUrl ? '[URL_PRESENT]' : '[URL_MISSING]',
      recordingDuration,
      callSid,
      accountSid: accountSid ? '[PRESENT]' : '[MISSING]'
    });

    if (!recordingSid) {
      console.error('[RECORDING STATUS] Missing RecordingSid');
      return new NextResponse('Missing RecordingSid', { status: 400 });
    }

    // Check if this recording is from an ignored contact
    console.log('[IGNORED CONTACT RECORDING STATUS CHECK]', {
      recordingSid,
      timestamp: new Date().toISOString()
    })

    try {
      // Look up the voicemail recording to get the call_sid
      const { data: voicemailRecording } = await supabaseAdmin
        .from('voicemail_recordings')
        .select('call_sid')
        .eq('recording_sid', recordingSid)
        .single()

      if (voicemailRecording?.call_sid) {
        // Look up the call event to get the caller phone
        const { data: callEvent } = await supabaseAdmin
          .from('call_events')
          .select('from_phone')
          .eq('call_sid', voicemailRecording.call_sid)
          .single()

        if (callEvent?.from_phone) {
          // Look up the business from the call event
          const { data: callEventWithBusiness } = await supabaseAdmin
            .from('call_events')
            .select('business_id')
            .eq('call_sid', voicemailRecording.call_sid)
            .single()

          if (callEventWithBusiness?.business_id) {
            const normalizedPhone = normalizePhoneNumber(callEvent.from_phone)
            const isIgnored = await isIgnoredContact(callEventWithBusiness.business_id, normalizedPhone)

            if (isIgnored) {
              console.log('[IGNORED CONTACT RECORDING STATUS SKIP]', {
                businessId: callEventWithBusiness.business_id,
                phoneNumber: normalizedPhone,
                recordingSid,
                timestamp: new Date().toISOString()
              })

              // Return success without updating the recording
              return new NextResponse('OK', { status: 200 })
            }
          }
        }
      }
    } catch (error) {
      console.error('[RECORDING STATUS] Error checking ignored contact:', error)
      // Continue anyway - this is a safety check
    }

    // Update voicemail recording with final status
    console.log('[RECORDING STATUS] Updating voicemail recording status');
    const updateData: any = {
      recording_status: recordingStatus || 'unknown',
      updated_at: new Date().toISOString(),
    };

    // Add optional fields if present
    if (recordingUrl) {
      updateData.recording_url = recordingUrl;
    }
    if (recordingDuration) {
      updateData.recording_duration = parseInt(recordingDuration) || null;
    }

    const { data: voicemail, error: updateError } = await supabaseAdmin
      .from('voicemail_recordings')
      .update(updateData)
      .eq('recording_sid', recordingSid)
      .select()
      .maybeSingle();

    if (updateError) {
      console.error('[RECORDING STATUS] Failed to update recording status:', updateError);
      // Don't fail the callback - Twilio will retry
      console.log('[RECORDING STATUS] Continuing despite update failure');
    } else if (voicemail) {
      console.log('[RECORDING STATUS] Recording status updated successfully:', voicemail.id);
      console.log('[RECORDING STATUS] Note: Structured extraction will run in transcription callback when transcript becomes available');
    } else {
      console.log('[RECORDING STATUS] No voicemail recording found for sid:', recordingSid);
    }

    console.log('[RECORDING STATUS] Recording status callback processed');
    
    // Return empty 200 response as expected by Twilio
    return new NextResponse('', { status: 200 });

  } catch (error: any) {
    console.error('[RECORDING STATUS] Unexpected error:', error);
    // Return 200 to prevent Twilio retries on our errors
    return new NextResponse('', { status: 200 });
  }
}
