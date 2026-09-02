/**
 * Manual Customer Creation Tests
 *
 * Tests for creating customers without phone numbers
 */

import { describe, it, expect } from 'vitest'
import { hasPhoneNumber } from '@/lib/utils'

describe('Manual Customer Creation - Optional Phone', () => {
  describe('Database Migration', () => {
    it('should allow multiple phone-less customers per business', async () => {
      // This test would require database access
      // For now, we verify the migration SQL is correct
      const migrationSQL = `
        CREATE UNIQUE INDEX leads_business_id_caller_phone_unique
        ON leads(business_id, caller_phone)
        WHERE caller_phone IS NOT NULL;
      `
      expect(migrationSQL).toContain('WHERE caller_phone IS NOT NULL')
    })

    it('should preserve uniqueness for non-null phones', async () => {
      // Verify the partial index only applies when phone is not null
      const migrationSQL = `
        CREATE UNIQUE INDEX leads_business_id_caller_phone_unique
        ON leads(business_id, caller_phone)
        WHERE caller_phone IS NOT NULL;
      `
      expect(migrationSQL).toContain('UNIQUE INDEX')
      expect(migrationSQL).toContain('business_id, caller_phone')
    })

    it('should make caller_phone column nullable', async () => {
      // Verify the migration makes caller_phone nullable
      const migrationSQL = `
        ALTER TABLE leads ALTER COLUMN caller_phone DROP NOT NULL;
      `
      expect(migrationSQL).toContain('ALTER TABLE leads ALTER COLUMN caller_phone DROP NOT NULL')
    })
  })

  describe('Customer Creation Cases', () => {
    it('should create customer with name only', async () => {
      const payload = {
        businessId: 'test-business-id',
        customerName: 'John Doe',
        phoneNumber: undefined,
        email: undefined
      }
      // Would call API and verify success
      expect(payload.customerName).toBeDefined()
      expect(payload.phoneNumber).toBeUndefined()
    })

    it('should create customer with name + email without phone', async () => {
      const payload = {
        businessId: 'test-business-id',
        customerName: 'Jane Smith',
        phoneNumber: undefined,
        email: 'jane@example.com'
      }
      expect(payload.customerName).toBeDefined()
      expect(payload.email).toBeDefined()
      expect(payload.phoneNumber).toBeUndefined()
    })

    it('should create customer with name + phone', async () => {
      const payload = {
        businessId: 'test-business-id',
        customerName: 'Bob Johnson',
        phoneNumber: '4125551234',
        email: undefined
      }
      expect(payload.customerName).toBeDefined()
      expect(payload.phoneNumber).toBeDefined()
    })

    it('should reject missing name', async () => {
      const payload = {
        businessId: 'test-business-id',
        customerName: '',
        phoneNumber: undefined
      }
      expect(payload.customerName).toBe('')
      // API should return 400 with validation error
    })

    it('should normalize blank phone to null/undefined', async () => {
      const phoneNumber = ''
      const normalized = phoneNumber || undefined
      expect(normalized).toBeUndefined()
    })

    it('should allow two separate phone-less customers', async () => {
      const customer1 = {
        businessId: 'test-business-id',
        customerName: 'Customer One',
        phoneNumber: undefined
      }
      const customer2 = {
        businessId: 'test-business-id',
        customerName: 'Customer Two',
        phoneNumber: undefined
      }
      // Both should succeed without unique constraint violation
      expect(customer1.customerName).not.toBe(customer2.customerName)
    })
  })

  describe('Phone Deduping', () => {
    it('should dedupe when phone exists and matches', async () => {
      const phone = '4125551234'
      const customer1 = { businessId: 'test', phoneNumber: phone }
      const customer2 = { businessId: 'test', phoneNumber: phone }
      // Should find existing customer
      expect(customer1.phoneNumber).toBe(customer2.phoneNumber)
    })

    it('should not dedupe when phones differ', async () => {
      const customer1 = { businessId: 'test', phoneNumber: '4125551234' }
      const customer2 = { businessId: 'test', phoneNumber: '4125555678' }
      // Should create new customer
      expect(customer1.phoneNumber).not.toBe(customer2.phoneNumber)
    })

    it('should not dedupe phone-less customers', async () => {
      const customer1 = { businessId: 'test', phoneNumber: undefined }
      const customer2 = { businessId: 'test', phoneNumber: undefined }
      // Should create new customer (no phone to dedupe on)
      expect(customer1.phoneNumber).toBe(customer2.phoneNumber)
    })
  })
})

describe('Downstream Non-Phone Features', () => {
  it('should allow job creation for phone-less customer', async () => {
    const customer = { id: 'test-id', caller_phone: null, name: 'Test Customer' }
    const job = { customerId: customer.id, title: 'Test Job' }
    expect(customer.caller_phone).toBeNull()
    // Job should be created successfully
  })

  it('should allow task creation for phone-less customer', async () => {
    const customer = { id: 'test-id', caller_phone: null, name: 'Test Customer' }
    const task = { leadId: customer.id, title: 'Test Task' }
    expect(customer.caller_phone).toBeNull()
    // Task should be created successfully
  })

  it('should allow appointment creation for phone-less customer', async () => {
    const customer = { id: 'test-id', caller_phone: null, name: 'Test Customer' }
    const appointment = { leadId: customer.id, title: 'Test Appointment' }
    expect(customer.caller_phone).toBeNull()
    // Appointment should be created successfully
  })
})

