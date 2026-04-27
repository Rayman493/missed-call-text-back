import Twilio from "twilio";
import { createClient } from '@supabase/supabase-js';

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

// Initialize Supabase client for DB operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  // Create fresh Twilio client for this SMS
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN

  if (!accountSid || !authToken) {
    console.error('[SYSTEM] [TWILIO] Credentials missing');
    return null
  }

  const client = Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  try {
    console.log('[SYSTEM] [TWILIO] Sending SMS to:', to, 'from business:', business.id);

    let messageResult;
    if (business.twilio_messaging_service_sid) {
      console.log('[SYSTEM] [TWILIO] Using messaging service:', business.twilio_messaging_service_sid);
      messageResult = await client.messages.create({
        body: message,
        to,
        messagingServiceSid: business.twilio_messaging_service_sid,
        statusCallback: "https://replyflowhq.com/api/twilio/status",
      });
    } else {
      console.log('[SYSTEM] [TWILIO] Using phone number:', business.twilio_phone_number);
      messageResult = await client.messages.create({
        body: message,
        to,
        from: business.twilio_phone_number,
        statusCallback: "https://replyflowhq.com/api/twilio/status",
      });
    }

    console.log('[SYSTEM] [TWILIO] SMS sent successfully:', { to, sid: messageResult.sid });

    // Insert message record into database
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
        status: 'queued',
        created_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error('[SYSTEM] [TWILIO] Failed to insert message record:', insertError);
      // Guard: If DB insert fails, we still return the SID but log the error
      // In production, you might want to throw here to prevent sending without DB record
    } else {
      console.log('[SYSTEM] [TWILIO] Message record inserted:', messageResult.sid);
    }

    return messageResult.sid
  } catch (error) {
    console.error('[SYSTEM] [TWILIO] Error sending SMS:', error);
    throw error
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
          console.log('[Twilio Provisioning] Number does not exist in Twilio Active Numbers, clearing bad saved number');
          
          // Clear the bad phone number
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
