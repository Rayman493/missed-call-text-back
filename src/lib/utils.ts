import { z } from 'zod'

export function formatDateTime(date: string | null): string {
  if (!date) return 'N/A'
  
  return new Date(date).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatRelativeTime(date: string | null): string {
  if (!date) return 'Never'

  const now = new Date()
  const then = new Date(date)
  const diffMs = now.getTime() - then.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`

  return formatDateTime(date)
}

export function truncateText(text: string, maxLength: number = 50): string {
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * Apply sentence-style capitalization to text.
 * Only capitalizes the first letter of the first word.
 * Preserves existing capitalization, acronyms, and proper casing.
 * Does NOT apply title case (capitalizing every word).
 *
 * Examples:
 * "plumbing project" → "Plumbing project"
 * "installing appliances in bathroom in new house" → "Installing appliances in bathroom in new house"
 * "tomorrow morning" → "Tomorrow morning"
 * "urgent" → "Urgent"
 * "iPhone" → "iPhone" (preserved)
 * "NASA" → "NASA" (preserved)
 */
export function sentenceCase(text: string | null | undefined): string {
  if (!text || text.length === 0) return ''

  // Check if text already has proper capitalization (first letter is uppercase)
  // or contains all caps (acronyms), preserve it
  if (/^[A-Z]/.test(text) && !/^[a-z]+$/.test(text)) {
    return text
  }

  // Capitalize only the first letter
  return text.charAt(0).toUpperCase() + text.slice(1)
}

// Zod schemas for validation
export const twilioVoiceStatusSchema = z.object({
  CallSid: z.string(),
  CallStatus: z.string(),
  From: z.string(),
  To: z.string(),
  Direction: z.string(),
  Timestamp: z.string().optional(),
})

export const twilioSmsSchema = z.object({
  MessageSid: z.string(),
  From: z.string(),
  To: z.string(),
  Body: z.string(),
  NumMedia: z.string(),
})

export function logError(context: string, error: any, additionalInfo?: any) {
  console.error(`[${context}] Error:`, error)
  if (additionalInfo) {
    console.error(`[${context}] Additional info:`, additionalInfo)
  }
}

export function logInfo(context: string, message: string, additionalInfo?: any) {
  console.log(`[${context}] ${message}`, additionalInfo || '')
}

export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '')
  return cleaned.length >= 10 && cleaned.length <= 15
}

export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return 'Unknown Caller'

  let normalized = phone.replace(/\D/g, '')

  // Handle E.164 format (+1XXXXXXXXXX) - strip leading 1
  if (normalized.length === 11 && normalized.startsWith('1')) {
    normalized = normalized.substring(1)
  }

  // Format as (XXX) XXX-XXXX
  if (normalized.length === 10) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`
  }

  // Return original if can't format
  return phone
}

/**
 * Get lead display name with graceful fallback
 * Priority: lead.raw_metadata?.callerName → lead.raw_metadata?.caller_name → lead.raw_metadata?.extracted_info?.callerName → lead.raw_metadata?.extracted_info?.name → ai_call_records extracted info → caller_phone / phone → "Unknown Caller"
 */
export function getLeadDisplayName(lead: any): string {
  // Try raw_metadata.callerName first (camelCase)
  if (lead.raw_metadata?.callerName && lead.raw_metadata.callerName.trim()) {
    return lead.raw_metadata.callerName.trim()
  }

  // Try raw_metadata.caller_name (snake_case)
  if (lead.raw_metadata?.caller_name && lead.raw_metadata.caller_name.trim()) {
    return lead.raw_metadata.caller_name.trim()
  }

  // Try raw_metadata.extracted_info.callerName (camelCase)
  if (lead.raw_metadata?.extracted_info?.callerName && lead.raw_metadata.extracted_info.callerName.trim()) {
    return lead.raw_metadata.extracted_info.callerName.trim()
  }

  // Try raw_metadata.extracted_info.name
  if (lead.raw_metadata?.extracted_info?.name && lead.raw_metadata.extracted_info.name.trim()) {
    return lead.raw_metadata.extracted_info.name.trim()
  }

  // Try raw_metadata.extracted_info.caller_name
  if (lead.raw_metadata?.extracted_info?.caller_name && lead.raw_metadata.extracted_info.caller_name.trim()) {
    return lead.raw_metadata.extracted_info.caller_name.trim()
  }

  // Try ai_call_records.extracted_info.callerName (camelCase)
  if (lead.ai_call_records && lead.ai_call_records.length > 0) {
    const aiCall = lead.ai_call_records[0]
    if (aiCall.extracted_info?.callerName && aiCall.extracted_info.callerName.trim()) {
      return aiCall.extracted_info.callerName.trim()
    }
  }

  // Try ai_call_records.extracted_info.name
  if (lead.ai_call_records && lead.ai_call_records.length > 0) {
    const aiCall = lead.ai_call_records[0]
    if (aiCall.extracted_info?.name && aiCall.extracted_info.name.trim()) {
      return aiCall.extracted_info.name.trim()
    }
  }

  // Try ai_call_records.extracted_info.caller_name
  if (lead.ai_call_records && lead.ai_call_records.length > 0) {
    const aiCall = lead.ai_call_records[0]
    if (aiCall.extracted_info?.caller_name && aiCall.extracted_info.caller_name.trim()) {
      return aiCall.extracted_info.caller_name.trim()
    }
  }

  // Try raw_metadata.ai_extracted_info.name
  if (lead.raw_metadata?.ai_extracted_info?.name && lead.raw_metadata.ai_extracted_info.name.trim()) {
    return lead.raw_metadata.ai_extracted_info.name.trim()
  }

  // Try raw_metadata.name
  if (lead.raw_metadata?.name && lead.raw_metadata.name.trim()) {
    return lead.raw_metadata.name.trim()
  }

  // Try formatted phone number
  if (lead.phone) {
    const formatted = formatPhoneNumber(lead.phone)
    if (formatted !== 'Unknown Caller') {
      return formatted
    }
  }

  // Try caller_phone
  if (lead.caller_phone) {
    const formatted = formatPhoneNumber(lead.caller_phone)
    if (formatted !== 'Unknown Caller') {
      return formatted
    }
  }

  // Try phone_number
  if (lead.phone_number) {
    const formatted = formatPhoneNumber(lead.phone_number)
    if (formatted !== 'Unknown Caller') {
      return formatted
    }
  }

  // Fallback to generic text
  return 'Unknown Caller'
}

