import crypto from 'crypto'

/**
 * Validates Twilio webhook signature using Twilio's validateRequest method
 * @param authToken - Twilio auth token
 * @param signature - The twilio-signature header
 * @param url - The full URL of the webhook endpoint
 * @param params - Object of URL parameters (from URLSearchParams)
 * @returns true if valid, false otherwise
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  if (!authToken) {
    console.error('[TWILIO-WEBHOOK] TWILIO_AUTH_TOKEN not configured')
    return false
  }
  
  if (!signature) {
    console.error('[TWILIO-WEBHOOK] Missing twilio-signature header')
    return false
  }
  
  // Create the signed token using Twilio's method: HMAC-SHA1(url + sorted params)
  // Twilio sorts parameters alphabetically and concatenates them as key=value pairs
  const sortedKeys = Object.keys(params).sort()
  const paramString = sortedKeys.map(key => `${key}${params[key]}`).join('')
  const dataToSign = url + paramString
  
  const signedToken = crypto
    .createHmac('sha1', authToken)
    .update(dataToSign, 'utf8')
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
  authToken: string,
  signature: string,
  params: Record<string, string>,
  request: Request
): { valid: boolean; usedUrl?: string } {
  const candidates = getPublicUrl(request)
  
  console.log('[TWILIO-WEBHOOK] Signature validation candidates:', candidates.length)
  console.log('[TWILIO-WEBHOOK] URL candidates:', candidates)
  console.log('[TWILIO-WEBHOOK] Param keys:', Object.keys(params).sort())
  
  for (const url of candidates) {
    const isValid = validateTwilioSignature(authToken, signature, url, params)
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
 * @param request - The incoming request
 * @param params - Object of URL parameters (from URLSearchParams)
 * @param rawBodyLength - Length of raw body for debug logging
 * @param contentType - Content-type header for debug logging
 */
export function requireTwilioAuth(
  request: Request, 
  params: Record<string, string>,
  rawBodyLength?: number,
  contentType?: string
): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  
  if (!authToken) {
    console.error('[TWILIO-WEBHOOK] TWILIO_AUTH_TOKEN not configured')
    return false
  }
  
  // Support both header formats that Twilio might send
  const signature = request.headers.get('x-twilio-signature') || request.headers.get('twilio-signature')
  
  if (!signature) {
    console.error('[TWILIO-WEBHOOK] Missing twilio-signature header (both x-twilio-signature and twilio-signature checked)')
    return false
  }
  
  console.log('[TWILIO-WEBHOOK] Signature header present:', !!signature)
  console.log('[TWILIO-WEBHOOK] Raw body length:', rawBodyLength || 'unknown')
  console.log('[TWILIO-WEBHOOK] Content-type:', contentType || 'unknown')
  
  // Try validation with multiple URL candidates
  const result = validateTwilioSignatureWithCandidates(authToken, signature, params, request)
  
  if (!result.valid) {
    console.error('[TWILIO-WEBHOOK] Invalid webhook signature - POSSIBLE ATTACK')
    console.log('[TWILIO-WEBHOOK] Request URL:', request.url)
    console.log('[TWILIO-WEBHOOK] Forwarded proto:', request.headers.get('x-forwarded-proto'))
    console.log('[TWILIO-WEBHOOK] Forwarded host:', request.headers.get('x-forwarded-host'))
    console.log('[TWILIO-WEBHOOK] Configured base URL:', process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'none')
  }
  
  return result.valid
}
