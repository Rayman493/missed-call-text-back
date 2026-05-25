import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireTwilioAuth } from '@/lib/twilio/webhook';

export async function POST(request: NextRequest) {
  try {
    console.log('[RECORDING STATUS] Recording status callback received');
    
    // Parse form data from Twilio first
    const formData = await request.formData();
    const rawBody = await request.text();
    const contentType = request.headers.get('content-type') || '';
    
    // Convert FormData to params object for signature validation
    const params: Record<string, string> = {};
    formData.forEach((value, key) => {
      params[key] = value as string;
    });
    
    // Validate Twilio signature with params object
    const isValid = requireTwilioAuth(request, params, rawBody.length, contentType);
    if (!isValid) {
      console.error('[RECORDING STATUS] Invalid Twilio signature');
      return new NextResponse('Invalid signature', { status: 403 });
    }

    // Extract recording status data
    const recordingSid = formData.get('RecordingSid') as string;
    const recordingStatus = formData.get('RecordingStatus') as string;
    const recordingUrl = formData.get('RecordingUrl') as string;
    const recordingDuration = formData.get('RecordingDuration') as string;
    const callSid = formData.get('CallSid') as string;
    const accountSid = formData.get('AccountSid') as string;

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
      .single();

    if (updateError) {
      console.error('[RECORDING STATUS] Failed to update recording status:', updateError);
      // Don't fail the callback - Twilio will retry
      console.log('[RECORDING STATUS] Continuing despite update failure');
    } else if (voicemail) {
      console.log('[RECORDING STATUS] Recording status updated successfully:', voicemail.id);
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
