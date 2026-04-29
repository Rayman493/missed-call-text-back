/**
 * Security utilities for input validation and XSS prevention
 */

/**
 * Sanitizes message content to prevent XSS attacks
 * @param content - The message content to sanitize
 * @returns Sanitized content
 */
export function sanitizeMessageContent(content: string): string {
  if (!content || typeof content !== 'string') {
    return ''
  }
  
  // Remove HTML tags and encode special characters
  return content
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;')
    .trim()
    .substring(0, 1600) // Limit message length
}

/**
 * Validates phone number format
 * @param phone - The phone number to validate
 * @returns True if valid, false otherwise
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone || typeof phone !== 'string') {
    return false
  }
  
  // Remove all non-numeric characters for validation
  const cleanPhone = phone.replace(/\D/g, '')
  
  // Accept 10-digit US numbers or E.164 format
  return cleanPhone.length === 10 || 
         (phone.startsWith('+') && cleanPhone.length >= 10 && cleanPhone.length <= 15)
}

/**
 * Validates UUID format
 * @param uuid - The UUID to validate
 * @returns True if valid, false otherwise
 */
export function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') {
    return false
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(uuid)
}

/**
 * Sanitizes and validates business name
 * @param name - The business name to validate
 * @returns Sanitized business name
 */
export function sanitizeBusinessName(name: string): string {
  if (!name || typeof name !== 'string') {
    return ''
  }
  
  return name
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .trim()
    .substring(0, 100) // Limit length
}

/**
 * Rate limiting utility (in-memory, for production use Redis)
 */
class RateLimiter {
  private requests = new Map<string, number[]>()
  
  constructor(private maxRequests: number, private windowMs: number) {}
  
  isAllowed(identifier: string): boolean {
    const now = Date.now()
    const windowStart = now - this.windowMs
    
    // Get existing requests for this identifier
    let requests = this.requests.get(identifier) || []
    
    // Remove old requests outside the window
    requests = requests.filter(timestamp => timestamp > windowStart)
    
    // Check if under limit
    if (requests.length >= this.maxRequests) {
      return false
    }
    
    // Add current request
    requests.push(now)
    this.requests.set(identifier, requests)
    
    return true
  }
  
  cleanup(): void {
    const now = Date.now()
    const windowStart = now - this.windowMs
    
    for (const [key, requests] of Array.from(this.requests.entries())) {
      const filtered = requests.filter((timestamp: number) => timestamp > windowStart)
      if (filtered.length === 0) {
        this.requests.delete(key)
      } else {
        this.requests.set(key, filtered)
      }
    }
  }
}

// Rate limiters for different endpoints
export const demoSmsRateLimiter = new RateLimiter(3, 60 * 60 * 1000) // 3 requests per hour
export const authRateLimiter = new RateLimiter(10, 60 * 1000) // 10 requests per minute

// Cleanup rate limiters periodically
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    demoSmsRateLimiter.cleanup()
    authRateLimiter.cleanup()
  }, 5 * 60 * 1000) // Cleanup every 5 minutes
}
