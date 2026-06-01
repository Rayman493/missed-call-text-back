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
  if (!phone) return 'Latest Lead'

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
 * Priority: lead.name → formatted phone number → "Latest Lead"
 */
export function getLeadDisplayName(lead: any): string {
  // Try lead name first
  if (lead.name && lead.name.trim()) {
    return lead.name.trim()
  }

  // Try formatted phone number
  if (lead.customer_phone || lead.phone) {
    const phone = lead.customer_phone || lead.phone
    const formatted = formatPhoneNumber(phone)
    if (formatted !== 'Latest Lead') {
      return formatted
    }
  }

  // Fallback to generic text
  return 'Latest Lead'
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
