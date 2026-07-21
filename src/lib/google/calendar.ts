import { getGoogleAccessToken } from './token'

export interface EventTimes {
  start?: string
  end?: string
}

export async function getEventTimes(businessId: string, eventId: string): Promise<EventTimes> {
  const { accessToken } = await getGoogleAccessToken(businessId)
  const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!res.ok) return {}
  const ev = await res.json()
  const start = ev?.start?.dateTime || ev?.start?.date || undefined
  const end = ev?.end?.dateTime || ev?.end?.date || undefined
  return { start, end }
}
