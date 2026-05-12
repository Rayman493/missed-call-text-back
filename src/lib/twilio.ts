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

  console.log('[sms] outbound message queued:', {
    business_id: business.id,
    business_phone: business.twilio_phone_number,
    business_phone_sid: business.twilio_phone_number_sid,
    provisioning_status: business.provisioning_status,
    to_phone: to,
    message_body: message.substring(0, 50) + '...',
    lead_id: options?.lead_id,
    conversation_id: options?.conversation_id
  });

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
          console.log('[sms] sender pool verification passed');
          console.log('[sms] using messaging service:', globalMessagingServiceSid);
          
          // Use Messaging Service with business's canonical number
          messageResult = await client.messages.create({
            body: message,
            to,
            messagingServiceSid: globalMessagingServiceSid,
            statusCallback: statusCallbackUrl,
          });
        } else {
          console.error('[sms] sender pool verification failed');
          console.error('[sms] pool sids:', senderPool.map(pn => pn.sid));
          console.error('[sms] business sid:', business.twilio_phone_number_sid);
          errorMessage = 'Business number not found in Messaging Service sender pool';
          await logFailedMessage(business, to, message, options, errorMessage);
          
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
      console.warn('[sms] warning: no messaging service configured, using direct from');
      console.log('[sms] final from number:', business.twilio_phone_number);
      
      messageResult = await client.messages.create({
        body: message,
        to,
        from: business.twilio_phone_number,
        statusCallback: statusCallbackUrl,
      });
    }

    console.log('[sms] twilio accepted message:', {
      business_id: business.id,
      to,
      message_sid: messageResult.sid,
      status: messageResult.status,
      lead_id: options?.lead_id,
      conversation_id: options?.conversation_id
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
        status: 'sent', // Twilio accepted it
        sent_at: new Date().toISOString(),
        status_updated_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[sms] message insert failed:', {
        message_sid: messageResult.sid,
        lead_id: options?.lead_id,
        conversation_id: options?.conversation_id,
        error: insertError
      });
    } else {
      console.log('[sms] message inserted successfully:', {
        message_sid: messageResult.sid,
        lead_id: options?.lead_id,
        conversation_id: options?.conversation_id
      });
    }

    return messageResult.sid
  } catch (error: any) {
    console.error('[sms] twilio send failed:', {
      business_id: business.id,
      to,
      lead_id: options?.lead_id,
      conversation_id: options?.conversation_id,
      error_code: error?.code,
      error_message: error?.message,
      error_status: error?.status,
      more_info: error?.moreInfo
    });
    
    // Extract error details for logging
    errorCode = error?.code || 'UNKNOWN';
    errorMessage = error?.message || 'Unknown error occurred';
    
    // Log specific Twilio error codes for debugging
    if (error?.code) {
      console.error('[sms] twilio error code:', error?.code, '- common issues:');
      switch (error?.code) {
        case 21614:
          console.error('[sms] - to number is not a valid mobile number');
          break;
        case 21612:
          console.error('[sms] - from number not enabled for sms');
          break;
        case 21610:
          console.error('[sms] - attempt to send to unsubscribed recipient');
          break;
        case 21611:
          console.error('[sms] - message cannot be sent to the to number');
          break;
        case 21408:
          console.error('[sms] - permission to send an sms has not been enabled');
          break;
        case 30001:
          console.error('[sms] - queue overflow');
          break;
        case 30002:
          console.error('[sms] - account suspended');
          break;
        default:
          console.error('[sms] - unknown twilio error code');
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
    console.log('[sms] logging failed message:', {
      business_id: business.id,
      to,
      lead_id: options?.lead_id,
      conversation_id: options?.conversation_id,
      error_message: errorMessage,
      error_code: errorCode
    });
    
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
        failed_at: new Date().toISOString(),
        status_updated_at: new Date().toISOString(),
        error_message: errorMessage || 'Failed to send SMS',
        error_code: errorCode || 'UNKNOWN',
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[sms] failed message insert error:', {
        business_id: business.id,
        lead_id: options?.lead_id,
        conversation_id: options?.conversation_id,
        error: insertError
      });
    } else {
      console.log('[sms] failed message logged successfully');
    }
  } catch (logError) {
    console.error('[sms] error logging failed message:', logError);
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
} | null> {
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
  
  return { 
    success: true, 
    dbNumber: data.twilio_phone_number, 
    dbNumberSid: data.twilio_phone_number_sid 
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
