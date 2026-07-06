import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, db } from '@/lib/supabase/admin';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { isIgnoredContact } from '@/lib/ignored-contacts';
import { normalizePhoneNumber } from '@/lib/twilio';
import { extractFromVoicemailTranscript, safeMergeVoicemailExtraction } from '@/lib/voicemail-extraction';
import { transcribeVoicemail } from '@/lib/voicemail-transcription';
import { getLeadAIIntake } from '@/lib/ai-field-mapping';
import { formatAiIntakeSummary } from '@/lib/ai-intake-formatter';
import { timelineEvents } from '@/lib/event-timeline';
import { createFollowUpJobs } from '@/lib/follow-ups';
import { testFallbacks, warnIfTestFallbacksActive } from '@/lib/testing/test-fallbacks';
import { dispatchAutomaticCustomerSms } from '@/lib/auto-sms-dispatcher';

export async function POST(request: NextRequest) {
  warnIfTestFallbacksActive();
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
      
      // Attempt OpenAI transcription when recording completes
      if (recordingStatus === 'completed' && voicemail.lead_id && voicemail.recording_url) {
        // ── TEST FALLBACK: forceVoicemailFailure ─────────────────────────────
        if (testFallbacks.forceVoicemailFailure) {
          console.warn('[TEST FALLBACK] forceVoicemailFailure active — skipping transcription/extraction to trigger final SMS fallback');
          console.warn('[TEST FALLBACK] Reset forceVoicemailFailure to false in src/lib/testing/test-fallbacks.ts after testing.');
          // Fall through without transcribing so sms_pending remains true
          // and the final SMS fallback block below will fire.
        } else
        // ── END TEST FALLBACK ───────────────────────────────────────────────
        // Idempotency check: skip if transcript already exists
        if (voicemail.transcription_text && voicemail.transcription_text.trim().length > 0) {
          console.log('[RECORDING STATUS] Transcript already exists, skipping transcription');
        } else {
          console.log('[RECORDING STATUS] Starting OpenAI voicemail transcription');
          
          try {
            const transcriptionResult = await transcribeVoicemail(voicemail.recording_url, recordingSid);
            
            if (transcriptionResult && transcriptionResult.transcript) {
              console.log('[RECORDING STATUS] OpenAI transcription successful:', {
                transcriptLength: transcriptionResult.transcript.length,
                source: transcriptionResult.source
              });
              
              // Update voicemail recording with transcription
              await supabaseAdmin
                .from('voicemail_recordings')
                .update({
                  transcription_text: transcriptionResult.transcript,
                  transcription_status: 'completed',
                  updated_at: new Date().toISOString()
                })
                .eq('id', voicemail.id);
              
              console.log('[RECORDING STATUS] Voicemail transcription saved successfully');
              
              // Run structured extraction if we have transcription text
              if (transcriptionResult.transcript.trim()) {
                console.log('[RECORDING STATUS] Transcript available, attempting structured extraction');
                
                const extractionResult = await extractFromVoicemailTranscript(transcriptionResult.transcript);
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

                    // === SEND STRUCTURED SMS NOW (after extraction, using canonical data) ===
                    // Check if there is a pending SMS for this call that hasn't been sent yet
                    try {
                      const { data: callEvent } = await supabaseAdmin
                        .from('call_events')
                        .select('*')
                        .eq('twilio_call_sid', voicemail.call_sid)
                        .eq('sms_pending', true)
                        .maybeSingle();

                      if (callEvent && !callEvent.sms_sent_at) {
                        console.log('[RECORDING STATUS SMS] sms_pending flag found, sending structured SMS after extraction');

                        // Fetch the updated lead with freshly extracted data
                        const { data: freshLead } = await supabaseAdmin
                          .from('leads')
                          .select('*')
                          .eq('id', voicemail.lead_id)
                          .single();

                        const { data: businessDetails } = await supabaseAdmin
                          .from('businesses')
                          .select('*')
                          .eq('id', voicemail.business_id)
                          .single();

                        if (freshLead && businessDetails) {
                          const callerPhone = voicemail.caller_phone;

                          // Build canonical extracted info from freshly-written lead
                          const leadIntake = getLeadAIIntake(freshLead);
                          const extractedInfo = {
                            callerName: leadIntake.customerName || undefined,
                            reasonForCalling: leadIntake.serviceRequested || undefined,
                            importantDetails: leadIntake.additionalDetails || undefined,
                            desiredCompletionTime: leadIntake.desiredCompletion || undefined,
                            addressOrLocation: leadIntake.serviceAddress || undefined,
                            preferredCallbackTime: leadIntake.callbackTime || undefined,
                          };

                          const conversation = await db.getOpenConversationForLead(voicemail.lead_id, voicemail.business_id);
                          const dispatchResult = await dispatchAutomaticCustomerSms({
                            trigger: 'voicemail_completed',
                            callSid: voicemail.call_sid,
                            businessId: voicemail.business_id,
                            leadId: voicemail.lead_id,
                            conversationId: conversation?.id,
                            callerPhone,
                            businessName: businessDetails.name || 'My Business',
                            extractedInfo,
                            voicemailCompleted: true
                          });

                          const messageSid = dispatchResult.twilioMessageSid || null;
                          console.log('[RECORDING STATUS SMS] Centralized dispatch after extraction', {
                            messageSid,
                            leadId: voicemail.lead_id,
                            extractedName: leadIntake.customerName,
                            extractedService: leadIntake.serviceRequested,
                            outcome: dispatchResult.outcome,
                            template: dispatchResult.template,
                            reason: dispatchResult.reason
                          });

                          if (messageSid) {
                            await timelineEvents.messageSent(voicemail.business_id, voicemail.lead_id, conversation?.id || '', '', messageSid);

                            try {
                              await createFollowUpJobs({
                                businessId: voicemail.business_id,
                                leadId: voicemail.lead_id,
                                conversationId: conversation?.id,
                                businessName: businessDetails.name
                              });
                            } catch (followUpError) {
                              console.error('[RECORDING STATUS SMS] Error creating follow-up jobs:', followUpError);
                            }
                          }
                        } else {
                          console.error('[RECORDING STATUS SMS] Could not fetch fresh lead or business for SMS send');
                        }
                      } else if (callEvent?.sms_sent_at) {
                        console.log('[RECORDING STATUS SMS] SMS already sent for this call, skipping', { callSid: voicemail.call_sid });
                      } else {
                        console.log('[RECORDING STATUS SMS] No pending SMS flag found, skipping', { callSid: voicemail.call_sid });
                      }
                    } catch (smsError) {
                      console.error('[RECORDING STATUS SMS] Error sending post-extraction SMS:', smsError);
                    }
                    // === END SMS SEND ===
                  }
                } else {
                  console.log('[RECORDING STATUS] Low confidence extraction, skipping lead update');
                }
              } else {
                console.log('[RECORDING STATUS] No transcript text available, skipping extraction');
              }
            } else {
              console.log('[RECORDING STATUS] OpenAI transcription returned no result');
            }
          } catch (transcriptionError) {
            console.error('[RECORDING STATUS] Error during OpenAI transcription:', transcriptionError);
            // Don't let transcription errors break the recording status flow
          }
        }
      }

      // === FINAL TEXT-MESSAGE FALLBACK ===
      // If AI failed and voicemail produced no usable transcript (or any error occurred),
      // sms_pending may still be true. Send the structured summary with all fields "Not collected"
      // so the customer always receives a reply they can respond to.
      try {
        // ── TEST FALLBACK: forceFinalSmsFallback ───────────────────────────────────
        if (testFallbacks.forceFinalSmsFallback) {
          console.warn('[TEST FALLBACK] forceFinalSmsFallback active — forcing final structured SMS fallback regardless of sms_pending state');
          console.warn('[TEST FALLBACK] Reset forceFinalSmsFallback to false in src/lib/testing/test-fallbacks.ts after testing.');
        }
        // ── END TEST FALLBACK ──────────────────────────────────────────────────────

        const { data: pendingCallEvent } = await supabaseAdmin
          .from('call_events')
          .select('*')
          .eq('twilio_call_sid', voicemail.call_sid)
          .eq('sms_pending', true)
          .maybeSingle();

        if ((pendingCallEvent && !pendingCallEvent.sms_sent_at) || testFallbacks.forceFinalSmsFallback) {
          console.log('[FINAL SMS FALLBACK] sms_pending still true after all voicemail paths - sending structured fallback SMS', {
            callSid: voicemail.call_sid,
            leadId: voicemail.lead_id,
            businessId: voicemail.business_id,
            recordingStatus,
            reason: 'ai_failed_and_voicemail_no_usable_transcript'
          });

          const { data: fallbackBusiness } = await supabaseAdmin
            .from('businesses')
            .select('*')
            .eq('id', voicemail.business_id)
            .single();

          if (fallbackBusiness && voicemail.caller_phone) {
            const fallbackConversation = await db.getOpenConversationForLead(voicemail.lead_id, voicemail.business_id);
            const dispatchResult = await dispatchAutomaticCustomerSms({
              trigger: 'recording_fallback',
              callSid: voicemail.call_sid,
              businessId: voicemail.business_id,
              leadId: voicemail.lead_id,
              conversationId: fallbackConversation?.id,
              callerPhone: voicemail.caller_phone,
              businessName: fallbackBusiness.name || 'My Business'
            });

            const fallbackMessageSid = dispatchResult.twilioMessageSid || null;
            console.log('[FINAL SMS FALLBACK] Centralized dispatch result', {
              messageSid: fallbackMessageSid,
              leadId: voicemail.lead_id,
              callerPhone: voicemail.caller_phone,
              outcome: dispatchResult.outcome,
              template: dispatchResult.template,
              reason: dispatchResult.reason
            });

            if (fallbackMessageSid) {
              await timelineEvents.messageSent(voicemail.business_id, voicemail.lead_id, fallbackConversation?.id || '', '', fallbackMessageSid);

              try {
                await createFollowUpJobs({
                  businessId: voicemail.business_id,
                  leadId: voicemail.lead_id,
                  conversationId: fallbackConversation?.id,
                  businessName: fallbackBusiness.name
                });
              } catch (followUpError) {
                console.error('[FINAL SMS FALLBACK] Error creating follow-up jobs:', followUpError);
              }
            }
          } else {
            console.error('[FINAL SMS FALLBACK] Could not fetch business or missing caller phone for fallback SMS', {
              businessId: voicemail.business_id,
              callerPhone: voicemail.caller_phone
            });
          }
        } else if (pendingCallEvent?.sms_sent_at) {
          console.log('[FINAL SMS FALLBACK] SMS already sent, skipping fallback', { callSid: voicemail.call_sid });
        } else {
          console.log('[FINAL SMS FALLBACK] No pending SMS flag found, no fallback needed', { callSid: voicemail.call_sid });
        }
      } catch (finalFallbackError) {
        console.error('[FINAL SMS FALLBACK] Error in final SMS fallback:', finalFallbackError);
      }
      // === END FINAL TEXT-MESSAGE FALLBACK ===

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
