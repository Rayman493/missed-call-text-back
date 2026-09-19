/**
 * Online Booking — shared types.
 *
 * A booking request is a PRE-CUSTOMER intake record. It must never create
 * leads, jobs, appointments, or conversations at submission time — it only
 * stores enough snapshot data to create a canonical customer on later accept.
 */

export const BOOKING_REQUEST_STATUSES = [
  'pending',
  'business_proposed',
  'customer_reselected',
  'accepted',
  'declined',
  'cancelled',
  'expired',
] as const

export type BookingRequestStatus = (typeof BOOKING_REQUEST_STATUSES)[number]

/** Statuses whose effective window is held against other public bookers. */
export const ACTIVE_BOOKING_STATUSES: BookingRequestStatus[] = [
  'pending',
  'business_proposed',
  'customer_reselected',
]

export const BOOKING_EVENT_TYPES = [
  'created',
  'time_proposed',
  'time_selected',
  'accepted',
  'declined',
  'cancelled',
  'expired',
] as const

export type BookingEventType = (typeof BOOKING_EVENT_TYPES)[number]

export interface BookingSettings {
  id: string
  business_id: string
  enabled: boolean
  public_slug: string | null
  timezone: string
  default_duration_minutes: number
  slot_interval_minutes: number
  min_notice_minutes: number
  booking_window_days: number
  use_business_hours: boolean
  created_at: string
  updated_at: string
}

export interface BookingHoursRow {
  id: string
  business_id: string
  day_of_week: number // JS convention: 0 = Sunday … 6 = Saturday
  start_time: string // 'HH:mm' wall time in the booking timezone
  end_time: string
}

export interface BookingException {
  id: string
  business_id: string
  start_at: string
  end_at: string
  all_day: boolean
  label: string | null // INTERNAL ONLY — never exposed publicly
  created_at: string
}

export interface BookingRequest {
  id: string
  business_id: string
  continuation_token: string
  client_request_id: string | null
  status: BookingRequestStatus
  customer_name: string
  customer_phone: string | null
  normalized_phone: string | null
  customer_email: string | null
  customer_address: string | null
  service: string | null
  notes: string | null
  requested_start: string
  requested_end: string
  current_proposed_start: string | null
  current_proposed_end: string | null
  timezone: string
  hold_expires_at: string
  lead_id: string | null
  appointment_id: string | null
  job_id: string | null
  created_at: string
  updated_at: string
}

export interface BookingRequestEvent {
  id: string
  booking_request_id: string
  business_id: string
  event_type: BookingEventType
  actor: 'customer' | 'business' | 'system'
  from_status: string | null
  to_status: string | null
  start_at: string | null
  end_at: string | null
  note: string | null
  created_at: string
}

/** A concrete busy window in UTC. Source is never exposed publicly. */
export interface BusyWindow {
  start: Date
  end: Date
}

/** One generated public slot — the ONLY shape the public API may return. */
export interface AvailableSlot {
  start: string // ISO UTC
  end: string // ISO UTC
}
