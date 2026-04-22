import { Twilio } from 'twilio'

const accountSid = process.env.TWILIO_ACCOUNT_SID
const authToken = process.env.TWILIO_AUTH_TOKEN
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER

// Only initialize Twilio client if credentials are available and valid
export const twilioClient = accountSid && authToken && accountSid.startsWith('AC') 
  ? new Twilio(accountSid, authToken)
  : null

export async function sendSms(to: string, body: string): Promise<string | null> {
  // Create fresh Twilio client for this SMS
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER
  
  if (!accountSid || !authToken || !twilioPhoneNumber) {
    console.error('Twilio credentials missing')
    return null
  }

  const client = new Twilio(accountSid, authToken)

  try {
    const message = await client.messages.create({
      body,
      from: twilioPhoneNumber,
      to,
    })
    
    console.log(`SMS sent to ${to}, SID: ${message.sid}`)
    return message.sid
  } catch (error) {
    console.error('Error sending SMS:', error)
    return null
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
