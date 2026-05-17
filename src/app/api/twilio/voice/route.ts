import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/twilio';
import { normalizePhoneNumber } from '@/lib/twilio';
import { timelineEvents } from '@/lib/event-timeline';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { shouldSendAutoText } from '@/lib/smart-filtering';
import { createFollowUpJobs } from '@/lib/follow-ups';
import { checkTwilioVoiceRateLimit, getClientIp } from '@/lib/rate-limit';

// Helper to generate conversational voice greeting with Amazon Polly voice or prerecorded audio
function generateVoiceGreeting(businessName?: string): string {
  // Check for prerecorded audio URL
  const defaultGreetingAudioUrl = process.env.DEFAULT_GREETING_AUDIO_URL;
  
  if (defaultGreetingAudioUrl && defaultGreetingAudioUrl.trim() !== '') {
    // Log greeting mode
    console.log('VOICE WEBHOOK HIT - PRODUCTION - Greeting Mode: audio');
    console.log('ACTIVE TWILIO GREETING: prerecorded audio');
    console.log('ACTIVE TWILIO VOICE: audio playback');
    
    // Return prerecorded audio
    return `<Play>${defaultGreetingAudioUrl}</Play>`;
  }
  
  // Force Polly.Joanna-Neural voice with conversational script
  const voice = "Polly.Joanna-Neural";
  
  // Create conversational script with improved punctuation and pauses
  const businessNameText = businessName && businessName.trim() !== '' ? businessName : undefined;
  let greetingText: string;
  
  if (businessNameText) {
    greetingText = `Hey, thanks for calling ${businessNameText}. Sorry we missed your call. We'll send you a quick text message shortly.`;
  } else {
    greetingText = "Hey, thanks for calling. Sorry we missed your call. We'll send you a quick text message shortly.";
  }
  
  // DEBUG LOGS
  console.log('[Twilio Voice] DEBUG: Generating voice greeting');
  console.log('[Twilio Voice] DEBUG: Voice:', voice);
  console.log('[Twilio Voice] DEBUG: Business Name:', businessNameText);
  console.log('[Twilio Voice] DEBUG: Greeting Text:', greetingText);
  console.log('VOICE TEXT:', greetingText); // Add requested VOICE TEXT logging
  
  // Log production voice selection
  console.log('VOICE WEBHOOK HIT - PRODUCTION - Greeting Mode: tts');
  console.log('ACTIVE TWILIO GREETING:', greetingText);
  console.log('ACTIVE TWILIO VOICE:', voice);
  
  // Force the correct TwiML response with improved pacing
  const forcedTwiML = `<Say voice="${voice}" language="en-US">${greetingText}</Say><Pause length="1"/>`;
  
  console.log('FORCE DEPLOYMENT - TwiML being returned:', forcedTwiML);
  
  return forcedTwiML;
}

