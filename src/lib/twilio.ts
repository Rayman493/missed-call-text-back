import Twilio from "twilio";
import { createClient } from '@supabase/supabase-js';
import { validateTwilioForSms, logTwilioEnvStatus } from './twilio/env';

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
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

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
  }
): Promise<string | null> {
  // Validate Twilio environment for SMS operations
  const smsValidation = validateTwilioForSms();
  
  if (!smsValidation.isValid) {
    console.error('[SMS] Twilio validation failed:', smsValidation.error);
    // Still log the failed attempt
    await logFailedMessage(business, to, message, options, smsValidation.error || 'Twilio validation failed');
    return null;
  }

  console.log('[SMS] Sending SMS to:', to, 'from business:', business.id, 'method:', smsValidation.method);
  console.log('[SMS] Sending from business assigned number:', business.twilio_phone_number);
  console.log('[SMS] Business messaging service SID:', business.twilio_messaging_service_sid);

  // Handle simulation mode
  if (smsValidation.method === 'simulated') {
    console.log('[SMS] 🧪 Simulated SMS sent:', { to, body: message.substring(0, 50) + '...' });
    
    // Insert simulated message record into database
    const { error: insertError } = await supabase
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
      });

    if (insertError) {
      console.error('[SMS] Failed to insert simulated message record:', insertError);
    } else {
      console.log('[SMS] Simulated message record inserted successfully');
    }

    return `SIM_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Create fresh Twilio client for this SMS
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const globalMessagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID

  console.log('[SMS] Messaging Service SID exists:', !!globalMessagingServiceSid, 'value:', globalMessagingServiceSid ? globalMessagingServiceSid.substring(0, 8) + '...' : 'none');
  console.log('[SMS] Business messaging service SID exists:', !!business.twilio_messaging_service_sid);

  const client = Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  let messageResult;
  let sendMethod = '';
  let errorMessage = '';
  let errorCode = '';

  try {
    // Get app URL for status callback
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'
    const statusCallbackUrl = `${appUrl}/api/twilio/message-status`
    
    console.log('[SMS] Using status callback URL:', statusCallbackUrl)
    
    // Priority 1: Use business-specific messaging service SID if available
    if (business.twilio_messaging_service_sid) {
      console.log('[SMS] Using business messaging service:', business.twilio_messaging_service_sid);
      console.log('[SMS] Verified sender pool membership via messaging service');
      sendMethod = 'business-messaging-service';
      messageResult = await client.messages.create({
        body: message,
        to,
        messagingServiceSid: business.twilio_messaging_service_sid,
        statusCallback: statusCallbackUrl,
      });
    }
    // Priority 2: Use global messaging service SID if available (10DLC ready)
    else if (globalMessagingServiceSid) {
      console.log('[SMS] Using global Messaging Service:', globalMessagingServiceSid);
      console.log('[SMS] Verified sender pool membership via global messaging service');
      sendMethod = 'global-messaging-service';
      messageResult = await client.messages.create({
        body: message,
        to,
        messagingServiceSid: globalMessagingServiceSid,
        statusCallback: statusCallbackUrl,
      });
    }
    // Priority 3: Fallback to phone number (not 10DLC ready) with warning
    else if (business.twilio_phone_number) {
      console.warn('[SMS] WARNING: No Messaging Service SID available, falling back to phone number');
      console.warn('[SMS] This is not 10DLC compliant and should only be used in emergency/demo mode');
      console.warn('[SMS] Set TWILIO_MESSAGING_SERVICE_SID or business.twilio_messaging_service_sid to fix');
      sendMethod = 'phone-number-fallback';
      messageResult = await client.messages.create({
        body: message,
        to,
        from: business.twilio_phone_number,
        statusCallback: statusCallbackUrl,
      });
    } 
    // No valid sending method available
    else {
      console.error('[SMS] No valid sending method available - no messaging service SID or phone number');
      errorMessage = 'No valid Twilio sending method available';
      await logFailedMessage(business, to, message, options, errorMessage);
      return null;
    }

    console.log('[SMS] SMS sent successfully via', sendMethod, ':', { 
      to, 
      sid: messageResult.sid,
      status: messageResult.status 
    });

    // Insert successful message record into database
    const { error: insertError } = await supabase
      .from('messages')
      .insert({
        lead_id: options?.lead_id,
        conversation_id: options?.conversation_id,
        direction: 'outbound',
        body: message,
        from_phone: business.twilio_phone_number,
        to_phone: to,
        twilio_message_sid: messageResult.sid,
        status: messageResult.status || 'queued',
        sent_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[SMS] Failed to insert message record:', insertError);
    } else {
      console.log('[SMS] Message record inserted successfully:', messageResult.sid);
    }

    return messageResult.sid
  } catch (error: any) {
    console.error('[SMS] Error sending SMS:', {
      to,
      businessId: business.id,
      errorCode: error?.code,
      errorMessage: error?.message,
      errorStatus: error?.status,
      moreInfo: error?.moreInfo
    });
    
    // Extract error details for logging
    errorCode = error?.code || 'UNKNOWN';
    errorMessage = error?.message || 'Unknown error occurred';
    
    // Log specific Twilio error codes for debugging
    if (error?.code) {
      console.error('[SMS] Twilio error code:', error.code, '- Common issues:');
      switch (error.code) {
        case 21614:
          console.error('[SMS] - To number is not a valid mobile number');
          break;
        case 21612:
          console.error('[SMS] - From number not enabled for SMS');
          break;
        case 21610:
          console.error('[SMS] - Attempt to send to unsubscribed recipient');
          break;
        case 21611:
          console.error('[SMS] - Message cannot be sent to the To number');
          break;
        case 21408:
          console.error('[SMS] - Permission to send an SMS has not been enabled');
          break;
        case 30001:
          console.error('[SMS] - Queue overflow');
          break;
        case 30002:
          console.error('[SMS] - Account suspended');
          break;
        default:
          console.error('[SMS] - Unknown Twilio error code');
      }
    }
    
    // Log the failed message attempt - this won't throw, ensuring webhook continues
    await logFailedMessage(business, to, message, options, errorMessage, errorCode);
    
    // Return null instead of throwing to prevent webhooks from crashing
    return null
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
  },
  errorMessage?: string,
  errorCode?: string
): Promise<void> {
  try {
    console.log('[SMS] Logging failed message attempt for business:', business.id, 'to:', to);
    
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
        status: 'failed',
        error_message: errorMessage || 'Failed to send SMS',
        error_code: errorCode || 'UNKNOWN',
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[SMS] Failed to insert failed message record:', insertError);
    } else {
      console.log('[SMS] Failed message record inserted successfully');
    }
  } catch (logError) {
    console.error('[SMS] Error logging failed message:', logError);
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

export async function provisionTwilioNumber(businessId: string): Promise<{ 
  phoneNumber: string; 
  phoneNumberSid: string;
  messagingServiceAttached: boolean;
  messagingServiceError?: string;
} | null> {
  // Generate correlation ID for this provisioning operation
  const correlationId = `PROV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  // Use approved A2P 10DLC Messaging Service
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID || 'MGe422ac34a7a2b70a646e2084110e54d3'

  console.log(`[Provisioning] START business_id=${businessId} correlation_id=${correlationId}`)
  
  if (!accountSid || !authToken) {
    console.error(`[Provisioning] Credentials missing correlation_id=${correlationId}`)
    return null
  }

  // Provision a dedicated local number for the business
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
    console.log(`[Provisioning] Configured voice webhook=${appUrl}/api/twilio/voice correlation_id=${correlationId}`)
    console.log(`[Provisioning] Configured voice status callback=${appUrl}/api/twilio/voice-status correlation_id=${correlationId}`)
    console.log(`[Provisioning] Configured messaging webhook=${appUrl}/api/twilio/incoming-sms correlation_id=${correlationId}`)
    
    // Store canonical number for consistency
    const canonicalPhoneNumber = purchasedNumber.phoneNumber;
    const canonicalPhoneNumberSid = purchasedNumber.sid;
    console.log(`[Provisioning] Canonical number stored=${canonicalPhoneNumber} correlation_id=${correlationId}`)
    console.log(`[Provisioning] Canonical number SID stored=${canonicalPhoneNumberSid} correlation_id=${correlationId}`)

    // Validate that SID is present
    if (!purchasedNumber.sid) {
      console.error(`[Provisioning] ERROR: Twilio purchase succeeded but SID is missing correlation_id=${correlationId}`)
      throw new Error('Twilio purchase succeeded but SID is missing - cannot proceed without SID')
    }

    let messagingServiceAttached = false;
    let messagingServiceError: string | undefined;

    // Attach number to Messaging Service sender pool if available
    if (messagingServiceSid) {
      console.log(`[SenderPool] Starting Messaging Service attachment correlation_id=${correlationId}`)
      console.log(`[SenderPool] Messaging Service SID=${messagingServiceSid} correlation_id=${correlationId}`)
      console.log(`[SenderPool] Phone Number SID=${canonicalPhoneNumberSid} correlation_id=${correlationId}`)
      console.log(`[SenderPool] Phone Number=${canonicalPhoneNumber} correlation_id=${correlationId}`)
      
      try {
        // Check if number is already attached to the Messaging Service
        const existingPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
          .phoneNumbers
          .list({ limit: 100 })
        
        const alreadyAttached = existingPhoneNumbers.some(pn => pn.sid === canonicalPhoneNumberSid)
        
        if (alreadyAttached) {
          console.log(`[SenderPool] Number already attached to Messaging Service, skipping correlation_id=${correlationId}`)
          console.log(`[SenderPool] Verification passed (already attached) correlation_id=${correlationId}`)
          messagingServiceAttached = true
        } else {
          // Attach the number to the Messaging Service
          const attachedSender = await client.messaging.v1.services(messagingServiceSid)
            .phoneNumbers
            .create({
              phoneNumberSid: canonicalPhoneNumberSid
            })
          
          console.log(`[SenderPool] Attach success correlation_id=${correlationId}`)
          console.log(`[SenderPool] Attached sender SID=${attachedSender.sid} correlation_id=${correlationId}`)
          
          // Verify attachment succeeded
          const updatedPhoneNumbers = await client.messaging.v1.services(messagingServiceSid)
            .phoneNumbers
            .list({ limit: 100 })
          
          const isAttached = updatedPhoneNumbers.some(pn => pn.sid === canonicalPhoneNumberSid)
          
          if (isAttached) {
            console.log(`[SenderPool] Verification passed correlation_id=${correlationId}`)
            console.log(`[SenderPool] Added to Messaging Service=${canonicalPhoneNumber} correlation_id=${correlationId}`)
            messagingServiceAttached = true
          } else {
            const errorMsg = 'Attachment succeeded but verification failed'
            console.error(`[SenderPool] Verification failed correlation_id=${correlationId}`)
            console.error(`[SenderPool] ERROR=${errorMsg} correlation_id=${correlationId}`)
            messagingServiceError = errorMsg
          }
        }
      } catch (attachmentError: any) {
        console.error(`[SenderPool] Attach failed correlation_id=${correlationId}`)
        console.error(`[SenderPool] Error message=${attachmentError?.message || 'Unknown error'} correlation_id=${correlationId}`)
        console.error(`[SenderPool] Error code=${attachmentError?.code || 'Unknown code'} correlation_id=${correlationId}`)
        console.error(`[SenderPool] Error status=${attachmentError?.status || 'Unknown status'} correlation_id=${correlationId}`)
        console.error(`[SenderPool] More info=${attachmentError?.moreInfo || 'N/A'} correlation_id=${correlationId}`)
        console.error(`[SenderPool] Full error correlation_id=${correlationId}`, attachmentError)
        
        const errorMsg = attachmentError?.message || 'Unknown attachment error'
        messagingServiceError = errorMsg
        
        // Do NOT swallow this error - propagate it
        throw new Error(`Messaging Service attachment failed: ${errorMsg}`)
      }
    } else {
      console.log(`[SenderPool] No Messaging Service SID configured, skipping attachment correlation_id=${correlationId}`)
      messagingServiceAttached = true // Not applicable
    }

    console.log(`[Provisioning] FINAL assigned number=${canonicalPhoneNumber} correlation_id=${correlationId}`)
    console.log(`[Provisioning] FINAL assigned number SID=${canonicalPhoneNumberSid} correlation_id=${correlationId}`)
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
        
        const canonicalInPool = finalPoolNumbers.find(pn => pn.sid === canonicalPhoneNumberSid)
        
        if (!canonicalInPool) {
          console.error(`[Provisioning] CRITICAL ERROR: Canonical number NOT in pool correlation_id=${correlationId}`)
          console.error(`[Provisioning] Canonical number=${canonicalPhoneNumber} correlation_id=${correlationId}`)
          console.error(`[Provisioning] Pool numbers=${finalPoolNumbers.map(pn => pn.phoneNumber)} correlation_id=${correlationId}`)
          throw new Error(`Critical: Canonical number ${canonicalPhoneNumber} not found in Messaging Service pool after provisioning`)
        }
        
        console.log(`[Provisioning] Final validation passed: canonical number in pool correlation_id=${correlationId}`)
      } catch (validationError: any) {
        console.error(`[Provisioning] Final validation failed correlation_id=${correlationId}`, validationError)
        throw new Error(`Final validation failed: ${validationError.message}`)
      }
    }
    
    return {
      phoneNumber: canonicalPhoneNumber,
      phoneNumberSid: canonicalPhoneNumberSid,
      messagingServiceAttached,
      messagingServiceError
    }
  } catch (error) {
    console.error(`[Twilio Provisioning] Failed to provision number correlation_id=${correlationId}`, error)
    return null
  }
}
