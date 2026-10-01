import { capitalizeFirstAlpha, normalizePunctuation } from '@/lib/utils'

/**
 * Shared notification body formatting helpers (pure — safe on client + server).
 *
 * Used by notifications-server.ts and notifications.ts so in-app and push
 * surfaces render the same identifying context for appointment events.
 */

/** Format an appointment start in the business's timezone. Date-only
 *  strings (all-day events, "YYYY-MM-DD") are calendar dates — rendered
 *  as written, not parsed as UTC midnight (which would shift the day in
 *  western timezones). Returns '' for missing/invalid. */
export function formatAppointmentWhen(dateStr: string | undefined | null, timeZone?: string | null): string {
  if (!dateStr) return ''
  const hasTime = dateStr.includes('T')
  if (!hasTime) {
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
      const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
      return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d)
    }
  }
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      ...(hasTime ? { hour: 'numeric', minute: '2-digit' } : {}),
      ...(timeZone ? { timeZone } : {}),
    }).format(d)
  } catch {
    return ''
  }
}

/** Join contextual parts with a separator, skipping empty/missing values. */
export function joinNotificationParts(...parts: (string | null | undefined)[]): string {
  return parts.map((p) => (p || '').trim()).filter(Boolean).join(' · ')
}

/**
 * Return the appointment summary only when it carries identifying info —
 * generic placeholders like "Appointment" add nothing.
 */
export function usefulAppointmentTitle(title: string | null | undefined): string {
  const t = (title || '').trim()
  if (!t || t.toLowerCase() === 'appointment') return ''
  return t
}

/**
 * Build the appointment notification message: "Customer · Summary · Sep 29, 2:00 PM".
 * Skips the customer name when the summary already contains it.
 */
export function appointmentNotificationMessage(
  title: string | null | undefined,
  date: string | undefined | null,
  customerName?: string | null,
  timeZone?: string | null,
): string {
  const summary = usefulAppointmentTitle(title)
  const name = (customerName || '').trim()
  const namePart = name && summary.toLowerCase().includes(name.toLowerCase()) ? '' : name
  return joinNotificationParts(namePart, summary, formatAppointmentWhen(date, timeZone))
}

/**
 * AI intake completion notification body.
 *
 * The caller's display name already renders as the notification title (the
 * ai_intake_completed template resolves it from leadName). The body must
 * carry only the caller's reason — composing `name · reason` here produced
 * "Ryan Ryan · <reason>" on surfaces that render title + body together.
 */
export function aiIntakeNotificationBody(serviceRequested?: string | null): string {
  const service = serviceRequested ? capitalizeFirstAlpha(normalizePunctuation(serviceRequested)) : ''
  return service || 'New customer request'
}

// Values that must never be shown as a customer's name.
const VOICEMAIL_NAME_PLACEHOLDERS = new Set([
  'customer',
  'unknown',
  'unknown customer',
  'caller',
  'anonymous',
  'not collected',
])

/**
 * Resolve a usable caller display name from a business-scoped lead row for
 * the voicemail notification. Consults every name store production rows
 * actually use: the canonical contact_name column, the legacy name column,
 * and corrected/extracted intake metadata. Returns null for blanks,
 * placeholders, and phone-number-shaped values so the caller falls back to
 * the formatted phone number.
 */
export function resolveVoicemailCallerName(
  lead: { contact_name?: string | null; name?: string | null; raw_metadata?: any } | null | undefined
): string | null {
  if (!lead) return null

  const candidates = [
    lead.contact_name,
    lead.name,
    lead.raw_metadata?.corrected_fields?.name,
    lead.raw_metadata?.corrected_fields?.callerName,
    lead.raw_metadata?.extracted_info?.callerName,
    lead.raw_metadata?.extracted_info?.customerName,
    lead.raw_metadata?.customerName,
  ]

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue
    const trimmed = candidate.trim()
    if (!trimmed) continue
    if (VOICEMAIL_NAME_PLACEHOLDERS.has(trimmed.toLowerCase())) continue
    // Reject phone-number-shaped values (e.g. "+1 (412) 253-3598", "4122533598")
    const digits = trimmed.replace(/\D/g, '')
    if (digits.length >= 7 && /^[\d\s()+.\-#*xX]+$/.test(trimmed)) continue
    return trimmed
  }

  return null
}
