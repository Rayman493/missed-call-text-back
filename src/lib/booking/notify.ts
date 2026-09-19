/**
 * Online Booking — Phase 2 business-facing notifications.
 *
 * One notification type ('booking_request') covers the lifecycle;
 * data.event distinguishes the cause and feeds the atomic idempotency key
 * (bookreq_<requestId>_<event>) so a retried transition can never spam the
 * notification feed. Deep-links to Schedule → Overview, where the booking
 * card is the management surface.
 */

import { notificationServiceServer } from '@/lib/notifications-server'

export type BookingNotifyEvent = 'new_request' | 'customer_accepted' | 'customer_reselected'

const EVENT_MESSAGE: Record<BookingNotifyEvent, string> = {
  new_request: 'New online booking request',
  customer_accepted: 'Customer accepted the suggested time',
  customer_reselected: 'Customer picked a different time',
}

export async function notifyBookingRequest(
  businessId: string,
  requestId: string,
  event: BookingNotifyEvent,
  customerName?: string | null,
): Promise<void> {
  try {
    await notificationServiceServer.createNotification(
      businessId,
      'booking_request',
      EVENT_MESSAGE[event],
      {
        bookingRequestId: requestId,
        event,
        leadName: customerName ?? null,
      },
      '/dashboard/calendar',
      'View Schedule',
    )
  } catch (error) {
    // Notification delivery is never allowed to break the booking transition.
    console.warn('[BOOKING] business notification failed (non-fatal):', error)
  }
}
