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
  console.log('[SMS] Voice forwarding number for business:', business.twilio_phone_number);
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
    
    // Priority 1: Use global messaging service SID if available (10DLC ready)
    if (globalMessagingServiceSid) {
      console.log('[SMS] Using global Messaging Service:', globalMessagingServiceSid);
      sendMethod = 'global-messaging-service';
      messageResult = await client.messages.create({
        body: message,
        to,
        messagingServiceSid: globalMessagingServiceSid,
        statusCallback: statusCallbackUrl,
      });
    } 
    // Priority 2: Use business-specific messaging service SID
    else if (business.twilio_messaging_service_sid) {
      console.log('[SMS] Using business messaging service:', business.twilio_messaging_service_sid);
      sendMethod = 'business-messaging-service';
      messageResult = await client.messages.create({
        body: message,
        to,
        messagingServiceSid: business.twilio_messaging_service_sid,
        statusCallback: statusCallbackUrl,
      });
    } 
    // Priority 3: Fallback to phone number (not 10DLC ready)
    else if (business.twilio_phone_number) {
      console.log('[SMS] Using phone number fallback:', business.twilio_phone_number);
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

export async function provisionTwilioNumber(businessId: string): Promise<{ phoneNumber: string; phoneNumberSid: string } | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    console.error('[Twilio Provisioning] Credentials missing');
    return null
  }

  // HARD ENFORCEMENT: Use centralized assignment helper
  try {
    // Import the centralized assignment helper
    const { getAssignedTwilioNumber, isSharedModeEnabled } = require('./twilio-assignment')
    
    if (isSharedModeEnabled()) {
      console.log('[Twilio Provisioning] Shared mode enabled - using shared number only')
      const assignment = getAssignedTwilioNumber()
      return {
        phoneNumber: assignment.phoneNumber,
        phoneNumberSid: 'SHARED_MODE' // No SID needed for shared number
      }
    }
  } catch (error) {
    console.error('[Twilio Provisioning] Assignment helper failed:', error)
    // Fallback to shared number if helper fails
    console.log('[Twilio Provisioning] Fallback to shared number')
    return {
      phoneNumber: '+18336584303',
      phoneNumberSid: 'SHARED_MODE'
    }
  }

  console.error('[Twilio Provisioning] Shared mode is disabled - unique number provisioning not implemented')
  console.error('[Twilio Provisioning] Set USE_SHARED_TWILIO_NUMBER=true to enable shared mode')
  return null
}
