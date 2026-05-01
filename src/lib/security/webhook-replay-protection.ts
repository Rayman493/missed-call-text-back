import crypto from 'crypto'
import { NextRequest } from 'next/server'

// In-memory store for processed webhook IDs
// In production, use Redis or database for persistence
const processedWebhooks = new Map<string, number>()

interface WebhookConfig {
  windowMs: number // Time window to track processed webhooks
  maxAge: number // Maximum age of webhook entries
}

export class WebhookReplayProtection {
  constructor(private config: WebhookConfig) {}

  // Generate a unique ID for the webhook to detect duplicates
  generateWebhookId(payload: any, signature?: string): string {
    // Create a hash of the payload + signature for uniqueness
    const payloadString = JSON.stringify(payload, Object.keys(payload).sort())
    const hashInput = `${payloadString}:${signature || ''}`
    
    return crypto
      .createHash('sha256')
      .update(hashInput)
      .digest('hex')
  }

  // Check if webhook has been processed recently
  isProcessed(webhookId: string): boolean {
    const timestamp = processedWebhooks.get(webhookId)
    if (!timestamp) return false

    const now = Date.now()
    const isExpired = (now - timestamp) > this.config.maxAge

    if (isExpired) {
      // Clean up expired entry
      processedWebhooks.delete(webhookId)
      return false
    }

    return true
  }

  // Mark webhook as processed
  markProcessed(webhookId: string): void {
    processedWebhooks.set(webhookId, Date.now())
  }

  // Clean up old entries
  cleanup(): void {
    const now = Date.now()
    const entries = Array.from(processedWebhooks.entries())
    
    for (const [webhookId, timestamp] of entries) {
      if ((now - timestamp) > this.config.maxAge) {
        processedWebhooks.delete(webhookId)
      }
    }
  }

  // Middleware function for webhook protection
  protect() {
    return (request: NextRequest, payload: any, signature?: string) => {
      const webhookId = this.generateWebhookId(payload, signature)

      if (this.isProcessed(webhookId)) {
        return {
          success: false,
          reason: 'Webhook already processed',
          webhookId
        }
      }

      this.markProcessed(webhookId)
      return {
        success: true,
        webhookId
      }
    }
  }
}

// Pre-configured webhook protection
export const twilioWebhookProtection = new WebhookReplayProtection({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxAge: 10 * 60 * 1000 // 10 minutes max age
})

export const stripeWebhookProtection = new WebhookReplayProtection({
  windowMs: 5 * 60 * 1000, // 5 minutes  
  maxAge: 15 * 60 * 1000 // 15 minutes max age
})

// Helper function to extract relevant payload for ID generation
export async function extractWebhookPayload(request: NextRequest, type: 'twilio' | 'stripe'): Promise<any> {
  const body = await request.text()
  
  if (type === 'twilio') {
    // For Twilio, use the CallSid or MessageSid as primary identifier
    const params = new URLSearchParams(body)
    
    return {
      CallSid: params.get('CallSid'),
      MessageSid: params.get('MessageSid'),
      From: params.get('From'),
      To: params.get('To'),
      CallStatus: params.get('CallStatus'),
      MessageStatus: params.get('MessageStatus')
    }
  }

  if (type === 'stripe') {
    // For Stripe, use the event type and relevant IDs
    try {
      const payload = JSON.parse(body)
      
      return {
        type: payload.type,
        id: payload.id,
        object: payload.object,
        created: payload.created
      }
    } catch {
      return {}
    }
  }

  return {}
}

// Middleware wrapper for Next.js API routes
export function withWebhookProtection(
  protection: WebhookReplayProtection,
  type: 'twilio' | 'stripe'
) {
  return async (request: NextRequest) => {
    const payload = await extractWebhookPayload(request, type)
    const signature = request.headers.get('twilio-signature') || request.headers.get('stripe-signature') || undefined
    
    const result = protection.protect()(request, payload, signature)
    
    if (!result.success) {
      return Response.json(
        { error: result.reason },
        { 
          status: 200, // Return 200 to prevent webhook retries
          headers: {
            'X-Webhook-Processed': 'true',
            'X-Webhook-ID': result.webhookId
          }
        }
      )
    }
    
    // Add headers to indicate webhook is being processed
    const headers = new Headers({
      'X-Webhook-ID': result.webhookId,
      'X-Webhook-Processed': 'false'
    })
    
    return { headers, allowRequest: true, webhookId: result.webhookId }
  }
}

// Cleanup expired entries every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    twilioWebhookProtection.cleanup()
    stripeWebhookProtection.cleanup()
  }, 5 * 60 * 1000)
}
