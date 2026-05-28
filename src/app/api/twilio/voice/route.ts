import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/twilio';
import { normalizePhoneNumber } from '@/lib/twilio';
import { timelineEvents } from '@/lib/event-timeline';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { shouldSendAutoText } from '@/lib/smart-filtering';
import { createFollowUpJobs } from '@/lib/follow-ups';
import { checkTwilioVoiceRateLimit, getClientIp } from '@/lib/rate-limit';
import { getSpokenBusinessName } from '@/lib/speech';
import { checkAllGuards } from '@/lib/ai-call-assistant/config';
import { createAISession } from '@/lib/ai-call-assistant/session';
import { isIgnoredContact } from '@/lib/ignored-contacts';
import { notificationService } from '@/lib/notifications';
import { markForwardingVerified } from '@/lib/forwarding-verification';

// Constants for repeat caller behavior
const AUTO_REPLY_REPEAT_WINDOW_MINUTES = 30;


// Helper function to check if auto-reply SMS was recently sent
async function hasRecentAutoReply(businessId: string, callerPhone: string): Promise<{ hasRecent: boolean; lastSentAt?: string }> {
  try {
    const cutoffTime = new Date(Date.now() - AUTO_REPLY_REPEAT_WINDOW_MINUTES * 60 * 1000).toISOString();
    
    const { data: recentMessage, error } = await supabaseAdmin
      .from('messages')
      .select('created_at')
      .eq('business_id', businessId)
      .eq('customer_phone', callerPhone)
      .eq('direction', 'outbound')
      .eq('message_type', 'auto_reply')
      .gte('created_at', cutoffTime)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[Repeat Caller] Error checking recent auto-reply:', error);
      return { hasRecent: false };
    }

    if (recentMessage) {
      console.log('[Repeat Caller] Found recent auto-reply sent at:', recentMessage.created_at);
      return { hasRecent: true, lastSentAt: recentMessage.created_at };
    }

    return { hasRecent: false };
  } catch (error) {
    console.error('[Repeat Caller] Exception checking recent auto-reply:', error);
    return { hasRecent: false };
  }
}

