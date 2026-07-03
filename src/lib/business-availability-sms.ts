export type BusinessAvailabilityNoticeType = 'none' | 'after_hours' | 'out_of_office'

export interface BusinessAvailabilityNoticeResult {
  type: BusinessAvailabilityNoticeType
  notice: string | null
}

function replaceBusinessName(message: string, business: any): string {
  return message.replace(/\{\{business_name\}\}/gi, business?.name || 'the business').trim()
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

  if (business.out_of_office_enabled && business.out_of_office_start && business.out_of_office_end) {
    const now = new Date()
    const start = new Date(business.out_of_office_start)
    const end = new Date(business.out_of_office_end)

    if (now >= start && now <= end) {
      const notice = business.out_of_office_message && business.out_of_office_message.trim()
        ? replaceBusinessName(business.out_of_office_message, business)
        : `Thanks for contacting ${business.name || 'the business'}. We are currently out of office and responses may be delayed.`

      return { type: 'out_of_office', notice }
    }
  }

  if (!isWithinBusinessHoursForSms(business)) {
    const notice = business.after_hours_message && business.after_hours_message.trim()
      ? replaceBusinessName(business.after_hours_message, business)
      : `Thanks for calling ${business.name || 'the business'}. We are currently closed and will get back to you during business hours.`

    return { type: 'after_hours', notice }
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

  return `${body.trim()}\n\n${notice}`
}
