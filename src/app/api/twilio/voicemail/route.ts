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

export async function POST(request: NextRequest) {
  console.log('[VOICEMAIL CALLBACK RECEIVED]');

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
    const normalizedCallerPhone = normalizePhoneNumberForStorage(from);
    console.log('[VOICEMAIL] Normalized caller phone:', normalizedCallerPhone);

    // EARLIEST POSSIBLE POINT: Check if caller is in ignored contacts
    console.log('[IGNORED CONTACT VOICEMAIL CHECK]', {
      businessId: business.id,
      callerPhone: normalizedCallerPhone,
      timestamp: new Date().toISOString()
    })
    
    const isIgnored = await isIgnoredContact(business.id, normalizedCallerPhone)
    
    if (isIgnored) {
      console.log('[IGNORED CONTACT VOICEMAIL SKIP]', {
        businessId: business.id,
        phoneNumber: normalizedCallerPhone,
        timestamp: new Date().toISOString()
      })
      
      // Return success without creating lead, conversation, message, or voicemail
      return new NextResponse('OK', { status: 200 })
    }

    // Find or create lead
    console.log('[VOICEMAIL] Finding lead for phone:', normalizedCallerPhone);
    let lead = await db.getLeadByPhone(business.id, normalizedCallerPhone);
    
    if (!lead) {
      console.log('[VOICEMAIL] No existing lead found, creating new lead')
      console.log('[VOICEMAIL LEAD CREATE PAYLOAD]', {
        business_id: business.id,
        phone: normalizedCallerPhone,
        status: 'new',
        first_contact_at: new Date().toISOString(),
        last_message_at: null,
        last_reply_at: null,
        opted_out: false,
        is_demo: false,
      });

      try {
        lead = await db.createLead({
          business_id: business.id,
          phone: normalizedCallerPhone,
          status: 'new',
          first_contact_at: new Date().toISOString(),
          last_message_at: null,
          last_reply_at: null,
          opted_out: false,
          is_demo: false,
        });
      } catch (leadError) {
        console.error('[VOICEMAIL LEAD CREATE EXCEPTION]', {
          error: leadError,
          message: leadError instanceof Error ? leadError.message : 'Unknown error',
          stack: leadError instanceof Error ? leadError.stack : undefined,
          business_id: business.id,
          phone: normalizedCallerPhone
        });
        return new NextResponse('Failed to create lead: database error', { status: 500 });
      }

      if (!lead) {
        console.error('[VOICEMAIL LEAD CREATE FAILED]', {
          business_id: business.id,
          phone: normalizedCallerPhone,
          result: lead
        });
        return new NextResponse('Failed to create lead: null returned', { status: 500 });
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
        return new NextResponse('Failed to create conversation', { status: 500 });
      }

      console.log('[VOICEMAIL CONVERSATION CREATED]', { conversationId: conversation.id, leadId: lead.id, businessId: business.id });
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

    console.log('[VOICEMAIL NOTIFICATION CREATED]', { voicemailId: voicemail.id, leadId: lead.id, businessId: business.id });
    console.log('[VOICEMAIL INGEST COMPLETE]', { leadId: lead.id, conversationId: conversation.id, voicemailId: voicemail.id, businessId: business.id });
    console.log('[VOICEMAIL] Recording saved:', voicemail.id);

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
    console.log('[MISSED CALL TIMING] voicemail completed', {
      businessId: business.id,
      callSid: callSid,
      recordingSid: recordingSid,
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
      console.log('[MISSED CALL TIMING] Processing pending SMS from voice webhook');
      
      // Prevent duplicate SMS by checking if already sent
      if (callEvent.sms_sent_at) {
        console.log('[MISSED CALL TIMING] SMS already sent for this call, skipping');
      } else {
        // Send the delayed SMS
        try {
          // Get business details for SMS sending
          const { data: businessDetails } = await supabaseAdmin
            .from('businesses')
            .select('*')
            .eq('id', business.id)
            .single();

          if (businessDetails) {
            // Ensure conversation exists
            let conversation = await db.getOpenConversationForLead(lead.id, business.id);
            
            if (!conversation) {
              conversation = await db.createConversation({
                lead_id: lead.id,
                business_id: business.id,
                status: 'open',
                source: 'missed_call',
                started_at: new Date().toISOString(),
                last_activity_at: new Date().toISOString(),
              });
            }

            // Prepare SMS message
            let messageToSend: string;
            
            if (businessDetails.auto_reply_message && businessDetails.auto_reply_message.trim()) {
              messageToSend = businessDetails.auto_reply_message;
            } else {
              messageToSend = `Hi, this is ${businessDetails.name || 'My Business'}. We received your call and will get back to you shortly. You can also reply to this text with any additional details. Reply STOP to opt out.`;
            }

            const personalizedMessage = messageToSend.replace('{{business_name}}', businessDetails.name || 'My Business');

            console.log('[MISSED CALL TIMING] Sending delayed SMS:', {
              to: from,
              leadId: lead.id,
              conversationId: conversation?.id,
              businessId: business.id
            });

            // Send SMS
            const messageSid = await sendSms(businessDetails, from, personalizedMessage, {
              lead_id: lead.id,
              conversation_id: conversation?.id,
            });

            if (messageSid) {
              console.log('[MISSED CALL TIMING] SMS sent successfully:', messageSid);
              
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

              // Create follow-up jobs
              try {
                const followUpJobs = await createFollowUpJobs({
                  businessId: business.id,
                  leadId: lead.id,
                  conversationId: conversation?.id,
                  businessName: businessDetails.name
                });
                
                console.log(`[MISSED CALL TIMING] Created ${followUpJobs.length} follow-up jobs`);
              } catch (followUpError) {
                console.error('[MISSED CALL TIMING] Error creating follow-up jobs:', followUpError);
              }

            } else {
              console.log('[MISSED CALL TIMING] SMS sending failed');
            }
          }
        } catch (smsError) {
          console.error('[MISSED CALL TIMING] Error sending delayed SMS:', smsError);
        }
      }
    } else {
      console.log('[MISSED CALL TIMING] No pending SMS found for this call');
    }

    // Return thank you TwiML
    const thankYouTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you. Goodbye.</Say>
  <Hangup/>
</Response>`;

    console.log('[MISSED CALL TIMING] voicemail processing completed successfully');
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