/**
 * Get customer reply acknowledgement message
 * Simplified workflow: always return the same standardized message
 */
export function getCustomerReplyAcknowledgement(messageBody: string): string {
  return 'Thanks for the update. We\'ve added that information and will pass it along to the business.'
}

export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return ''
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  } catch (error) {
    console.error('Error formatting date:', error)
    return ''
  }
}

export function getReplyFlowPhoneNumber(business: any): string {
  // Always return the business's dedicated Twilio number
  // Never fall back to shared number in customer-facing code
  if (business?.twilio_phone_number) {
    return business.twilio_phone_number
  }
  
  // Return empty string if no dedicated number assigned
  // This prevents showing the shared toll-free number to customers
  return ''
}

export function getReplyFlowPhoneNumberDisplay(business: any): string {
  const phoneNumber = getReplyFlowPhoneNumber(business)
  return formatPhoneNumber(phoneNumber)
}

export function normalizePhoneNumber(input: string): string | null {
  const digits = input.replace(/\D/g, '')

  if (digits.length === 10) {
    return `+1${digits}`
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }

  if (digits.length > 11) {
    return `+${digits}`
  }

  return null
}

export function getLeadStatusColor(status: string): string {
  switch (status) {
    case 'new':
      return 'bg-blue-900/30 text-blue-400'
    case 'contacted':
      return 'bg-green-900/30 text-green-400'
    case 'qualified':
      return 'bg-purple-900/30 text-purple-400'
    case 'closed':
      return 'bg-slate-800 text-slate-400'
    default:
      return 'bg-slate-800 text-slate-400'
  }
}

/**
 * Normalize punctuation to prevent duplicate periods and other punctuation issues.
 * 
 * This function ensures that when concatenating strings, we don't create duplicate punctuation
 * like "..", "... .", or similar artifacts that can occur when AI-generated text is combined
 * with templates or other strings.
 * 
 * Examples:
 * - "Need estimate." + "." → "Need estimate."
 * - "Need estimate" + "." → "Need estimate."
 * - "Need estimate..." + "." → "Need estimate."
 * 
 * @param text - The text to normalize
 * @returns The text with normalized punctuation
 */
export function normalizePunctuation(text: string | null | undefined): string {
  if (!text) return ''
  
  const original = text.trim()
  let normalized = original
  
  // Remove trailing periods, question marks, and exclamation marks
  // This prevents duplicates when concatenating with punctuation
  normalized = normalized.replace(/[.!?]+$/, '')
  
  // Log normalization for debugging
  if (original !== normalized) {
    console.log('[AI FIELD NORMALIZED]', {
      original: original,
      normalized: normalized
    })
  }
  
  return normalized
}

/**
 * Normalize phone number for search by removing all formatting characters.
 * 
 * This function removes spaces, parentheses, dashes, periods, and plus signs
 * to enable flexible phone number search across different formats.
 * 
 * Examples:
 * - "+14125551234" → "14125551234"
 * - "(412) 555-1234" → "4125551234"
 * - "412-555-1234" → "4125551234"
 * - "412 555 1234" → "4125551234"
 * 
 * @param phone - The phone number to normalize
 * @returns The normalized phone number (digits only)
 */
export function normalizePhoneNumberForSearch(phone: string | null | undefined): string {
  if (!phone) return ''
  return phone.replace(/[\s\(\)\-\.\+]/g, '')
}