// Helper to generate complete TwiML response with fallback structure
function generateTwiMLResponse(businessName?: string, hasCustomGreeting: boolean = false): string {
  let voiceContent: string;
  
  // Future-ready structure for custom audio greetings
  if (hasCustomGreeting) {
    // TODO: Implement custom audio greeting support
    // voiceContent = `<Play>${customGreetingUrl}</Play>`;
    voiceContent = generateVoiceGreeting(businessName); // Fallback to generated for now
  } else {
    voiceContent = generateVoiceGreeting(businessName);
  }
  
  const twiml = `
<Response>
  ${voiceContent}
  <Hangup/>
</Response>
`.trim();
  
  console.log('[Twilio Voice] DEBUG: Generated complete TwiML');
  console.log('[Twilio Voice] DEBUG: Final TwiML:', twiml);
  
  // Log production final TwiML with greeting mode info
  const greetingMode = twiml.includes('<Play>') ? 'audio' : 'tts';
  console.log('VOICE WEBHOOK HIT - PRODUCTION - Final TwiML:', {
    twimlLength: twiml.length,
    twimlPreview: twiml.substring(0, 200) + (twiml.length > 200 ? '...' : ''),
    greetingMode: greetingMode,
    containsPlayTag: twiml.includes('<Play>'),
    containsSayTag: twiml.includes('<Say')
  });
  
  return twiml;
}

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
    console.log('VOICE WEBHOOK HIT - PRODUCTION');
    
    // Read raw body exactly once for validation
    const rawBody = await request.text();
    const contentType = request.headers.get('content-type') || '';
    
    // Parse body into params using URLSearchParams
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    
    // Validate Twilio signature with params object
    const isValid = requireTwilioAuth(request, params, rawBody.length, contentType);
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
    
    // Rate limiting check (IP-based)
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkTwilioVoiceRateLimit(clientIp);
    if (!rateLimitResult.success) {
      console.warn('[Twilio Voice] Rate limit exceeded for IP:', clientIp);
      return NextResponse.json(
        { error: 'Too many requests', retryAfter: rateLimitResult.reset },
        { 
          status: 429,
          headers: {
            'Retry-After': rateLimitResult.reset.toString(),
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          }
        }
      );
    }
    
    // Create Supabase client for forwarding verification
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const From = params.From;
    const To = params.To;
    const CallSid = params.CallSid;
    const Called = params.Called;
    const ForwardedFrom = params.ForwardedFrom;
    const Caller = params.Caller;
    const Direction = params.Direction;
    
    // Log raw Twilio params for debugging
    console.log('[Voice] Raw Twilio params:', {
      To,
      Called,
      ForwardedFrom,
      From,
      Caller,
      Direction,
      CallSid,
      CallStatus: params.CallStatus
    });
    
    if (!From || !To) {
      console.error('[Twilio Voice] Missing required fields:', { From, To });
      
      const twiml = generateTwiMLResponse();
      return new NextResponse(twiml, {
        status: 200,
        headers: { 
          "Content-Type": "text/xml",
          "X-ReplyFlow-Voice-Version": "v2"
        },
      });
    }
    
    // Normalize numbers to E.164 format
    const normalizedFrom = toE164(From);
    const normalizedTo = toE164(To);
    
    console.log('[Twilio Voice] Normalized From:', normalizedFrom);
    console.log('[Twilio Voice] Normalized To:', normalizedTo);
    
    // Build candidate lookup numbers from Twilio destination fields
    const candidateNumbers = new Set<string>();
    if (To) candidateNumbers.add(toE164(To));
    if (Called) candidateNumbers.add(toE164(Called));
    if (ForwardedFrom) candidateNumbers.add(toE164(ForwardedFrom));
    
    const uniqueCandidates = Array.from(candidateNumbers);
    console.log('[Voice] Candidate business lookup numbers:', uniqueCandidates);
    
    // Lookup business by businesses.twilio_phone_number IN candidateNumbers
    console.log('[Voice] Business lookup query started');
    let business = null;
    let lookupSource = null;
    
    for (const candidate of uniqueCandidates) {
      const result = await db.getBusinessByTwilioNumber(candidate);
      if (result && result.business) {
        business = result.business;
        lookupSource = result.source;
        console.log('[Voice] Business found:', business.id, business.name, 'via', lookupSource, 'using', candidate);
        await timelineEvents.callReceived(business.id, '', '', From, To);
        break;
      }
    }
    
    if (!business) {
      console.warn('[Voice] No business found for candidates:', uniqueCandidates);
      
      const twiml = generateTwiMLResponse();

      console.log('[Voice] Returning fallback TwiML for no business found');
      return new NextResponse(twiml, {
        status: 200,
        headers: { 
          "Content-Type": "text/xml",
          "X-ReplyFlow-Voice-Version": "v2" // Add version tracking header
        },
      });
    }
    
    console.log('[Voice] Business twilio_phone_number:', business.twilio_phone_number);
    console.log('[Voice] Business business_phone_number:', business.business_phone_number);
    
    // Log production business resolution
    console.log('VOICE WEBHOOK HIT - PRODUCTION - Business Resolved:', {
      businessId: business.id,
      businessName: business.name,
      twilioPhone: business.twilio_phone_number,
      businessPhone: business.business_phone_number
    });

    // Mark forwarding as verified if this is the first successful forwarded call
    // Update: Mark forwarding_verified when ANY call is received (not just when SMS succeeds)
    // This ensures Step 4 completes when real calls are coming in
    let shouldMarkForwardingVerified = !business.forwarding_verified

    console.log('[Setup Progress] Step 4 check:', {
      businessId: business.id,
      forwarding_verified: business.forwarding_verified,
      shouldMarkForwardingVerified
    });

    // Mark forwarding as verified when ANY call is received (not just when SMS succeeds)
    // This ensures Step 4 completes when real calls are coming in
    if (shouldMarkForwardingVerified) {
      console.log('[Setup Progress] Marking forwarding_verified = true for business:', business.id);
      try {
        const { error: updateError } = await supabase
          .from('businesses')
          .update({ 
            forwarding_verified: true, 
            forwarding_verified_at: new Date().toISOString(),
            phone_setup_completed_at: new Date().toISOString(),
            onboarding_status: 'completed'
          })
          .eq('id', business.id);

        if (updateError) {
          console.error('[Setup Progress] Error updating forwarding verification:', updateError);
        } else {
          console.log('[Setup Progress] Forwarding verified successfully for business:', business.id);
          // Mark as verified so we don't try again in the SMS section
          shouldMarkForwardingVerified = false;
        }
      } catch (verificationError) {
        console.error('[Setup Progress] Exception updating forwarding verification:', verificationError);
      }
    }

    console.log('[Twilio Voice] Business found:', {
      businessId: business.id,
      businessName: business.name,
      via: lookupSource
    });
    
    // Add routing logs as specified
    if (lookupSource === 'twilio_numbers') {
      console.log('[Twilio Voice] routing via twilio_numbers');
    } else {
      console.log('[Twilio Voice] routing via legacy fallback');
    }

    // Check if this is a setup completion call (caller matches business phone number)
    const normalizedCallerPhone = normalizePhoneNumber(From);
    const businessPhoneNumber = business.business_phone_number ? normalizePhoneNumber(business.business_phone_number) : null;
    
    if (businessPhoneNumber && normalizedCallerPhone === businessPhoneNumber) {
      console.log('[Twilio Voice] Setup completion detected - caller matches business phone number:', normalizedCallerPhone);
      
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
    const callSid = params.CallSid
    try {
      const callEvent = await db.createCallEvent({
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        call_status: 'missed',
        twilio_call_sid: callSid,
        raw_payload: Object.fromEntries(Object.entries(params)),
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

    // Check if caller is in ignored contacts
    console.log('[Twilio Voice] Checking if caller is in ignored contacts:', normalizedCallerPhone);
    const { data: ignoredContact, error: ignoredCheckError } = await supabase
      .from('ignored_contacts')
      .select('*')
      .eq('business_id', business.id)
      .eq('phone_number', normalizedCallerPhone)
      .single();

    if (ignoredContact) {
      console.log('[Twilio Voice] Ignored contact detected - skipping automation:', {
        businessId: business.id,
        phoneNumber: normalizedCallerPhone,
        label: ignoredContact.label,
        reason: ignoredContact.reason
      });

      // Still return valid TwiML so the call doesn't error
      const twiml = generateTwiMLResponse(business.name);
      return new NextResponse(twiml, {
        status: 200,
        headers: { 
          "Content-Type": "text/xml",
          "X-ReplyFlow-Voice-Version": "v2"
        },
      });
    }

    if (ignoredCheckError && ignoredCheckError.code !== 'PGRST116') {
      console.error('[Twilio Voice] Error checking ignored contacts:', ignoredCheckError);
    }

    // Check if lead already exists
    console.log('[Voice] Checking for existing lead for phone:', normalizedCallerPhone);
    const existingLead = await db.getLeadByPhone(business.id, normalizedCallerPhone);
    
    let lead;
    let shouldSendSms = false;
    
    if (!existingLead) {
      console.log('[Voice] No existing lead found, creating new lead');
      console.log('[Voice] Creating lead:', {
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        status: 'new'
      });
      
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
        console.log('[Voice] Lead created:', lead.id);
        await timelineEvents.leadCreated(business.id, lead.id, '', normalizedCallerPhone);
        shouldSendSms = true; // Send SMS for new leads
      } else {
        console.error('[Voice] Persistence failed: Lead creation returned null');
        console.error('[Voice] Returning safe TwiML response without SMS');
        
        const twiml = generateTwiMLResponse(business.name);
        return new NextResponse(twiml, {
          status: 200,
          headers: { 
            "Content-Type": "text/xml",
            "X-ReplyFlow-Voice-Version": "v2"
          },
        });
      }
    } else {
      console.log('[Voice] Existing lead found:', existingLead.id);
      lead = existingLead;
      // For testing, we'll send SMS even for existing leads to ensure the flow works
      // TODO: Add logic to determine if SMS should be sent for existing leads based on business rules
      shouldSendSms = true;
      console.log('[Voice] Will send auto-reply SMS for existing lead (testing mode)');
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
        console.log('[Voice] Checking for existing conversation for lead:', lead.id);
        let conversation = await db.getOpenConversationForLead(lead.id, business.id);
        
        if (!conversation) {
          console.log('[Voice] Creating conversation:', {
            lead_id: lead.id,
            business_id: business.id,
            status: 'open',
            source: 'missed_call'
          });
          
          conversation = await db.createConversation({
            lead_id: lead.id,
            business_id: business.id,
            status: 'open',
            source: 'missed_call',
            started_at: new Date().toISOString(),
            last_activity_at: new Date().toISOString(),
          });
          
          if (conversation) {
            console.log('[Voice] Conversation created:', conversation.id);
            await timelineEvents.conversationCreated(business.id, lead.id, conversation.id);
          } else {
            console.error('[Voice] Persistence failed: Conversation creation returned null');
            console.error('[Voice] Returning safe TwiML response without SMS');
            
            const twiml = generateTwiMLResponse(business.name);
            return new NextResponse(twiml, {
              status: 200,
              headers: { 
                "Content-Type": "text/xml",
                "X-ReplyFlow-Voice-Version": "v2"
              },
            });
          }
        } else {
          console.log('[Voice] Using existing conversation:', conversation.id);
        }
        
        // Prepare auto-reply message
        const autoReplyMessage = business.auto_reply_message || 
          `Hi, this is ${business.name || 'My Business'}. Sorry we missed your call-how can we help? Reply STOP to opt out.`;
        
        // Replace business name placeholder if present
        const personalizedMessage = autoReplyMessage.replace('{{business_name}}', business.name || 'My Business');
        
        console.log('[Voice] Sending SMS:', {
          to: From,
          lead_id: lead.id,
          conversation_id: conversation?.id,
          business_id: business.id
        });
        
        // Send SMS using centralized sendSms function
        const messageSid = await sendSms(business, From, personalizedMessage, {
          lead_id: lead.id,
          conversation_id: conversation?.id,
        });
        
        if (messageSid) {
          console.log('[Voice] SMS sent:', messageSid);
          console.log('[Voice] Outbound message saved via sendSms function');
          await timelineEvents.messageSent(business.id, lead.id, conversation?.id, '', messageSid);

          // Mark forwarding as verified after SMS is successfully sent
          if (shouldMarkForwardingVerified) {
            console.log(`[Twilio Voice] Marking forwarding as verified for business ${business.id} after successful SMS`);
            try {
              const { error: updateError } = await supabase
                .from('businesses')
                .update({ 
                  forwarding_verified: true, 
                  forwarding_verified_at: new Date().toISOString(),
                  phone_setup_completed_at: new Date().toISOString(),
                  onboarding_status: 'completed'
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
          }

          // Create follow-up jobs after successful auto-reply SMS
          try {
            const followUpJobs = await createFollowUpJobs({
              businessId: business.id,
              leadId: lead.id,
              conversationId: conversation?.id,
              businessName: business.name
            });
            
            console.log(`[Voice] Created ${followUpJobs.length} follow-up jobs for lead: ${lead.id}`);
          } catch (followUpError) {
            console.error('[Voice] Error creating follow-up jobs:', followUpError);
            // Don't fail the voice webhook - follow-up creation is secondary
          }
        } else {
          console.log('[Voice] SMS send failed but was logged in database - this is expected behavior');
          // Do not mark forwarding as verified if SMS failed
          if (shouldMarkForwardingVerified) {
            console.log('[Voice] SMS failed, not marking forwarding as verified');
          }
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
    
    // DEBUG LOGS
    console.log('[Twilio Voice] DEBUG: About to generate final TwiML with business name:', business.name);
    
    const twiml = generateTwiMLResponse(business.name);

    console.log('[Twilio Voice] Generated final TwiML response');
    return new NextResponse(twiml, {
      status: 200,
      headers: { 
        "Content-Type": "text/xml",
        "X-ReplyFlow-Voice-Version": "v2" // Add version tracking header
      },
    });
  } catch (error) {
    console.error('[Twilio Voice] Failed:', error);
    
    const twiml = generateTwiMLResponse();

    console.log('[Twilio Voice] Returning fallback TwiML due to error');
    return new NextResponse(twiml, {
      status: 200,
      headers: { 
        "Content-Type": "text/xml",
        "X-ReplyFlow-Voice-Version": "v2" // Add version tracking header
      },
    });
  }
}