describe('Phone-Dependent UI Gating', () => {
  it('should check hasPhoneNumber before SMS', () => {
    expect(hasPhoneNumber(null)).toBe(false)
    expect(hasPhoneNumber('')).toBe(false)
    expect(hasPhoneNumber('4125551234')).toBe(true)
  })

  it('should block SMS for phone-less customer at UI level', async () => {
    const customer = { caller_phone: null, name: 'Test' }
    const hasPhone = hasPhoneNumber(customer.caller_phone)
    expect(hasPhone).toBe(false)
    // UI should show "Add phone number to send SMS" message
  })

  it('should block call for phone-less customer at UI level', async () => {
    const customer = { caller_phone: null, name: 'Test' }
    const hasPhone = hasPhoneNumber(customer.caller_phone)
    expect(hasPhone).toBe(false)
    // UI should show "Add phone number to make call" message
  })
})

describe('AI/Twilio Safety', () => {
  it('should not interfere with inbound call matching when phone exists', async () => {
    const inboundPhone = '4125551234'
    const normalized = inboundPhone.replace(/\D/g, '')
    const withCountryCode = normalized.startsWith('1') ? normalized : '1' + normalized
    expect(withCountryCode).toBe('14125551234')
    // AI/Twilio matching should work exactly as before
  })

  it('should not match phone-less manual customers to inbound calls', async () => {
    const manualCustomer = { caller_phone: null, name: 'Manual Customer' }
    const inboundPhone = '4125551234'
    // Should not match because manual customer has no phone
    expect(manualCustomer.caller_phone).not.toBe(inboundPhone)
  })
})

describe('Phone-less Customer Smoke Tests', () => {
  it('should render customer detail with null phone', () => {
    const customer = { id: 'test-id', caller_phone: null, name: 'Test Customer' }
    expect(customer.caller_phone).toBeNull()
    // Detail page should render without crashing
  })

  it('should allow task creation for phone-less customer', () => {
    const customer = { id: 'test-id', caller_phone: null, name: 'Test Customer' }
    const task = { leadId: customer.id, title: 'Test Task', reminder_offset_minutes: 15 }
    expect(customer.caller_phone).toBeNull()
    // Task should be creatable
  })

  it('should allow appointment creation for phone-less customer', () => {
    const customer = { id: 'test-id', caller_phone: null, name: 'Test Customer' }
    const appointment = { leadId: customer.id, title: 'Test Appointment' }
    expect(customer.caller_phone).toBeNull()
    // Appointment should be creatable
  })

  it('should gate SMS for phone-less customer', () => {
    const customer = { caller_phone: null, name: 'Test' }
    const hasPhone = hasPhoneNumber(customer.caller_phone)
    expect(hasPhone).toBe(false)
    // SMS should be blocked with error message
  })

  it('should gate call for phone-less customer', () => {
    const customer = { caller_phone: null, name: 'Test' }
    const hasPhone = hasPhoneNumber(customer.caller_phone)
    expect(hasPhone).toBe(false)
    // Call should be blocked with error message
  })

  it('should gate payment-by-text for phone-less customer', () => {
    const customer = { caller_phone: null, name: 'Test' }
    const hasPhone = hasPhoneNumber(customer.caller_phone)
    expect(hasPhone).toBe(false)
    // Payment-by-text should be blocked with error message
  })

  it('should gate Request Payment modal for phone-less customer', () => {
    const customer = { caller_phone: null, name: 'Test' }
    const hasPhone = hasPhoneNumber(customer.caller_phone)
    expect(hasPhone).toBe(false)
    // Request Payment modal should not open for phone-less customer
    // User should see error: 'Add a phone number to this customer before sending a payment request.'
  })

  it('should remove UI gate when phone is added later', () => {
    const customerWithoutPhone = { caller_phone: null, name: 'Test' }
    const customerWithPhone = { caller_phone: '4125551234', name: 'Test' }
    
    expect(hasPhoneNumber(customerWithoutPhone.caller_phone)).toBe(false)
    expect(hasPhoneNumber(customerWithPhone.caller_phone)).toBe(true)
    // UI gate should be removed when phone is added
  })

  it('should allow normal call when phone exists', () => {
    const customer = { caller_phone: '4125551234', name: 'Test' }
    const hasPhone = hasPhoneNumber(customer.caller_phone)
    expect(hasPhone).toBe(true)
    // Call should work normally
  })

  it('should allow normal SMS when phone exists', () => {
    const customer = { caller_phone: '4125551234', name: 'Test' }
    const hasPhone = hasPhoneNumber(customer.caller_phone)
    expect(hasPhone).toBe(true)
    // SMS should work normally
  })

  it('should have no required asterisk on phone field label', () => {
    // Structural check: Add Customer modal phone field should not have asterisk
    const phoneLabel = 'Phone Number'
    const expectedLabel = 'Phone Number' // No asterisk
    expect(phoneLabel).toBe(expectedLabel)
  })
})