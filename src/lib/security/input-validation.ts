import { z } from 'zod'

// Common validation schemas
export const uuidSchema = z.string().uuid('Invalid UUID format')

export const phoneNumberSchema = z.string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format')
  .min(10, 'Phone number must be at least 10 digits')
  .max(15, 'Phone number must be at most 15 digits')

export const messageBodySchema = z.string()
  .min(1, 'Message cannot be empty')
  .max(1600, 'Message too long (max 1600 characters)')
  .trim()

export const businessNameSchema = z.string()
  .min(1, 'Business name cannot be empty')
  .max(100, 'Business name too long (max 100 characters)')
  .trim()

export const emailSchema = z.string()
  .email('Invalid email format')
  .max(255, 'Email too long')

// Lead-specific validation
export const leadCreateSchema = z.object({
  business_id: uuidSchema,
  caller_phone: phoneNumberSchema,
  status: z.enum(['new', 'contacted', 'qualified', 'closed', 'blocked']),
  first_contact_at: z.string().datetime().optional(),
  opted_out: z.boolean().default(false)
})

// Message-specific validation
export const messageCreateSchema = z.object({
  lead_id: uuidSchema,
  direction: z.enum(['inbound', 'outbound']),
  body: messageBodySchema,
  from_phone: phoneNumberSchema,
  to_phone: phoneNumberSchema,
  twilio_message_sid: z.string().optional(),
  status: z.enum(['pending', 'sent', 'delivered', 'failed', 'undelivered']).optional()
})

// Business-specific validation
export const businessUpdateSchema = z.object({
  name: businessNameSchema.optional(),
  auto_reply_message: messageBodySchema.optional(),
  twilio_phone_number: phoneNumberSchema.optional(),
  business_phone_number: phoneNumberSchema.optional(),
  forwarding_phone_number: phoneNumberSchema.optional()
})

// Webhook payload validation
export const twilioWebhookSchema = z.object({
  CallSid: z.string().optional(),
  From: phoneNumberSchema.optional(),
  To: phoneNumberSchema.optional(),
  CallStatus: z.string().optional(),
  Direction: z.string().optional(),
  MessageSid: z.string().optional(),
  Body: z.string().max(1600).optional(),
  MessageStatus: z.string().optional()
})

// API parameter validation
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(100).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
})

// Validation helper functions
export function validateInput<T>(schema: z.ZodSchema<T>, data: unknown): {
  success: true
  data: T
} | {
  success: false
  error: string
  details: any
} {
  try {
    const validatedData = schema.parse(data)
    return { success: true, data: validatedData }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(e => e.message).join(', ')
      return {
        success: false,
        error: errorMessages,
        details: error.errors
      }
    }
    return {
      success: false,
      error: 'Validation failed',
      details: error
    }
  }
}

// Sanitization functions
export function sanitizePhoneNumber(phone: string): string {
  // Remove all non-numeric characters except leading +
  return phone.replace(/[^\d+]/g, '').replace(/^(\+?1)/, '+1')
}

export function sanitizeMessage(message: string): string {
  // Remove potentially dangerous content
  return message
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Control characters
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Script tags
    .trim()
}

export function sanitizeString(input: string, maxLength: number = 1000): string {
  return input
    .substring(0, maxLength)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
}

// Security validation for file uploads (if needed in future)
export const fileUploadSchema = z.object({
  filename: z.string().max(255),
  mimetype: z.enum(['image/jpeg', 'image/png', 'image/gif', 'text/plain']),
  size: z.number().max(5 * 1024 * 1024), // 5MB max
  content: z.string().optional() // Base64 content
})

// Rate limiting validation
export function validateRateLimitHeaders(headers: Headers): {
  limit: number
  remaining: number
  reset: number
} | null {
  const limit = headers.get('x-ratelimit-limit')
  const remaining = headers.get('x-ratelimit-remaining')
  const reset = headers.get('x-ratelimit-reset')

  if (!limit || !remaining || !reset) {
    return null
  }

  return {
    limit: parseInt(limit, 10),
    remaining: parseInt(remaining, 10),
    reset: parseInt(reset, 10)
  }
}

// Request validation middleware helper
export function validateRequest(request: Request, schema: z.ZodSchema) {
  return async () => {
    try {
      const body = await request.json()
      const validation = validateInput(schema, body)
      
      if (!validation.success) {
        return Response.json(
          { error: 'Invalid request data', details: validation.details },
          { status: 400 }
        )
      }
      
      return validation.data
    } catch (error) {
      return Response.json(
        { error: 'Invalid request format' },
        { status: 400 }
      )
    }
  }
}

// Common error messages
export const VALIDATION_ERRORS = {
  INVALID_UUID: 'Invalid ID format provided',
  INVALID_PHONE: 'Invalid phone number format',
  MESSAGE_TOO_LONG: 'Message exceeds maximum length',
  MISSING_REQUIRED_FIELD: 'Required field is missing',
  INVALID_EMAIL: 'Invalid email address format',
  RATE_LIMIT_EXCEEDED: 'Too many requests, please try again later'
} as const
