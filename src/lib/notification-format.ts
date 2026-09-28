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
