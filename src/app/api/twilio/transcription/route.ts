import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from '@/lib/supabase/admin';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { extractFromVoicemailTranscript, safeMergeVoicemailExtraction } from '@/lib/voicemail-extraction';

export async function POST(request: NextRequest) {
  console.log('[TRANSCRIPTION ROUTE HIT] - Transcription callback invoked')
  console.log('[TRANSCRIPTION] Timestamp:', new Date().toISOString())
  console.log('[TRANSCRIPTION] Request URL:', request.url)
  console.log('[TRANSCRIPTION] Request method:', request.method)
  
  try {
    console.log('[TRANSCRIPTION] Transcription callback received');
    
    // Read body exactly once to prevent "Body has already been read" error
    const rawBody = await request.text();
    const contentType = request.headers.get('content-type') || '';
    
    // Parse form data using URLSearchParams
    const params = new URLSearchParams(rawBody);
    
    // Defensive logging
    console.log('[TRANSCRIPTION] Request details:', {
      rawBodyLength: rawBody.length,
      paramKeys: Array.from(params.keys()),
      RecordingSid: params.get('RecordingSid'),
      TranscriptionText: params.get('TranscriptionText') ? '[TEXT_PRESENT]' : '[TEXT_MISSING]',
      TranscriptionStatus: params.get('TranscriptionStatus'),
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
      console.error('[TRANSCRIPTION] Invalid Twilio signature');
      return new NextResponse('Invalid signature', { status: 403 });
    }

    // Extract transcription data using params.get()
    const recordingSid = params.get('RecordingSid') as string;
    const transcriptionSid = params.get('TranscriptionSid') as string;
    const transcriptionText = params.get('TranscriptionText') as string;
    const transcriptionStatus = params.get('TranscriptionStatus') as string;
    const callSid = params.get('CallSid') as string;
    const accountSid = params.get('AccountSid') as string;

    console.log('[TRANSCRIPTION] Transcription data:', {
      recordingSid,
      transcriptionSid,
      transcriptionStatus,
      transcriptionTextLength: transcriptionText ? transcriptionText.length : 0,
      transcriptionTextPreview: transcriptionText ? transcriptionText.substring(0, 100) : '[NONE]',
      callSid,
      accountSid: accountSid ? '[PRESENT]' : '[MISSING]'
    });

    if (!recordingSid) {
      console.error('[TRANSCRIPTION] Missing RecordingSid');
      return new NextResponse('Missing RecordingSid', { status: 400 });
    }

    // Look up the voicemail recording by recording_sid
    console.log('[TRANSCRIPTION] Looking up voicemail recording');
    const { data: voicemail, error: voicemailError } = await supabaseAdmin
      .from('voicemail_recordings')
      .select('*')
      .eq('recording_sid', recordingSid)
      .single();

    if (voicemailError || !voicemail) {
      console.error('[TRANSCRIPTION] Failed to find voicemail recording:', voicemailError);
      return new NextResponse('Voicemail recording not found', { status: 404 });
    }

    console.log('[TRANSCRIPTION] Voicemail recording found:', {
      voicemailId: voicemail.id,
      leadId: voicemail.lead_id,
      businessId: voicemail.business_id,
      existingTranscription: voicemail.transcription_text ? '[PRESENT]' : '[MISSING]'
    });

    // Update voicemail recording with transcription text
    const updateData: any = {
      transcription_text: transcriptionText || null,
      transcription_status: transcriptionStatus || 'unknown',
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseAdmin
      .from('voicemail_recordings')
      .update(updateData)
      .eq('id', voicemail.id);

    if (updateError) {
      console.error('[TRANSCRIPTION] Failed to update voicemail with transcription:', updateError);
      return new NextResponse('Failed to update transcription', { status: 500 });
    }

    console.log('[TRANSCRIPTION] Voicemail transcription updated successfully');

    // Run structured extraction if we have transcription text and a lead
    if (transcriptionText && transcriptionText.trim() && voicemail.lead_id) {
      console.log('[TRANSCRIPTION] Transcript available, attempting structured extraction');
      
      try {
        const extractionResult = await extractFromVoicemailTranscript(transcriptionText);
        console.log('[TRANSCRIPTION] Extraction result:', {
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
          
          console.log('[TRANSCRIPTION] Current lead metadata before merge:', {
            leadId: voicemail.lead_id,
            hasCurrentMetadata: !!currentLead,
            currentMetadataKeys: Object.keys(currentMetadata),
            currentExtractedInfo: currentMetadata.extracted_info,
            currentIntakeSources: currentMetadata.intake_sources,
            currentVoicemailExtraction: currentMetadata.voicemail_extraction
          });
          
          // Safely merge voicemail extraction with existing metadata
          const updatedMetadata = safeMergeVoicemailExtraction(currentMetadata, extractionResult);
          
          console.log('[TRANSCRIPTION] Updated metadata after merge:', {
            updatedMetadataKeys: Object.keys(updatedMetadata),
            updatedExtractedInfo: updatedMetadata.extracted_info,
            updatedIntakeSources: updatedMetadata.intake_sources,
            updatedVoicemailExtraction: updatedMetadata.voicemail_extraction,
            updatePayload: { raw_metadata: updatedMetadata }
          });
          
          // Update lead with merged metadata
          const { error: updateError } = await supabaseAdmin
            .from('leads')
            .update({ raw_metadata: updatedMetadata })
            .eq('id', voicemail.lead_id);

          if (updateError) {
            console.error('[TRANSCRIPTION] Failed to update lead metadata:', updateError);
          } else {
            console.log('[TRANSCRIPTION] Lead metadata update successful', {
              leadId: voicemail.lead_id,
              fieldsUpdated: Object.keys(extractionResult.extractedInfo).filter(k => extractionResult.extractedInfo[k as keyof typeof extractionResult.extractedInfo]).length
            });
            
            // Verify persistence by re-reading the lead
            const { data: verifiedLead } = await supabaseAdmin
              .from('leads')
              .select('raw_metadata')
              .eq('id', voicemail.lead_id)
              .single();
            
            console.log('[TRANSCRIPTION] Verification - re-read lead metadata:', {
              leadId: voicemail.lead_id,
              hasVerifiedLead: !!verifiedLead,
              verifiedExtractedInfo: verifiedLead?.raw_metadata?.extracted_info,
              verifiedIntakeSources: verifiedLead?.raw_metadata?.intake_sources,
              verifiedVoicemailExtraction: verifiedLead?.raw_metadata?.voicemail_extraction,
              metadataMatches: JSON.stringify(verifiedLead?.raw_metadata) === JSON.stringify(updatedMetadata)
            });
          }
        } else {
          console.log('[TRANSCRIPTION] Low confidence extraction, skipping lead update');
        }
      } catch (extractionError) {
        console.error('[TRANSCRIPTION] Error during extraction:', extractionError);
        // Don't let extraction errors break the transcription flow
      }
    } else {
      console.log('[TRANSCRIPTION] No transcript or no lead_id, skipping extraction', {
        hasTranscript: !!transcriptionText,
        hasLeadId: !!voicemail.lead_id
      });
    }

    console.log('[TRANSCRIPTION] Transcription callback processed');
    
    // Return empty 200 response as expected by Twilio
    return new NextResponse('', { status: 200 });

  } catch (error: any) {
    console.error('[TRANSCRIPTION] Unexpected error:', error);
    // Return 200 to prevent Twilio retries on our errors
    return new NextResponse('', { status: 200 });
  }
}
