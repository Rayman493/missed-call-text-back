import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase/admin';
import { normalizePhoneNumber } from '@/lib/twilio';
import { sendSms } from '@/lib/twilio';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { shouldSendAutoText } from '@/lib/smart-filtering';
import { createFollowUpJobs } from '@/lib/follow-ups';

// Helper to convert normalized 10-digit US number to E.164 format
function toE164(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  // If it's 10 digits (US number), add +1 prefix
  if (normalized.length === 10) {
    return `+1${normalized}`;
  }
  // Otherwise assume it's already in E.164 or international format
  return phone.startsWith('+') ? phone : `+${normalized}`;
}

export async function POST(request: NextRequest) {
  try {
    console.log('[Twilio Voice] Incoming call');
    
    // Create Supabase client for forwarding verification
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const body = await request.text();
    
    // TODO: Re-enable Twilio signature validation after testing
    // TEMPORARILY DISABLED FOR PRODUCTION READINESS TESTING
    // Validate Twilio webhook signature
    // if (!requireTwilioAuth(request, body)) {
    //   console.error('[Twilio Voice] Invalid webhook signature')
    //   return new Response('Unauthorized', { status: 401 })
    // }
    
    // Log request details for debugging
    console.log('[Twilio Voice] Request details:', {
      url: request.url,
      method: request.method,
      headers: {
        'twilio-signature': request.headers.get('twilio-signature'),
        'content-type': request.headers.get('content-type'),
        'user-agent': request.headers.get('user-agent'),
      },
      bodyLength: body.length
    });
    
    const params = new URLSearchParams(body);
    
    const From = params.get('From');
    const To = params.get('To');
    
    console.log('[Twilio Voice] Call details:', {
      From,
      To,
      CallSid: params.get('CallSid'),
      CallStatus: params.get('CallStatus'),
      Direction: params.get('Direction')
    });
    
    if (!From || !To) {
      console.error('[Twilio Voice] Missing required fields:', { From, To });
      
      const twiml = `
<Response>
  <Say voice="alice">Sorry, we missed your call. We will text you shortly.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>
`;

      console.log('[Twilio Voice] Returning fallback TwiML for missing fields');
      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }
    
    console.log('[Twilio Voice] From:', From);
    console.log('[Twilio Voice] To:', To);
    
    // Normalize numbers to E.164 format
    const normalizedFrom = toE164(From);
    const normalizedTo = toE164(To);
    
    console.log('[Twilio Voice] Normalized From:', normalizedFrom);
    console.log('[Twilio Voice] Normalized To:', normalizedTo);
    
    // Find business by Twilio phone number (try twilio_numbers first, fallback to legacy)
    console.log('[Twilio Voice] Looking up business for Twilio number:', normalizedTo);
    const result = await db.getBusinessByTwilioNumber(normalizedTo);
    
    if (!result || !result.business) {
      console.log('[Twilio Voice] No business found for number:', normalizedTo);
      
      const twiml = `
<Response>
  <Say voice="alice">Sorry, we missed your call. We will text you shortly.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>
`;

      console.log('[Twilio Voice] Returning fallback TwiML for no business found');
      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      });
    }
    
    const business = result.business;
    console.log(`[Twilio Voice] Business found: ${business.name} (ID: ${business.id})`);

    // Mark forwarding as verified if this is the first successful forwarded call
    if (!business.forwarding_verified) {
      console.log(`[Twilio Voice] Marking forwarding as verified for business ${business.id}`);
      try {
        const { error: updateError } = await supabase
          .from('businesses')
          .update({ 
            forwarding_verified: true, 
            forwarding_verified_at: new Date().toISOString() 
          })
          .eq('id', business.id);

        if (updateError) {
          console.error('[Twilio Voice] Error updating forwarding verification:', updateError);
        } else {
          console.log(`[Twilio Voice] Forwarding verified successfully for business ${business.id}`);
        }
      } catch (verificationError) {
        console.error('[Twilio Voice] Exception updating forwarding verification:', verificationError);
      }
    } else {
      console.log(`[Twilio Voice] Forwarding already verified for business ${business.id} at ${business.forwarding_verified_at}`);
    }

    console.log('[Twilio Voice] Business found:', {
      businessId: business.id,
      businessName: business.name,
      via: result.source
    });
    
    // Add routing logs as specified
    if (result.source === 'twilio_numbers') {
      console.log('[Twilio Voice] routing via twilio_numbers');
    } else {
      console.log('[Twilio Voice] routing via legacy fallback');
    }

    // Check if this is a setup completion call (caller matches business forwarding phone)
    const normalizedCallerPhone = normalizePhoneNumber(From);
    const businessForwardingPhone = business.forwarding_phone_number ? normalizePhoneNumber(business.forwarding_phone_number) : null;
    
    if (businessForwardingPhone && normalizedCallerPhone === businessForwardingPhone) {
      console.log('[Twilio Voice] Setup completion detected - caller matches business forwarding phone:', normalizedCallerPhone);
      
      // Mark setup as complete by updating the business
      try {
        const updatedBusiness = await db.updateBusiness(business.id, {
          setup_completed_at: new Date().toISOString(),
          setup_status: 'working'
        });
        
        if (updatedBusiness) {
          console.log('[Twilio Voice] Business setup marked as complete:', updatedBusiness.id);
        } else {
          console.error('[Twilio Voice] Failed to update business setup status');
        }
      } catch (error) {
        console.error('[Twilio Voice] Error updating business setup status:', error);
      }
    }
    
    // Create call event for analytics (every call counts)
    const callSid = params.get('CallSid')
    try {
      const callEvent = await db.createCallEvent({
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        call_status: 'missed',
        twilio_call_sid: callSid,
        raw_payload: Object.fromEntries(params.entries()),
        created_at: new Date().toISOString(),
      });
      
      if (callEvent) {
        console.log('[call_events] Created call event:', callEvent.id);
      } else {
        console.log('[call_events] Duplicate call SID detected, skipping insert:', callSid);
      }
    } catch (callEventError: any) {
      // Handle duplicate key error gracefully
      if (callEventError.message?.includes('duplicate key') || callEventError.code === '23505') {
        console.log('[call_events] Duplicate prevented by DB index:', callSid);
      } else {
        console.error('[call_events] Error creating call event:', callEventError);
      }
    }

    // Check if lead already exists
    console.log('[Twilio Voice] Checking for existing lead for phone:', normalizedCallerPhone);
    const existingLead = await db.getLeadByPhone(business.id, normalizedCallerPhone);
    
    let lead;
    let shouldSendSms = false;
    
    if (!existingLead) {
      console.log('[Twilio Voice] No existing lead found, creating new lead');
      
      // Create new lead
      lead = await db.createLead({
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        status: 'new',
        first_contact_at: new Date().toISOString(),
        last_message_at: null,
        last_reply_at: null,
        opted_out: false,
        is_demo: false, // Real leads from voice webhook
      });
      
      if (lead) {
        console.log('[Twilio Voice] New lead created successfully:', {
          leadId: lead.id,
          businessId: lead.business_id,
          callerPhone: lead.caller_phone,
          status: lead.status
        });
        shouldSendSms = true; // Send SMS for new leads
      } else {
        console.error('[Twilio Voice] Failed to create lead - database returned null');
      }
    } else {
      console.log('[Twilio Voice] Existing lead found:', {
        leadId: existingLead.id,
        businessId: existingLead.business_id,
        callerPhone: existingLead.caller_phone,
        status: existingLead.status,
        createdAt: existingLead.created_at
      });
      lead = existingLead;
      // For testing, we'll send SMS even for existing leads to ensure the flow works
      // TODO: Add logic to determine if SMS should be sent for existing leads based on business rules
      shouldSendSms = true;
      console.log('[Twilio Voice] Will send auto-reply SMS for existing lead (testing mode)');
    }
    
    // Send auto-reply SMS if appropriate
    if (shouldSendSms && lead) {
      console.log('[Twilio Voice] Preparing auto-reply SMS for lead:', lead.id);
      
      // Run smart filtering before sending SMS
      console.log('[Twilio Voice] Running smart filtering for caller:', From);
      const filteringResult = await shouldSendAutoText({
        businessId: business.id,
        callerPhone: From,
        callSid: callSid || undefined,
        business: business
      });
      
      if (!filteringResult.allowed) {
        console.log('[Twilio Voice] SMS blocked by smart filtering:', {
          reason: filteringResult.reason,
          details: filteringResult.details
        });
        shouldSendSms = false;
      } else {
        console.log('[Twilio Voice] SMS allowed by smart filtering:', filteringResult.reason);
      }
    }
    
    // Send auto-reply SMS if appropriate and not blocked
    if (shouldSendSms && lead) {
      console.log('[Twilio Voice] Preparing auto-reply SMS for lead:', lead.id);
      
      try {
        // Ensure conversation exists before sending SMS
        console.log('[Twilio Voice] Checking for existing conversation for lead:', lead.id);
        let conversation = await db.getOpenConversationForLead(lead.id, business.id);
        
        if (!conversation) {
          console.log('[Twilio Voice] Creating new conversation for lead:', lead.id);
          conversation = await db.createConversation({
            lead_id: lead.id,
            business_id: business.id,
            status: 'open',
            source: 'missed_call',
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          });
          
          if (conversation) {
            console.log('[Twilio Voice] Conversation created successfully:', {
              conversationId: conversation.id,
              leadId: conversation.lead_id,
              businessId: conversation.business_id,
              status: conversation.status
            });
          } else {
            console.error('[Twilio Voice] Failed to create conversation - database returned null');
          }
        } else {
          console.log('[Twilio Voice] Using existing conversation:', {
            conversationId: conversation.id,
            status: conversation.status,
            lastActivity: conversation.last_activity_at
          });
        }
        
        // Prepare auto-reply message
        const autoReplyMessage = business.auto_reply_message || 
          `Hi, this is ${business.name || 'My Business'}. Sorry we missed your call-how can we help? Reply STOP to opt out.`;
        
        // Replace business name placeholder if present
        const personalizedMessage = autoReplyMessage.replace('{{business_name}}', business.name || 'My Business');
        
        console.log('[Twilio Voice] Sending auto-reply SMS:', {
          to: From,
          messageLength: personalizedMessage.length,
          messagePreview: personalizedMessage.substring(0, 100) + (personalizedMessage.length > 100 ? '...' : ''),
          leadId: lead.id,
          conversationId: conversation?.id
        });
        
        // Send SMS using centralized sendSms function
        const messageSid = await sendSms(business, From, personalizedMessage, {
          lead_id: lead.id,
          conversation_id: conversation?.id,
        });
        
        if (messageSid) {
          console.log('[Twilio Voice] SMS sent successfully:', {
            messageSid,
            to: From,
            leadId: lead.id,
            conversationId: conversation?.id
          });

          // Create follow-up jobs after successful auto-reply SMS
          try {
            const followUpJobs = await createFollowUpJobs({
              businessId: business.id,
              leadId: lead.id,
              conversationId: conversation?.id,
              businessName: business.name
            });
            
            console.log(`[Twilio Voice] Created ${followUpJobs.length} follow-up jobs for lead: ${lead.id}`);
          } catch (followUpError) {
            console.error('[Twilio Voice] Error creating follow-up jobs:', followUpError);
            // Don't fail the voice webhook - follow-up creation is secondary
          }
        } else {
          console.log('[Twilio Voice] SMS send failed but was logged in database - this is expected behavior');
        }
        
      } catch (smsError: any) {
        console.error('[Twilio Voice] SMS sending failed with error:', {
          error: smsError.message,
          stack: smsError.stack,
          leadId: lead.id
        });
        // Don't crash the voice webhook - continue with TwiML response
        console.log('[Twilio Voice] Continuing with voice response despite SMS failure');
      }
    } else {
      console.log('[Twilio Voice] SMS skipped - conditions not met:', {
        shouldSendSms,
        leadExists: !!lead,
        leadId: lead?.id
      });
    }
    
    console.log('[Twilio Voice] Voice webhook processed successfully');
    
    const twiml = `
<Response>
  <Say voice="alice">Sorry, we missed your call. We will text you shortly.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>
`;

    console.log('[Twilio Voice] Generated final TwiML response');
    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  } catch (error) {
    console.error('[Twilio Voice] Failed:', error);
    
    const twiml = `
<Response>
  <Say voice="alice">Sorry, we missed your call. We will text you shortly.</Say>
  <Pause length="1"/>
  <Hangup/>
</Response>
`;

    console.log('[Twilio Voice] Returning fallback TwiML due to error');
    return new NextResponse(twiml, {
      status: 200,
      headers: { "Content-Type": "text/xml" },
    });
  }
}
