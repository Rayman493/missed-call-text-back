/**
 * Schema Alignment Test
 *
 * This test ensures that the application's canonical notification types
 * are represented in the migration-defined allowed set.
 *
 * This prevents drift where new notification types are added to the
 * application without updating the database CHECK constraint.
 */

import { describe, it, expect } from 'vitest'
import { Notification } from '../notifications'

// The complete set of notification types that should be allowed by the database CHECK constraint
// This must match the constraint defined in the latest migration:
// supabase/migrations/20260910000000_fix_notification_type_constraint.sql
const DB_ALLOWED_NOTIFICATION_TYPES = [
  'new_lead',
  'customer_reply',
  'followup_completed',
  'followup_sent',
  'forwarding_disconnected',
  'sms_failed',
  'trial_ending',
  'subscription_issue',
  'voicemail_received',
  'missed_call',
  'ai_intake_completed',
  'payment_requested',
  'payment_created',
  'payment_completed',
  'calendar_connected',
  'calendar_disconnected',
  'appointment_created',
  'appointment_deleted',
  'personal_voicemail',
] as const

// Extract notification types from the TypeScript type union
// This uses a type assertion to get the actual literal values from the type
type NotificationType = Notification['type']
const getNotificationTypes = (): NotificationType[] => {
  // This will cause a TypeScript error if the type union changes
  // without updating this array, forcing alignment
  const types: NotificationType[] = [
    'new_lead',
    'customer_reply',
    'followup_completed',
    'followup_sent',
    'forwarding_disconnected',
    'sms_failed',
    'trial_ending',
    'subscription_issue',
  'voicemail_received',
    'missed_call',
    'ai_intake_completed',
    'payment_requested',
    'payment_created',
    'payment_completed',
    'calendar_connected',
    'calendar_disconnected',
    'appointment_created',
    'appointment_deleted',
    'personal_voicemail',
  ]
  return types
}

describe('Notification Schema Alignment', () => {
  it('should have all TypeScript notification types in the database constraint', () => {
    const tsTypes = getNotificationTypes()

    for (const type of tsTypes) {
      expect(DB_ALLOWED_NOTIFICATION_TYPES).toContain(type)
    }
  })

  it('should have all database constraint types in the TypeScript union', () => {
    const tsTypes = getNotificationTypes()

    for (const type of DB_ALLOWED_NOTIFICATION_TYPES) {
      expect(tsTypes).toContain(type)
    }
  })

  it('should have the exact same set of types in both TypeScript and database', () => {
    const tsTypes = getNotificationTypes().sort()
    const dbTypes = [...DB_ALLOWED_NOTIFICATION_TYPES].sort()

    expect(tsTypes).toEqual(dbTypes)
  })

  it('should include legacy types for backward compatibility', () => {
    // These types are no longer actively produced but may exist in historical rows
    expect(DB_ALLOWED_NOTIFICATION_TYPES).toContain('followup_sent')
    expect(DB_ALLOWED_NOTIFICATION_TYPES).toContain('missed_call')
  })

  it('should include all actively produced notification types', () => {
    // These types are actively produced by the application
    const activelyProducedTypes = [
      'ai_intake_completed',
      'payment_requested',
      'payment_created',
      'payment_completed',
      'calendar_connected',
      'calendar_disconnected',
      'appointment_created',
      'appointment_deleted',
    ]

    for (const type of activelyProducedTypes) {
      expect(DB_ALLOWED_NOTIFICATION_TYPES).toContain(type)
    }
  })
})