import { NextRequest, NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';
import { db } from '@/lib/supabase/admin';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/twilio';
import { normalizePhoneNumberForStorage } from '@/lib/supabase/admin';
import { timelineEvents } from '@/lib/event-timeline';
import { requireTwilioAuth } from '@/lib/twilio/webhook';
import { shouldSendAutoText } from '@/lib/smart-filtering';
import { createFollowUpJobs } from '@/lib/follow-ups';
import { checkTwilioVoiceRateLimit, getClientIp } from '@/lib/rate-limit';
import { getSpokenBusinessName } from '@/lib/speech';
import { checkAllGuards } from '@/lib/ai-call-assistant/config';
import { createAISession, updateAISession } from '@/lib/ai-call-assistant/session';
import { isIgnoredContact } from '@/lib/ignored-contacts';
import { notificationServiceServer } from '@/lib/notifications-server';
import { markForwardingVerified } from '@/lib/forwarding-verification';

// Constants for repeat caller behavior
const AUTO_REPLY_REPEAT_WINDOW_MINUTES = 30;

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


// Helper function to check if auto-reply SMS was recently sent
async function hasRecentAutoReply(businessId: string, callerPhone: string): Promise<{ hasRecent: boolean; lastSentAt?: string }> {
  try {
    const cutoffTime = new Date(Date.now() - AUTO_REPLY_REPEAT_WINDOW_MINUTES * 60 * 1000).toISOString();
    
    // First find the lead for this business and caller
    const { data: lead, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id')
      .eq('business_id', businessId)
      .eq('caller_phone', callerPhone)
      .single();

    if (leadError && leadError.code !== 'PGRST116') {
      console.error('[Repeat Caller] Error finding lead:', leadError);
      return { hasRecent: false };
    }

    if (!lead) {
      // No lead found, so no recent messages
      return { hasRecent: false };
    }

    // Now check for recent auto-reply messages for this lead
    const { data: recentMessage, error } = await supabaseAdmin
      .from('messages')
      .select('created_at')
      .eq('lead_id', lead.id)
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

// Helper to generate voice greeting with static polished wording
function generateVoiceGreeting(): string {
  // Static, polished voicemail greeting for all businesses
  // Note: Phone number is not requested since ReplyFlow receives it from Caller ID
  const voicemailMessage = "Thank you for calling. We're sorry we missed your call. Please leave your name and the reason for your call after the tone, and we'll get back to you as soon as possible.";
  
  // Note: Transcription is now fetched via REST API in recording-status callback
  // instead of using Twilio's transcribeCallback (account-level restrictions prevent callbacks)
  
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

// Helper to generate voicemail with pre-recorded greeting
function generateVoicemailWithRecordedGreeting(customGreetingUrl: string): string {
  // Note: Transcription is now fetched via REST API in recording-status callback
  // instead of using Twilio's transcribeCallback (account-level restrictions prevent callbacks)
  
  const voicemailTwiml = `
    <Play>${customGreetingUrl}</Play>
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

// Helper to generate clean hangup for ignored contacts
function generateIgnoredContactResponse(): string {
  // Silent hangup - no message, no voicemail
  // Clean UX for intentionally blocked calls
  // No persistence, no AI, no lead, no conversation, no SMS, no follow-ups
  const responseTwiml = `
<Response>
  <Hangup/>
</Response>
`.trim();
  
  return responseTwiml;
}

// Helper to generate complete TwiML response with fallback structure
function generateTwiMLResponse(customGreetingUrl?: string | null): string {
  let voiceContent: string;
  
  // Use pre-recorded greeting if available, with TTS fallback
  if (customGreetingUrl) {
    voiceContent = generateVoicemailWithRecordedGreeting(customGreetingUrl);
  } else {
    voiceContent = generateVoiceGreeting();
  }
  
  const twiml = `
<Response>
  ${voiceContent}
</Response>
`.trim();
  
  return twiml;
}


// Shared voice webhook handler - used by both GET and POST
// This ensures AI routing cannot be bypassed by HTTP method differences
async function handleVoiceWebhook(request: NextRequest, skipSignatureValidation: boolean = false) {
  console.log('[VOICE ROUTE START] Beginning voice webhook processing', {
    timestamp: new Date().toISOString(),
    url: request.url,
    method: request.method,
    deploymentVersion: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown'
  });

  console.log('[MAIN VOICE WEBHOOK HIT]', {
    timestamp: new Date().toISOString(),
    url: request.url,
    method: request.method
  });
  console.log('[ROUTE HIT - TWILIO VOICE] routeName=/api/twilio/voice');
  console.log('[CALL INTAKE FLOW] Initial voice webhook received - starting canonical intake process');

  try {
    console.log('[VOICE WEBHOOK] Starting call processing');
    console.log('[VOICE WEBHOOK] Headers:', Object.fromEntries(request.headers.entries()));
    
    // Extract params based on HTTP method
    let params: any;
    let rawBody: string = '';
    let contentType: string = '';
    
    if (request.method === 'POST') {
      // Read raw body for signature validation
      rawBody = await request.text();
      contentType = request.headers.get('content-type') || '';
      
      console.log('[VOICE WEBHOOK] Body length:', rawBody.length);
      console.log('[VOICE WEBHOOK] Content type:', contentType);
      
      // Parse body into params using URLSearchParams
      params = Object.fromEntries(new URLSearchParams(rawBody));
    } else {
      // GET: Extract params from query string
      const url = new URL(request.url);
      params = Object.fromEntries(url.searchParams.entries());
      console.log('[VOICE WEBHOOK] GET request - params from query string');
    }
    
    console.log('[ROUTE HIT - TWILIO VOICE]', {
      routeName: '/api/twilio/voice',
      from: params.From,
      to: params.To,
      timestamp: new Date().toISOString()
    })
    
    // Validate Twilio signature with params object (only for POST unless skipped)
    if (!skipSignatureValidation) {
      console.log('[VOICE WEBHOOK] Validating Twilio signature...');
      const isValid = requireTwilioAuth(request, params, rawBody.length, contentType);
      console.log('[VOICE WEBHOOK] Signature valid:', isValid);
      if (!isValid) {
        console.error('[VOICE WEBHOOK] Invalid signature - rejecting request');
        console.log('[VOICE ROUTE RETURN]', {
          path: 'INVALID_SIGNATURE',
          reason: 'Twilio signature validation failed',
          callSid: params.CallSid || 'unknown'
        });
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else {
      console.log('[VOICE WEBHOOK] Signature validation skipped (GET or explicitly disabled)');
    }
    
    // Rate limiting check (IP-based)
    const clientIp = getClientIp(request);
    const rateLimitResult = await checkTwilioVoiceRateLimit(clientIp);
    if (!rateLimitResult.success) {
      console.warn('[Twilio Voice] Rate limit exceeded for IP:', clientIp);
      console.log('[VOICE ROUTE RETURN]', {
        path: 'RATE_LIMIT',
        reason: 'IP rate limit exceeded',
        callSid: params.CallSid || 'unknown',
        clientIp: clientIp
      });
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
    
    console.log('[MAIN VOICE REQUEST]', {
      callSid: CallSid,
      from: From,
      to: To,
      forwardedFrom: ForwardedFrom
    });
    
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

    // Add comprehensive webhook input logging
    console.log('[TWILIO VOICE WEBHOOK INPUT]', {
      From: From || 'undefined',
      To: To || 'undefined', 
      Called: Called || 'undefined',
      ForwardedFrom: ForwardedFrom || 'undefined',
      CallSid: CallSid || 'undefined',
      Caller: Caller || 'undefined',
      Direction: Direction || 'undefined'
    });
    
    if (!From || !To) {
      console.error('[Twilio Voice] Missing required fields:', { From, To });
      console.log('[FINAL TWIML PATH] MISSING_FIELDS - From or To is missing', {
        callSid: CallSid,
        From: From || 'missing',
        To: To || 'missing'
      });

      const twiml = generateTwiMLResponse();
      console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=normal-voicemail');
      console.log('[AI POC FINAL TWIML]', twiml);
      console.log('[VOICE PATH] VOICEMAIL');
      console.log('[VOICE ROUTE RETURN]', {
        path: 'MISSING_FIELDS',
        reason: 'From or To is missing',
        callSid: CallSid || 'unknown',
        From: From || 'missing',
        To: To || 'missing'
      });
      return new NextResponse(twiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
          "X-ReplyFlow-Voice-Version": "v2"
        },
      });
    }
    
    // Normalize numbers to E.164 format
    const normalizedFrom = normalizePhoneNumberForStorage(From);
    const normalizedTo = normalizePhoneNumberForStorage(To);
    
    console.log('[Twilio Voice] Normalized From:', normalizedFrom);
    console.log('[Twilio Voice] Normalized To:', normalizedTo);
    
    // Build candidate lookup numbers from Twilio destination fields
    const candidateNumbers = new Set<string>();
    if (To) candidateNumbers.add(normalizePhoneNumberForStorage(To));
    if (Called) candidateNumbers.add(normalizePhoneNumberForStorage(Called));
    if (ForwardedFrom) candidateNumbers.add(normalizePhoneNumberForStorage(ForwardedFrom));
    
    const uniqueCandidates = Array.from(candidateNumbers);
    console.log('[Voice] Candidate business lookup numbers:', uniqueCandidates);
    
    // Lookup business by businesses.twilio_phone_number IN candidateNumbers
    console.log('[Voice] Business lookup query started');
    console.log('[VOICE WEBHOOK] Looking up business with candidate numbers:', uniqueCandidates);
    logCallTrace({
      route: 'voice',
      action: 'business_lookup_start',
      callSid: CallSid,
      from: From,
      to: To,
      forwardedFrom: ForwardedFrom,
      reason: 'Looking up business by Twilio number'
    })
    
    let business = null;
    let lookupSource = null;
    
    for (const candidate of uniqueCandidates) {
      console.log('[VOICE WEBHOOK] Trying candidate number:', candidate);
      const result = await db.getBusinessByTwilioNumber(candidate);
      console.log('[VOICE WEBHOOK] Lookup result for candidate:', candidate, '=>', result ? 'found' : 'not found');
      if (result && result.business) {
        business = result.business;
        lookupSource = result.source;
        console.log('[Voice] Business found:', business.id, business.name, 'via', lookupSource, 'using', candidate);
        console.log('[MAIN BUSINESS LOADED]', {
          businessId: business.id,
          businessName: business.name,
          twilioPhone: business.twilio_phone_number,
          businessPhone: business.business_phone_number,
          forwardingVerified: business.forwarding_verified,
          onboardingStatus: business.onboarding_status,
          provisioningStatus: business.provisioning_status
        });
        
        logCallTrace({
          route: 'voice',
          action: 'business_lookup_success',
          callSid: CallSid,
          from: From,
          to: To,
          forwardedFrom: ForwardedFrom,
          businessId: business.id,
          businessName: business.name,
          existingOrCreated: 'existing',
          reason: `Found business via ${lookupSource} using ${candidate}`
        })
        
        break;
      }
    }
    
    if (!business) {
      console.warn('[Voice] No business found for candidates:', uniqueCandidates);

      logCallTrace({
        route: 'voice',
        action: 'business_lookup_failed',
        callSid: CallSid,
        from: From,
        to: To,
        forwardedFrom: ForwardedFrom,
        reason: `No business found for candidates: ${uniqueCandidates.join(', ')}`
      })

      console.log('[FINAL TWIML PATH] NO_BUSINESS - business lookup failed', {
        callSid: CallSid,
        candidates: uniqueCandidates
      });

      const twiml = generateTwiMLResponse();

      console.log('[Voice] Returning fallback TwiML for no business found');
      console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=no-business-found');
      console.log('[AI POC FINAL TWIML]', twiml);
      console.log('[VOICE PATH] EMERGENCY');
      console.log('[VOICE ROUTE RETURN]', {
        path: 'NO_BUSINESS',
        reason: 'Business lookup failed for all candidate numbers',
        callSid: CallSid || 'unknown',
        candidates: uniqueCandidates
      });
      return new NextResponse(twiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
          "X-ReplyFlow-Voice-Version": "v2" // Add version tracking header
        },
      });
    }
    
    // Check if business has been deleted (offboarding tracking)
    console.log('[OFFBOARDING CHECK] Checking if business has been deleted');
    const { data: offboardingRecord, error: offboardingError } = await supabaseAdmin
      .from('offboarding_tracking')
      .select('*')
      .eq('business_id', business.id)
      .eq('forwarding_confirmed', false)
      .single();
    
    if (offboardingRecord && !offboardingError) {
      console.log('[OFFBOARDING FALLBACK]');
      console.log(`toPhone=${To}`);
      console.log(`fromPhone=${From}`);
      console.log(`matchedDeletedBusiness=${business.id}`);
      console.log(`reason=Business deleted but call forwarding may still be enabled`);
      console.log(`action=fallback_voicemail`);
      
      const fallbackTwiml = `
<Response>
  <Say voice="alice">This business is no longer using ReplyFlow. They may still have call forwarding enabled. Please contact the business directly using their primary phone number.</Say>
  <Hangup/>
</Response>
`.trim();
      
      console.log('[OFFBOARDING CHECK] Returning fallback voicemail TwiML');
      console.log('[VOICE ROUTE RETURN]', {
        path: 'OFFBOARDING_FALLBACK',
        reason: 'Business has been deleted but call forwarding may still be enabled',
        callSid: CallSid || 'unknown',
        businessId: business.id,
      });
      
      return new NextResponse(fallbackTwiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
          "X-ReplyFlow-Voice-Version": "v2"
        },
      });
    }
    
    console.log('[OFFBOARDING CHECK] Business is active, continuing with normal call processing');
    
    // EARLIEST POSSIBLE POINT: Check if caller is in ignored contacts BEFORE ANY DB write
    console.log('[IGNORED CONTACT CHECK] =========================================');
    console.log('[IGNORED CONTACT CHECK] businessId:', business.id);
    console.log('[IGNORED CONTACT CHECK] rawFrom:', From);
    console.log('[IGNORED CONTACT CHECK] normalizedFrom:', normalizedFrom);
    console.log('[IGNORED CONTACT CHECK] timestamp:', new Date().toISOString());
    console.log('[IGNORED CONTACT CHECK] =========================================');

    let isIgnored = false;
    let ignoredCheckError = null;

    try {
      isIgnored = await isIgnoredContact(business.id, normalizedFrom);
      console.log('[IGNORED CONTACT CHECK] =========================================');
      console.log('[IGNORED CONTACT CHECK] ignoredContactResult:', isIgnored);
      console.log('[IGNORED CONTACT CHECK] error:', ignoredCheckError);
      console.log('[IGNORED CONTACT CHECK] timestamp:', new Date().toISOString());
      console.log('[IGNORED CONTACT CHECK] =========================================');
    } catch (error) {
      ignoredCheckError = error instanceof Error ? error.message : String(error);
      console.log('[IGNORED CONTACT CHECK] =========================================');
      console.log('[IGNORED CONTACT CHECK] ignoredContactResult:', isIgnored);
      console.log('[IGNORED CONTACT CHECK] error:', ignoredCheckError);
      console.log('[IGNORED CONTACT CHECK] timestamp:', new Date().toISOString());
      console.log('[IGNORED CONTACT CHECK] =========================================');
    }

    if (isIgnored) {
      console.log('[IGNORED CONTACT BLOCKED - WEBHOOK] =========================================');
      console.log('[IGNORED CONTACT BLOCKED - WEBHOOK] businessId:', business.id);
      console.log('[IGNORED CONTACT BLOCKED - WEBHOOK] normalizedFrom:', normalizedFrom);
      console.log('[IGNORED CONTACT BLOCKED - WEBHOOK] action: silent hangup / no AI / no persistence');
      console.log('[IGNORED CONTACT BLOCKED - WEBHOOK] timestamp:', new Date().toISOString());
      console.log('[IGNORED CONTACT BLOCKED - WEBHOOK] =========================================');

      console.log('[IGNORED CONTACT MESSAGE]', {
        businessId: business.id,
        phoneNumber: normalizedFrom,
        timestamp: new Date().toISOString()
      })
      console.log('[FINAL TWIML PATH] IGNORED_CONTACT - caller is in ignored list', {
        callSid: CallSid,
        businessId: business.id
      })

      // Return silent hangup
      // No voicemail recording, no persistence, no AI, no lead, no conversation, no SMS, no follow-ups
      const twiml = generateIgnoredContactResponse()
      console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=ignored-contact-hangup')
      console.log('[AI POC FINAL TWIML]', twiml)
      console.log('[VOICE PATH] IGNORED_CONTACT_HANGUP')
      console.log('[VOICE ROUTE RETURN]', {
        path: 'IGNORED_CONTACT_HANGUP',
        reason: 'Caller is in ignored contacts list - silent hangup',
        callSid: CallSid || 'unknown',
        phoneNumber: normalizedFrom
      });
      return new NextResponse(twiml, {
        status: 200,
        headers: {
          "Content-Type": "text/xml",
          "X-ReplyFlow-Voice-Version": "v2",
          "X-ReplyFlow-Ignored-Contact": "true"
        },
      })
    }
    
    // Only log timeline event if NOT ignored
    await timelineEvents.callReceived(business.id, '', '', From, To);

    // SMART FILTERING CHECK: Run spam/repeat filtering BEFORE lead/conversation creation
    console.log('[SPAM FILTER] ==========================================')
    console.log('[SPAM FILTER] enabled:', (business as any).smart_filtering_enabled)
    console.log('[SPAM FILTER] caller:', From)
    console.log('[SPAM FILTER] timestamp:', new Date().toISOString())
    console.log('[SPAM FILTER] ==========================================')

    let isSpamFiltered = false
    let spamFilterReason = ''

    if ((business as any).smart_filtering_enabled) {
      console.log('[SPAM FILTER] Running smart filtering before lead creation')
      const filteringResult = await shouldSendAutoText({
        businessId: business.id,
        callerPhone: From,
        callSid: CallSid || undefined,
        business: business
      })

      if (!filteringResult.allowed) {
        isSpamFiltered = true
        spamFilterReason = filteringResult.reason

        console.log('[SPAM FILTER] ==========================================')
        console.log('[SPAM FILTER] enabled=true')
        console.log('[SPAM FILTER] reason=', spamFilterReason)
        console.log('[SPAM FILTER] action=ignored_before_lead_creation')
        console.log('[SPAM FILTER] caller=', From)
        console.log('[SPAM FILTER] ==========================================')

        // Return silent hangup, similar to ignored contacts
        // Do NOT create lead, conversation, SMS, follow-ups, or notifications
        const twiml = generateIgnoredContactResponse()
        console.log('[FINAL TWIML PATH] SPAM_FILTERED - smart filtering blocked lead creation', {
          callSid: CallSid,
          businessId: business.id,
          reason: spamFilterReason
        })
        console.log('[VOICE ROUTE RETURN]', {
          path: 'SPAM_FILTERED',
          reason: 'Smart filtering blocked lead creation - silent hangup',
          callSid: CallSid || 'unknown',
          phoneNumber: normalizedFrom
        })
        return new NextResponse(twiml, {
          status: 200,
          headers: {
            "Content-Type": "text/xml",
            "X-ReplyFlow-Voice-Version": "v2",
            "X-ReplyFlow-Spam-Filtered": "true"
          },
        })
      } else {
        console.log('[SPAM FILTER] Caller allowed by smart filtering:', filteringResult.reason)
      }
    } else {
      console.log('[SPAM FILTER] Smart filtering disabled, allowing all calls')
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
        // Use the centralized markForwardingVerified function for consistency
        const verified = await markForwardingVerified(business.id, 'voice_webhook_forwarded_call_received');

        if (verified) {
          // Update onboarding status when forwarding is verified
          const { error: onboardingError } = await supabase
            .from('businesses')
            .update({
              phone_setup_completed_at: new Date().toISOString(),
              onboarding_status: 'completed'
            })
            .eq('id', business.id);

          if (onboardingError) {
            console.error('[Setup Progress] Error updating onboarding status:', onboardingError);
          } else {
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
          }
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

    // CALL TIMING DIAGNOSTICS: Track exact call arrival timing
    const callArrivalTimestamp = new Date();
    console.log('[CALL TIMING] CALL RECEIVED BY TWILIO', callArrivalTimestamp.toISOString());
    
    // Log exact Twilio webhook payload fields related to forwarding
    console.log('[TWILIO WEBHOOK PAYLOAD]', {
      ForwardedFrom: params.ForwardedFrom || 'not_present',
      Caller: params.Caller || From,
      Called: params.Called || 'not_present',
      To: params.To || 'not_present',
      CallStatus: params.CallStatus || 'not_present',
      Direction: params.Direction || 'not_present',
      ParentCallSid: params.ParentCallSid || 'not_present',
      AnsweredBy: params.AnsweredBy || 'not_present',
      CallSid: CallSid || 'not_present',
      ApiVersion: params.ApiVersion || 'not_present',
      AccountSid: params.AccountSid || 'not_present'
    });
    
    console.log('[CALL TIMING] FORWARDED FROM', params.ForwardedFrom || 'not_present');
    console.log('[CALL TIMING] CALL SID', CallSid || 'not_present');
    console.log('[CALL TIMING] TO', params.To || 'not_present');
    console.log('[CALL TIMING] CALLED', params.Called || 'not_present');

    // Determine call type based on Twilio parameters
    let isDirectCall = false;
    let isForwardedCall = false;
    let callType = 'unknown';

    if (ForwardedFrom) {
      // ForwardedFrom is present when call was forwarded from business phone to Twilio
      isForwardedCall = true;
      callType = 'forwarded_missed_call';
      console.log('[CALL CLASSIFICATION] FORWARDED_MISSED_CALL');
      console.log('[FORWARDING EVIDENCE]', {
        primaryEvidence: 'ForwardedFrom parameter present',
        ForwardedFrom: ForwardedFrom,
        expectedBusinessNumber: business.business_phone_number,
        matchesBusinessNumber: ForwardedFrom === business.business_phone_number,
        To: To,
        Called: Called,
        From: From,
        businessId: business.id,
        businessPhone: business.business_phone_number,
        twilioPhone: business.twilio_phone_number,
        forwardingType: ForwardedFrom === business.business_phone_number ? 'business_to_twilio' : 'unknown_forwarding',
        timestamp: callArrivalTimestamp.toISOString()
      });
    } else if (To === business.twilio_phone_number || Called === business.twilio_phone_number) {
      // No ForwardedFrom, but To/Called matches our Twilio number
      isDirectCall = true;
      callType = 'direct_to_twilio';
      console.log('[CALL CLASSIFICATION] DIRECT_TWILIO_CALL');
      console.log('[DIRECT CALL EVIDENCE]', {
        primaryEvidence: 'To/Called matches Twilio number without ForwardedFrom',
        To: To,
        Called: Called,
        From: From,
        businessId: business.id,
        businessPhone: business.business_phone_number,
        twilioPhone: business.twilio_phone_number,
        callPattern: To === business.twilio_phone_number ? 'To_matches_twilio' : 'Called_matches_twilio',
        missingForwardedFrom: 'ForwardedFrom parameter not present',
        timestamp: callArrivalTimestamp.toISOString()
      });
    } else {
      console.log('[CALL CLASSIFICATION] UNKNOWN');
      console.log('[UNKNOWN CALL EVIDENCE]', {
        primaryEvidence: 'Neither ForwardedFrom present nor To/Called matches Twilio number',
        To: To,
        Called: Called,
        ForwardedFrom: ForwardedFrom,
        From: From,
        businessId: business.id,
        businessPhone: business.business_phone_number,
        twilioPhone: business.twilio_phone_number,
        toMatchesTwilio: To === business.twilio_phone_number,
        calledMatchesTwilio: Called === business.twilio_phone_number,
        forwardedFromPresent: !!ForwardedFrom,
        timestamp: callArrivalTimestamp.toISOString()
      });
    }

    console.log('[VOICE ROUTING SUMMARY]', {
      callType,
      isDirectCall,
      isForwardedCall,
      businessId: business.id,
      businessName: business.name,
      businessPhone: business.business_phone_number,
      twilioPhone: business.twilio_phone_number,
      timestamp: callArrivalTimestamp.toISOString()
    });

    // CRITICAL FIX: Create call_events record EARLY, before any branching
    // This ensures canonical intake record exists for AI path, voicemail fallback, and status callbacks
    // Phantom lead protection requires call_events to exist before creating leads
    const normalizedCallerPhone = normalizePhoneNumberForStorage(From);
    console.log('[CALL EVENTS EARLY CREATION]', {
      businessId: business.id,
      callerPhone: normalizedCallerPhone,
      callSid: CallSid,
      callType,
      timestamp: new Date().toISOString()
    });

    let callEventCreated = false;
    try {
      const callEvent = await db.createCallEvent({
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        call_status: 'ringing', // Will be updated by status callbacks
        twilio_call_sid: CallSid,
        raw_payload: Object.fromEntries(Object.entries(params)),
        created_at: new Date().toISOString(),
      });

      if (callEvent) {
        console.log('[CALL EVENTS EARLY CREATION SUCCESS]', {
          callEventId: callEvent.id,
          callSid: CallSid,
          businessId: business.id
        });
        callEventCreated = true;
      } else {
        console.log('[CALL EVENTS EARLY CREATION SKIPPED]', {
          callSid: CallSid,
          reason: 'Duplicate call SID detected'
        });
        // Not an error - duplicate is expected for retries
      }
    } catch (callEventError: any) {
      // Handle duplicate key error gracefully
      if (callEventError.message?.includes('duplicate key') || callEventError.code === '23505') {
        console.log('[CALL EVENTS EARLY CREATION DUPLICATE]', {
          callSid: CallSid,
          reason: 'DB index prevented duplicate'
        });
        callEventCreated = true; // Treat as success - record exists
      } else {
        console.error('[CALL EVENTS EARLY CREATION ERROR]', callEventError);
        // Continue anyway - don't block call intake on call event failure
      }
    }

    console.log('[CALL EVENTS EARLY CREATION COMPLETE]', {
      callSid: CallSid,
      callEventCreated,
      businessId: business.id
    });

    // CRITICAL: Log that we are about to check AI routing
    console.log('[AI ROUTING ENTRYPOINT] About to check AI routing guards', {
      callSid: CallSid,
      businessId: business.id,
      timestamp: new Date().toISOString()
    });

    // AI CALL ASSISTANT: Check if AI should handle this call
    // Phase 0: /api/twilio/ai-assistant/start (fallback to voicemail)
    // Phase 1A POC: Direct TwiML return (routes to Fly.io)
    // This is a minimal, safe check that does NOT affect production customers
    console.log('[AI CALL ASSISTANT] Checking if AI should handle this call');
    console.log('[AI ROUTING GUARD CHECK] Starting guard checks', {
      businessId: business.id,
      onboarding_status: business.onboarding_status,
      provisioning_status: business.provisioning_status,
      forwarding_verified: business.forwarding_verified,
      env_AI_CALL_ASSISTANT_ENABLED: process.env.AI_CALL_ASSISTANT_ENABLED,
      env_NEXT_PUBLIC_AI_CALL_ASSISTANT_ENABLED: process.env.NEXT_PUBLIC_AI_CALL_ASSISTANT_ENABLED,
      env_AI_ASSISTANT_USE_POC: process.env.AI_ASSISTANT_USE_POC,
      env_AI_VOICE_FLY_WS_URL: process.env.AI_VOICE_FLY_WS_URL ? 'configured' : 'missing',
      env_OPENAI_API_KEY: process.env.OPENAI_API_KEY ? 'configured' : 'missing'
    });

    const guardResult = checkAllGuards(business.id, business);
    const usePOC = process.env.AI_ASSISTANT_USE_POC === 'true';

    let aiRoutingSucceeded = false;

    console.log('[MAIN VOICE MODE DECISION]', {
      aiVoiceEnabled: guardResult.passed,
      useAiVoice: usePOC,
      businessId: business.id,
      twilioNumber: business.twilio_phone_number,
      forwardingVerified: business.forwarding_verified,
      onboardingStatus: business.onboarding_status,
      provisioningStatus: business.provisioning_status,
      callType,
      isDirectCall,
      isForwardedCall,
      guardReason: guardResult.reason
    });

    if (!guardResult.passed) {
      console.log('[AI ROUTING FAILED] Guards did not pass - using voicemail fallback', {
        guardReason: guardResult.reason,
        businessId: business.id,
        callSid: CallSid,
        willProceedToVoicemail: true
      });
    } else {
      console.log('[AI ROUTING PASSED] All guards passed - will attempt AI routing', {
        guardReason: guardResult.reason,
        businessId: business.id,
        callSid: CallSid,
        usePOC,
        isDirectCall,
        isForwardedCall
      });
    }
    
    if (guardResult.passed) {
      // Config safety validation: If AI is enabled, production requires POC routing
      if (!usePOC) {
        console.error('[AI VOICE CONFIG ERROR] AI Voice enabled but production POC routing is disabled. Falling back to voicemail.', {
          businessId: business.id,
          callSid: CallSid,
          reason: 'AI_CALL_ASSISTANT_ENABLED=true but AI_ASSISTANT_USE_POC is not set to true',
          fix: 'Set AI_ASSISTANT_USE_POC=true in environment variables to enable production AI Voice routing'
        });
        console.log('[VOICE PATH] VOICEMAIL (CONFIG SAFETY)');
        // Fall through to voicemail flow
      } else {
        console.log('[AI CALL ASSISTANT] All guards passed', {
          businessId: business.id,
        callSid: CallSid,
        reason: guardResult.reason,
        callType,
        isDirectCall,
        isForwardedCall
      })
      
      
      // CORRECTED CALL ROUTING BEHAVIOR:
      // Forwarded calls have already gone through the carrier/business ring window, so it is correct for AI to answer immediately once Twilio receives them.
      if (isDirectCall) {
        console.log('[DIRECT TWILIO CALL] AI test/demo path', {
          callType,
          businessId: business.id,
          callSid: CallSid,
          From,
          To
        });
      } else if (isForwardedCall) {
        console.log('[FORWARDED MISSED CALL] AI production path', {
          callType,
          businessId: business.id,
          callSid: CallSid,
          ForwardedFrom,
          From,
          To
        });
        console.log('[FORWARDED MISSED CALL] Business already had ring chance - AI should answer now');
      } else {
        console.log('[UNKNOWN CALL TYPE] voicemail fallback', {
          callType,
          businessId: business.id,
          callSid: CallSid,
          From,
          To
        });
        console.log('[UNKNOWN CALL TYPE] Unable to classify - using safest fallback');
        // Fall through to voicemail flow for unknown call types
      }

      if (usePOC && (isDirectCall || isForwardedCall)) {
        // Phase 1A POC: Generate TwiML directly to avoid redirect issues
        // Handle both direct calls (test/demo) and forwarded missed calls (production)
        const callPath = isDirectCall ? 'direct_test' : 'forwarded_production'
        const aiActivationTimestamp = new Date();
        const timeFromWebhookToAI = aiActivationTimestamp.getTime() - callArrivalTimestamp.getTime();

        console.log(`[AI ACTIVATION START] AI being activated for ${callPath}`, {
          callPath,
          timeFromWebhookToAI: `${timeFromWebhookToAI}ms`,
          aiActivationTimestamp: aiActivationTimestamp.toISOString(),
          callArrivalTimestamp: callArrivalTimestamp.toISOString(),
          businessId: business.id,
          callSid: CallSid,
          enteringAIPath: true
        });
        
        console.log('[CALL TIMING] AI GREETING STARTED', aiActivationTimestamp.toISOString());
        
        console.log(`[AI CALL ASSISTANT] Using Phase 1A POC - generating TwiML for ${callPath}`)
        
        try {
          // Create AI session first (lead/conversation will be attached next)
          const normalizedCallerPhone = normalizePhoneNumberForStorage(From)

          logCallTrace({
            route: 'voice',
            action: 'ai_session_create_start',
            callSid: CallSid,
            from: From,
            to: To,
            forwardedFrom: ForwardedFrom,
            businessId: business.id,
            businessName: business.name,
            reason: 'Creating AI session and baseline lead/conversation before AI asks questions'
          })

          const session = await createAISession({
            business_id: business.id,
            lead_id: null,
            call_sid: CallSid,
          })

          if (!session) {
            console.log('[AI FAILED - VOICEMAIL FALLBACK] Failed to create session, falling back to voicemail')

            logCallTrace({
              route: 'voice',
              action: 'ai_session_create_failed',
              callSid: CallSid,
              from: From,
              to: To,
              forwardedFrom: ForwardedFrom,
              businessId: business.id,
              businessName: business.name,
              reason: 'Failed to create AI session'
            })

            // Fall through to voicemail flow
          } else {
            console.log('[AI POC] session created:', session.id)
            console.log('[AI POC] callSid:', CallSid)
            console.log(`[AI POC] ${callPath.toUpperCase()} - AI answering immediately`)

            // BASELINE MISSED-CALL RECORDS: Create lead/conversation immediately so that even
            // an immediate hangup after "Hi" has durable records and SMS eligibility.
            console.log('[AI BASELINE INTAKE RECORDS] Ensuring lead and conversation exist before AI intake', {
              callSid: CallSid,
              businessId: business.id,
              callerPhone: normalizedCallerPhone,
              callPath
            });

            const baselineRecords = await db.getOrCreateCallIntakeRecords({
              callSid: CallSid,
              businessId: business.id,
              callerPhone: normalizedCallerPhone,
              to: To,
              forwardedFrom: ForwardedFrom,
              requireValidCall: false // We already created the call_event above
            });

            let baselineLeadId: string | null = null;
            let baselineConversationId: string | null = null;

            if (baselineRecords.leadId && baselineRecords.conversationId) {
              baselineLeadId = baselineRecords.leadId;
              baselineConversationId = baselineRecords.conversationId;

              console.log('[AI BASELINE INTAKE RECORDS] Reused or created baseline records', {
                callSid: CallSid,
                leadId: baselineLeadId,
                conversationId: baselineConversationId,
                isNew: baselineRecords.isNew
              });

              // Attach the lead/conversation to the AI session so status callbacks and
              // the AI service can find them without recreating.
              await updateAISession(session.id, {
                lead_id: baselineLeadId,
                raw_metadata: {
                  ...(session.raw_metadata || {}),
                  conversation_id: baselineConversationId,
                  call_path: callPath,
                  baseline_records_created: true,
                  baseline_records_is_new: baselineRecords.isNew
                }
              });

              console.log('[AI SESSION BASELINE ATTACHED] Updated AI session with baseline records', {
                sessionId: session.id,
                leadId: baselineLeadId,
                conversationId: baselineConversationId
              });

              // Create ai_call_records row immediately with pending status
              // This ensures voice-status can find the record even if caller hangs up immediately
              if (baselineLeadId && baselineConversationId) {
                console.log('[AI BASELINE AI CALL RECORD] Creating ai_call_records with in_progress status', {
                  callSid: CallSid,
                  businessId: business.id,
                  leadId: baselineLeadId,
                  conversationId: baselineConversationId
                });

                const aiCallRecord = await db.createOrUpdateAICallRecord({
                  call_sid: CallSid,
                  business_id: business.id,
                  lead_id: baselineLeadId,
                  conversation_id: baselineConversationId,
                  caller_phone: normalizedCallerPhone,
                  ai_session_id: session.id,
                  outcome: 'incomplete',
                  extracted_info: null,
                  summary: null,
                  transcript: []
                });

                if (aiCallRecord) {
                  console.log('[AI BASELINE AI CALL RECORD SUCCESS] Created ai_call_records:', aiCallRecord.id);
                } else {
                  console.error('[AI BASELINE AI CALL RECORD FAILED] Could not create ai_call_records', {
                    callSid: CallSid,
                    businessId: business.id,
                    leadId: baselineLeadId
                  });
                }
              }
            } else {
              console.error('[AI BASELINE INTAKE RECORDS FAILED] Could not ensure baseline records', {
                callSid: CallSid,
                businessId: business.id,
                leadId: baselineRecords.leadId,
                conversationId: baselineRecords.conversationId
              });
            }

            logCallTrace({
              route: 'voice',
              action: 'ai_session_create_success',
              callSid: CallSid,
              from: From,
              to: To,
              forwardedFrom: ForwardedFrom,
              businessId: business.id,
              businessName: business.name,
              aiCallRecordId: session.id,
              leadId: baselineLeadId || undefined,
              conversationId: baselineConversationId || undefined,
              existingOrCreated: baselineRecords.isNew ? 'created' : 'existing',
              reason: baselineRecords.leadId
                ? 'Created AI session and attached baseline lead/conversation'
                : 'Created AI session but baseline lead/conversation unavailable'
            })

            // Get Fly.io WebSocket URL from environment
            const flyWsUrl = process.env.AI_VOICE_FLY_WS_URL || 'wss://replyflow-ai-voice.fly.dev/stream';

            console.log('[MAIN TWIML STREAM URL]', flyWsUrl);

            // Add comprehensive outbound parameter logging
            console.log('[STREAM PARAMS OUTBOUND]', {
              sessionId: session.id,
              callSid: CallSid,
              businessId: business.id,
              callType: callPath,
              callerPhone: From,
              from: From,
              to: To,
              called: Called,
              forwardedFrom: ForwardedFrom,
              leadId: baselineLeadId,
              conversationId: baselineConversationId
            });

            // Return TwiML with Media Stream to Fly.io
            // Parameters are passed as <Parameter> elements, not query params
            // leadId and conversationId are now passed so the AI service can update the same records.
            const statusCallbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000'}/api/twilio/voice-status`;
            const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${flyWsUrl}" statusCallback="${statusCallbackUrl}">
      <Parameter name="sessionId" value="${session.id}" />
      <Parameter name="callSid" value="${CallSid}" />
      <Parameter name="businessId" value="${business.id}" />
      <Parameter name="callType" value="${callPath}" />
      <Parameter name="callerPhone" value="${From}" />
      <Parameter name="from" value="${From}" />
      <Parameter name="to" value="${To}" />
      <Parameter name="called" value="${Called}" />
      <Parameter name="forwardedFrom" value="${ForwardedFrom}" />
      <Parameter name="businessTwilioPhoneNumber" value="${business.twilio_phone_number}" />
      <Parameter name="leadId" value="${baselineLeadId || ''}" />
      <Parameter name="conversationId" value="${baselineConversationId || ''}" />
    </Stream>
  </Connect>
</Response>`

              console.log('[AI POC] final TwiML:', twiml);
              console.log('[MAIN TWIML GENERATED]', twiml);
              console.log(`[AI POC DEPLOYMENT MARKER] version=3105ffc path=ai-poc-${callPath}`);
              console.log('[AI POC FINAL TWIML]', twiml);
              console.log('[VOICE PATH] AI');

              // Final timing report
              const secondsBetweenArrivalAndAIStart = timeFromWebhookToAI / 1000;
              console.log('[CALL TIMING REPORT]', {
                seconds_between_call_arrival_and_ai_start: secondsBetweenArrivalAndAIStart,
                milliseconds_between_call_arrival_and_ai_start: timeFromWebhookToAI,
                callArrivalTimestamp: callArrivalTimestamp.toISOString(),
                aiActivationTimestamp: aiActivationTimestamp.toISOString(),
                callType: callType,
                callPath: callPath,
                businessId: business.id,
                callSid: CallSid,
                expectedBehavior: callType === 'forwarded_missed_call' ? 'Business should have rung for 30+ seconds before forwarding' : 'Direct call - AI should answer immediately'
              });

              aiRoutingSucceeded = true;
              return new NextResponse(twiml, {
                status: 200,
                headers: {
                  'Content-Type': 'text/xml',
                  'X-AI-POC': `phase-1a-${callPath}`,
                  'X-Call-Type': callPath
                },
              })
            }
          } catch (error) {
            console.error('[AI FAILED - VOICEMAIL FALLBACK] Error generating POC TwiML:', error);
            console.log('[AI FAILED - VOICEMAIL FALLBACK] Falling back to voicemail due to AI setup failure');
            console.log('[VOICE PATH] VOICEMAIL');
            // Fall through to voicemail flow
          }
        } else if (usePOC && !isDirectCall && !isForwardedCall) {
          console.log('[AI CALL ASSISTANT] POC enabled but unknown call type - using voicemail fallback')
        } else {
          // Phase 0: Redirect to start route
          console.log('[AI CALL ASSISTANT] Using Phase 0 - redirecting to AI assistant');
          console.log('[VOICE PATH] AI (Phase 0 redirect)');
          const aiStartUrl = new URL('/api/twilio/ai-assistant/start', request.url);
          aiRoutingSucceeded = true;
          return NextResponse.redirect(aiStartUrl);
        }
      }
    } else {
      console.log('[AI CALL ASSISTANT] Guards failed - continuing with existing voicemail flow', {
        businessId: business.id,
        reason: guardResult.reason,
        aiVoiceEnabled: guardResult.passed,
        useAiVoice: usePOC,
        callType,
        isDirectCall,
        isForwardedCall
      });
      console.log('[VOICE PATH] VOICEMAIL (GUARDS FAILED)');
      console.log('[FINAL TWIML PATH] VOICEMAIL_FALLBACK - AI guards failed', {
        guardReason: guardResult.reason,
        callSid: CallSid,
        businessId: business.id
      });
    }
    // END AI CALL ASSISTANT CHECK

    // Skip legacy voice path if AI routing succeeded
    if (aiRoutingSucceeded) {
      console.log('[AI ROUTING SUCCEEDED] Skipping legacy voice path - canonical records already created')
      console.log('[FINAL TWIML PATH] AI_STREAM - AI routing succeeded', {
        callSid: CallSid,
        businessId: business.id
      });
      console.log('[VOICE ROUTE RETURN]', {
        path: 'AI_STREAM',
        reason: 'AI routing succeeded - returning Hangup TwiML',
        callSid: CallSid,
        businessId: business.id
      });
      return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>', {
        status: 200,
        headers: {
          'Content-Type': 'text/xml',
          'X-AI-Routing': 'succeeded'
        },
      })
    }

    // MISSED CALL TIMING: Log voice webhook received
    console.log('[MISSED CALL TIMING] voice webhook received', {
      businessId: business.id,
      callSid: CallSid,
      callerPhone: From,
      timestamp: new Date().toISOString()
    });
    console.log('[FINAL TWIML PATH] LEGACY_VOICEMAIL - falling through to legacy voicemail path', {
      callSid: CallSid,
      businessId: business.id
    });

    // Check if this is a setup completion call (caller matches business phone number)
    const businessPhoneNumber = business.business_phone_number ? normalizePhoneNumberForStorage(business.business_phone_number) : null;
    
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

    // Check if lead already exists
    console.log('[Voice] Checking for existing lead for phone:', normalizedCallerPhone);
    const existingLead = await db.getLeadByPhone(business.id, normalizedCallerPhone);
    
    // Determine if we should reuse existing lead
    let shouldReuseLead = false;
    let reuseReason = '';
    
    if (existingLead) {
      // Only reuse lead if:
      // - business_id matches (already guaranteed by getLeadByPhone)
      // - normalized caller phone matches (already guaranteed by getLeadByPhone)
      // - lead is not completed/ignored
      // - lead is not too old (optional time-window check)
      const isCompletedOrIgnored = existingLead.status === 'completed' || existingLead.status === 'ignored' || existingLead.opted_out === true;
      
      if (isCompletedOrIgnored) {
        shouldReuseLead = false;
        reuseReason = `Existing lead ${existingLead.id} is completed/ignored/opted_out, will create new lead`;
        console.log('[Voice] Existing lead is completed/ignored, will create new lead:', {
          leadId: existingLead.id,
          status: existingLead.status,
          optedOut: existingLead.opted_out
        });
      } else {
        shouldReuseLead = true;
        reuseReason = `Existing lead ${existingLead.id} is active, will reuse`;
        console.log('[Voice] Existing lead is active, will reuse:', {
          leadId: existingLead.id,
          status: existingLead.status
        });
      }
    }
    
    // Log detailed call lead link debug
    console.log('[CALL LEAD LINK DEBUG]', {
      callSid: CallSid,
      from: From,
      to: To,
      normalizedFrom: normalizedCallerPhone,
      normalizedTo: normalizedTo,
      forwardedFrom: ForwardedFrom || null,
      businessId: business.id,
      existingLeadId: existingLead?.id || null,
      shouldReuseLead,
      newLeadCreated: false,
      finalLeadId: shouldReuseLead ? existingLead?.id : null,
      finalConversationId: null,
      aiCallRecordId: null,
      outboundMessageId: null,
      reason: reuseReason || (existingLead ? `Existing lead found by phone: ${existingLead.id}, status: ${existingLead.status}` : 'No existing lead found by phone, will create new lead')
    });
    
    // Log test call lead trace for debugging
    console.log('[TEST CALL LEAD TRACE]', {
      callSid: CallSid,
      from: From,
      to: To,
      forwardedFrom: ForwardedFrom,
      matchedBusinessId: business.id,
      matchedTwilioNumberId: business.twilio_phone_number_sid,
      leadId: existingLead?.id || null,
      conversationId: null,
      messageId: null,
      aiCallRecordId: null,
      leadStatus: existingLead?.status || 'new',
      classification: existingLead ? 'existing_lead_reused' : 'new_lead_will_be_created',
      reason: existingLead ? 'Lead found by phone number' : 'No lead found, will create new',
      businessLookup: {
        lookupSource,
        twilioPhone: business.twilio_phone_number,
        businessPhone: business.business_phone_number
      }
    });
    
    let lead;
    let shouldSendSms = false;
    let isRepeatCaller = false;
    
    if (!shouldReuseLead || !existingLead) {
      console.log('[LEAD WRITE ATTEMPT]', {
        businessId: business.id,
        callerPhone: normalizedCallerPhone,
        timestamp: new Date().toISOString()
      })
      console.log('[Voice] No existing lead found, creating new lead');
      console.log('[Voice] Creating lead:', {
        business_id: business.id,
        phone: normalizedCallerPhone,
        status: 'new'
      });
      
      logCallTrace({
        route: 'voice',
        action: 'lead_create_start',
        callSid: CallSid,
        from: From,
        to: To,
        forwardedFrom: ForwardedFrom,
        businessId: business.id,
        businessName: business.name,
        reason: 'No existing lead found, creating new lead for voicemail flow'
      })
      
      // Create new lead
      lead = await db.createLead({
        business_id: business.id,
        caller_phone: normalizedCallerPhone,
        status: 'new',
        raw_metadata: { source: 'voice', callSid: CallSid },
      }, CallSid);
      
      if (lead) {
        console.log('[Voice] Lead created:', lead.id);
        
        logCallTrace({
          route: 'voice',
          action: 'lead_create_success',
          callSid: CallSid,
          from: From,
          to: To,
          forwardedFrom: ForwardedFrom,
          businessId: business.id,
          businessName: business.name,
          leadId: lead.id,
          existingOrCreated: 'created',
          reason: 'Created new lead for voicemail flow'
        })
        
        await timelineEvents.leadCreated(business.id, lead.id, '', normalizedCallerPhone);
        
        // Mark forwarding as verified when real lead is created from missed call
        await markForwardingVerified(business.id, 'real_missed_call_lead_created');
        
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
            'Unknown', // lead name (can be updated later from conversation)
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
        
        // Create follow-up jobs for new lead
        try {
          console.log('[FOLLOWUP JOB CREATE ATTEMPT]', { 
            businessId: business.id, 
            leadId: lead.id 
          });
          
          logCallTrace({
            route: 'voice',
            action: 'followup_job_create_start',
            callSid: CallSid,
            from: From,
            to: To,
            forwardedFrom: ForwardedFrom,
            businessId: business.id,
            businessName: business.name,
            leadId: lead.id,
            reason: 'Creating follow-up jobs for new lead'
          })
          
          const followUpJobs = await createFollowUpJobs({
            businessId: business.id,
            leadId: lead.id,
            conversationId: undefined, // Conversation created later
            businessName: business.name
          });
          
          console.log('[FOLLOWUP JOB CREATE SUCCESS]', { 
            businessId: business.id, 
            leadId: lead.id,
            jobCount: followUpJobs.length 
          });
          
          logCallTrace({
            route: 'voice',
            action: 'followup_job_create_success',
            callSid: CallSid,
            from: From,
            to: To,
            forwardedFrom: ForwardedFrom,
            businessId: business.id,
            businessName: business.name,
            leadId: lead.id,
            existingOrCreated: 'created',
            reason: `Created ${followUpJobs.length} follow-up jobs`
          })
        } catch (followUpError) {
          console.error('[FOLLOWUP JOB CREATE ERROR]', { 
            businessId: business.id, 
            leadId: lead.id,
            error: followUpError 
          });
          
          logCallTrace({
            route: 'voice',
            action: 'followup_job_create_failed',
            callSid: CallSid,
            from: From,
            to: To,
            forwardedFrom: ForwardedFrom,
            businessId: business.id,
            businessName: business.name,
            leadId: lead.id,
            reason: `Follow-up job creation failed: ${followUpError}`
          })
          
          // Don't let follow-up job creation fail the webhook
        }

        // Check for AI call record to avoid duplicate SMS
        // If AI call exists, voice-status route will send AI summary SMS
        const { data: aiCallRecordCheck } = await supabaseAdmin
          .from('ai_call_records')
          .select('id')
          .eq('call_sid', CallSid)
          .maybeSingle()

        if (aiCallRecordCheck) {
          console.log('[AI SMS SUPPRESSION] AI call record found, suppressing standard missed-call SMS', {
            callSid: CallSid,
            aiCallRecordId: aiCallRecordCheck.id,
            leadId: lead.id,
            reason: 'AI call record found, voice-status will send AI summary SMS'
          })
          shouldSendSms = false
        } else {
          console.log('[SMS PATH MISSED CALL]', {
            callSid: CallSid,
            leadId: lead.id,
            reason: 'No AI call record, will send missed-call SMS'
          })
          shouldSendSms = true; // Send SMS for new leads
        }
      } else {
        console.error('[Voice] Persistence failed: Lead creation returned null');
        console.error('[Voice] Returning safe TwiML response without SMS');

        const twiml = generateTwiMLResponse(business.voicemail_greeting_url);
        console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=persistence-failed');
        console.log('[AI POC FINAL TWIML]', twiml);
        console.log('[VOICE PATH] EMERGENCY');
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
      
      // Log call lead link debug when reusing existing lead
      console.log('[CALL LEAD LINK DEBUG]', {
        callSid: CallSid,
        from: From,
        to: To,
        normalizedFrom: normalizedCallerPhone,
        normalizedTo: normalizedTo,
        forwardedFrom: ForwardedFrom || null,
        businessId: business.id,
        existingLeadId: existingLead.id,
        shouldReuseLead: true,
        newLeadCreated: false,
        finalLeadId: existingLead.id,
        finalConversationId: null,
        aiCallRecordId: null,
        outboundMessageId: null,
        reason: `Reusing existing lead: ${existingLead.id}, status: ${existingLead.status}`
      });
      
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

      // Note: Smart filtering already checked earlier in the voice webhook (before lead creation)
      // No need to check again here - if we reach this point, the caller passed spam filtering

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
      console.log('[MISSED CALL TIMING] Setting sms_pending=true on call_events for voicemail callback', {
        businessId: business.id,
        callSid: CallSid,
        leadId: lead.id,
        callerPhone: From,
        timestamp: new Date().toISOString()
      });

      // CRITICAL: Set sms_pending flag on call_events so voicemail callback knows to send SMS
      try {
        await supabaseAdmin
          .from('call_events')
          .update({ sms_pending: true })
          .eq('twilio_call_sid', CallSid);

        console.log('[MISSED CALL TIMING] sms_pending flag set successfully on call_events', {
          callSid: CallSid,
          leadId: lead.id
        });
      } catch (smsPendingError) {
        console.error('[MISSED CALL TIMING] Failed to set sms_pending flag:', smsPendingError);
        // Continue anyway - don't block call intake
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
    console.log('[VOICE] Returning voicemail TwiML for call:', CallSid);
    console.log('[VOICE PATH] MISSED_CALL');

    // DEBUG LOGS
    console.log('[Twilio Voice] DEBUG: About to generate final TwiML with business name:', business.name);

    const twiml = generateTwiMLResponse(business.voicemail_greeting_url);

    console.log('[Twilio Voice] ===== TWIML RESPONSE LOGGING =====');
    console.log('[Twilio Voice] Business ID:', business.id);
    console.log('[Twilio Voice] Business Name:', business.name);
    console.log('[Twilio Voice] Call SID:', CallSid);
    console.log('[Twilio Voice] Caller:', From);
    console.log('[Twilio Voice] Generated TwiML:');
    console.log('[Twilio Voice]', twiml);
    console.log('[Twilio Voice] ===== TWIML RESPONSE LOGGING END =====');
    
    // Verify transcription callback is in TwiML
    const hasTranscribe = twiml.includes('transcribe="true"');
    const hasTranscribeCallback = twiml.includes('transcribeCallback=');
    console.log('[Twilio Voice] Transcription verification:', {
      hasTranscribe,
      hasTranscribeCallback,
      transcriptionEnabled: hasTranscribe && hasTranscribeCallback
    });
    
    console.log('[Twilio Voice] Generated final TwiML response');
    console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=main-fallback');
    console.log('[AI POC FINAL TWIML]', twiml);
    console.log('[VOICE ROUTE RETURN]', {
      path: 'LEGACY_VOICEMAIL',
      reason: 'AI routing not succeeded - falling through to legacy voicemail path',
      callSid: CallSid,
      businessId: business.id
    });
    return new NextResponse(twiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
        "X-ReplyFlow-Voice-Version": "v2" // Add version tracking header
      },
    });
  } catch (error) {
    console.error('[VOICE ROUTE ERROR]', error);

    const twiml = generateTwiMLResponse();

    console.log('[Twilio Voice] Returning fallback TwiML due to error');
    console.log('[AI POC DEPLOYMENT MARKER] version=3105ffc path=error-catch-all');
    console.log('[AI POC FINAL TWIML]', twiml);
    console.log('[VOICE PATH] EMERGENCY');
    console.log('[VOICE ROUTE RETURN]', {
      path: 'ERROR',
      reason: 'Exception caught in voice webhook',
      callSid: 'unknown',
      error: error instanceof Error ? error.message : String(error)
    });
    return new NextResponse(twiml, {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
        "X-ReplyFlow-Voice-Version": "v2" // Add version tracking header
      },
    });
  }
}

export async function POST(request: NextRequest) {
  return handleVoiceWebhook(request, false); // POST requires signature validation
}

// GET handler - requires signature validation for security
export async function GET(request: NextRequest) {
  return handleVoiceWebhook(request, false); // GET also requires signature validation
}
