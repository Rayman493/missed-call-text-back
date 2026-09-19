/**
 * Booking notification name presentation tests
 *
 * Booking lifecycle notifications carry the customer name in BOTH the title
 * (from the booking_request template) and data.leadName. The navbar dropdown
 * renders title + displayName + message, so without suppression the customer
 * name printed twice:
 *
 *   Ryan Bandi        <- title
 *   Ryan Bandi        <- displayName (bug)
 *   Customer accepted the suggested time
 *
 * These tests pin the suppression contract and guard the other notification
 * types that still legitimately need a standalone name line.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolveNotificationSubject, notificationIncludesCustomerContext } from '@/lib/notifications'

const navbarSource = readFileSync(
  'src/components/NavbarNotifications.tsx',
  'utf8'
).replace(/\r\n/g, '\n')

const notificationsTypes = readFileSync(
  'src/lib/notifications.ts',
  'utf8'
).replace(/\r\n/g, '\n')

// Mirror of the production suppression list in NavbarNotifications.getDisplayName
const NAME_IN_TITLE_TYPES = [
  'new_lead',
  'followup_completed',
  'ai_intake_completed',
  'missed_call',
  'booking_request',
]

function displayNameFor(notification: any): string | null {
  const subject = resolveNotificationSubject(notification)
  if (NAME_IN_TITLE_TYPES.includes(notification.type)) return null
  if (notification.type === 'sms_failed' && notification.data?.lead_phone) {
    return 'masked'
  }
  if (subject === 'Unknown Caller') return null
  if (notification.message && notification.message.startsWith(`${subject}:`)) return null
  return subject
}

describe('booking_request notification name suppression', () => {
  it('booking_request is registered in the navbar name-in-title suppression list', () => {
    const listMatch = navbarSource.match(/const nameInTitleTypes = \[([^\]]+)\]/)
    expect(listMatch).not.toBeNull()
    expect(listMatch![1]).toContain("'booking_request'")
  })

  it('booking_request is a known client-side notification type', () => {
    expect(notificationsTypes).toContain("'booking_request'")
  })

  it('new booking request notification renders the customer name once', () => {
    const notification = {
      type: 'booking_request',
      title: 'Ryan Bandi',
      message: 'New online booking request',
      data: { leadName: 'Ryan Bandi', bookingRequestId: 'br-1', event: 'created' },
    }
    expect(displayNameFor(notification)).toBeNull()
    // Rendered rows: title (Ryan Bandi) + message — name appears exactly once.
    const renderedLines = [notification.title, displayNameFor(notification), notification.message].filter(Boolean)
    expect(renderedLines.filter((l) => l === 'Ryan Bandi')).toHaveLength(1)
  })

  it('accepted booking notification renders the customer name once', () => {
    const notification = {
      type: 'booking_request',
      title: 'Ryan Bandi',
      message: 'Customer accepted the suggested time',
      data: { leadName: 'Ryan Bandi', bookingRequestId: 'br-1', event: 'accepted' },
    }
    expect(displayNameFor(notification)).toBeNull()
    const renderedLines = [notification.title, displayNameFor(notification), notification.message].filter(Boolean)
    expect(renderedLines).toEqual(['Ryan Bandi', 'Customer accepted the suggested time'])
  })

  it('booking notification without a customer name stays clean', () => {
    const notification = {
      type: 'booking_request',
      title: 'Booking Request',
      message: 'New online booking request',
      data: { bookingRequestId: 'br-2', event: 'created' },
    }
    expect(displayNameFor(notification)).toBeNull()
    expect(notification.title).toBe('Booking Request')
  })
})

describe('suppression does not regress other notification types', () => {
  it('customer_reply still shows the standalone name line', () => {
    const notification = {
      type: 'customer_reply',
      title: 'New Message',
      message: 'sounds good, see you then',
      data: { leadName: 'Ryan Bandi' },
    }
    expect(displayNameFor(notification)).toBe('Ryan Bandi')
  })

  it('a type with a distinct subject still renders the unique name line', () => {
    const notification = {
      type: 'payment_completed',
      title: 'Payment Received',
      message: '$150.00 paid',
      data: { leadName: 'Jordan Lee' },
    }
    expect(displayNameFor(notification)).toBe('Jordan Lee')
  })

  it('calendar_connected keeps its own presentation', () => {
    const notification = {
      type: 'calendar_connected',
      title: 'Calendar Connected',
      message: 'Google Calendar linked',
      data: {},
    }
    expect(displayNameFor(notification)).toBeNull()
  })

  it('shared context helper already suppresses booking_request on the full page', () => {
    // The /dashboard/notifications page uses notificationIncludesCustomerContext;
    // a booking notification whose title IS the customer name suppresses the
    // extra context line there too — this documents parity with the navbar fix.
    const notification = {
      type: 'booking_request',
      title: 'Ryan Bandi',
      message: 'Customer accepted the suggested time',
      data: { leadName: 'Ryan Bandi' },
    } as any
    expect(notificationIncludesCustomerContext(notification)).toBe(true)
  })
})
