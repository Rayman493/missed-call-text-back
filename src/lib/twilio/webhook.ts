import crypto from 'crypto'

/**
 * Validates Twilio webhook signature using Twilio's validateRequest method
 * @param authToken - Twilio auth token
 * @param signature - The twilio-signature header
 * @param url - The full URL of the webhook endpoint
 * @param params - Object of URL parameters (from URLSearchParams or body)
 * @param isGetRequest - Whether this is a GET request (params should be empty for GET)
 * @returns true if valid, false otherwise
 */
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
  isGetRequest: boolean = false
): boolean {
  if (!authToken) {
    console.error('[TWILIO-WEBHOOK] TWILIO_AUTH_TOKEN not configured')
    return false
  }
  
  if (!signature) {
    console.error('[TWILIO-WEBHOOK] Missing twilio-signature header')
    return false
  }
  
  // For GET requests, Twilio includes params in the URL query string, so params should be empty
  // For POST requests, params are in the body and should be concatenated
  const validationParams = isGetRequest ? {} : params
  
  // Create the signed token using Twilio's method: HMAC-SHA1(url + sorted params)
  // Twilio sorts parameters alphabetically and concatenates them as key=value pairs
  const sortedKeys = Object.keys(validationParams).sort()
  const paramString = sortedKeys.map(key => `${key}${validationParams[key]}`).join('')
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
 * For GET requests, includes the raw query string exactly as Twilio sent it
 * For POST requests, uses URL without query string (params are in body)
 */
function getPublicUrl(request: Request, includeQueryString: boolean = true): string[] {
  const candidates: string[] = []
  const url = new URL(request.url)
  
  // For GET requests, use the raw query string to preserve exact encoding/order
  // For POST requests, exclude query string (params are in body)
  const queryString = includeQueryString ? url.search : ''
  
  // Candidate 1: Original request.url (includes or excludes query string based on method)
  if (includeQueryString) {
    candidates.push(request.url)
  } else {
    candidates.push(`${url.protocol}//${url.host}${url.pathname}`)
  }
  
  // Candidate 2: Reconstruct from forwarded headers
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host')
  
  if (forwardedHost) {
    const reconstructedUrl = `${forwardedProto}://${forwardedHost}${url.pathname}${queryString}`
    candidates.push(reconstructedUrl)
  }
  
  // Candidate 3: Configured production base URL
  const configuredBaseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL
  if (configuredBaseUrl) {
    const configuredUrl = `${configuredBaseUrl}${url.pathname}${queryString}`
    candidates.push(configuredUrl)
    
    // Candidate 4: Canonical www version of configured URL (only if not already www)
    if (configuredBaseUrl.startsWith('https://') && !configuredBaseUrl.startsWith('https://www.')) {
      const wwwUrl = configuredBaseUrl.replace('https://', 'https://www.')
      candidates.push(`${wwwUrl}${url.pathname}${queryString}`)
    }
    
    // Candidate 5: Non-www version of configured URL (only if currently www)
    if (configuredBaseUrl.startsWith('https://www.')) {
      const nonWwwUrl = configuredBaseUrl.replace('https://www.', 'https://')
      candidates.push(`${nonWwwUrl}${url.pathname}${queryString}`)
    }
  }
  
  // Candidate 6: Default www.replyflowhq.com
  candidates.push(`https://www.replyflowhq.com${url.pathname}${queryString}`)
  
  // Candidate 7: Default replyflowhq.com (non-www)
  candidates.push(`https://replyflowhq.com${url.pathname}${queryString}`)
  
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
): { valid: boolean; usedUrl?: string; validationMode?: string } {
  const isGetRequest = request.method === 'GET'
  const url = new URL(request.url)
  // Include query string for GET requests AND for POST requests that have query parameters
  // Twilio signs the full URL including query string for POST callbacks with query params
  const hasQueryString = url.search.length > 0
  const includeQueryString = isGetRequest || hasQueryString
  const candidates = getPublicUrl(request, includeQueryString)
  
  console.log('[TWILIO-WEBHOOK] Validation mode:', isGetRequest ? 'GET (URL with query string, empty params)' : hasQueryString ? 'POST (URL with query string, body params)' : 'POST (URL without query string, body params)')
  console.log('[TWILIO-WEBHOOK] Request method:', request.method)
  console.log('[TWILIO-WEBHOOK] Signature candidates:', candidates.length)
  console.log('[TWILIO-WEBHOOK] Param keys count:', Object.keys(params).length)
  
  // Log first few param keys without exposing sensitive values
  const paramKeys = Object.keys(params).sort()
  console.log('[TWILIO-WEBHOOK] Param keys (first 5):', paramKeys.slice(0, 5).join(', '))
  
  for (const url of candidates) {
    // Mask CallToken in logs if present
    const safeUrl = url.replace(/CallToken=[^&]*/, 'CallToken=REDACTED')
    console.log('[TWILIO-WEBHOOK] Trying candidate URL:', safeUrl)
    
    const isValid = validateTwilioSignature(authToken, signature, url, params, isGetRequest)
    if (isValid) {
      console.log('[TWILIO-WEBHOOK] Signature VALID with URL:', safeUrl)
      return { valid: true, usedUrl: url, validationMode: isGetRequest ? 'GET' : 'POST' }
    }
  }
  
  console.log('[TWILIO-WEBHOOK] Signature INVALID for all candidates')
  return { valid: false, validationMode: isGetRequest ? 'GET' : 'POST' }
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
  console.log('[TWILIO-WEBHOOK] Request method:', request.method)
  console.log('[TWILIO-WEBHOOK] Raw body length:', rawBodyLength || 'unknown')
  console.log('[TWILIO-WEBHOOK] Content-type:', contentType || 'unknown')
  
  // Try validation with multiple URL candidates
  const result = validateTwilioSignatureWithCandidates(authToken, signature, params, request)
  
  if (!result.valid) {
    console.warn('[TWILIO-WEBHOOK] Invalid webhook signature - validation failed for all URL candidates')
    console.log('[TWILIO-WEBHOOK] Request URL:', request.url)
    console.log('[TWILIO-WEBHOOK] Forwarded proto:', request.headers.get('x-forwarded-proto'))
    console.log('[TWILIO-WEBHOOK] Forwarded host:', request.headers.get('x-forwarded-host'))
    console.log('[TWILIO-WEBHOOK] Configured base URL:', process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || 'none')
    console.log('[TWILIO-WEBHOOK] Validation mode used:', result.validationMode)
  } else {
    console.log('[TWILIO-WEBHOOK] Signature validation PASSED')
    console.log('[TWILIO-WEBHOOK] Validation mode:', result.validationMode)
  }
  
  return result.valid
}
