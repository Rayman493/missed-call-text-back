import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { isIgnoredContact } from '@/lib/ignored-contacts';
import { normalizePhoneNumber } from '@/lib/twilio';
import { extractFromVoicemailTranscript, safeMergeVoicemailExtraction } from '@/lib/voicemail-extraction';

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
      
      // Check if transcription is available and run extraction
      if (voicemail.transcription_text && voicemail.transcription_text.trim()) {
        console.log('[RECORDING STATUS] Transcript available, attempting structured extraction');
        
        try {
          const extractionResult = extractFromVoicemailTranscript(voicemail.transcription_text);
          console.log('[RECORDING STATUS] Extraction result:', {
            confidence: extractionResult.confidence,
            fieldsExtracted: Object.keys(extractionResult.extractedInfo).filter(k => extractionResult.extractedInfo[k as keyof typeof extractionResult.extractedInfo]).length,
            extractedInfo: extractionResult.extractedInfo
          });

          // Only update lead if we extracted meaningful information
          if (extractionResult.confidence > 0 && voicemail.lead_id) {
            // Get current lead metadata
            const { data: currentLead } = await supabaseAdmin
              .from('leads')
              .select('raw_metadata')
              .eq('id', voicemail.lead_id)
              .single();

            const currentMetadata = currentLead?.raw_metadata || {};
            
            // Safely merge voicemail extraction with existing metadata
            const updatedMetadata = safeMergeVoicemailExtraction(currentMetadata, extractionResult);
            
            // Update lead with merged metadata
            const { error: updateError } = await supabaseAdmin
              .from('leads')
              .update({ raw_metadata: updatedMetadata })
              .eq('id', voicemail.lead_id);

            if (updateError) {
              console.error('[RECORDING STATUS] Failed to update lead metadata:', updateError);
            } else {
              console.log('[RECORDING STATUS] Lead metadata updated successfully', {
                leadId: voicemail.lead_id,
                fieldsUpdated: Object.keys(extractionResult.extractedInfo).filter(k => extractionResult.extractedInfo[k as keyof typeof extractionResult.extractedInfo]).length
              });
            }
          } else {
            console.log('[RECORDING STATUS] Low confidence extraction or no lead_id, skipping lead update');
          }
        } catch (extractionError) {
          console.error('[RECORDING STATUS] Error during extraction:', extractionError);
          // Don't let extraction errors break the recording status flow
        }
      } else {
        console.log('[RECORDING STATUS] No transcript available, skipping extraction');
      }
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
