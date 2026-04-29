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
    // Priority 1: Use global messaging service SID if available (10DLC ready)
    if (globalMessagingServiceSid) {
      console.log('[SMS] Using global Messaging Service:', globalMessagingServiceSid);
      sendMethod = 'global-messaging-service';
      messageResult = await client.messages.create({
        body: message,
        to,
        messagingServiceSid: globalMessagingServiceSid,
        statusCallback: "https://replyflowhq.com/api/twilio/status",
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
        statusCallback: "https://replyflowhq.com/api/twilio/status",
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
        statusCallback: "https://replyflowhq.com/api/twilio/status",
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

  const client = Twilio(accountSid, authToken);

  try {
    // Idempotency check: Verify both twilio_phone_number and twilio_phone_number_sid exist
    const { data: business } = await supabase
      .from('businesses')
      .select('id, twilio_phone_number, twilio_phone_number_sid')
      .eq('id', businessId)
      .single();

    if (business && business.twilio_phone_number && business.twilio_phone_number_sid) {
      console.log('[Twilio Provisioning] Business already has valid Twilio number and SID, skipping provisioning');
      return {
        phoneNumber: business.twilio_phone_number,
        phoneNumberSid: business.twilio_phone_number_sid,
      };
    }

    // Handle bad state: phone number exists but SID is missing
    if (business && business.twilio_phone_number && !business.twilio_phone_number_sid) {
      console.log('[Twilio Provisioning] Bad state detected: phone number exists but SID is missing, verifying in Twilio');

      try {
        // Verify if the number exists in Twilio Active Numbers
        const incomingNumbers = await client.incomingPhoneNumbers.list({ phoneNumber: business.twilio_phone_number });
        
        if (incomingNumbers.length === 0) {
          console.log('[Twilio Provisioning] Number does not exist in Twilio Active Numbers');
          
          // Check if this is the shared MVP number - if so, don't clear it
          const sharedReplyFlowNumber = process.env.MVP_SHARED_TWILIO_NUMBER || '+18336584303';
          if (business.twilio_phone_number === sharedReplyFlowNumber) {
            console.log('[Twilio Provisioning] Preserving shared ReplyFlow number, only clearing SID');
            
            // Only clear the SID, keep the shared number
            const { error: clearError } = await supabase
              .from('businesses')
              .update({
                twilio_phone_number_sid: null,
              })
              .eq('id', businessId);

            if (clearError) {
              console.error('[Twilio Provisioning] Failed to clear SID:', clearError);
            } else {
              console.log('[Twilio Provisioning] Shared number SID cleared, number preserved');
            }
          } else {
            console.log('[Twilio Provisioning] Clearing bad non-shared number');
            
            // Clear the bad phone number (only for non-shared numbers)
            const { error: clearError } = await supabase
              .from('businesses')
              .update({
                twilio_phone_number: null,
                twilio_phone_number_sid: null,
              })
              .eq('id', businessId);

            if (clearError) {
              console.error('[Twilio Provisioning] Failed to clear bad saved number:', clearError);
            } else {
              console.log('[Twilio Provisioning] Bad saved number cleared');
            }
          }
        } else {
          console.log('[Twilio Provisioning] Number exists in Twilio, updating SID in database');
          
          // Update with the correct SID
          const { error: updateError } = await supabase
            .from('businesses')
            .update({
              twilio_phone_number_sid: incomingNumbers[0].sid,
            })
            .eq('id', businessId);

          if (updateError) {
            console.error('[Twilio Provisioning] Failed to update SID:', updateError);
          } else {
            console.log('[Twilio Provisioning] SID updated successfully');
            return {
              phoneNumber: business.twilio_phone_number,
              phoneNumberSid: incomingNumbers[0].sid,
            };
          }
        }
      } catch (verifyError) {
        console.error('[Twilio Provisioning] Error verifying number in Twilio:', verifyError);
        // Proceed to purchase a new number
      }
    }

    console.log('[Twilio Provisioning] Searching numbers for business:', businessId);

    // Search for available US local numbers with voice + SMS enabled
    const availableNumbers = await client.availablePhoneNumbers('US')
      .local
      .list({
        voiceEnabled: true,
        smsEnabled: true,
        limit: 1,
      });

    if (!availableNumbers || availableNumbers.length === 0) {
      console.error('[Twilio Provisioning] No available numbers found');
      return null
    }

    const numberToPurchase = availableNumbers[0];
    console.log('[Twilio Provisioning] Selected available number:', numberToPurchase.phoneNumber);

    // Purchase the number
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: numberToPurchase.phoneNumber,
      voiceUrl: 'https://replyflowhq.com/api/twilio/voice',
      smsUrl: 'https://replyflowhq.com/api/twilio/incoming-sms',
    });

    console.log('[Twilio Provisioning] Purchase succeeded:', purchasedNumber.phoneNumber, 'SID:', purchasedNumber.sid);

    // Verify the number exists by SID after purchase
    try {
      const verifiedNumber = await client.incomingPhoneNumbers(purchasedNumber.sid).fetch();
      console.log('[Twilio Provisioning] Verified number exists in Twilio by SID:', verifiedNumber.phoneNumber);
    } catch (verifyError) {
      console.error('[Twilio Provisioning] Failed to verify number by SID after purchase:', verifyError);
    }

    // Save to database only after purchase succeeds
    const { error: updateError } = await supabase
      .from('businesses')
      .update({
        twilio_phone_number: purchasedNumber.phoneNumber,
        twilio_phone_number_sid: purchasedNumber.sid,
      })
      .eq('id', businessId);

    if (updateError) {
      console.error('[Twilio Provisioning] Failed to save number to database:', updateError);
      // Still return the number since it was purchased, but log the error
    } else {
      console.log('[Twilio Provisioning] Saved number to business:', businessId);
    }

    return {
      phoneNumber: purchasedNumber.phoneNumber,
      phoneNumberSid: purchasedNumber.sid,
    };
  } catch (error) {
    console.error('[Twilio Provisioning] Purchase failed:', error);
    // Do not save twilio_phone_number or twilio_phone_number_sid on failure
    return null
  }
}
