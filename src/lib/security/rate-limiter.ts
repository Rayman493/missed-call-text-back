import { NextRequest } from 'next/server'

// Simple in-memory rate limiter for production
// In production, consider using Redis or similar for distributed systems
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  message?: string // Custom message
}

export class RateLimiter {
  constructor(public config: RateLimitConfig) {}

  check(request: NextRequest, identifier?: string): {
    success: boolean
    remaining: number
    resetTime: number
    message?: string
  } {
    // Get identifier from IP address or custom identifier
    const key = identifier || this.getClientIdentifier(request)
    const now = Date.now()
    
    // Get or create rate limit entry
    let entry = rateLimitStore.get(key)
    
    if (!entry || now > entry.resetTime) {
      // Create new entry
      entry = {
        count: 1,
        resetTime: now + this.config.windowMs
      }
      rateLimitStore.set(key, entry)
      
      return {
        success: true,
        remaining: this.config.maxRequests - 1,
        resetTime: entry.resetTime
      }
    }
    
    // Check if limit exceeded
    if (entry.count >= this.config.maxRequests) {
      return {
        success: false,
        remaining: 0,
        resetTime: entry.resetTime,
        message: this.config.message || `Rate limit exceeded. Try again in ${Math.ceil((entry.resetTime - now) / 1000)} seconds.`
      }
    }
    
    // Increment count
    entry.count++
    rateLimitStore.set(key, entry)
    
    return {
      success: true,
      remaining: this.config.maxRequests - entry.count,
      resetTime: entry.resetTime
    }
  }

  private getClientIdentifier(request: NextRequest): string {
    // Try to get real IP address
    const forwardedFor = request.headers.get('x-forwarded-for')
    const realIp = request.headers.get('x-real-ip')
    const cfConnectingIp = request.headers.get('cf-connecting-ip') // Cloudflare
    
    if (cfConnectingIp) return cfConnectingIp
    if (realIp) return realIp
    if (forwardedFor) return forwardedFor.split(',')[0].trim()
    
    // Fallback to a generic identifier
    return request.ip || 'unknown'
  }

  // Clean up expired entries (call periodically)
  static cleanup(): void {
    const now = Date.now()
    const entries = Array.from(rateLimitStore.entries())
    for (const [key, entry] of entries) {
      if (now > entry.resetTime) {
        rateLimitStore.delete(key)
      }
    }
  }
}

// Pre-configured rate limiters for different use cases
export const apiRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100, // 100 requests per minute
  message: 'Too many API requests. Please try again later.'
})

export const authRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 auth attempts per 15 minutes
  message: 'Too many authentication attempts. Please try again later.'
})

export const smsRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 SMS per minute per user
  message: 'SMS sending limit exceeded. Please wait before sending more messages.'
})

export const webhookRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 1000, // 1000 webhooks per minute (high for Twilio)
  message: 'Webhook rate limit exceeded.'
})

// Middleware function for Next.js API routes
export function withRateLimit(
  rateLimiter: RateLimiter,
  identifier?: string
) {
  return async (request: NextRequest) => {
    const result = rateLimiter.check(request, identifier)
    
    if (!result.success) {
      return Response.json(
        { error: result.message || 'Rate limit exceeded' },
        { 
          status: 429,
          headers: {
            'X-RateLimit-Limit': rateLimiter.config.maxRequests.toString(),
            'X-RateLimit-Remaining': result.remaining.toString(),
            'X-RateLimit-Reset': result.resetTime.toString(),
            'Retry-After': Math.ceil((result.resetTime - Date.now()) / 1000).toString()
          }
        }
      )
    }
    
    // Add rate limit headers to successful responses
    const headers = new Headers({
      'X-RateLimit-Limit': rateLimiter.config.maxRequests.toString(),
      'X-RateLimit-Remaining': result.remaining.toString(),
      'X-RateLimit-Reset': result.resetTime.toString()
    })
    
    return { headers, allowRequest: true }
  }
}

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(RateLimiter.cleanup, 5 * 60 * 1000)
}
