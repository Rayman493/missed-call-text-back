import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from '@/lib/supabase/admin';
import { db, normalizePhoneNumberForStorage } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/twilio';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { timelineEvents } from '@/lib/event-timeline';
import { createFollowUpJobs } from '@/lib/follow-ups';
import { notificationServiceServer } from '@/lib/notifications-server';
import { markForwardingVerified } from '@/lib/forwarding-verification';
import { isIgnoredContact } from '@/lib/ignored-contacts';

// CALL TRACE logging function
function logCallTrace(data: {
  route: string
  action: string
  callSid?: string
  from?: string
  to?: string
  forwardedFrom?: string
  businessId?: string
  businessName?: string
  leadId?: string
  conversationId?: string
  messageId?: string
  aiCallRecordId?: string
  existingOrCreated?: 'existing' | 'created' | 'updated'
  reason?: string
}) {
  console.log('[CALL TRACE]', JSON.stringify(data))
}

export async function POST(request: NextRequest) {
  console.log('[VOICEMAIL CALLBACK RECEIVED]');
  console.log('[CALL INTAKE FLOW] Voicemail callback received - trusted path for intake record creation');

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

    // Check if this is an ignored contact voicemail
    // We need to check this early to skip all automation
    let isCallerIgnored = false;
    let businessId: string | null = null;

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
    
    logCallTrace({
      route: 'voicemail',
      action: 'business_lookup_start',
      callSid,
      from,
      to,
      reason: 'Looking up business by Twilio phone number'
    })
    
    const { data: business, error: businessError } = await supabaseAdmin
      .from('businesses')
      .select('id, name')
      .eq('twilio_phone_number', to)
      .single();

    if (businessError || !business) {
      console.error('[VOICEMAIL] Business not found for Twilio number:', to);
      
      logCallTrace({
        route: 'voicemail',
        action: 'business_lookup_failed',
        callSid,
        from,
        to,
        reason: `Business not found for Twilio number: ${to}`
      })
      
      return new NextResponse('Business not found', { status: 404 });
    }

    console.log('[VOICEMAIL] Business found:', business.id, business.name);
    businessId = business.id;
    
    logCallTrace({
      route: 'voicemail',
      action: 'business_lookup_success',
      callSid,
      from,
      to,
      businessId: business.id,
      businessName: business.name,
      existingOrCreated: 'existing',
      reason: 'Found business by Twilio phone number'
    })

    // Normalize caller phone number
    const normalizedCallerPhone = normalizePhoneNumberForStorage(from);
    console.log('[VOICEMAIL] Normalized caller phone:', normalizedCallerPhone);

    // EARLIEST POSSIBLE POINT: Check if caller is in ignored contacts
    console.log('[IGNORED CONTACT VOICEMAIL CHECK]', {
      businessId: business.id,
      callerPhone: normalizedCallerPhone,
      timestamp: new Date().toISOString()
    })
    
    isCallerIgnored = await isIgnoredContact(business.id, normalizedCallerPhone)
    
    if (isCallerIgnored) {
      console.log('[IGNORED CONTACT VOICEMAIL BYPASS]', {
        businessId: business.id,
        phoneNumber: normalizedCallerPhone,
        timestamp: new Date().toISOString()
      })
      
      // For ignored contacts, we still want to save the recording for review
      // But skip all automation (lead creation, SMS, follow-ups, extraction, notifications)
      // Create a minimal internal record marked as ignored
      console.log('[IGNORED CONTACT] Creating minimal internal record for traceability');
      
      const { data: ignoredVoicemail, error: ignoredError } = await supabaseAdmin
        .from('voicemail_recordings')
        .insert({
          business_id: business.id,
          lead_id: null, // No lead for ignored contacts
          conversation_id: null, // No conversation for ignored contacts
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
          raw_metadata: {
            is_ignored_contact: true,
            automation_skipped: true,
            skip_reason: 'Caller is in ignored contacts list'
          }
        })
        .select()
        .single();

      if (ignoredError) {
        console.error('[IGNORED CONTACT] Failed to save voicemail recording:', ignoredError);
      } else {
        console.log('[IGNORED CONTACT] Voicemail recording saved for review (no automation)', {
          voicemailId: ignoredVoicemail.id,
          recordingUrl: ignoredVoicemail.recording_url,
          callerPhone: normalizedCallerPhone,
          metadata: ignoredVoicemail.raw_metadata
        });
      }

      // Return success without any automation
      const thankYouTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;
      
      return new NextResponse(thankYouTwiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
        },
      });
    }

    // Find or create lead
    console.log('[VOICEMAIL] Finding lead for phone:', normalizedCallerPhone);
    
    logCallTrace({
      route: 'voicemail',
      action: 'lead_lookup_start',
      callSid,
      from,
      to,
      businessId: business.id,
      businessName: business.name,
      reason: 'Looking up lead by caller phone for voicemail'
    })
    
    let lead = await db.getLeadByPhone(business.id, normalizedCallerPhone);
    
    if (lead) {
      logCallTrace({
        route: 'voicemail',
        action: 'lead_lookup_success',
        callSid,
        from,
        to,
        businessId: business.id,
        businessName: business.name,
        leadId: lead.id,
        existingOrCreated: 'existing',
        reason: 'Found existing lead for voicemail'
      })
    }
    
    if (!lead) {
      console.log('[VOICEMAIL] No existing lead found, using trusted voicemail path for canonical records')

      logCallTrace({
        route: 'voicemail',
        action: 'call_intake_start',
        callSid,
        from,
        to,
        businessId: business.id,
        businessName: business.name,
        reason: 'Getting/creating canonical lead and conversation for trusted voicemail callback'
      })

      try {
        // TRUSTED VOICEMAIL PATH: Allow voicemail callback to create intake records
        // This is safe because we've already verified:
        // - Valid Twilio signature (line 63)
        // - RecordingSid and RecordingUrl present (line 88-96)
        // - Business lookup succeeded (line 110-129)
        // - Caller normalization succeeded (line 146)
        // - Not an ignored contact (line 156-167)
        const intakeRecords = await db.getOrCreateCallIntakeRecords({
          callSid,
          businessId: business.id,
          callerPhone: normalizedCallerPhone,
          to,
          requireValidCall: false // Trusted voicemail callback bypasses call event requirement
        })
        
        if (!intakeRecords.leadId || !intakeRecords.conversationId) {
          console.error('[VOICEMAIL] Failed to get or create intake records')
          
          logCallTrace({
            route: 'voicemail',
            action: 'call_intake_failed',
            callSid,
            from,
            to,
            businessId: business.id,
            businessName: business.name,
            reason: 'Failed to get or create intake records for voicemail'
          })
        } else {
          console.log('[VOICEMAIL] Intake records obtained:', {
            leadId: intakeRecords.leadId,
            conversationId: intakeRecords.conversationId,
            isNew: intakeRecords.isNew
          })

          logCallTrace({
            route: 'voicemail',
            action: 'call_intake_success',
            callSid,
            from,
            to,
            businessId: business.id,
            businessName: business.name,
            leadId: intakeRecords.leadId,
            conversationId: intakeRecords.conversationId,
            existingOrCreated: intakeRecords.isNew ? 'created' : 'existing',
            reason: 'Successfully obtained canonical lead and conversation for trusted voicemail callback'
          })

          console.log('[TRUSTED VOICEMAIL PATH] Lead/conversation created for voicemail callback', {
            callSid,
            leadId: intakeRecords.leadId,
            conversationId: intakeRecords.conversationId,
            isNew: intakeRecords.isNew
          })
          
          lead = { id: intakeRecords.leadId } as any
        }
      } catch (intakeError) {
        console.error('[VOICEMAIL] Exception during intake:', intakeError)
        
        logCallTrace({
          route: 'voicemail',
          action: 'call_intake_failed',
          callSid,
          from,
          to,
          businessId: business.id,
          businessName: business.name,
          reason: `Exception during intake: ${intakeError}`
        })
      }

      if (!lead) {
        console.error('[VOICEMAIL LEAD CREATE FAILED]', {
          business_id: business.id,
          phone: normalizedCallerPhone,
          result: lead
        });
        // FAIL-SAFE: Return 200 with TwiML instead of 500 to prevent "server unreachable"
        const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;
        console.log('[VOICEMAIL] Returning 200 despite lead creation failure');
        return new NextResponse(errorTwiml, {
          status: 200,
          headers: {
            "Content-Type": "text/xml",
          },
        });
      }

      console.log('[VOICEMAIL] Lead created:', lead.id);
      console.log('[VOICEMAIL LEAD CREATED]', { leadId: lead.id, businessId: business.id, phone: normalizedCallerPhone });
      
      // Mark forwarding as verified when real lead is created from voicemail
      await markForwardingVerified(business.id, 'real_voicemail_lead_created');
      
      // Create notification for new lead
      try {
        console.log('[NOTIFICATION CREATE ATTEMPT]', { 
          businessId: business.id, 
          type: 'new_lead', 
          leadId: lead.id,
          leadPhone: normalizedCallerPhone 
        });
        await notificationServiceServer.notifyNewLead(
          business.id,
          'New Customer',
          normalizedCallerPhone,
          lead.id
        );
        console.log('[NOTIFICATION CREATE SUCCESS]', { 
          businessId: business.id, 
          type: 'new_lead', 
          leadId: lead.id 
        });
      } catch (error) {
        console.error('[NOTIFICATION CREATE ERROR]', { 
          businessId: business.id, 
          type: 'new_lead', 
          leadId: lead.id,
          error 
        });
        // Don't let notification failures break webhook processing
      }
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
        // FAIL-SAFE: Return 200 with TwiML instead of 500 to prevent "server unreachable"
        const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;
        console.log('[VOICEMAIL] Returning 200 despite conversation creation failure');
        return new NextResponse(errorTwiml, {
          status: 200,
          headers: {
            "Content-Type": "text/xml",
          },
        });
      }

      console.log('[VOICEMAIL CONVERSATION CREATED]', { conversationId: conversation.id, leadId: lead.id, businessId: business.id });
      console.log('[VOICEMAIL] Conversation created:', conversation.id);
    } else {
      console.log('[VOICEMAIL] Using existing conversation:', conversation.id);
    }

    // Insert voicemail recording
    console.log('[VOICEMAIL RECORDING] Preparing to save voicemail recording', {
      businessId: business.id,
      leadId: lead.id,
      conversationId: conversation.id,
      callSid: callSid,
      recordingSid: recordingSid,
      recordingUrl: recordingUrl,
      recordingDuration: recordingDuration,
      recordingStatus: recordingStatus
    });

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
      console.error('[VOICEMAIL RECORDING] Failed to save voicemail recording:', voicemailError);
      // FAIL-SAFE: Return 200 with TwiML instead of 500 to prevent "server unreachable"
      const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;
      console.log('[VOICEMAIL] Returning 200 despite voicemail save failure');
      return new NextResponse(errorTwiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
        },
      });
    }

    console.log('[VOICEMAIL RECORDING] Row created successfully', {
      voicemailId: voicemail.id,
      recordingUrl: voicemail.recording_url,
      recordingSid: voicemail.recording_sid,
      recordingDuration: voicemail.recording_duration,
      leadId: voicemail.lead_id,
      conversationId: voicemail.conversation_id,
      businessId: voicemail.business_id
    });

    console.log('[VOICEMAIL NOTIFICATION CREATED]', { voicemailId: voicemail.id, leadId: lead.id, businessId: business.id });
    console.log('[VOICEMAIL INGEST COMPLETE]', { leadId: lead.id, conversationId: conversation.id, voicemailId: voicemail.id, businessId: business.id });
    console.log('[VOICEMAIL] Recording saved:', voicemail.id);
    console.log('[VOICEMAIL] Note: Structured extraction will run in recording-status callback when transcript becomes available');

    // Create notification for voicemail
    try {
      await notificationServiceServer.notifyVoicemailReceived(
        business.id,
        'Customer',
        normalizedCallerPhone,
        lead.id
      );
      console.log('[VOICEMAIL] Notification created for voicemail');
    } catch (error) {
      console.error('[VOICEMAIL] Failed to create voicemail notification:', error);
    }

    // MISSED CALL TIMING: Check if SMS needs to be sent after voicemail completion
    console.log('[VOICEMAIL SMS] Checking if initial SMS should be sent', {
      businessId: business.id,
      callSid: callSid,
      recordingSid: recordingSid,
      leadId: lead.id,
      timestamp: new Date().toISOString()
    });

    // Check for pending SMS from voice webhook
    const { data: callEvent, error: callEventError } = await supabaseAdmin
      .from('call_events')
      .select('*')
      .eq('twilio_call_sid', callSid)
      .eq('sms_pending', true)
      .single();

    if (!callEventError && callEvent) {
      console.log('[VOICEMAIL SMS] sms_pending flag found - sending initial missed-call SMS', {
        callSid: callSid,
        leadId: lead.id,
        businessId: business.id
      });
      
      // Prevent duplicate SMS by checking if already sent
      if (callEvent.sms_sent_at) {
        console.log('[VOICEMAIL SMS] Skipped - SMS already sent for this call', {
          callSid: callSid,
          smsSentAt: callEvent.sms_sent_at
        });
      } else {
        // Send the delayed SMS
        try {
          console.log('[VOICEMAIL SMS] Sending initial missed-call SMS', {
            to: from,
            leadId: lead.id,
            businessId: business.id
          });

          // Get business details for SMS sending
          const { data: businessDetails } = await supabaseAdmin
            .from('businesses')
            .select('*')
            .eq('id', business.id)
            .single();

          if (!businessDetails) {
            console.error('[VOICEMAIL SMS] Failed to fetch business details for SMS sending');
            return;
          }

          console.log('[VOICEMAIL SMS] Business details fetched', {
            businessId: businessDetails.id,
            twilioPhoneNumber: businessDetails.twilio_phone_number,
            messagingServiceSid: businessDetails.twilio_messaging_service_sid,
            hasAutoReply: !!businessDetails.auto_reply_message
          });

          // Ensure conversation exists
          let conversation = await db.getOpenConversationForLead(lead.id, business.id);

          if (!conversation) {
            console.log('[VOICEMAIL SMS] Creating conversation for SMS');
            conversation = await db.createConversation({
              lead_id: lead.id,
              business_id: business.id,
              status: 'open',
              source: 'missed_call',
              started_at: new Date().toISOString(),
              last_activity_at: new Date().toISOString(),
            });
          } else {
            console.log('[VOICEMAIL SMS] Using existing conversation', {
              conversationId: conversation.id
            });
          }

          // Prepare SMS message
          let messageToSend: string;

          if (businessDetails.auto_reply_message && businessDetails.auto_reply_message.trim()) {
            messageToSend = businessDetails.auto_reply_message;
          } else {
            messageToSend = `Hi, this is {{business_name}}. We just missed your call and received your voicemail. If there's anything you'd like to add or clarify, reply to this text and we'll include it with your request before getting back to you. Reply STOP to opt out.`;
          }

          const personalizedMessage = messageToSend.replace('{{business_name}}', businessDetails.name || 'My Business');

          console.log('[VOICEMAIL SMS] SMS prepared', {
            to: from,
            fromNumber: businessDetails.twilio_phone_number,
            messageLength: personalizedMessage.length,
            conversationId: conversation?.id
          });

          // Send SMS
          const result = await sendSms(businessDetails, from, personalizedMessage, {
            lead_id: lead.id,
            conversation_id: conversation?.id,
          });

          const messageSid = result?.sid || null;

          // Log message link debug
          console.log('[VOICEMAIL SMS] Twilio send result', {
            messageId: messageSid,
            businessId: business.id,
            leadId: lead.id,
            conversationId: conversation?.id,
            direction: 'outbound',
            bodyPresent: !!personalizedMessage,
            createdAt: new Date().toISOString(),
            reason: 'SMS sent from voicemail callback with delayed auto-reply'
          });

          if (messageSid) {
            console.log('[VOICEMAIL SMS] Twilio send success', {
              messageSid,
              callSid: callSid
            });
              
              // Update call_event to mark SMS as sent
              await supabaseAdmin
                .from('call_events')
                .update({
                  sms_sent_at: new Date().toISOString(),
                  sms_message_sid: messageSid,
                  sms_pending: false
                })
                .eq('twilio_call_sid', callSid);

              // Create timeline events
              await timelineEvents.messageSent(business.id, lead.id, conversation?.id || '', '', messageSid);

              console.log('[VOICEMAIL SMS] Outbound message saved to database', {
                messageSid,
                leadId: lead.id,
                conversationId: conversation?.id
              });

              // Create follow-up jobs
              try {
                console.log('[VOICEMAIL SMS] Creating follow-up jobs', {
                  businessId: business.id,
                  leadId: lead.id,
                  conversationId: conversation?.id
                });

                const followUpJobs = await createFollowUpJobs({
                  businessId: business.id,
                  leadId: lead.id,
                  conversationId: conversation?.id,
                  businessName: businessDetails.name
                });

                console.log(`[VOICEMAIL SMS] Created ${followUpJobs.length} follow-up jobs`);
              } catch (followUpError) {
                console.error('[VOICEMAIL SMS] Error creating follow-up jobs:', followUpError);
              }

            } else {
              console.log('[VOICEMAIL SMS] Twilio send failed - no messageSid returned');
            }
          } catch (smsError) {
            console.error('[VOICEMAIL SMS] Error sending delayed SMS:', smsError);
          }
        }
      } else {
        console.log('[VOICEMAIL SMS] Skipped - no pending SMS flag found for this call', {
          callSid: callSid,
          callEventError: callEventError?.message
        });
      }

    // Return thank you TwiML
    const thankYouTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;

    console.log('[MISSED CALL TIMING] voicemail processing completed successfully');
    console.log('[VOICEMAIL INGEST COMPLETE]', { leadId: lead.id, conversationId: conversation.id, voicemailId: voicemail.id, businessId: business.id });
    console.log('[VOICEMAIL TWIML RESPONSE SENT]');
    return new NextResponse(thankYouTwiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });

  } catch (error: any) {
    console.error('[VOICEMAIL] Unexpected error:', error);
    console.error('[VOICEMAIL] Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : 'Unknown'
    });
    // FAIL-SAFE: Always return 200 with TwiML, never 500 to prevent "server unreachable"
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;
    console.log('[VOICEMAIL] Returning 200 despite unexpected error to prevent "server unreachable"');
    return new NextResponse(errorTwiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  }
}
