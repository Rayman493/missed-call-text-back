import crypto from 'crypto'

/**
 * Validates Twilio webhook signature
 * @param signature - The twilio-signature header
 * @param url - The full URL of the webhook endpoint
 * @param body - The raw request body
 * @returns true if valid, false otherwise
 */
export function validateTwilioSignature(
  signature: string,
  url: string,
  body: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  
  if (!authToken) {
    console.error('[TWILIO-WEBHOOK] TWILIO_AUTH_TOKEN not configured')
    return false
  }
  
  if (!signature) {
    console.error('[TWILIO-WEBHOOK] Missing twilio-signature header')
    return false
  }
  
  // Create the signed token
  const signedToken = crypto
    .createHmac('sha1', authToken)
    .update(url + body, 'utf8')
    .digest('base64')
  
  // Compare securely
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(signedToken, 'utf8')
    )
  } catch (error) {
    console.error('[TWILIO-WEBHOOK] Signature comparison error:', error)
    return false
  }
}

/**
 * Middleware function to validate Twilio webhooks
 */
export function requireTwilioAuth(request: Request, body: string): boolean {
  // Support both header formats that Twilio might send
  const signature = request.headers.get('x-twilio-signature') || request.headers.get('twilio-signature')
  
  if (!signature) {
    console.error('[TWILIO-WEBHOOK] Missing twilio-signature header (both x-twilio-signature and twilio-signature checked)')
    return false
  }
  
  // Use the exact URL that Twilio is calling
  const url = request.url
  
  return validateTwilioSignature(signature, url, body)
}
