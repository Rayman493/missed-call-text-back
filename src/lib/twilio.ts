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
    console.error('Twilio credentials missing')
    return null
  }

  if (!business.twilio_messaging_service_sid) {
    throw new Error("Missing messaging service SID for business");
  }

  console.log("Sending SMS with Messaging Service SID:", business.twilio_messaging_service_sid);

  const client = Twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!
  );

  try {
    console.log("Twilio SID used:", process.env.TWILIO_ACCOUNT_SID);
    console.log("Messaging Service SID:", business.twilio_messaging_service_sid);

    const messageResult = await client.messages.create({
      body: message,
      to,
      messagingServiceSid: business.twilio_messaging_service_sid,
      statusCallback: "https://replyflowhq.com/api/twilio/status",
    });

    console.log("[twilio] message sent", {
      to: to,
      sid: messageResult.sid,
      statusCallback: "https://replyflowhq.com/api/twilio/status"
    });

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
      console.error('[sendSms] Failed to insert message record:', insertError);
      // Guard: If DB insert fails, we still return the SID but log the error
      // In production, you might want to throw here to prevent sending without DB record
    } else {
      console.log("[sendSms] SID stored in database:", messageResult.sid);
    }

    return messageResult.sid
  } catch (error) {
    console.error("Error sending SMS:", error)
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
