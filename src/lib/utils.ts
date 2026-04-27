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
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  
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

export function formatPhoneNumber(phone: string): string {
  const normalized = phone.replace(/\D/g, '')
  
  // Format as (XXX) XXX-XXXX for 10-digit US numbers
  if (normalized.length === 10) {
    return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`
  }
  
  // Return as is for other formats
  return phone
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
      return 'bg-blue-100 text-blue-800'
    case 'contacted':
      return 'bg-green-100 text-green-800'
    case 'qualified':
      return 'bg-purple-100 text-purple-800'
    case 'closed':
      return 'bg-gray-100 text-gray-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}
