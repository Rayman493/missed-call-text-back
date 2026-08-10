import { getDefaultOutOfOfficeTemplate, getDefaultAfterHoursTemplate } from '@/lib/out-of-office'

export type BusinessAvailabilityNoticeType = 'none' | 'after_hours' | 'out_of_office'

export interface BusinessAvailabilityNoticeResult {
  type: BusinessAvailabilityNoticeType
  notice: string | null
}

// SMS-specific concise defaults (optimized for segment efficiency)
function getSmsDefaultAfterHoursTemplate(businessName: string | null): string {
  if (businessName && businessName.trim()) {
    return `${businessName.trim()} is currently closed. They'll review your message during business hours.`
  }
  return "We're currently closed. Your message will be reviewed during business hours."
}

function getSmsDefaultOutOfOfficeTemplate(businessName: string | null, returnDate: string | null): string {
  if (businessName && businessName.trim()) {
    if (returnDate && returnDate.trim()) {
      return `${businessName.trim()} is currently away. Responses may be delayed until ${returnDate.trim()}.`
    }
    return `${businessName.trim()} is currently away, so responses may be delayed.`
  }
  if (returnDate && returnDate.trim()) {
    return `We're currently away. Responses may be delayed until ${returnDate.trim()}.`
  }
  return "We're currently away, so responses may be delayed."
}

export function isWithinBusinessHoursForSms(business: any): boolean {
  const businessHoursEnabled = business?.business_hours_enabled || false
  if (!businessHoursEnabled) return true

  const businessHoursStart = business.business_hours_start || '09:00'
  const businessHoursEnd = business.business_hours_end || '17:00'
  const businessTimezone = business.business_hours_timezone || 'America/New_York'

  const now = new Date()
  const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: businessTimezone }))

  const [startHour, startMin] = businessHoursStart.split(':').map(Number)
  const [endHour, endMin] = businessHoursEnd.split(':').map(Number)

  const currentHour = nowInTimezone.getHours()
  const currentMin = nowInTimezone.getMinutes()
  const currentTimeInMinutes = currentHour * 60 + currentMin
  const startTimeInMinutes = startHour * 60 + startMin
  const endTimeInMinutes = endHour * 60 + endMin

  const dayIndex = nowInTimezone.getDay()
  const isWeekday = dayIndex >= 1 && dayIndex <= 5

  return isWeekday && currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes < endTimeInMinutes
}

export function getBusinessAvailabilityNoticeForSms(business: any): BusinessAvailabilityNoticeResult {
  if (!business) return { type: 'none', notice: null }

  const businessName = business?.name && business.name.trim() ? business.name.trim() : null

  // Out of office takes precedence
  if (business.out_of_office_enabled && business.out_of_office_start && business.out_of_office_end) {
    const now = new Date()
    const start = new Date(business.out_of_office_start)
    const end = new Date(business.out_of_office_end)

    if (now >= start && now <= end) {
      // Use custom message if present, otherwise use SMS-specific default
      if (business.out_of_office_message && business.out_of_office_message.trim()) {
        // Custom message: preserve merchant wording, just replace placeholders
        const customMessage = business.out_of_office_message.trim()
        let notice = customMessage
        notice = notice.replace(/\{\{business_name\}\}/gi, businessName || 'the business')
        if (business.out_of_office_end) {
          const endDate = new Date(business.out_of_office_end)
          const friendlyDate = endDate.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
          })
          notice = notice.replace(/\{\{return_date\}\}/gi, friendlyDate)
        }
        return { type: 'out_of_office', notice }
      } else {
        // Use SMS-specific default
        const returnDate = business.out_of_office_end
          ? new Date(business.out_of_office_end).toLocaleDateString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric'
            })
          : null
        const notice = getSmsDefaultOutOfOfficeTemplate(businessName, returnDate)
        return { type: 'out_of_office', notice }
      }
    }
  }

  // After hours
  if (!isWithinBusinessHoursForSms(business)) {
    // Use custom message if present, otherwise use SMS-specific default
    if (business.after_hours_message && business.after_hours_message.trim()) {
      // Custom message: preserve merchant wording, just replace placeholders
      let notice = business.after_hours_message.trim()
      notice = notice.replace(/\{\{business_name\}\}/gi, businessName || 'the business')
      return { type: 'after_hours', notice }
    } else {
      // Use SMS-specific default
      const notice = getSmsDefaultAfterHoursTemplate(businessName)
      return { type: 'after_hours', notice }
    }
  }

  return { type: 'none', notice: null }
}

export function appendBusinessAvailabilityNote(message: string, business: any): string {
  const body = message || ''
  const { notice } = getBusinessAvailabilityNoticeForSms(business)
  if (!notice) return body

  const normalizedBody = body.replace(/\s+/g, ' ').trim().toLowerCase()
  const normalizedNotice = notice.replace(/\s+/g, ' ').trim().toLowerCase()

  if (normalizedBody.includes(normalizedNotice)) return body

  return `${body.trim()}\n\n----------\n\n${notice}`
}
