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
    console.error('[SMS Sender] Twilio validation failed:', smsValidation.error);
    // Still log the failed attempt
    await logFailedMessage(business, to, message, options, smsValidation.error || 'Twilio validation failed');
    return null;
  }

  console.log('[SMS Sender] business_id:', business.id);
  console.log('[SMS Sender] business twilio_phone_number:', business.twilio_phone_number);
  console.log('[SMS Sender] business twilio_phone_number_sid:', business.twilio_phone_number_sid);
  console.log('[SMS Sender] provisioning_status:', business.provisioning_status);

  // Verify business has a canonical number and it's attached
  if (!business.twilio_phone_number || !business.twilio_phone_number_sid) {
    console.error('[SMS Sender] No canonical Twilio number assigned to business');
    await logFailedMessage(business, to, message, options, 'No Twilio number assigned to business');
    return null;
  }

  if (business.provisioning_status !== 'attached') {
    console.error('[SMS Sender] Business number is not attached to Messaging Service');
    console.error('[SMS Sender] provisioning_status:', business.provisioning_status);
    await logFailedMessage(business, to, message, options, 'ReplyFlow number is still provisioning. Try again shortly.');
    return null;
  }

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
    
    console.log('[SMS Sender] Verifying sender pool membership for SID:', business.twilio_phone_number_sid);
    
    // Verify the business's number is in the Messaging Service sender pool
    if (globalMessagingServiceSid) {
      try {
        const senderPool = await client.messaging.v1.services(globalMessagingServiceSid)
          .phoneNumbers
          .list({ limit: 100 });
        
        const numberInPool = senderPool.find(pn => pn.sid === business.twilio_phone_number_sid);
        
        if (numberInPool) {
          console.log('[SMS Sender] sender pool verification passed - number found in pool');
          console.log('[SMS Sender] final from number:', business.twilio_phone_number);
          console.log('[SMS Sender] final messagingServiceSid:', globalMessagingServiceSid);
          
          // Use Messaging Service with business's canonical number
          messageResult = await client.messages.create({
            body: message,
            to,
            messagingServiceSid: globalMessagingServiceSid,
            statusCallback: statusCallbackUrl,
          });
        } else {
          console.error('[SMS Sender] sender pool verification failed - number not in pool');
          console.error('[SMS Sender] Pool SIDs:', senderPool.map(pn => pn.sid));
          console.error('[SMS Sender] Business SID:', business.twilio_phone_number_sid);
          errorMessage = 'Business number not found in Messaging Service sender pool';
          await logFailedMessage(business, to, message, options, errorMessage);
          
          // Trigger repair provisioning
          console.log('[SMS Sender] Triggering repair provisioning for business:', business.id);
          try {
            await fetch('/api/business/trigger-provisioning', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ business_id: business.id })
            });
          } catch (repairError) {
            console.error('[SMS Sender] Failed to trigger repair:', repairError);
          }
          
          return null;
        }
      } catch (poolError) {
        console.error('[SMS Sender] Error checking sender pool:', poolError);
        errorMessage = 'Failed to verify sender pool membership';
        await logFailedMessage(business, to, message, options, errorMessage);
        return null;
      }
    } else {
      // No Messaging Service configured - use direct from with business number
      console.warn('[SMS Sender] WARNING: No Messaging Service SID configured, using direct from');
      console.log('[SMS Sender] final from number:', business.twilio_phone_number);
      console.log('[SMS Sender] final messagingServiceSid: null (direct from)');
      
      messageResult = await client.messages.create({
        body: message,
        to,
        from: business.twilio_phone_number,
        statusCallback: statusCallbackUrl,
      });
    }

    console.log('[SMS] SMS sent successfully:', { 
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
  console.log(`[Provisioning] TWILIO_MESSAGING_SERVICE_SID env var=${process.env.TWILIO_MESSAGING_SERVICE_SID} correlation_id=${correlationId}`)
  console.log(`[Provisioning] Using Messaging Service=${messagingServiceSid} correlation_id=${correlationId}`)
  
  if (!accountSid || !authToken) {
    console.error(`[Provisioning] Credentials missing correlation_id=${correlationId}`)
    return null
  }

  console.log(`[Twilio] Active account SID=${accountSid} correlation_id=${correlationId}`)
  console.log(`[Twilio] Purchasing number under account=${accountSid} correlation_id=${correlationId}`)

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
          
          if (isAttached) {
            console.log(`[MessagingService] Verification PASSED correlation_id=${correlationId}`)
            console.log(`[MessagingService] Canonical SID found in sender pool=${purchasedPhoneNumberSid} correlation_id=${correlationId}`)
            console.log(`[MessagingService] Added to Messaging Service=${purchasedPhoneNumber} correlation_id=${correlationId}`)
            messagingServiceAttached = true
          } else {
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

export async function repairProvisioningForBusiness(businessId: string): Promise<boolean> {
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
    console.log(`[RepairProvisioning] Number not in pool, attaching correlation_id=${correlationId}`)
    console.log(`[RepairProvisioning] Messaging Service SID=${messagingServiceSid} correlation_id=${correlationId}`)
    console.log(`[RepairProvisioning] PhoneNumber SID=${business.twilio_phone_number_sid} correlation_id=${correlationId}`)
    
    try {
      await client.messaging.v1.services(messagingServiceSid)
        .phoneNumbers
        .create({
          phoneNumberSid: business.twilio_phone_number_sid
        })
      
      console.log(`[RepairProvisioning] Attached to Messaging Service correlation_id=${correlationId}`)
      
      // Verify attachment
      const updatedPool = await client.messaging.v1.services(messagingServiceSid)
        .phoneNumbers
        .list({ limit: 100 })
      
      const isAttached = updatedPool.some(pn => pn.sid === business.twilio_phone_number_sid)
      
      if (isAttached) {
        console.log(`[RepairProvisioning] Verification passed - number in pool correlation_id=${correlationId}`)
        console.log(`[RepairProvisioning] Updating provisioning_status to attached correlation_id=${correlationId}`)
        
        await supabase
          .from('businesses')
          .update({
            provisioning_status: 'attached',
            provisioning_error: null,
            provisioned_at: new Date().toISOString()
          })
          .eq('id', businessId)
        
        console.log(`[RepairProvisioning] Repair complete - status=attached correlation_id=${correlationId}`)
        return true
      } else {
        console.error(`[RepairProvisioning] Verification failed - number not in pool after attach correlation_id=${correlationId}`)
        
        await supabase
          .from('businesses')
          .update({
            provisioning_status: 'failed',
            provisioning_error: 'Repair failed - number not in pool after attach'
          })
          .eq('id', businessId)
        
        return false
      }
    } catch (attachError) {
      console.error(`[RepairProvisioning] Attach failed correlation_id=${correlationId}`, attachError)
      
      await supabase
        .from('businesses')
        .update({
          provisioning_status: 'failed',
          provisioning_error: attachError instanceof Error ? attachError.message : 'Unknown attach error'
        })
        .eq('id', businessId)
      
      return false
    }
  } catch (error) {
    console.error(`[RepairProvisioning] Repair failed correlation_id=${correlationId}`, error)
    return false
  }
}
