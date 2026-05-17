import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// Initialize Redis client for rate limiting
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Rate limiter for IP-based limits (public routes)
export const ipRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s'),
  analytics: true,
  prefix: '@upstash/ratelimit',
})

// Rate limiter for Twilio voice (IP-based, more generous)
export const twilioVoiceRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '1 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:twilio-voice',
})

// Rate limiter for incoming SMS (phone number-based)
export const incomingSmsRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '1 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:incoming-sms',
})

// Rate limiter for Twilio voice status (CallSid-based)
export const voiceStatusRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(50, '1 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:voice-status',
})

// Rate limiter for manual SMS send (user-based)
export const manualSmsRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:manual-sms',
})

// Rate limiter for test setup (user-based)
export const testSetupRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:test-setup',
})

// Rate limiter for cron jobs (secret-based)
export const cronRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:cron',
})

// Rate limiter for auth/signup (IP-based)
export const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '1 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:auth',
})

/**
 * Check rate limit for IP-based routes
 * @param identifier IP address or unique identifier
 * @returns Rate limit result
 */
export async function checkIpRateLimit(identifier: string) {
  try {
    const result = await ipRateLimit.limit(identifier)
    if (!result.success) {
      console.warn(`[RateLimit] IP rate limit exceeded for ${identifier}`)
    }
    return result
  } catch (error) {
    console.error('[RateLimit] Error checking IP rate limit:', error)
    // On error, allow the request (fail open)
    return { success: true, limit: 10, remaining: 10, reset: 0 }
  }
}

/**
 * Check rate limit for Twilio voice routes (IP-based)
 * @param identifier IP address
 * @returns Rate limit result
 */
export async function checkTwilioVoiceRateLimit(identifier: string) {
  try {
    const result = await twilioVoiceRateLimit.limit(identifier)
    if (!result.success) {
      console.warn(`[RateLimit] Twilio voice rate limit exceeded for IP: ${identifier}`)
    }
    return result
  } catch (error) {
    console.error('[RateLimit] Error checking Twilio voice rate limit:', error)
    return { success: true, limit: 30, remaining: 30, reset: 0 }
  }
}

/**
 * Check rate limit for incoming SMS (phone number-based)
 * @param phoneNumber From phone number
 * @returns Rate limit result
 */
export async function checkIncomingSmsRateLimit(phoneNumber: string) {
  try {
    const result = await incomingSmsRateLimit.limit(phoneNumber)
    if (!result.success) {
      console.warn(`[RateLimit] Incoming SMS rate limit exceeded for phone: ${phoneNumber}`)
    }
    return result
  } catch (error) {
    console.error('[RateLimit] Error checking incoming SMS rate limit:', error)
    return { success: true, limit: 60, remaining: 60, reset: 0 }
  }
}

/**
 * Check rate limit for Twilio voice status (CallSid-based)
 * @param callSid Twilio CallSid
 * @returns Rate limit result
 */
export async function checkVoiceStatusRateLimit(callSid: string) {
  try {
    const result = await voiceStatusRateLimit.limit(callSid)
    if (!result.success) {
      console.warn(`[RateLimit] Voice status rate limit exceeded for CallSid: ${callSid}`)
    }
    return result
  } catch (error) {
    console.error('[RateLimit] Error checking voice status rate limit:', error)
    return { success: true, limit: 50, remaining: 50, reset: 0 }
  }
}

/**
 * Check rate limit for manual SMS send (user-based)
 * @param userId User ID or business ID
 * @returns Rate limit result
 */
export async function checkManualSmsRateLimit(userId: string) {
  try {
    const result = await manualSmsRateLimit.limit(userId)
    if (!result.success) {
      console.warn(`[RateLimit] Manual SMS rate limit exceeded for user: ${userId}`)
    }
    return result
  } catch (error) {
    console.error('[RateLimit] Error checking manual SMS rate limit:', error)
    return { success: true, limit: 10, remaining: 10, reset: 0 }
  }
}

/**
 * Check rate limit for test setup (user-based)
 * @param userId User ID or business ID
 * @returns Rate limit result
 */
export async function checkTestSetupRateLimit(userId: string) {
  try {
    const result = await testSetupRateLimit.limit(userId)
    if (!result.success) {
      console.warn(`[RateLimit] Test setup rate limit exceeded for user: ${userId}`)
    }
    return result
  } catch (error) {
    console.error('[RateLimit] Error checking test setup rate limit:', error)
    return { success: true, limit: 5, remaining: 5, reset: 0 }
  }
}

/**
 * Check rate limit for cron jobs (secret-based)
 * @param secret Cron secret
 * @returns Rate limit result
 */
export async function checkCronRateLimit(secret: string) {
  try {
    const result = await cronRateLimit.limit(secret)
    if (!result.success) {
      console.warn(`[RateLimit] Cron rate limit exceeded`)
    }
    return result
  } catch (error) {
    console.error('[RateLimit] Error checking cron rate limit:', error)
    return { success: true, limit: 5, remaining: 5, reset: 0 }
  }
}

/**
 * Check rate limit for auth/signup (IP-based)
 * @param identifier IP address
 * @returns Rate limit result
 */
export async function checkAuthRateLimit(identifier: string) {
  try {
    const result = await authRateLimit.limit(identifier)
    if (!result.success) {
      console.warn(`[RateLimit] Auth rate limit exceeded for IP: ${identifier}`)
    }
    return result
  } catch (error) {
    console.error('[RateLimit] Error checking auth rate limit:', error)
    return { success: true, limit: 5, remaining: 5, reset: 0 }
  }
}

/**
 * Get client IP address from request
 */
export function getClientIp(request: Request): string {
  // Check various headers for IP
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  
  if (cfConnectingIp) {
    return cfConnectingIp
  }
  if (realIp) {
    return realIp
  }
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  // Fallback to a default (shouldn't happen in production)
  return 'unknown'
}
