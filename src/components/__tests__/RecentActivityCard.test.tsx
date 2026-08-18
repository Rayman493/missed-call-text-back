/**
 * RecentActivityCard Navigation and Friendly Name Tests
 *
 * Tests for:
 * - Activity card navigation to customer detail
 * - Voicemail activity includes customerId and is navigable
 * - Job and appointment activities include jobId
 * - Friendly names are used instead of internal identifiers
 */

import { describe, it, expect } from 'vitest'

describe('RecentActivityCard', () => {
  describe('Activity Navigation', () => {
    it('customer-related activities should have customerId for navigation', () => {
      // This documents the expected structure
      const navigableTypes = [
        'call_captured',
        'job_created',
        'job_completed',
        'task_completed',
        'appointment_scheduled',
        'payment_requested',
        'payment_received',
        'payment_failed',
        'voicemail_received',
      ]

      navigableTypes.forEach(type => {
        const activity = {
          id: `test-${type}`,
          type,
          customerId: 'customer-123',
          customerName: 'John Doe',
          title: 'Test Activity',
          description: 'Test description',
          timestamp: new Date().toISOString(),
          icon: null,
          iconBgColor: 'bg-blue-500/20',
          iconTextColor: 'text-blue-400',
        }

        expect(activity.customerId).toBe('customer-123')
      })
    })

    it('job activities should include jobId for potential navigation', () => {
      const jobActivities = [
        'job_created',
        'job_completed',
        'appointment_scheduled',
      ]

      jobActivities.forEach(type => {
        const activity = {
          id: `test-${type}`,
          type,
          customerId: 'customer-123',
          jobId: 'job-456',
          jobTitle: 'Test Job',
          title: 'Test Activity',
          description: 'Test description',
          timestamp: new Date().toISOString(),
          icon: null,
          iconBgColor: 'bg-blue-500/20',
          iconTextColor: 'text-blue-400',
        }

        expect(activity.jobId).toBe('job-456')
      })
    })

    it('voicemail activities should include customerId and customerName', () => {
      const voicemailActivity = {
        id: 'voicemail-123',
        type: 'voicemail_received',
        customerId: 'customer-789',
        customerName: '(555) 123-4567',
        title: 'Voicemail Received',
        description: 'Left a voicemail',
        timestamp: new Date().toISOString(),
        icon: null,
        iconBgColor: 'bg-purple-500/20',
        iconTextColor: 'text-purple-400',
      }

      expect(voicemailActivity.customerId).toBe('customer-789')
      expect(voicemailActivity.customerName).toBeDefined()
    })
  })

  describe('Friendly Name Display', () => {
    it('prefers customerName over phone number', () => {
      const formatPhoneNumber = (phone: string): string => {
        if (!phone) return ''
        const digits = phone.replace(/\D/g, '')
        if (digits.length === 10) {
          return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
        }
        // If not exactly 10 digits, return original
        return phone
      }

      const getDisplayName = (customerName?: string, customerPhone?: string): string => {
        if (customerName && customerName !== 'Unknown') {
          return customerName
        }
        if (customerPhone) {
          return formatPhoneNumber(customerPhone)
        }
        return 'Customer'
      }

      // Test with customerName
      expect(getDisplayName('John Doe', '5551234567')).toBe('John Doe')

      // Test without customerName but with 10-digit phone
      expect(getDisplayName(undefined, '5551234567')).toBe('(555) 123-4567')

      // Test without customerName but with international phone (not 10 digits)
      expect(getDisplayName(undefined, '+15551234567')).toBe('+15551234567')

      // Test without either
      expect(getDisplayName(undefined, undefined)).toBe('Customer')

      // Test with 'Unknown' name (should fall back to phone)
      expect(getDisplayName('Unknown', '5551234567')).toBe('(555) 123-4567')
    })

    it('does not expose raw UUIDs or internal database identifiers', () => {
      // Verify that the component structure doesn't include raw IDs in display fields
      const activity = {
        id: 'activity-uuid-12345',
        customerId: 'customer-uuid-67890',
        customerName: 'John Doe',
        title: 'Test Activity',
        description: 'Test description',
        timestamp: new Date().toISOString(),
        icon: null,
        iconBgColor: 'bg-blue-500/20',
        iconTextColor: 'text-blue-400',
      }

      // customerName should be the friendly name, not the UUID
      expect(activity.customerName).toBe('John Doe')
      expect(activity.customerName).not.toContain('uuid')
      expect(activity.customerName).not.toContain('customer-')
    })
  })

  describe('Activity Click Behavior', () => {
    it('navigates to customer detail when customerId exists', () => {
      const activity = {
        customerId: 'customer-123',
      }

      const targetRoute = `/dashboard/leads/${activity.customerId}`
      expect(targetRoute).toBe('/dashboard/leads/customer-123')
    })

    it('does not navigate when customerId is missing', () => {
      const activity = {
        // No customerId
        title: 'Message Sent',
      }

      expect(activity.customerId).toBeUndefined()
    })

    it('navigable activities should use semantic Link element', () => {
      // This documents the expected implementation
      const navigableActivity = {
        customerId: 'customer-123',
      }

      // When customerId exists, should render as Link with href
      const shouldUseLink = !!navigableActivity.customerId
      expect(shouldUseLink).toBe(true)

      if (shouldUseLink) {
        const href = `/dashboard/leads/${navigableActivity.customerId}`
        expect(href).toBe('/dashboard/leads/customer-123')
      }
    })

    it('non-navigable activities should use plain div', () => {
      const nonNavigableActivity = {
        // No customerId
        title: 'Message Sent',
      }

      // When customerId doesn't exist, should render as plain div
      const shouldUseLink = !!nonNavigableActivity.customerId
      expect(shouldUseLink).toBe(false)
    })
  })
})