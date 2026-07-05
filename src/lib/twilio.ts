import Twilio from "twilio";
import { createClient } from '@supabase/supabase-js';
import { validateTwilioForSms, logTwilioEnvStatus } from './twilio/env';
import { isNumberReadyForUse } from './twilio-provisioning-service';
import { markForwardingVerified } from './forwarding-verification';
import { appendBusinessAvailabilityNote } from './business-availability-sms';

// Log Twilio environment status on module import
logTwilioEnvStatus();

// Initialize Supabase client for DB operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
// NOTE: Removed global TWILIO_PHONE_NUMBER fallback - must always use business.twilio_phone_number for tenant isolation

// Only initialize Twilio client if credentials are available and valid
export const twilioClient = accountSid && authToken && accountSid.startsWith('AC')
  ? Twilio(accountSid, authToken)
  : null

export async function sendSms(
  business: any,
  to: string,
  message: string,
  options?: {
    lead_id?: string;
    conversation_id?: string;
    isManual?: boolean; // Flag to distinguish manual user messages from automated
    source?: string; // Explicit source to identify message type (e.g., 'follow_up_job')
    isOffboarding?: boolean; // Flag to bypass number readiness check for offboarding/system SMS
  }
): Promise<{ sid: string | null; messageId: string | null }> {
  console.log('[SMS TRACE sendSms ENTRY]', {
    business_id: business?.id,
    business_name: business?.name,
    to,
    message_length: message?.length,
    lead_id: options?.lead_id,
    conversation_id: options?.conversation_id,
    isManual: options?.isManual,
    source: options?.source,
    isOffboarding: options?.isOffboarding,
    business_twilio_phone_number: business?.twilio_phone_number,
    business_twilio_phone_number_sid: business?.twilio_phone_number_sid,
    business_messaging_service_sid: business?.twilio_messaging_service_sid,
    business_provisioning_status: business?.provisioning_status
  });

  message = options?.isOffboarding ? message : appendBusinessAvailabilityNote(message, business);

  // Idempotency check for automated messages (prevent duplicates within 5 minutes)
  // Only block if a previous message was actually sent to Twilio or is truly pending
  // Failed/unsent messages should NOT block a retry
  // Manual user messages are exempt from this check to allow normal conversation flow
  // FOLLOW-UP EXCEPTION: Messages with explicit source='follow_up_job' are allowed even if within 5 minutes
  const isFollowUpMessage = options?.source === 'follow_up_job';
  const isAutomatedMessage = options?.lead_id && !options.isManual && !message.includes('ReplyFlow Admin') && !message.includes('Manual test') && !isFollowUpMessage;

  if (isAutomatedMessage) {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: existingMessage, error: duplicateError } = await supabase
      .from('messages')
      .select('id, created_at, body, twilio_message_sid, status, error_code')
      .eq('lead_id', options.lead_id)
      .eq('body', message)
      .gte('created_at', fiveMinutesAgo)
      .limit(1)
      .maybeSingle();

    if (existingMessage) {
      // Only block if the previous message was actually sent to Twilio or is pending
      // Failed/unsent messages (twilio_api_called=false, error_code set, or twilio_message_sid=null/NOT_CALLED) should NOT block
      const wasTwilioCalled = existingMessage.twilio_message_sid && existingMessage.twilio_message_sid !== 'NOT_CALLED';
      const hasError = existingMessage.error_code;
      const isFailedStatus = existingMessage.status === 'failed' || existingMessage.status === 'undelivered';

      if (wasTwilioCalled && !hasError && !isFailedStatus) {
        console.log('[SMS TRACE sendSms RETURN_NULL]', { reason: 'IDEMPOTENCY_DUPLICATE_SENT_OR_PENDING', lead_id: options.lead_id, message_sid: existingMessage.id, twilio_message_sid: existingMessage.twilio_message_sid });
        console.log('[SMS] Duplicate blocked (idempotency):', { lead_id: options.lead_id, message_sid: existingMessage.id, twilio_message_sid: existingMessage.twilio_message_sid });
        return { sid: null, messageId: null }; // Block duplicate
      } else {
        console.log('[SMS] Previous message failed/unsent, allowing retry:', { 
          lead_id: options.lead_id, 
          message_id: existingMessage.id, 
          twilio_message_sid: existingMessage.twilio_message_sid,
          error_code: existingMessage.error_code,
          status: existingMessage.status
        });
      }
    }

    if (duplicateError && duplicateError.code !== 'PGRST116') {
      console.error('[SMS] Error checking duplicates:', duplicateError);
      // Continue with send if check fails (don't block legitimate messages)
    }
  }

  // Check if lead has opted out - block automated messages to opted-out numbers
  if (options?.lead_id && !options.isManual) {
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('opted_out')
      .eq('id', options.lead_id)
      .single()

    if (!leadError && lead && lead.opted_out) {
      console.log('[SMS BLOCKED] Lead has opted out of messages', {
        lead_id: options.lead_id,
        to,
        message_preview: message.substring(0, 50)
      })
      await logFailedMessage(business, to, message, options, 'Lead has opted out of messages', 'OPTED_OUT', false)
      console.log('[SMS TRACE sendSms RETURN_NULL]', { reason: 'OPTED_OUT', lead_id: options.lead_id, to });
      return { sid: null, messageId: null }
    }
  }

  // Validate Twilio environment for SMS operations
  const smsValidation = validateTwilioForSms();

  const maskPhone = (phone: string | null | undefined) => {
    if (!phone) return 'undefined'
    return phone.replace(/\d(?=\d{4})/g, '*')
  }

  if (!smsValidation.isValid) {
    console.error('[SMS] Twilio validation failed:', smsValidation.error);
    // Still log the failed attempt
    await logFailedMessage(business, to, message, options, smsValidation.error || 'Twilio validation failed', 'CONFIG_ERROR', false);
    console.log('[SMS TRACE sendSms RETURN_NULL]', { reason: 'TWILIO_VALIDATION_FAILED', error: smsValidation.error, method: smsValidation.method });
    return { sid: null, messageId: null };
  }

  // Verify business has a canonical number
  // When using Messaging Service, twilio_phone_number_sid is not required (Messaging Service manages sender pool)
  // twilio_phone_number is still required for validation and logging
  const requiresPhoneSid = !business.twilio_messaging_service_sid;
  if (!business.twilio_phone_number || (requiresPhoneSid && !business.twilio_phone_number_sid)) {
    console.error('[SMS] No canonical Twilio number assigned to business:', { business_id: business.id });
    console.error('[SMS] Business config:', {
      business_id: business.id,
      twilio_phone_number_sid: business.twilio_phone_number_sid,
      messaging_service_sid: business.twilio_messaging_service_sid,
      requiresPhoneSid
    });
    await logFailedMessage(business, to, message, options, 'No Twilio number assigned to business', 'NO_TWILIO_NUMBER', false);
    console.log('[SMS TRACE sendSms RETURN_NULL]', { reason: 'NO_TWILIO_NUMBER', business_id: business.id, requiresPhoneSid, hasPhoneNumber: !!business.twilio_phone_number, hasPhoneSid: !!business.twilio_phone_number_sid });
    return { sid: null, messageId: null };
  }

  // FAIL-SAFE: Check if number is ready for use before sending
  // Bypass this check for offboarding/system SMS - they can use valid numbers even if not fully provisioned
  const isOffboardingSms = options?.isOffboarding || false;
  
  if (!isOffboardingSms) {
    const isReady = await isNumberReadyForUse(business.id);

    if (!isReady) {
      console.error('[SMS] Number not ready for use:', { business_id: business.id, provisioning_status: business.provisioning_status });
      console.log('[SMS TRACE sendSms FAIL_SAFE_FAILED]', { business_id: business.id, business_provisioning_status: business.provisioning_status });
      await logFailedMessage(business, to, message, options, 'Number not ready for use - provisioning incomplete', 'NUMBER_NOT_READY', false);
      console.log('[SMS TRACE sendSms RETURN_NULL]', { reason: 'NUMBER_NOT_READY_FAIL_SAFE', business_id: business.id, business_provisioning_status: business.provisioning_status });
      return { sid: null, messageId: null };
    }

    console.log('[SMS TRACE sendSms FAIL_SAFE_PASSED]', { business_id: business.id, business_provisioning_status: business.provisioning_status });
  }

  // Handle simulation mode
  if (smsValidation.method === 'simulated') {
    console.log('[SMS] Simulated SMS sent:', { to: maskPhone(to), body: message.substring(0, 50) + '...' });
    
    // Check if this is a system SMS (no lead_id)
    const isSystemSms = !options?.lead_id;
    
    if (isSystemSms) {
      // Insert into system_sms table for account-level messages (optional logging)
      try {
        const { data: insertedSystemSms, error: insertError } = await supabase
          .from('system_sms')
          .insert({
            business_id: business.id,
            to_phone: to,
            from_phone: business.twilio_phone_number,
            body: message,
            twilio_message_sid: `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            status: 'simulated',
            message_type: 'offboarding',
            created_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (insertError) {
          console.warn('[SMS] system_sms insert failed (table may not exist), skipping optional logging');
        } else {
          console.log('[SYSTEM SMS INSERTED] Simulated system SMS record inserted successfully', {
            system_sms_id: insertedSystemSms.id,
            business_id: business.id,
            message_body: message.substring(0, 50),
            to: maskPhone(to),
            message_type: 'simulated'
          });
        }

        return { sid: `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, messageId: insertedSystemSms?.id || null };
      } catch (error) {
        // If system_sms table doesn't exist, log warning but don't fail
        console.warn('[SMS] system_sms table not found - skipping optional logging for simulated system SMS');
        return { sid: `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, messageId: null };
      }
    } else {
      // Insert into messages table for lead/conversation messages
      const { data: insertedMessage, error: insertError } = await supabase
        .from('messages')
        .insert({
          lead_id: options?.lead_id,
          conversation_id: options?.conversation_id,
          direction: 'outbound',
          body: message,
          from_phone: business.twilio_phone_number,
          to_phone: to,
          twilio_message_sid: `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'simulated',
          error_message: null,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[SMS] Failed to insert simulated message record:', insertError);
      } else {
        console.log('[MESSAGE INSERTED] Simulated message record inserted successfully', {
          lead_id: options?.lead_id,
          message_id: insertedMessage.id,
          message_body: message.substring(0, 50),
          to: maskPhone(to),
          message_type: 'simulated'
        });
      }

      return { sid: `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, messageId: insertedMessage?.id || null };
    }
  }

  // Create fresh Twilio client for this SMS
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const globalMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

  const client = Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  let messageResult;
  let errorMessage = '';
  let errorCode = '';

  try {
    // Get app URL for status callback
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'
    const statusCallbackUrl = `${appUrl}/api/twilio/message-status`

    console.log('[FOLLOWUP TWILIO SEND START] Calling Twilio API');
    console.log('[SMS Sender] Verifying sender pool membership for SID:', business.twilio_phone_number_sid);
    
    // Verify the business's number is in the Messaging Service sender pool
    if (globalMessagingServiceSid) {
      try {
        const senderPool = await client.messaging.v1.services(globalMessagingServiceSid)
          .phoneNumbers
          .list({ limit: 100 });
        
        const numberInPool = senderPool.find(pn => pn.sid === business.twilio_phone_number_sid);
        
        if (numberInPool) {
          console.log('[SMS SEND] sender pool verification passed');
          console.log('[SMS SEND] using messaging service:', globalMessagingServiceSid);
          console.log('[FOLLOWUP TWILIO SEND RESULT] Sender pool verification passed');
          
          // CRITICAL: Always specify from to ensure tenant isolation
          // Without from parameter, Twilio can choose any sender from the pool
          const fromNumber = business.twilio_phone_number;
          
          console.log('[SMS SEND CONTEXT]', {
            business_id: business.id,
            business_name: business.name,
            to,
            from: fromNumber,
            messaging_service_sid: globalMessagingServiceSid,
            twilio_phone_number: business.twilio_phone_number,
            twilio_phone_number_sid: business.twilio_phone_number_sid,
            source: options?.lead_id ? 'missed_call_auto_reply' : 'manual',
          });
          
          // Safety assertion: verify sender matches business
          if (fromNumber !== business.twilio_phone_number) {
            console.error('[SMS FAILED] Sender mismatch: selected sender does not belong to business', {
              business_id: business.id,
              business_twilio_phone_number: business.twilio_phone_number,
              selected_from: fromNumber,
            });
            console.error('[FOLLOWUP TWILIO SEND FAILED] Sender mismatch');
            console.log('[FOLLOWUP RETURN PATH] Sender mismatch (messaging service) - returning null SID');
            await logFailedMessage(business, to, message, options, 'Sender mismatch: selected sender does not belong to business', 'SENDER_MISMATCH', false);
            console.log('[SMS TRACE sendSms RETURN_NULL]', { reason: 'SENDER_MISMATCH_MESSAGING_SERVICE', business_id: business.id, selected_from: fromNumber, business_twilio_phone_number: business.twilio_phone_number });
            return { sid: null, messageId: null };
          }
          
          console.log('[SMS SEND] Calling Twilio API with Messaging Service:', {
            business_id: business.id,
            to,
            from: fromNumber,
            messagingServiceSid: globalMessagingServiceSid,
            statusCallbackUrl
          });
          
          console.log('[SMS TRACE sendSms BEFORE_TWILIO_CREATE]', {
            mode: 'messaging_service',
            business_id: business.id,
            to,
            from: fromNumber,
            messagingServiceSid: globalMessagingServiceSid,
            statusCallbackUrl,
            body_length: message.length
          });

          // Use Messaging Service with business's canonical number
          // CRITICAL: Always specify from to ensure tenant isolation
          messageResult = await client.messages.create({
            body: message,
            to,
            from: fromNumber,
            messagingServiceSid: globalMessagingServiceSid,
            statusCallback: statusCallbackUrl,
          });

          console.log('[SMS TRACE sendSms AFTER_TWILIO_CREATE]', {
            mode: 'messaging_service',
            sid: messageResult?.sid,
            status: messageResult?.status,
            errorCode: messageResult?.errorCode,
            errorMessage: messageResult?.errorMessage
          });
          
          console.log('[SMS SEND] Twilio API call succeeded (Messaging Service):', {
            message_sid: messageResult.sid,
            status: messageResult.status
          });
          console.log('[FOLLOWUP TWILIO SEND RESULT] Twilio API call succeeded, SID:', messageResult.sid);
        } else {
          console.error('[SMS FAILED] sender pool verification failed');
          console.error('[SMS FAILED] pool sids:', senderPool.map(pn => pn.sid));
          console.error('[SMS FAILED] business sid:', business.twilio_phone_number_sid);
          console.error('[FOLLOWUP TWILIO SEND FAILED] Sender pool verification failed');
          console.log('[FOLLOWUP RETURN PATH] Sender pool verification failed - returning null SID');
          errorMessage = 'Business number not found in Messaging Service sender pool';
          await logFailedMessage(business, to, message, options, errorMessage, 'SENDER_POOL_ERROR', false);
          console.log('[SMS TRACE sendSms RETURN_NULL]', { reason: 'SENDER_POOL_VERIFICATION_FAILED', business_id: business.id, business_twilio_phone_number_sid: business.twilio_phone_number_sid, pool_sids: senderPool.map(pn => pn.sid) });

          // Trigger repair provisioning
          console.log('[sms] triggering repair provisioning for business:', business.id);
          try {
            await fetch('/api/business/trigger-provisioning', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ business_id: business.id })
            });
          } catch (repairError) {
            console.error('[sms] failed to trigger repair:', repairError);
          }

          return { sid: null, messageId: null };
        }
      } catch (poolError) {
        console.error('[SMS FAILED] Error checking sender pool:', poolError);
        console.error('[FOLLOWUP TWILIO SEND FAILED] Sender pool check error');
        console.log('[FOLLOWUP RETURN PATH] Sender pool check error - returning null SID');
        errorMessage = 'Failed to verify sender pool membership';
        await logFailedMessage(business, to, message, options, errorMessage, 'SENDER_POOL_CHECK_ERROR', false);
        console.log('[SMS TRACE sendSms RETURN_NULL]', { reason: 'SENDER_POOL_CHECK_ERROR', business_id: business.id, error: poolError instanceof Error ? poolError.message : String(poolError), stack: poolError instanceof Error ? poolError.stack : undefined });
        return { sid: null, messageId: null };
      }
    } else {
      // No Messaging Service configured - use direct from with business number
      console.warn('[SMS SEND] warning: no messaging service configured, using direct from');
      console.log('[FOLLOWUP TWILIO SEND RESULT] No messaging service, using direct from');
      
      // CRITICAL: Always use business's canonical number for tenant isolation
      const fromNumber = business.twilio_phone_number;
      
      console.log('[SMS SEND CONTEXT]', {
        business_id: business.id,
        business_name: business.name,
        to,
        from: fromNumber,
        messaging_service_sid: null,
        twilio_phone_number: business.twilio_phone_number,
        twilio_phone_number_sid: business.twilio_phone_number_sid,
        source: options?.lead_id ? 'missed_call_auto_reply' : 'manual',
      });
      
      // Safety assertion: verify sender matches business
      if (fromNumber !== business.twilio_phone_number) {
        console.error('[SMS FAILED] Sender mismatch: selected sender does not belong to business', {
          business_id: business.id,
          business_twilio_phone_number: business.twilio_phone_number,
          selected_from: fromNumber,
        });
        console.error('[FOLLOWUP TWILIO SEND FAILED] Sender mismatch (direct from)');
        console.log('[FOLLOWUP RETURN PATH] Sender mismatch (direct from) - returning null SID');
        await logFailedMessage(business, to, message, options, 'Sender mismatch: selected sender does not belong to business', 'SENDER_MISMATCH', false);
        console.log('[SMS TRACE sendSms RETURN_NULL]', { reason: 'SENDER_MISMATCH_DIRECT_FROM', business_id: business.id, selected_from: fromNumber, business_twilio_phone_number: business.twilio_phone_number });
        return { sid: null, messageId: null };
      }
      
      console.log('[SMS SEND] Calling Twilio API with direct from:', {
        business_id: business.id,
        to,
        from: fromNumber,
        statusCallbackUrl
      });
      
      console.log('[SMS TRACE sendSms BEFORE_TWILIO_CREATE]', {
        mode: 'direct_from',
        business_id: business.id,
        to,
        from: fromNumber,
        statusCallbackUrl,
        body_length: message.length
      });

      messageResult = await client.messages.create({
        body: message,
        to,
        from: fromNumber,
        statusCallback: statusCallbackUrl,
      });

      console.log('[SMS TRACE sendSms AFTER_TWILIO_CREATE]', {
        mode: 'direct_from',
        sid: messageResult?.sid,
        status: messageResult?.status,
        errorCode: messageResult?.errorCode,
        errorMessage: messageResult?.errorMessage
      });
      
      console.log('[SMS SEND] Twilio API call succeeded (direct from):', {
        message_sid: messageResult.sid,
        status: messageResult.status
      });
      console.log('[FOLLOWUP TWILIO SEND RESULT] Twilio API call succeeded (direct from), SID:', messageResult.sid);
    }

    console.log('[SMS SEND] Twilio accepted message:', {
      business_id: business.id,
      to,
      message_sid: messageResult.sid,
      status: messageResult.status,
      lead_id: options?.lead_id,
      conversation_id: options?.conversation_id
    });

    // Fetch actual message status after send to detect any immediate errors
    // This helps identify deliverability issues like warning 30034
    let actualStatus = messageResult.status;
    let twilioErrorCode = messageResult.errorCode;
    let twilioErrorMessage = messageResult.errorMessage;
    
    try {
      console.log('[SMS DELIVERY DEBUG] Fetching post-send message status:', {
        message_sid: messageResult.sid,
        business_id: business.id,
        to,
        from: business.twilio_phone_number
      });
      
      const fetchedMessage = await client.messages(messageResult.sid).fetch();
      actualStatus = fetchedMessage.status;
      twilioErrorCode = fetchedMessage.errorCode;
      twilioErrorMessage = fetchedMessage.errorMessage;
      
      console.log('[SMS DELIVERY DEBUG] Post-send status fetched:', {
        message_sid: messageResult.sid,
        business_id: business.id,
        from: business.twilio_phone_number,
        to,
        twilio_sid: fetchedMessage.sid,
        twilio_status: fetchedMessage.status,
        error_code: fetchedMessage.errorCode,
        error_message: fetchedMessage.errorMessage,
        direction: fetchedMessage.direction,
        price: fetchedMessage.price,
        priceUnit: fetchedMessage.priceUnit
      });
      
      // NOTE: Warning 30034 (Message delivery - Possible delivery issue) should be monitored
      // but not used alone as proof of failure. This warning can occur due to carrier delays
      // or temporary issues. We should track it across multiple sends to identify patterns.
      if (twilioErrorCode === 30034) {
        console.warn('[SMS DELIVERY DEBUG] Warning 30034 detected - possible delivery issue:', {
          message_sid: messageResult.sid,
          business_id: business.id,
          from: business.twilio_phone_number,
          to,
          error_message: twilioErrorMessage,
          status: actualStatus
        });
      }
    } catch (fetchError) {
      console.warn('[SMS DELIVERY DEBUG] Failed to fetch post-send status:', {
        message_sid: messageResult.sid,
        error: fetchError
      });
      // Continue with original status if fetch fails
    }

    // Insert successful message record into database
    // Check if this is a system SMS (no lead_id)
    const isSystemSms = !options?.lead_id;
    let messageId: string | null = null;

    if (isSystemSms) {
      // Insert into system_sms table for account-level messages
      const { data: insertedSystemSms, error: insertError } = await supabase
        .from('system_sms')
        .insert({
          business_id: business.id,
          to_phone: to,
          from_phone: business.twilio_phone_number,
          body: message,
          twilio_message_sid: messageResult.sid,
          status: actualStatus,
          sent_at: new Date().toISOString(),
          status_updated_at: new Date().toISOString(),
          error_code: twilioErrorCode,
          error_message: twilioErrorMessage,
          message_type: 'offboarding',
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[SMS SEND] system SMS insert failed:', {
          message_sid: messageResult.sid,
          business_id: business.id,
          error: insertError
        });
      } else {
        console.log('[SYSTEM SMS INSERTED] System SMS record stored with delivery info:', {
          message_sid: messageResult.sid,
          system_sms_id: insertedSystemSms.id,
          business_id: business.id,
          from: business.twilio_phone_number,
          to,
          twilio_sid: messageResult.sid,
          twilio_status: actualStatus,
          error_code: twilioErrorCode,
          error_message: twilioErrorMessage,
          message_body: message.substring(0, 50)
        });
      }

      messageId = insertedSystemSms?.id || null;
    } else {
      // Insert into messages table for lead/conversation messages
      const { data: insertedMessage, error: insertError } = await supabase
        .from('messages')
        .insert({
          lead_id: options?.lead_id,
          conversation_id: options?.conversation_id,
          direction: 'outbound',
          body: message,
          from_phone: business.twilio_phone_number,
          to_phone: to,
          twilio_message_sid: messageResult.sid,
          status: actualStatus, // Use fetched status if available
          sent_at: new Date().toISOString(),
          status_updated_at: new Date().toISOString(),
          error_code: twilioErrorCode,
          error_message: twilioErrorMessage,
          created_at: new Date().toISOString(),
          is_manual: options?.isManual || false,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('[SMS SEND] message insert failed:', {
          message_sid: messageResult.sid,
          lead_id: options?.lead_id,
          conversation_id: options?.conversation_id,
          error: insertError
        });
      } else {
        console.log('[MESSAGE INSERTED] Message record stored with delivery info:', {
          message_sid: messageResult.sid,
          message_id: insertedMessage.id,
          business_id: business.id,
          lead_id: options?.lead_id,
          from: business.twilio_phone_number,
          to,
          twilio_sid: messageResult.sid,
          twilio_status: actualStatus,
          error_code: twilioErrorCode,
          error_message: twilioErrorMessage,
          message_body: message.substring(0, 50)
        });
      }

      messageId = insertedMessage?.id || null;
    }

    // Mark forwarding as verified for successful auto-response SMS
    // Only trigger for auto-replies (when lead_id is provided but conversation_id might be null for new leads)
    if (options?.lead_id && !options?.conversation_id) {
      // This is likely an auto-response to a new lead
      await markForwardingVerified(business.id, 'auto_response_sms_sent');
    }

    return { sid: messageResult.sid, messageId };
  } catch (error: any) {
    console.error('[SMS FAILED] Twilio send failed:', {
      business_id: business.id,
      to,
      lead_id: options?.lead_id,
      conversation_id: options?.conversation_id,
      error_code: error?.code,
      error_message: error?.message,
      error_status: error?.status,
      more_info: error?.moreInfo,
      twilio_api_called: true
    });
    console.error('[FOLLOWUP TWILIO SEND FAILED] Twilio API error:', error?.message);

    // Extract error details for logging (internal only)
    errorCode = error?.code || 'UNKNOWN';
    errorMessage = error?.message || 'Unknown error occurred';
    
    // Log specific Twilio error codes for debugging
    if (error?.code) {
      console.error('[SMS FAILED] Twilio error code:', error?.code, '- common issues:');
      switch (error?.code) {
        case 21614:
          console.error('[SMS FAILED] - to number is not a valid mobile number');
          break;
        case 21612:
          console.error('[SMS FAILED] - from number not enabled for sms');
          break;
        case 21610:
          console.error('[SMS FAILED] - attempt to send to unsubscribed recipient');
          break;
        case 21611:
          console.error('[SMS FAILED] - message cannot be sent to the to number');
          break;
        case 21408:
          console.error('[SMS FAILED] - permission to send an sms has not been enabled');
          break;
        case 30001:
          console.error('[SMS FAILED] - queue overflow');
          break;
        case 30002:
          console.error('[SMS FAILED] - account suspended');
          break;
        default:
          console.error('[SMS FAILED] - unknown twilio error code');
      }
    }

    // Log the failed message attempt - this won't throw, ensuring webhook continues
    console.log('[FOLLOWUP RETURN PATH] Twilio API error in catch block - returning null SID');
    await logFailedMessage(business, to, message, options, errorMessage, errorCode, true); // Twilio was called

    console.error('[SMS TRACE sendSms TWILIO_EXCEPTION_COMPLETE]', {
      business_id: business.id,
      to,
      lead_id: options?.lead_id,
      conversation_id: options?.conversation_id,
      status: error?.status,
      code: error?.code,
      message: error?.message,
      moreInfo: error?.moreInfo,
      details: error?.details,
      stack: error?.stack,
      raw: error
    });

    // Return null instead of throwing to prevent webhooks from crashing
    console.log('[SMS TRACE sendSms RETURN_NULL]', { reason: 'TWILIO_API_EXCEPTION', business_id: business.id, code: errorCode, message: errorMessage, status: error?.status });
    return { sid: null, messageId: null }
  }
}

export async function sendMms(
  business: any,
  to: string,
  message: string,
  mediaUrls: string[],
  options?: {
    lead_id?: string;
    conversation_id?: string;
    isManual?: boolean; // Flag to distinguish manual user messages from automated
  }
): Promise<{ sid: string | null; messageId: string | null }> {
  message = appendBusinessAvailabilityNote(message, business);

  // Validate Twilio environment for SMS operations
  const smsValidation = validateTwilioForSms();
  
  console.log('[MMS SEND] Starting sendMms:', {
    business_id: business.id,
    business_name: business.name,
    to,
    message_length: message.length,
    media_count: mediaUrls.length,
    lead_id: options?.lead_id,
    conversation_id: options?.conversation_id,
    twilio_phone_number: business.twilio_phone_number,
    messaging_service_sid: business.twilio_messaging_service_sid,
    provisioning_status: business.provisioning_status
  });
  
  if (!smsValidation.isValid) {
    console.error('[MMS FAILED] Twilio validation failed:', smsValidation.error);
    await logFailedMessage(business, to, message || '[MMS]', options, smsValidation.error || 'Twilio validation failed', 'CONFIG_ERROR', false);
    return { sid: null, messageId: null };
  }

  // Verify business has a canonical number
  if (!business.twilio_phone_number || !business.twilio_phone_number_sid) {
    console.error('[MMS FAILED] No canonical Twilio number assigned to business');
    await logFailedMessage(business, to, message || '[MMS]', options, 'No Twilio number assigned to business', 'NO_TWILIO_NUMBER', false);
    return { sid: null, messageId: null };
  }

  // FAIL-SAFE: Check if number is ready for use before sending
  const isReady = await isNumberReadyForUse(business.id);
  
  if (!isReady) {
    console.error('[MMS FAILED] Number not ready for use - provisioning incomplete');
    await logFailedMessage(business, to, message || '[MMS]', options, 'Number not ready for use - provisioning incomplete', 'NUMBER_NOT_READY', false);
    return { sid: null, messageId: null };
  }

  // Handle simulation mode
  if (smsValidation.method === 'simulated') {
    console.log('[MMS] 🧪 Simulated MMS sent:', { to, mediaCount: mediaUrls.length });
    
    const { data: insertedMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        lead_id: options?.lead_id,
        conversation_id: options?.conversation_id,
        direction: 'outbound',
        body: message,
        from_phone: business.twilio_phone_number,
        to_phone: to,
        twilio_message_sid: `SIM_MMS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        status: 'simulated',
        error_message: null,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[MMS] Failed to insert simulated message record:', insertError);
    } else {
      console.log('[MESSAGE INSERTED] MMS simulated message record inserted successfully', {
        lead_id: options?.lead_id,
        message_id: insertedMessage.id,
        message_body: message.substring(0, 50),
        to,
        message_type: 'mms_simulated',
        media_count: mediaUrls?.length || 0
      });
    }

    return { sid: `SIM_MMS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, messageId: insertedMessage?.id || null };
  }

  const client = Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  let messageResult;
  let errorMessage = '';
  let errorCode = '';

  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'
    const statusCallbackUrl = `${appUrl}/api/twilio/message-status`
    const fromNumber = business.twilio_phone_number;

    console.log('[MMS SEND] Calling Twilio API with media:', {
      business_id: business.id,
      to,
      from: fromNumber,
      mediaUrls,
      messageLength: message.length,
      statusCallbackUrl
    });

    messageResult = await client.messages.create({
      body: message,
      to,
      from: fromNumber,
      mediaUrl: mediaUrls,
      statusCallback: statusCallbackUrl,
    });

    console.log('[MMS SEND] Twilio API call succeeded:', {
      message_sid: messageResult.sid,
      status: messageResult.status
    });

    // Insert successful message record into database
    const { data: insertedMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        lead_id: options?.lead_id,
        conversation_id: options?.conversation_id,
        direction: 'outbound',
        body: message,
        from_phone: business.twilio_phone_number,
        to_phone: to,
        twilio_message_sid: messageResult.sid,
        status: messageResult.status,
        sent_at: new Date().toISOString(),
        status_updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        is_manual: options?.isManual || false,
        media_count: mediaUrls.length,
        message_type: !message && mediaUrls.length > 0 ? 'image' : message && mediaUrls.length > 0 ? 'mixed' : 'text',
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('[MMS SEND] message insert failed:', insertError);
    } else {
      console.log('[MESSAGE INSERTED] MMS message record stored successfully', {
        message_sid: messageResult.sid,
        message_id: insertedMessage.id,
        business_id: business.id,
        lead_id: options?.lead_id,
        from: business.twilio_phone_number,
        to,
        twilio_status: messageResult.status,
        message_body: message.substring(0, 50),
        media_count: mediaUrls?.length || 0
      });
    }

    return { sid: messageResult.sid, messageId: insertedMessage?.id };
  } catch (error: any) {
    console.error('[MMS FAILED] Twilio send failed:', {
      business_id: business.id,
      to,
      error_code: error?.code,
      error_message: error?.message,
      error_status: error?.status,
    });
    
    errorCode = error?.code || 'UNKNOWN';
    errorMessage = error?.message || 'Unknown error occurred';
    
    await logFailedMessage(business, to, message || '[MMS]', options, errorMessage, errorCode, true);
    
    return { sid: null, messageId: null }
  }
}

// Helper function to log failed message attempts
async function logFailedMessage(
  business: any,
  to: string,
  message: string,
  options?: {
    lead_id?: string;
    conversation_id?: string;
    isOffboarding?: boolean;
  },
  errorMessage?: string,
  errorCode?: string,
  twilioApiCalled: boolean = false
): Promise<void> {
  try {
    console.log('[SMS FAILED] Logging failed message:', {
      business_id: business.id,
      business_name: business.name,
      to,
      from_phone: business.twilio_phone_number,
      lead_id: options?.lead_id,
      conversation_id: options?.conversation_id,
      is_offboarding: options?.isOffboarding,
      error_message: errorMessage,
      error_code: errorCode,
      twilio_api_called: twilioApiCalled,
      twilio_message_sid: twilioApiCalled ? 'TWILIO_CALLED' : 'NOT_CALLED',
      message_body: message.substring(0, 50) + '...'
    });
    
    // Check if this is a system/offboarding SMS (no lead_id)
    const isSystemSms = !options?.lead_id || options?.isOffboarding;
    
    if (isSystemSms) {
      // Try to insert into system_sms table for account-level messages
      try {
        const { error: insertError } = await supabase
          .from('system_sms')
          .insert({
            business_id: business.id,
            to_phone: to,
            from_phone: business.twilio_phone_number,
            body: message,
            twilio_message_sid: null,
            status: 'failed',
            error_code: errorCode,
            error_message: errorMessage,
            message_type: options?.isOffboarding ? 'offboarding' : 'other',
            status_updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          console.warn('[SMS FAILED] system_sms insert failed (table may not exist), skipping optional logging');
        } else {
          console.log('[SMS FAILED] Failed system SMS logged successfully');
        }
      } catch (error) {
        console.warn('[SMS FAILED] system_sms table not found - skipping optional logging for failed system SMS');
      }
      return;
    }
    
    // Insert into messages table for lead/conversation messages
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        lead_id: options?.lead_id,
        conversation_id: options?.conversation_id,
        direction: 'outbound',
        body: message,
        from_phone: business.twilio_phone_number,
        to_phone: to,
        twilio_message_sid: null,
        status: twilioApiCalled ? 'failed' : 'not_sent', // Distinguish between Twilio failed vs never called
        status_updated_at: new Date().toISOString(),
        error_message: errorMessage || 'Failed to send SMS',
        error_code: errorCode || 'UNKNOWN',
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[SMS FAILED] Failed message insert error:', {
        business_id: business.id,
        lead_id: options?.lead_id,
        conversation_id: options?.conversation_id,
        error: insertError
      });
    } else {
      console.log('[SMS FAILED] Failed message logged successfully');
    }
  } catch (logError) {
    console.error('[SMS FAILED] Error logging failed message:', logError);
    // Don't throw - this is just logging
  }
}

export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '')
  
  // If it starts with 1 and has 11 digits, remove the 1
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return cleaned.substring(1)
  }
  
  // If it has 10 digits, return as is
  if (cleaned.length === 10) {
    return cleaned
  }
  
  // Otherwise return the cleaned number (might be international)
  return cleaned
}

export function formatPhoneNumber(phone: string): string {
  const normalized = normalizePhoneNumber(phone)
  
  // Format as (XXX) XXX-XXXX for 10-digit US numbers
  if (normalized.length === 10) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`
  }
  
  // Return as is for other formats
  return phone
}

export function isMissedCall(callStatus: string): boolean {
  const missedCallStatuses = ['no-answer', 'busy', 'failed', 'canceled']
  return missedCallStatuses.includes(callStatus.toLowerCase())
}

export function validateTwilioRequest(payload: any, expectedFields: string[]): boolean {
  return expectedFields.every(field => field in payload)
}

export async function provisionTwilioNumber(businessId: string, correlationId?: string): Promise<{ 
  phoneNumber: string; 
  phoneNumberSid: string;
  messagingServiceAttached: boolean;
  messagingServiceError?: string;
  fromWarmInventory?: boolean; // Flag to indicate if number came from warm inventory
} | null> {
  console.log('[Provision Path] ========== provisionTwilioNumber HIT ==========');
  console.log(`[Provision Path] businessId=${businessId} correlation_id=${correlationId}`);
  
  // Use provided correlation ID or generate one for backwards compatibility
  const finalCorrelationId = correlationId || `PROV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  // Use approved A2P 10DLC Messaging Service
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MGe422ac34a7a2b70a646e2084110e54d3'

  console.log(`[Provisioning] START business_id=${businessId} correlation_id=${correlationId}`)
  console.log(`[Provisioning] TWILIO_MESSAGING_SERVICE_SID env var=${process.env.TWILIO_MESSAGING_SERVICE_SID} correlation_id=${correlationId}`)
  console.log(`[Provisioning] Using Messaging Service=${messagingServiceSid} correlation_id=${correlationId}`)
  
  if (!accountSid || !authToken) {
    console.error(`[Provisioning] Credentials missing correlation_id=${correlationId}`)
    return null
  }

  console.log(`[Twilio] Active account SID=${accountSid} correlation_id=${correlationId}`)
  console.log(`[Twilio] Purchasing number under account=${accountSid} correlation_id=${correlationId}`)

  // Database guard: Check if business already has a number or is already provisioning
  console.log(`[ProvisioningGuard] ========== CHECKING EXISTING STATE ========== correlation_id=${correlationId}`)
  const { data: existingBusiness } = await supabase
    .from('businesses')
    .select('twilio_phone_number, twilio_phone_number_sid, provisioning_status, provisioning_lock_id')
    .eq('id', businessId)
    .single()

  if (existingBusiness) {
    console.log(`[ProvisioningGuard] Existing twilio_phone_number=${existingBusiness.twilio_phone_number} correlation_id=${correlationId}`)
    console.log(`[ProvisioningGuard] Existing twilio_phone_number_sid=${existingBusiness.twilio_phone_number_sid} correlation_id=${correlationId}`)
    console.log(`[ProvisioningGuard] Existing provisioning_status=${existingBusiness.provisioning_status} correlation_id=${correlationId}`)
    console.log(`[ProvisioningGuard] Existing provisioning_lock_id=${existingBusiness.provisioning_lock_id} correlation_id=${correlationId}`)

    // Smart lock: Only block if provisioning by a different request
    if (existingBusiness.provisioning_status === 'provisioning' && 
        existingBusiness.provisioning_lock_id && 
        existingBusiness.provisioning_lock_id !== finalCorrelationId) {
      console.log(`[ProvisioningGuard] ========== LOCK BLOCKED (DIFFERENT REQUEST) ========== correlation_id=${correlationId}`)
      console.log(`[ProvisioningGuard] Business is being provisioned by different request, blocking correlation_id=${correlationId}`)
      console.log(`[ProvisioningGuard] Existing lock_id=${existingBusiness.provisioning_lock_id} correlation_id=${correlationId}`)
      console.log(`[ProvisioningGuard] Current correlation_id=${correlationId}`)
      return null
    }

    // Allow provisioning if same request or no lock
    if (existingBusiness.provisioning_status === 'provisioning' && 
        (!existingBusiness.provisioning_lock_id || existingBusiness.provisioning_lock_id === finalCorrelationId)) {
      console.log(`[ProvisioningGuard] ========== ALLOWING (SAME REQUEST) ========== correlation_id=${correlationId}`)
      console.log(`[ProvisioningGuard] Business is provisioning but this is the same request, allowing correlation_id=${correlationId}`)
      console.log(`[ProvisioningGuard] Existing lock_id=${existingBusiness.provisioning_lock_id} correlation_id=${correlationId}`)
      console.log(`[ProvisioningGuard] Current correlation_id=${correlationId}`)
    }

    // Database guard: If already has number or is attached, skip purchase
    if (existingBusiness.twilio_phone_number_sid || existingBusiness.provisioning_status === 'attached') {
      console.log(`[ProvisioningGuard] ========== EXISTING NUMBER FOUND ========== correlation_id=${correlationId}`)
      console.log(`[ProvisioningGuard] Existing attached number found, skipping purchase correlation_id=${correlationId}`)
      console.log(`[ProvisioningGuard] Business already has twilio_phone_number_sid=${existingBusiness.twilio_phone_number_sid} correlation_id=${correlationId}`)
      console.log(`[ProvisioningGuard] Business provisioning_status=${existingBusiness.provisioning_status} correlation_id=${correlationId}`)
      console.log(`[ProvisioningGuard] This prevents duplicate number purchases correlation_id=${correlationId}`)
      return null
    }
  }

  console.log(`[ProvisioningGuard] ========== PROCEEDING WITH PROVISIONING ========== correlation_id=${correlationId}`)

  // STEP 1: Try to assign from warm inventory first
  console.log(`[Warm Inventory] ========== START WARM INVENTORY CHECK ========== correlation_id=${correlationId}`);
  console.log(`[Warm Inventory] Checking for available warm numbers before live provisioning correlation_id=${correlationId}`);
  console.log(`[Warm Inventory] Business ID: ${businessId} correlation_id=${correlationId}`);
  
  try {
    console.log(`[Warm Inventory] Importing warm number manager... correlation_id=${correlationId}`);
    const { getAndAssignWarmNumber, triggerBackgroundReplenishment } = await import('@/lib/warm-number-manager')
    console.log(`[Warm Inventory] Warm number manager imported successfully correlation_id=${correlationId}`);
    
    console.log(`[Warm Inventory] Calling getAndAssignWarmNumber... correlation_id=${correlationId}`);
    const warmNumberResult = await getAndAssignWarmNumber(businessId)
    console.log(`[Warm Inventory] getAndAssignWarmNumber returned correlation_id=${correlationId}`);
    console.log(`[Warm Inventory] Result success: ${warmNumberResult.success} correlation_id=${correlationId}`);
    console.log(`[Warm Inventory] Result phoneNumber: ${warmNumberResult.phoneNumber} correlation_id=${correlationId}`);
    console.log(`[Warm Inventory] Result phoneNumberSid: ${warmNumberResult.phoneNumberSid} correlation_id=${correlationId}`);
    console.log(`[Warm Inventory] Result error: ${warmNumberResult.error} correlation_id=${correlationId}`);

    if (warmNumberResult.success && warmNumberResult.phoneNumber && warmNumberResult.phoneNumberSid) {
      console.log(`[Warm Inventory] ========== WARM NUMBER ASSIGNMENT SUCCESS ========== correlation_id=${correlationId}`);
      console.log(`[Warm Inventory] ✓ Assigned warm number from inventory correlation_id=${correlationId}`);
      console.log(`[Warm Inventory] Phone number: ${warmNumberResult.phoneNumber} correlation_id=${correlationId}`);
      console.log(`[Warm Inventory] Phone SID: ${warmNumberResult.phoneNumberSid} correlation_id=${correlationId}`);

      // Update businesses table with the warm number
      console.log(`[Warm Inventory] Updating businesses table with warm number... correlation_id=${correlationId}`);
      console.log(`[Warm Inventory] Business ID: ${businessId} correlation_id=${correlationId}`);
      console.log(`[Warm Inventory] Phone Number: ${warmNumberResult.phoneNumber} correlation_id=${correlationId}`);
      console.log(`[Warm Inventory] Phone SID: ${warmNumberResult.phoneNumberSid} correlation_id=${correlationId}`);
      
      const { error: updateBusinessError } = await supabase
        .from('businesses')
        .update({
          twilio_phone_number: warmNumberResult.phoneNumber,
          twilio_phone_number_sid: warmNumberResult.phoneNumberSid,
          sms_type: 'a2p_local',
          a2p_status: 'active',
          messaging_status: 'active',
          twilio_messaging_service_sid: messagingServiceSid,
          provisioning_status: 'attached',
          provisioning_error: null,
          provisioned_at: new Date().toISOString()
        })
        .eq('id', businessId)

      if (updateBusinessError) {
        console.error(`[Warm Inventory] ========== BUSINESS UPDATE FAILED ========== correlation_id=${correlationId}`);
        console.error(`[Warm Inventory] Failed to update business with warm number correlation_id=${correlationId}`, updateBusinessError);
        console.error(`[Warm Inventory] ERROR Details: ${JSON.stringify(updateBusinessError, null, 2)} correlation_id=${correlationId}`);
        console.log(`[Warm Inventory] Fallback to live provisioning due to business update failure correlation_id=${correlationId}`);
      } else {
        console.log(`[Warm Inventory] ========== BUSINESS UPDATE SUCCESS ========== correlation_id=${correlationId}`);
        console.log(`[Warm Inventory] ✓ Business updated with warm number correlation_id=${correlationId}`);
        
        console.log(`[Warm Inventory] Triggering background replenishment... correlation_id=${correlationId}`);
        await triggerBackgroundReplenishment()
        console.log(`[Warm Inventory] Background replenishment triggered correlation_id=${correlationId}`);
        
        console.log(`[Warm Inventory] ========== WARM NUMBER ASSIGNMENT COMPLETE ========== correlation_id=${correlationId}`);
        console.log(`[Warm Inventory] Warm number assignment complete, skipping live purchase correlation_id=${correlationId}`);
        return {
          phoneNumber: warmNumberResult.phoneNumber,
          phoneNumberSid: warmNumberResult.phoneNumberSid,
          messagingServiceAttached: true,
          fromWarmInventory: true, // Flag to indicate this came from warm inventory
        }
      }
    } else {
      console.log(`[Warm Inventory] ========== NO WARM NUMBER AVAILABLE ========== correlation_id=${correlationId}`);
      console.log(`[Warm Inventory] No warm numbers available, falling back to live provisioning correlation_id=${correlationId}`);
      console.log(`[Warm Inventory] Reason: ${warmNumberResult.error} correlation_id=${correlationId}`);
    }
  } catch (error) {
    console.error(`[Warm Inventory] ========== WARM INVENTORY CHECK FAILED ========== correlation_id=${correlationId}`);
    console.error(`[Warm Inventory] Error checking warm inventory, falling back to live provisioning correlation_id=${correlationId}`, error);
    console.error(`[Warm Inventory] ERROR Details: ${JSON.stringify(error, null, 2)} correlation_id=${correlationId}`);
  }

  // STEP 2: Fallback to live provisioning if no warm numbers available
  console.log(`[Warm Inventory] ========== FALLING BACK TO LIVE PROVISIONING ========== correlation_id=${correlationId}`);
  console.log(`[Provisioning] Provisioning dedicated local number for business=${businessId} correlation_id=${correlationId}`)
  console.log(`[Provisioning] Using approved Messaging Service=${messagingServiceSid} correlation_id=${correlationId}`)

  try {
    const client = Twilio(accountSid, authToken)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'

    console.log(`[Provisioning] Searching for available local number correlation_id=${correlationId}`)
    
    // Search for available US local numbers with voice + SMS enabled
    const availableNumbers = await client.availablePhoneNumbers('US')
      .local
      .list({
        voiceEnabled: true,
        smsEnabled: true,
        limit: 1,
      })

    if (!availableNumbers || availableNumbers.length === 0) {
      console.error(`[Provisioning] No available local numbers found correlation_id=${correlationId}`)
      return null
    }

    const numberToPurchase = availableNumbers[0]
    console.log(`[Provisioning] Selected available number=${numberToPurchase.phoneNumber} correlation_id=${correlationId}`)

    // Purchase the number with webhook URLs
    console.log(`[Provisioning] Purchasing number with webhooks correlation_id=${correlationId}`)
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: numberToPurchase.phoneNumber,
      voiceUrl: `${appUrl}/api/twilio/voice`,
      statusCallback: `${appUrl}/api/twilio/voice-status`,
      statusCallbackMethod: 'POST',
      smsUrl: `${appUrl}/api/twilio/incoming-sms`,
      smsMethod: 'POST',
    })

    console.log(`[Provisioning] Purchased number=${purchasedNumber.phoneNumber} correlation_id=${correlationId}`)
    console.log(`[Provisioning] Purchased number SID=${purchasedNumber.sid} correlation_id=${correlationId}`)
    console.log(`[Provisioning] Purchased number accountSid=${purchasedNumber.accountSid} correlation_id=${correlationId}`)
    console.log(`[Provisioning] Messaging Service SID=${messagingServiceSid} correlation_id=${correlationId}`)
    console.log(`[Provisioning] Active account SID=${accountSid} correlation_id=${correlationId}`)
    console.log(`[Provisioning] Purchased number is SINGLE SOURCE OF TRUTH correlation_id=${correlationId}`)
    
    // Check for account mismatch
    if (purchasedNumber.accountSid !== accountSid) {
      console.error(`[MessagingService] Account mismatch detected correlation_id=${correlationId}`)
      console.error(`[MessagingService] Purchased number accountSid=${purchasedNumber.accountSid} correlation_id=${correlationId}`)
      console.error(`[MessagingService] Active account SID=${accountSid} correlation_id=${correlationId}`)
      console.error(`[MessagingService] Messaging Service SID=${messagingServiceSid} correlation_id=${correlationId}`)
      console.error(`[MessagingService] ERROR: Number purchased under different account than active Twilio client`)
      throw new Error(`Account mismatch: Number purchased under account ${purchasedNumber.accountSid} but active client is ${accountSid}`)
    }
    
    console.log(`[MessagingService] Account ownership verified - number purchased under active account correlation_id=${correlationId}`)
    console.log(`[Provisioning] Configured voice webhook=${appUrl}/api/twilio/voice correlation_id=${correlationId}`)
    console.log(`[Provisioning] Configured voice status callback=${appUrl}/api/twilio/voice-status correlation_id=${correlationId}`)
    console.log(`[Provisioning] Configured messaging webhook=${appUrl}/api/twilio/incoming-sms correlation_id=${correlationId}`)
    
    // IMMUTABLE: Store purchased number as single source of truth
    const purchasedPhoneNumber = purchasedNumber.phoneNumber;
    const purchasedPhoneNumberSid = purchasedNumber.sid;
    
    console.log(`[Provisioning] IMMUTABLE purchasedPhoneNumber=${purchasedPhoneNumber} correlation_id=${correlationId}`)
    console.log(`[Provisioning] IMMUTABLE purchasedPhoneNumberSid=${purchasedPhoneNumberSid} correlation_id=${correlationId}`)
    console.log(`[Provisioning] These are the ONLY values that will be saved to database correlation_id=${correlationId}`)

    // Validate that SID is present
    if (!purchasedPhoneNumberSid) {
      console.error(`[Provisioning] ERROR: Twilio purchase succeeded but SID is missing correlation_id=${correlationId}`)
      throw new Error('Twilio purchase succeeded but SID is missing - cannot proceed without SID')
    }

    let messagingServiceAttached = false;
    let messagingServiceError: string | undefined;

    // Attach number to Messaging Service sender pool if available
    if (messagingServiceSid) {
      console.log(`[SenderAttach] ========== START ATTACH ========== correlation_id=${correlationId}`)
      console.log(`[SenderAttach] phoneNumber=${purchasedPhoneNumber} correlation_id=${correlationId}`)
      console.log(`[SenderAttach] phoneNumberSid=${purchasedPhoneNumberSid} correlation_id=${correlationId}`)
      console.log(`[SenderAttach] messagingServiceSid=${messagingServiceSid} correlation_id=${correlationId}`)
      
      console.log(`[MessagingService] Attaching phone number correlation_id=${correlationId}`)
      console.log(`[MessagingService] Messaging Service SID=${messagingServiceSid} correlation_id=${correlationId}`)
      console.log(`[MessagingService] PhoneNumber SID=${purchasedPhoneNumberSid} correlation_id=${correlationId}`)
      console.log(`[MessagingService] PhoneNumber=${purchasedPhoneNumber} correlation_id=${correlationId}`)
      console.log(`[MessagingService] SID type=${purchasedPhoneNumberSid.startsWith('PN') ? 'IncomingPhoneNumber SID (correct)' : 'INVALID - not a PN SID'} correlation_id=${correlationId}`)
      
      try {
        // Check if number is already attached to the Messaging Service
        console.log(`[MessagingService] Fetching current sender pool correlation_id=${correlationId}`)
        const existingPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
          .phoneNumbers
          .list({ limit: 100 })
        
        console.log(`[MessagingService] Current sender pool count=${existingPhoneNumbers.length} correlation_id=${correlationId}`)
        console.log(`[MessagingService] Current sender pool SIDs=${existingPhoneNumbers.map(pn => pn.sid)} correlation_id=${correlationId}`)
        console.log(`[MessagingService] Current sender pool numbers=${existingPhoneNumbers.map(pn => pn.phoneNumber)} correlation_id=${correlationId}`)
        
        const alreadyAttached = existingPhoneNumbers.some(pn => pn.sid === purchasedPhoneNumberSid)
        
        if (alreadyAttached) {
          console.log(`[MessagingService] Number already attached to Messaging Service, skipping correlation_id=${correlationId}`)
          console.log(`[MessagingService] Verification PASSED (already attached) correlation_id=${correlationId}`)
          messagingServiceAttached = true
        } else {
          // Attach the number to the Messaging Service
          console.log(`[MessagingService] Number not attached, starting attachment correlation_id=${correlationId}`)
          console.log(`[MessagingService] Creating phoneNumberSid=${purchasedPhoneNumberSid} correlation_id=${correlationId}`)
          console.log(`[MessagingService] Twilio API method: client.messaging.v1.services(sid).phoneNumbers.create({phoneNumberSid}) correlation_id=${correlationId}`)
          
          const attachedSender = await client.messaging.v1.services(messagingServiceSid)
            .phoneNumbers
            .create({
              phoneNumberSid: purchasedPhoneNumberSid
            })
          
          console.log(`[MessagingService] Attach response received correlation_id=${correlationId}`)
          console.log(`[MessagingService] Attach response=${JSON.stringify(attachedSender)} correlation_id=${correlationId}`)
          console.log(`[MessagingService] Attached sender SID=${attachedSender.sid} correlation_id=${correlationId}`)
          console.log(`[MessagingService] Attached sender phoneNumber=${attachedSender.phoneNumber} correlation_id=${correlationId}`)
          
          // Verify attachment succeeded
          console.log(`[MessagingService] Verifying attachment correlation_id=${correlationId}`)
          const updatedPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
            .phoneNumbers
            .list({ limit: 100 })
          
          console.log(`[MessagingService] Updated sender pool count=${updatedPhoneNumbers.length} correlation_id=${correlationId}`)
          console.log(`[MessagingService] Updated sender pool SIDs=${updatedPhoneNumbers.map(pn => pn.sid)} correlation_id=${correlationId}`)
          console.log(`[MessagingService] Updated sender pool numbers=${updatedPhoneNumbers.map(pn => pn.phoneNumber)} correlation_id=${correlationId}`)
          
          const isAttached = updatedPhoneNumbers.some(pn => pn.sid === purchasedPhoneNumberSid)
          
          console.log(`[SenderAttach] ========== AFTER ATTACH ========== correlation_id=${correlationId}`)
          console.log(`[SenderAttach] sender pool numbers: ${updatedPhoneNumbers.map(pn => pn.phoneNumber).join(', ')} correlation_id=${correlationId}`)
          console.log(`[SenderAttach] sender pool SIDs: ${updatedPhoneNumbers.map(pn => pn.sid).join(', ')} correlation_id=${correlationId}`)
          console.log(`[SenderAttach] purchased SID in pool: ${isAttached} correlation_id=${correlationId}`)
          
          if (isAttached) {
            console.log(`[SenderAttach] ========== ATTACH VERIFICATION PASSED ========== correlation_id=${correlationId}`)
            console.log(`[MessagingService] Verification PASSED correlation_id=${correlationId}`)
            console.log(`[MessagingService] Canonical SID found in sender pool=${purchasedPhoneNumberSid} correlation_id=${correlationId}`)
            console.log(`[MessagingService] Added to Messaging Service=${purchasedPhoneNumber} correlation_id=${correlationId}`)
            messagingServiceAttached = true
          } else {
            console.error(`[SenderAttach] ========== CRITICAL_SENDER_POOL_ATTACH_MISMATCH ========== correlation_id=${correlationId}`)
            console.error(`[SenderAttach] Expected purchased SID: ${purchasedPhoneNumberSid} correlation_id=${correlationId}`)
            console.error(`[SenderAttach] Actual sender pool SIDs: ${updatedPhoneNumbers.map(pn => pn.sid).join(', ')} correlation_id=${correlationId}`)
            console.error(`[SenderAttach] This indicates stale number was attached or attach failed correlation_id=${correlationId}`)
            
            const errorMsg = 'Attachment succeeded but verification failed'
            console.error(`[MessagingService] Verification FAILED correlation_id=${correlationId}`)
            console.error(`[MessagingService] ERROR=${errorMsg} correlation_id=${correlationId}`)
            console.error(`[MessagingService] Canonical number SID=${purchasedPhoneNumberSid} correlation_id=${correlationId}`)
            console.error(`[MessagingService] Updated pool SIDs=${updatedPhoneNumbers.map(pn => pn.sid)} correlation_id=${correlationId}`)
            console.error(`[MessagingService] Canonical SID in pool?=${updatedPhoneNumbers.some(pn => pn.sid === purchasedPhoneNumberSid)} correlation_id=${correlationId}`)
            messagingServiceError = errorMsg
            
            // Release the purchased number if attachment fails
            console.log(`[MessagingService] Releasing purchased number due to attachment failure correlation_id=${correlationId}`)
            try {
              await client.incomingPhoneNumbers(purchasedPhoneNumberSid).remove()
              console.log(`[MessagingService] Released number=${purchasedPhoneNumber} correlation_id=${correlationId}`)
            } catch (releaseError) {
              console.error(`[MessagingService] Failed to release number correlation_id=${correlationId}`, releaseError)
            }
            
            throw new Error(errorMsg)
          }
        }
      } catch (attachmentError: any) {
        console.error(`[MessagingService] Attach failed correlation_id=${correlationId}`)
        console.error(`[MessagingService] Error message=${attachmentError?.message || 'Unknown error'} correlation_id=${correlationId}`)
        console.error(`[MessagingService] Error code=${attachmentError?.code || 'Unknown code'} correlation_id=${correlationId}`)
        console.error(`[MessagingService] Error status=${attachmentError?.status || 'Unknown status'} correlation_id=${correlationId}`)
        console.error(`[MessagingService] More info=${attachmentError?.moreInfo || 'N/A'} correlation_id=${correlationId}`)
        console.error(`[MessagingService] Full error correlation_id=${correlationId}`, attachmentError)
        
        const errorMsg = attachmentError?.message || 'Unknown attachment error'
        messagingServiceError = errorMsg
        
        // Release the purchased number if attachment fails
        console.log(`[MessagingService] Releasing purchased number due to attachment error correlation_id=${correlationId}`)
        try {
          await client.incomingPhoneNumbers(purchasedPhoneNumberSid).remove()
          console.log(`[MessagingService] Released number=${purchasedPhoneNumber} correlation_id=${correlationId}`)
        } catch (releaseError) {
          console.error(`[MessagingService] Failed to release number correlation_id=${correlationId}`, releaseError)
        }
        
        // Do NOT swallow this error - propagate it
        throw new Error(`Messaging Service attachment failed: ${errorMsg}`)
      }
    } else {
      console.log(`[MessagingService] No Messaging Service SID configured, skipping attachment correlation_id=${correlationId}`)
      console.log(`[MessagingService] WARNING: Number will not be attached to Messaging Service correlation_id=${correlationId}`)
      messagingServiceAttached = true // Not applicable
    }

    console.log(`[Provisioning] FINAL assigned number=${purchasedPhoneNumber} correlation_id=${correlationId}`)
    console.log(`[Provisioning] FINAL assigned number SID=${purchasedPhoneNumberSid} correlation_id=${correlationId}`)
    console.log(`[Provisioning] Messaging Service attached=${messagingServiceAttached} correlation_id=${correlationId}`)
    
    // Final validation: ensure only ONE number was purchased and attached
    if (messagingServiceAttached && messagingServiceSid) {
      console.log(`[Provisioning] Final validation: checking for multiple number purchases correlation_id=${correlationId}`)
      
      try {
        const finalPoolNumbers = await client.messaging.v1.services(messagingServiceSid)
          .phoneNumbers
          .list({ limit: 100 })
        
        console.log(`[Provisioning] Final pool count=${finalPoolNumbers.length} correlation_id=${correlationId}`)
        console.log(`[Provisioning] Final pool numbers=${finalPoolNumbers.map(pn => pn.phoneNumber)} correlation_id=${correlationId}`)
        
        const canonicalInPool = finalPoolNumbers.find(pn => pn.sid === purchasedPhoneNumberSid)
        
        if (!canonicalInPool) {
          console.error(`[Provisioning] CRITICAL ERROR: Canonical number NOT in pool correlation_id=${correlationId}`)
          console.error(`[Provisioning] Canonical number=${purchasedPhoneNumber} correlation_id=${correlationId}`)
          console.error(`[Provisioning] Pool numbers=${finalPoolNumbers.map(pn => pn.phoneNumber)} correlation_id=${correlationId}`)
          
          // Release the purchased number since verification failed
          console.log(`[Provisioning] Releasing number due to verification failure correlation_id=${correlationId}`)
          try {
            await client.incomingPhoneNumbers(purchasedPhoneNumberSid).remove()
            console.log(`[Provisioning] Released number=${purchasedPhoneNumber} correlation_id=${correlationId}`)
          } catch (releaseError) {
            console.error(`[Provisioning] Failed to release number correlation_id=${correlationId}`, releaseError)
          }
          
          throw new Error(`Critical: Canonical number ${purchasedPhoneNumber} not found in Messaging Service pool after provisioning`)
        }
        
        console.log(`[Provisioning] Final validation passed: canonical number in pool correlation_id=${correlationId}`)
      } catch (validationError: any) {
        console.error(`[Provisioning] Final validation failed correlation_id=${correlationId}`, validationError)
        
        // Release the purchased number since verification failed
        console.log(`[Provisioning] Releasing number due to validation error correlation_id=${correlationId}`)
        try {
          await client.incomingPhoneNumbers(purchasedPhoneNumberSid).remove()
          console.log(`[Provisioning] Released number=${purchasedPhoneNumber} correlation_id=${correlationId}`)
        } catch (releaseError) {
          console.error(`[Provisioning] Failed to release number correlation_id=${correlationId}`, releaseError)
        }
        
        throw new Error(`Final validation failed: ${validationError.message}`)
      }
    } else if (!messagingServiceAttached) {
      console.error(`[Provisioning] Messaging Service attachment failed, not returning result correlation_id=${correlationId}`)
      
      // Release the purchased number since attachment failed
      console.log(`[Provisioning] Releasing number due to attachment failure correlation_id=${correlationId}`)
      try {
        await client.incomingPhoneNumbers(purchasedPhoneNumberSid).remove()
        console.log(`[Provisioning] Released number=${purchasedPhoneNumber} correlation_id=${correlationId}`)
      } catch (releaseError) {
        console.error(`[Provisioning] Failed to release number correlation_id=${correlationId}`, releaseError)
      }
      
      return null
    }
    
    console.log(`[Provisioning] STATUS attached correlation_id=${correlationId}`)
    return {
      phoneNumber: purchasedPhoneNumber,
      phoneNumberSid: purchasedPhoneNumberSid,
      messagingServiceAttached,
      messagingServiceError
    }
  } catch (error) {
    console.error(`[Twilio Provisioning] Failed to provision number correlation_id=${correlationId}`, error)
    return null
  }
}

export async function saveProvisionedNumberToBusiness({
  businessId,
  phoneNumber,
  phoneNumberSid,
  messagingServiceSid
}: {
  businessId: string
  phoneNumber: string
  phoneNumberSid: string
  messagingServiceSid: string | null
}): Promise<{ success: boolean; dbNumber: string | null; dbNumberSid: string | null }> {
  console.log('[Provision Path] ========== saveProvisionedNumberToBusiness HIT ==========');
  console.log(`[Provision Path] businessId=${businessId} phoneNumber=${phoneNumber}`);
  
  const correlationId = `SAVE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  console.log(`[saveProvisionedNumber] ========== START ========== correlation_id=${correlationId}`)
  console.log(`[saveProvisionedNumber] business_id=${businessId} correlation_id=${correlationId}`)
  console.log(`[saveProvisionedNumber] INPUT phoneNumber=${phoneNumber} correlation_id=${correlationId}`)
  console.log(`[saveProvisionedNumber] INPUT phoneNumberSid=${phoneNumberSid} correlation_id=${correlationId}`)
  console.log(`[saveProvisionedNumber] INPUT messagingServiceSid=${messagingServiceSid} correlation_id=${correlationId}`)
  
  const updatePayload = {
    twilio_phone_number: phoneNumber,
    twilio_phone_number_sid: phoneNumberSid,
    sms_type: 'a2p_local',
    a2p_status: 'active',
    messaging_status: 'active',
    twilio_messaging_service_sid: messagingServiceSid,
    provisioning_status: 'attached',
    provisioning_error: null,
    provisioned_at: new Date().toISOString()
  }
  
  console.log(`[saveProvisionedNumber] DB UPDATE PAYLOAD twilio_phone_number=${updatePayload.twilio_phone_number} correlation_id=${correlationId}`)
  console.log(`[saveProvisionedNumber] DB UPDATE PAYLOAD twilio_phone_number_sid=${updatePayload.twilio_phone_number_sid} correlation_id=${correlationId}`)
  
  const { data, error } = await supabase
    .from('businesses')
    .update(updatePayload)
    .eq('id', businessId)
    .select('twilio_phone_number, twilio_phone_number_sid')
    .single()
  
  if (error) {
    console.error(`[saveProvisionedNumber] DB UPDATE FAILED correlation_id=${correlationId}`, error)
    console.error(`[saveProvisionedNumber] ========== END FAILED ========== correlation_id=${correlationId}`)
    return { success: false, dbNumber: null, dbNumberSid: null }
  }
  
  console.log(`[saveProvisionedNumber] DB UPDATE SUCCEEDED correlation_id=${correlationId}`)
  console.log(`[saveProvisionedNumber] DB RETURNED twilio_phone_number=${data.twilio_phone_number} correlation_id=${correlationId}`)
  console.log(`[saveProvisionedNumber] DB RETURNED twilio_phone_number_sid=${data.twilio_phone_number_sid} correlation_id=${correlationId}`)
  
  // HARD ASSERTION: DB number must match purchased number
  if (data.twilio_phone_number !== phoneNumber) {
    console.error(`[saveProvisionedNumber] ========== CRITICAL MISMATCH ========== correlation_id=${correlationId}`)
    console.error(`[saveProvisionedNumber] EXPECTED (INPUT) phoneNumber=${phoneNumber} correlation_id=${correlationId}`)
    console.error(`[saveProvisionedNumber] ACTUAL (DB) twilio_phone_number=${data.twilio_phone_number} correlation_id=${correlationId}`)
    console.error(`[saveProvisionedNumber] MISMATCH DETECTED - This indicates stale persistence or overwrite logic! correlation_id=${correlationId}`)
    console.error(`[saveProvisionedNumber] ========== END FAILED ========== correlation_id=${correlationId}`)
    throw new Error(`CRITICAL_PROVISIONING_NUMBER_MISMATCH: Expected ${phoneNumber}, got ${data.twilio_phone_number}`)
  }
  
  if (data.twilio_phone_number_sid !== phoneNumberSid) {
    console.error(`[saveProvisionedNumber] ========== CRITICAL SID MISMATCH ========== correlation_id=${correlationId}`)
    console.error(`[saveProvisionedNumber] EXPECTED (INPUT) phoneNumberSid=${phoneNumberSid} correlation_id=${correlationId}`)
    console.error(`[saveProvisionedNumber] ACTUAL (DB) twilio_phone_number_sid=${data.twilio_phone_number_sid} correlation_id=${correlationId}`)
    console.error(`[saveProvisionedNumber] MISMATCH DETECTED - This indicates stale persistence or overwrite logic! correlation_id=${correlationId}`)
    console.error(`[saveProvisionedNumber] ========== END FAILED ========== correlation_id=${correlationId}`)
    throw new Error(`CRITICAL_PROVISIONING_SID_MISMATCH: Expected ${phoneNumberSid}, got ${data.twilio_phone_number_sid}`)
  }
  
  console.log(`[saveProvisionedNumber] ========== HARD ASSERTION PASSED ========== correlation_id=${correlationId}`)
  console.log(`[saveProvisionedNumber] DB number matches purchased number correlation_id=${correlationId}`)
  console.log(`[saveProvisionedNumber] ========== END SUCCESS ========== correlation_id=${correlationId}`)
  
  // Trigger background warm number replenishment after successful assignment
  // This maintains a pool of available warm numbers for future signups
  try {
    const { triggerBackgroundReplenishment } = await import('@/lib/warm-number-manager')
    await triggerBackgroundReplenishment()
    console.log(`[saveProvisionedNumber] Triggered background warm number replenishment correlation_id=${correlationId}`)
  } catch (error) {
    // Don't fail the provisioning if replenishment trigger fails
    console.error('[Warm Inventory] replenish failed', error)
    console.warn(`[saveProvisionedNumber] Failed to trigger background replenishment correlation_id=${correlationId}`, error)
  }
  
  return { 
    success: true, 
    dbNumber: data.twilio_phone_number, 
    dbNumberSid: data.twilio_phone_number_sid 
  }
}

export async function repairProvisioningForBusiness(businessId: string): Promise<boolean> {
  console.log('[Provision Path] ========== repairProvisioningForBusiness HIT ==========');
  console.log(`[Provision Path] businessId=${businessId}`);
  
  const correlationId = `REPAIR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  console.log(`[RepairProvisioning] START business_id=${businessId} correlation_id=${correlationId}`)
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MGe422ac34a7a2b70a646e2084110e54d3'
  
  if (!accountSid || !authToken) {
    console.error(`[RepairProvisioning] Credentials missing correlation_id=${correlationId}`)
    return false
  }
  
  try {
    const client = Twilio(accountSid, authToken)
    
    // Fetch business details
    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid, provisioning_status, provisioning_error')
      .eq('id', businessId)
      .single()
    
    if (businessError || !business) {
      console.error(`[RepairProvisioning] Business not found correlation_id=${correlationId}`, businessError)
      return false
    }
    
    console.log(`[RepairProvisioning] Business twilio_phone_number=${business.twilio_phone_number} correlation_id=${correlationId}`)
    console.log(`[RepairProvisioning] Business twilio_phone_number_sid=${business.twilio_phone_number_sid} correlation_id=${correlationId}`)
    console.log(`[RepairProvisioning] Business provisioning_status=${business.provisioning_status} correlation_id=${correlationId}`)
    
    // Check if business has a number SID
    if (!business.twilio_phone_number_sid) {
      console.error(`[RepairProvisioning] No number SID found, cannot repair correlation_id=${correlationId}`)
      return false
    }
    
    // Verify the number exists in Twilio
    console.log(`[RepairProvisioning] Verifying number exists in Twilio correlation_id=${correlationId}`)
    try {
      await client.incomingPhoneNumbers(business.twilio_phone_number_sid).fetch()
      console.log(`[RepairProvisioning] Number exists in Twilio correlation_id=${correlationId}`)
    } catch (twilioError) {
      console.error(`[RepairProvisioning] Number not found in Twilio correlation_id=${correlationId}`, twilioError)
      // Number doesn't exist, need full provisioning
      return false
    }
    
    // Check if number is in sender pool
    console.log(`[RepairProvisioning] Checking sender pool membership correlation_id=${correlationId}`)
    const senderPool = await client.messaging.v1.services(messagingServiceSid)
      .phoneNumbers
      .list({ limit: 100 })
    
    const numberInPool = senderPool.find(pn => pn.sid === business.twilio_phone_number_sid)
    
    if (numberInPool) {
      console.log(`[RepairProvisioning] Number already in sender pool correlation_id=${correlationId}`)
      console.log(`[RepairProvisioning] Updating provisioning_status to attached correlation_id=${correlationId}`)
      
      await supabase
        .from('businesses')
        .update({
          provisioning_status: 'attached',
          provisioning_error: null
        })
        .eq('id', businessId)
      
      console.log(`[RepairProvisioning] Repair complete - status=attached correlation_id=${correlationId}`)
      return true
    }
    
    // Number not in pool, attach it
    // DISABLED: This repair logic was potentially attaching stale numbers to sender pool
    // Only provisionTwilioNumber() should attach numbers to sender pool
    console.log(`[RepairProvisioning] Number not in pool - SKIPPING attach to prevent stale number attachment correlation_id=${correlationId}`)
    console.log(`[RepairProvisioning] Only provisionTwilioNumber() should attach numbers to sender pool correlation_id=${correlationId}`)
    console.log(`[RepairProvisioning] This prevents stale persistence/overwrite logic from attaching wrong numbers correlation_id=${correlationId}`)
    
    // Mark as failed instead of attempting attach
    console.log(`[RepairProvisioning] Marking provisioning_status as failed correlation_id=${correlationId}`)
    
    await supabase
      .from('businesses')
      .update({
        provisioning_status: 'failed',
        provisioning_error: 'Number not in sender pool - re-provisioning required'
      })
      .eq('id', businessId)

    console.log(`[RepairProvisioning] Repair complete - status=failed (re-provisioning required) correlation_id=${correlationId}`)
    return false
  } catch (error) {
    console.error(`[RepairProvisioning] Repair failed correlation_id=${correlationId}`, error)
    return false
  }
}

/**
 * Send system SMS from a dedicated ReplyFlow system sender
 * This is used for offboarding/account-level SMS to avoid race conditions
 * where the business's ReplyFlow number is being reserved/released
 */
export async function sendSystemSms(
  to: string,
  message: string,
  options?: {
    businessId?: string;
    businessPhoneNumber?: string;
    messageType?: string;
    confirmationUrl?: string;
  }
): Promise<{ sid: string | null; messageId: string | null }> {
  console.log('[SYSTEM SMS] Sending system SMS', {
    to,
    messageType: options?.messageType,
    confirmationUrlPresent: !!options?.confirmationUrl,
    businessId: options?.businessId,
  });

  // Validate environment variables
  const systemNumber = process.env.REPLYFLOW_SYSTEM_SMS_NUMBER;
  const systemMessagingServiceSid = process.env.REPLYFLOW_SYSTEM_MESSAGING_SERVICE_SID;

  if (!systemNumber && !systemMessagingServiceSid) {
    const error = 'REPLYFLOW_SYSTEM_SMS_NUMBER or REPLYFLOW_SYSTEM_MESSAGING_SERVICE_SID is required for system SMS';
    
    if (process.env.NODE_ENV === 'production') {
      console.error('[SYSTEM SMS] Missing required environment variable:', error);
      throw new Error(error);
    } else {
      console.warn('[SYSTEM SMS] Missing required environment variable in development:', error);
      // In development, allow fallback to business number for testing
      console.warn('[SYSTEM SMS] Falling back to business number for development testing');
      return { sid: null, messageId: null };
    }
  }

  // Validate Twilio client
  if (!twilioClient) {
    console.error('[SYSTEM SMS] Twilio client not initialized');
    throw new Error('Twilio client not initialized');
  }

  try {
    const twilioParams: any = {
      to,
      body: message,
    };

    // Prefer messaging service over specific number
    if (systemMessagingServiceSid) {
      twilioParams.messagingServiceSid = systemMessagingServiceSid;
      console.log('[SYSTEM SMS] Using system messaging service:', systemMessagingServiceSid);
    } else if (systemNumber) {
      twilioParams.from = systemNumber;
      console.log('[SYSTEM SMS] Using system phone number:', systemNumber);
    }

    const twilioMessage = await twilioClient.messages.create(twilioParams);

    console.log('[SYSTEM SMS] Twilio message sent successfully', {
      sid: twilioMessage.sid,
      to,
      status: twilioMessage.status,
    });

    // Optionally log to system_sms table (graceful if table doesn't exist)
    if (options?.businessId) {
      try {
        await supabase
          .from('system_sms')
          .insert({
            business_id: options.businessId,
            to_phone: to,
            from_phone: systemNumber || systemMessagingServiceSid,
            body: message,
            twilio_message_sid: twilioMessage.sid,
            status: twilioMessage.status,
            message_type: options.messageType || 'system',
            created_at: new Date().toISOString(),
          });
        console.log('[SYSTEM SMS] Logged to system_sms table');
      } catch (error) {
        console.warn('[SYSTEM SMS] system_sms table not found or insert failed - skipping optional logging');
      }
    }

    return { sid: twilioMessage.sid, messageId: null };
  } catch (error) {
    console.error('[SYSTEM SMS] Failed to send system SMS:', error);
    throw error;
  }
}
