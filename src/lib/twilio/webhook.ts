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
 * Reconstructs the public URL from forwarded headers
 * This is necessary when running behind reverse proxies like Vercel
 */
function getPublicUrl(request: Request): string[] {
  const candidates: string[] = []
  
  // Candidate 1: Original request.url (may be internal)
  candidates.push(request.url)
  
  // Candidate 2: Reconstruct from forwarded headers
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  
  if (forwardedHost) {
    const url = new URL(request.url)
    const reconstructedUrl = `${forwardedProto}://${forwardedHost}${url.pathname}`
    candidates.push(reconstructedUrl)
  }
  
  // Candidate 3: Configured production base URL
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (configuredBaseUrl) {
    const url = new URL(request.url)
    const configuredUrl = `${configuredBaseUrl}${url.pathname}`
    candidates.push(configuredUrl)
  }
  
  return candidates
}

/**
 * Validates Twilio signature against multiple URL candidates
 */
function validateTwilioSignatureWithCandidates(
  signature: string,
  body: string,
  request: Request
): { valid: boolean; usedUrl?: string } {
  const candidates = getPublicUrl(request)
  
  console.log('[TWILIO-WEBHOOK] Signature validation candidates:', candidates.length)
  
  for (const url of candidates) {
    const isValid = validateTwilioSignature(signature, url, body)
    if (isValid) {
      console.log('[TWILIO-WEBHOOK] Signature valid with URL:', url)
      return { valid: true, usedUrl: url }
    }
  }
  
  console.log('[TWILIO-WEBHOOK] Signature invalid for all candidates')
  return { valid: false }
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
  
  console.log('[TWILIO-WEBHOOK] Signature header present:', !!signature)
  
  // Try validation with multiple URL candidates
  const result = validateTwilioSignatureWithCandidates(signature, body, request)
  
  if (!result.valid) {
    console.error('[TWILIO-WEBHOOK] Invalid webhook signature - POSSIBLE ATTACK')
    console.log('[TWILIO-WEBHOOK] Request URL:', request.url)
    console.log('[TWILIO-WEBHOOK] Forwarded proto:', request.headers.get('x-forwarded-proto'))
    console.log('[TWILIO-WEBHOOK] Forwarded host:', request.headers.get('x-forwarded-host'))
    console.log('[TWILIO-WEBHOOK] Configured base URL:', process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'none')
  }
  
  return result.valid
}