// Helper to generate voice greeting with dynamic business name
function generateVoiceGreeting(businessName?: string): string {
  // Convert business name to speech-friendly format
  const spokenBusinessName = getSpokenBusinessName(businessName);
  
  // Generate clear voicemail greeting with speech-friendly business name
  const voicemailMessage = `Thanks for calling ${spokenBusinessName}. Sorry we missed your call. Please leave a message after the beep. You can hang up when you're finished, and we'll get back to you shortly.`;
  
  // Voicemail TwiML with recording capability
  const voicemailTwiml = `
    <Pause length="1"/>
    <Say voice="alice">${voicemailMessage}</Say>
    <Record
      maxLength="60"
      playBeep="true"
      trim="trim-silence"
      action="/api/twilio/voicemail"
      method="POST"
      recordingStatusCallback="/api/twilio/recording-status"
      recordingStatusCallbackMethod="POST"
    />
    <Hangup/>
  `.trim();
  
  return voicemailTwiml;
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
  console.log('[ROUTE HIT - TWILIO VOICE] routeName=/api/twilio/voice')
  
  try {
    console.log('VOICE WEBHOOK HIT - PRODUCTION');
    
    // Read raw body exactly once for validation
    const rawBody = await request.text();
    const contentType = request.headers.get('content-type') || '';
    
    // Parse body into params using URLSearchParams
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    
    console.log('[ROUTE HIT - TWILIO VOICE]', {
      routeName: '/api/twilio/voice',
      from: params.From,
      to: params.To,
      timestamp: new Date().toISOString()
    })
    
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
      console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=normal-voicemail');
      console.log('[AI POC FINAL TWIML]', twiml);
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
        break;
      }
    }
    
    if (!business) {
      console.warn('[Voice] No business found for candidates:', uniqueCandidates);
      
      const twiml = generateTwiMLResponse();

      console.log('[Voice] Returning fallback TwiML for no business found');
      console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=no-business-found');
      console.log('[AI POC FINAL TWIML]', twiml);
      return new NextResponse(twiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
          "X-ReplyFlow-Voice-Version": "v2" // Add version tracking header
        },
      });
    }
    
    // EARLIEST POSSIBLE POINT: Check if caller is in ignored contacts BEFORE ANY DB write
    console.log('[IGNORED CONTACT CHECK EARLIEST]', {
      businessId: business.id,
      callerPhone: normalizedFrom,
      timestamp: new Date().toISOString()
    })
    
    const isIgnored = await isIgnoredContact(business.id, normalizedFrom)
    
    if (isIgnored) {
      console.log('[IGNORED CONTACT SKIP ALL AUTOMATION]', {
        businessId: business.id,
        phoneNumber: normalizedFrom,
        timestamp: new Date().toISOString()
      })
      
      // Return minimal TwiML - no Record, no voicemail callback, no recordingStatusCallback, no timeline logging
      const twiml = `<Response><Hangup/></Response>`
      console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=ignored-contact-early')
      console.log('[AI POC FINAL TWIML]', twiml)
      return new NextResponse(twiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
          "X-ReplyFlow-Voice-Version": "v2"
        },
      })
    }
    
    // Only log timeline event if NOT ignored
    await timelineEvents.callReceived(business.id, '', '', From, To);
    
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
      phone_setup_completed_at: business.phone_setup_completed_at,
      onboarding_status: business.onboarding_status,
      shouldMarkForwardingVerified
    });

    console.log('[ONBOARDING CHECK]', {
      businessId: business.id,
      currentStatus: business.onboarding_status,
      forwardingVerified: business.forwarding_verified,
      phoneSetupCompletedAt: business.phone_setup_completed_at
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
          console.log('[ONBOARDING COMPLETE]', {
            businessId: business.id,
            reason: 'First missed-call received and forwarding verified',
            updatedFields: {
              forwarding_verified: true,
              phone_setup_completed_at: new Date().toISOString(),
              onboarding_status: 'completed'
            }
          });
          console.log('[SETUP STEP 3 COMPLETE]', {
            businessId: business.id,
            reason: 'voice_webhook_success',
            callSid: CallSid,
            callStatus: 'completed',
            smsStatus: 'pending_compliance',
            smsFailureReason: 'A2P/campaign compliance not approved'
          });
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

    // AI CALL ASSISTANT: Check if AI should handle this call
    // Phase 0: /api/twilio/ai-assistant/start (fallback to voicemail)
    // Phase 1A POC: Direct TwiML return (routes to Fly.io)
    // This is a minimal, safe check that does NOT affect production customers
    console.log('[AI CALL ASSISTANT] Checking if AI should handle this call')
    const guardResult = checkAllGuards(business.id)
    
    if (guardResult.passed) {
      console.log('[AI CALL ASSISTANT] All guards passed', {
        businessId: business.id,
        callSid: CallSid,
        reason: guardResult.reason
      })
      
      // Choose route based on environment variable
      const usePOC = process.env.AI_ASSISTANT_USE_POC === 'true'
      
      if (usePOC) {
        // Phase 1A POC: Generate TwiML directly to avoid redirect issues
        console.log('[AI CALL ASSISTANT] Using Phase 1A POC - generating TwiML directly')
        
        try {
          // Create AI session
          const session = await createAISession({
            business_id: business.id,
            lead_id: null, // Phase 1A: no lead creation yet
            call_sid: CallSid,
          })

          if (!session) {
            console.log('[AI CALL ASSISTANT] Failed to create session, falling back to voicemail')
          } else {
            console.log('[AI POC] session created:', session.id)
            console.log('[AI POC] callSid:', CallSid)

            // Get Fly.io WebSocket URL from environment
            const flyWsUrl = process.env.AI_VOICE_FLY_WS_URL || 'wss://replyflow-ai-voice.fly.dev/stream'
            
            console.log('[AI POC] stream url:', flyWsUrl)

            // Return TwiML with Media Stream to Fly.io
            // Parameters are passed as <Parameter> elements, not query params
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${flyWsUrl}">
      <Parameter name="sessionId" value="${session.id}" />
      <Parameter name="callSid" value="${CallSid}" />
      <Parameter name="businessId" value="${business.id}" />
    </Stream>
  </Connect>
</Response>`

            console.log('[AI POC] final TwiML:', twiml)
            console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=ai-poc')
            console.log('[AI POC FINAL TWIML]', twiml)

            return new NextResponse(twiml, {
              status: 200,
              headers: {
                'Content-Type': 'text/xml',
                'X-AI-POC': 'phase-1a'
              },
            })
          }
        } catch (error) {
          console.error('[AI CALL ASSISTANT] Error generating POC TwiML:', error)
          // Fall through to existing voicemail flow
        }
      } else {
        // Phase 0: Redirect to start route
        console.log('[AI CALL ASSISTANT] Using Phase 0 - redirecting to AI assistant')
        const aiStartUrl = new URL('/api/twilio/ai-assistant/start', request.url)
        return NextResponse.redirect(aiStartUrl)
      }
    } else {
      console.log('[AI CALL ASSISTANT] Guards failed - continuing with existing voicemail flow', {
        businessId: business.id,
        reason: guardResult.reason
      })
    }
    // END AI CALL ASSISTANT CHECK

    // MISSED CALL TIMING: Log voice webhook received
    console.log('[MISSED CALL TIMING] voice webhook received', {
      businessId: business.id,
      callSid: CallSid,
      callerPhone: From,
      timestamp: new Date().toISOString()
    });

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
    console.log('[CALL EVENTS WRITE ATTEMPT]', {
      businessId: business.id,
      callerPhone: normalizedCallerPhone,
      callSid,
      timestamp: new Date().toISOString()
    })
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

    // Check if lead already exists
    console.log('[Voice] Checking for existing lead for phone:', normalizedCallerPhone);
    const existingLead = await db.getLeadByPhone(business.id, normalizedCallerPhone);
    
    let lead;
    let shouldSendSms = false;
    let isRepeatCaller = false;
    
    if (!existingLead) {
      console.log('[LEAD WRITE ATTEMPT]', {
        businessId: business.id,
        callerPhone: normalizedCallerPhone,
        timestamp: new Date().toISOString()
      })
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
        
        // Mark forwarding as verified when real lead is created from missed call
        await markForwardingVerified(business.id, 'real_missed_call_lead_created');
        
        // Create notification for new lead
        try {
          await notificationService.notifyNewLead(
            business.id,
            'Unknown', // lead name (can be updated later from conversation)
            normalizedCallerPhone,
            lead.id
          );
          console.log('[Voice] Notification created for new lead');
        } catch (error) {
          console.error('[Voice] Error creating notification:', error);
        }
        
        shouldSendSms = true; // Send SMS for new leads
      } else {
        console.error('[Voice] Persistence failed: Lead creation returned null');
        console.error('[Voice] Returning safe TwiML response without SMS');

        const twiml = generateTwiMLResponse(business.name);
        console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=persistence-failed');
        console.log('[AI POC FINAL TWIML]', twiml);
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
      console.log('[Repeat Caller] Reusing existing lead for repeat call');
      lead = existingLead;
      isRepeatCaller = true;
      
      // Update lead's last activity
      try {
        await db.updateLead(lead.id, {
          first_contact_at: new Date().toISOString()
        });
        console.log('[Repeat Caller] Updated lead first_contact_at');
      } catch (updateError) {
        console.error('[Repeat Caller] Error updating lead:', updateError);
      }
      
      await timelineEvents.callReceived(business.id, lead.id, '', normalizedCallerPhone, '');
      
      // Check for recent auto-reply SMS (rate limiting)
      console.log('[Repeat Caller] Checking for recent auto-reply SMS');
      const recentCheck = await hasRecentAutoReply(business.id, normalizedCallerPhone);
      
      if (recentCheck.hasRecent) {
        console.log('[Repeat Caller] Auto-reply skipped: recent message already sent');
        console.log('[Repeat Caller] Last auto-reply sent at:', recentCheck.lastSentAt);
        shouldSendSms = false;
        
        // Log timeline event for skipped SMS (using existing event)
        await timelineEvents.messageSent(business.id, lead.id, '', 'auto_reply_skipped_recent', '');
      } else {
        console.log('[Repeat Caller] No recent auto-reply found, allowing SMS');
        shouldSendSms = true;
      }
    }
    
    // Send auto-reply SMS if appropriate
    if (shouldSendSms && lead) {
      console.log('[Twilio Voice] Preparing auto-reply SMS for lead:', lead.id);
      
      // QA LOGGING: Business hours evaluation
      const now = new Date();
      const businessHoursEnabled = business.business_hours_enabled || false;
      const businessTimezone = business.business_hours_timezone || 'America/New_York';
      const autoReplyMessage = business.auto_reply_message || '';
      const afterHoursMessage = business.after_hours_message || '';
      
      console.log('[QA - Business Hours] Evaluation:', {
        businessId: business.id,
        businessHoursEnabled,
        businessTimezone,
        autoReplyMessageLength: autoReplyMessage.length,
        afterHoursMessageLength: afterHoursMessage.length,
        currentTimeUTC: now.toISOString(),
        currentTimeLocal: now.toLocaleString('en-US', { timeZone: businessTimezone })
      });
      
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
      
      // BUSINESS HOURS ENFORCEMENT
      if (businessHoursEnabled && shouldSendSms) {
        console.log('[QA - Business Hours] Business hours enabled, checking current time...');
        
        // Get current time in business timezone
        const localTime = new Date(now.toLocaleString('en-US', { timeZone: businessTimezone }));
        const localHour = localTime.getHours();
        const localDay = localTime.getDay(); // 0 = Sunday, 6 = Saturday
        
        // Business hours: 9 AM - 6 PM, Mon-Fri
        const isWeekday = localDay >= 1 && localDay <= 5; // Monday = 1, Friday = 5
        const isBusinessHour = localHour >= 9 && localHour < 18; // 9 AM - 6 PM (exclusive of 6 PM)
        
        const isDuringBusinessHours = isWeekday && isBusinessHour;
        
        console.log('[QA - Business Hours] Time evaluation:', {
          localHour,
          localDay,
          isWeekday,
          isBusinessHour,
          isDuringBusinessHours,
          decision: isDuringBusinessHours ? 'SEND AUTO-REPLY' : 'SEND AFTER-HOURS MESSAGE'
        });
        
        // Use appropriate message based on business hours
        if (!isDuringBusinessHours) {
          // Outside business hours - use after-hours message if available
          if (afterHoursMessage && afterHoursMessage.trim()) {
            console.log('[QA - Business Hours] Using after-hours message');
            // Store decision for later when preparing message
            (business as any)._useAfterHoursMessage = true;
          } else {
            console.log('[QA - Business Hours] No after-hours message configured, skipping SMS');
            shouldSendSms = false;
          }
        } else {
          console.log('[QA - Business Hours] During business hours, using auto-reply message');
          (business as any)._useAfterHoursMessage = false;
        }
      } else {
        console.log('[QA - Business Hours] Business hours disabled, always send auto-reply');
        (business as any)._useAfterHoursMessage = false;
      }
    }
    
    // MISSED CALL TIMING: Schedule SMS for later (don't send immediately)
    if (shouldSendSms && lead) {
      console.log('[SMS SCHEDULE ATTEMPT]', {
        businessId: business.id,
        leadId: lead.id,
        callerPhone: From,
        timestamp: new Date().toISOString()
      })
      console.log('[MISSED CALL TIMING] SMS scheduled for voicemail completion', {
        businessId: business.id,
        callSid: CallSid,
        leadId: lead.id,
        callerPhone: From,
        timestamp: new Date().toISOString()
      });
      
      // Store SMS sending intent in call_events for voicemail callback to process
      try {
        await supabaseAdmin
          .from('call_events')
          .update({
            sms_pending: true,
            sms_scheduled_at: new Date().toISOString()
          })
          .eq('twilio_call_sid', CallSid);
          
        console.log('[MISSED CALL TIMING] SMS intent stored in call_events');
      } catch (storeError) {
        console.error('[MISSED CALL TIMING] Failed to store SMS intent:', storeError);
      }
    } else {
      console.log('[MISSED CALL TIMING] SMS not scheduled - conditions not met:', {
        shouldSendSms,
        leadExists: !!lead,
        leadId: lead?.id,
        businessId: business.id
      });
    }
    
    console.log('[Twilio Voice] Voice webhook processed successfully');
    console.log('[VOICE] Returning voicemail TwiML for call:', callSid);
    
    // DEBUG LOGS
    console.log('[Twilio Voice] DEBUG: About to generate final TwiML with business name:', business.name);
    
    const twiml = generateTwiMLResponse(business.name);

    console.log('[Twilio Voice] ===== TWIML RESPONSE LOGGING =====');
    console.log('[Twilio Voice] Business ID:', business.id);
    console.log('[Twilio Voice] Business Name:', business.name);
    console.log('[Twilio Voice] Call SID:', CallSid);
    console.log('[Twilio Voice] Caller:', From);
    console.log('[Twilio Voice] Generated TwiML:');
    console.log('[Twilio Voice]', twiml);
    console.log('[Twilio Voice] ===== TWIML RESPONSE LOGGING END =====');
    console.log('[Twilio Voice] Generated final TwiML response');
    console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=main-fallback');
    console.log('[AI POC FINAL TWIML]', twiml);
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
    console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=error-catch-all');
    console.log('[AI POC FINAL TWIML]', twiml);
    return new NextResponse(twiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
        "X-ReplyFlow-Voice-Version": "v2" // Add version tracking header
      },
    });
  }
}
