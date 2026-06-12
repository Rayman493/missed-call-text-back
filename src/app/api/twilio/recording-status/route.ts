import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { isIgnoredContact } from '@/lib/ignored-contacts';
import { normalizePhoneNumber } from '@/lib/twilio';
import { extractFromVoicemailTranscript, safeMergeVoicemailExtraction } from '@/lib/voicemail-extraction';
import { Twilio } from 'twilio';

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
      
      // Attempt to fetch transcription via Twilio REST API (callback approach not working)
      if (recordingStatus === 'completed' && voicemail.lead_id) {
        console.log('[RECORDING STATUS] Attempting to fetch transcription via REST API');
        
        try {
          const twilioClient = new Twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
          );
          
          // Fetch transcription for this recording
          const transcription = await twilioClient.recordings(recordingSid).transcriptions.list({ limit: 1 });
          
          if (transcription && transcription.length > 0) {
            const transcriptionText = transcription[0].transcriptionText;
            const transcriptionStatus = transcription[0].status;
            
            console.log('[RECORDING STATUS] Transcription fetched via REST API:', {
              transcriptionSid: transcription[0].sid,
              transcriptionStatus,
              transcriptionTextLength: transcriptionText ? transcriptionText.length : 0,
              transcriptionTextPreview: transcriptionText ? transcriptionText.substring(0, 100) : '[NONE]'
            });
            
            // Update voicemail recording with transcription
            await supabaseAdmin
              .from('voicemail_recordings')
              .update({
                transcription_text: transcriptionText || null,
                transcription_status: transcriptionStatus || 'unknown',
                updated_at: new Date().toISOString()
              })
              .eq('id', voicemail.id);
            
            console.log('[RECORDING STATUS] Voicemail transcription updated successfully');
            
            // Run structured extraction if we have transcription text
            if (transcriptionText && transcriptionText.trim()) {
              console.log('[RECORDING STATUS] Transcript available, attempting structured extraction');
              
              const extractionResult = extractFromVoicemailTranscript(transcriptionText);
              console.log('[RECORDING STATUS] Extraction result:', {
                confidence: extractionResult.confidence,
                fieldsExtracted: Object.keys(extractionResult.extractedInfo).filter(k => extractionResult.extractedInfo[k as keyof typeof extractionResult.extractedInfo]).length,
                extractedInfo: extractionResult.extractedInfo
              });
              
              // Only update lead if we extracted meaningful information
              if (extractionResult.confidence > 0) {
                // Get current lead metadata
                const { data: currentLead } = await supabaseAdmin
                  .from('leads')
                  .select('raw_metadata')
                  .eq('id', voicemail.lead_id)
                  .single();
                
                const currentMetadata = currentLead?.raw_metadata || {};
                
                console.log('[RECORDING STATUS] Current lead metadata before merge:', {
                  leadId: voicemail.lead_id,
                  hasCurrentMetadata: !!currentLead,
                  currentMetadataKeys: Object.keys(currentMetadata),
                  currentExtractedInfo: currentMetadata.extracted_info,
                  currentIntakeSources: currentMetadata.intake_sources,
                  currentVoicemailExtraction: currentMetadata.voicemail_extraction
                });
                
                // Safely merge voicemail extraction with existing metadata
                const updatedMetadata = safeMergeVoicemailExtraction(currentMetadata, extractionResult);
                
                console.log('[RECORDING STATUS] Updated metadata after merge:', {
                  updatedMetadataKeys: Object.keys(updatedMetadata),
                  updatedExtractedInfo: updatedMetadata.extracted_info,
                  updatedIntakeSources: updatedMetadata.intake_sources,
                  updatedVoicemailExtraction: updatedMetadata.voicemail_extraction
                });
                
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
                  
                  // Verify persistence by re-reading the lead
                  const { data: verifiedLead } = await supabaseAdmin
                    .from('leads')
                    .select('raw_metadata')
                    .eq('id', voicemail.lead_id)
                    .single();
                  
                  console.log('[RECORDING STATUS] Verification - re-read lead metadata:', {
                    leadId: voicemail.lead_id,
                    hasVerifiedLead: !!verifiedLead,
                    verifiedExtractedInfo: verifiedLead?.raw_metadata?.extracted_info,
                    verifiedIntakeSources: verifiedLead?.raw_metadata?.intake_sources,
                    verifiedVoicemailExtraction: verifiedLead?.raw_metadata?.voicemail_extraction,
                    metadataMatches: JSON.stringify(verifiedLead?.raw_metadata) === JSON.stringify(updatedMetadata)
                  });
                }
              } else {
                console.log('[RECORDING STATUS] Low confidence extraction, skipping lead update');
              }
            } else {
              console.log('[RECORDING STATUS] No transcript text available, skipping extraction');
            }
          } else {
            console.log('[RECORDING STATUS] No transcription found via REST API');
          }
        } catch (transcriptionError) {
          console.error('[RECORDING STATUS] Error fetching transcription via REST API:', transcriptionError);
          // Don't let transcription errors break the recording status flow
        }
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
