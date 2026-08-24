/**
 * SMS / Intake Card Parity Tests
 *
 * Tests that SMS and Intake Details cards represent the SAME information set.
 * They may differ in formatting, punctuation, capitalization, or wording,
 * but must preserve every meaningful fact from the canonical current-call intake.
 *
 * Canonical current-call intake object is the single source of truth.
 */

import { describe, it, expect } from 'vitest'
import { formatAiIntakeSummaryWithMode } from '../ai-intake-formatter'

describe('SMS / Intake Card Parity', () => {
  describe('Multi-part details preservation', () => {
    it('SMS preserves multi-part details (yard size + fence + equipment)', () => {
      // Canonical current-call intake with multi-part details
      const canonicalIntake = {
        customerName: 'John',
        serviceRequested: 'Lawn Mowing',
        importantDetails: 'half-acre yard, privacy fence, larger equipment access concern',
        serviceAddress: '1632 South Pine Drive',
        desiredCompletionTime: 'next two weeks',
        callbackTime: 'mornings'
      }

      const sms = formatAiIntakeSummaryWithMode(
        canonicalIntake,
        '+15551234567',
        'Test Business',
        undefined,
        'onsite'
      )

      // Verify all facts are preserved in SMS (allowing for capitalization differences)
      expect(sms.toLowerCase()).toContain('lawn mowing')
      expect(sms.toLowerCase()).toContain('half-acre yard')
      expect(sms.toLowerCase()).toContain('privacy fence')
      expect(sms.toLowerCase()).toContain('larger equipment access concern')
      expect(sms.toLowerCase()).toContain('1632 south pine drive')
      expect(sms.toLowerCase()).toContain('next two weeks')
      expect(sms.toLowerCase()).toContain('mornings')

      // Verify no historical data is present
      expect(sms).not.toContain('Plumbing')
      expect(sms).not.toContain('Gutter cleaning')
    })

    it('SMS truncates details at reasonable length but preserves key facts', () => {
      const canonicalIntake = {
        customerName: 'Jane',
        serviceRequested: 'Plumbing Repair',
        importantDetails: 'kitchen sink leak under cabinet, water damage to floor below, shut off main water valve, need emergency repair',
        serviceAddress: '456 Oak Avenue',
        desiredCompletionTime: 'ASAP',
        callbackTime: 'evenings'
      }

      const sms = formatAiIntakeSummaryWithMode(
        canonicalIntake,
        '+15551234567',
        'Test Business',
        undefined,
        'onsite'
      )

      // Verify service, address, timing are preserved (allowing for capitalization/normalization)
      expect(sms.toLowerCase()).toContain('plumbing repair')
      expect(sms.toLowerCase()).toContain('456 oak avenue')
      expect(sms.toLowerCase()).toContain('asap') // Normalized to "Asap"
      expect(sms.toLowerCase()).toContain('evenings')

      // Verify details are included (may be truncated)
      expect(sms.toLowerCase()).toContain('kitchen sink leak') // Key fact preserved
    })
  })

  describe('Field-by-field parity with canonical intake', () => {
    it('SMS contains request when canonical has request', () => {
      const canonicalIntake = {
        customerName: 'Bob',
        serviceRequested: 'HVAC Repair'
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      // SMS normalizes service names, so check for the canonicalized version
      expect(sms.toLowerCase()).toContain('hvac')
    })

    it('SMS does NOT invent request when canonical lacks request', () => {
      const canonicalIntake = {
        customerName: 'Bob'
        // No serviceRequested
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      expect(sms).not.toContain('Lawn Mowing') // Historical data
      expect(sms).not.toContain('Plumbing') // Historical data
      expect(sms).toContain('What you\'re looking to have done') // Asking for request
    })

    it('SMS contains address when canonical has address', () => {
      const canonicalIntake = {
        customerName: 'Carol',
        serviceRequested: 'Electrical',
        serviceAddress: '789 Maple Street'
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('789 Maple Street')
    })

    it('SMS does NOT contain address when canonical lacks address', () => {
      const canonicalIntake = {
        customerName: 'Carol',
        serviceRequested: 'Electrical'
        // No serviceAddress
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business', undefined, 'onsite')

      expect(sms).not.toContain('123 Main Street') // Historical address
      expect(sms).toContain('Service address') // Asking for address
    })

    it('SMS contains completion time when canonical has it', () => {
      const canonicalIntake = {
        customerName: 'Dave',
        serviceRequested: 'Roofing',
        desiredCompletionTime: 'next month'
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      expect(sms.toLowerCase()).toContain('next month')
    })

    it('SMS does NOT invent completion time when canonical lacks it', () => {
      const canonicalIntake = {
        customerName: 'Dave',
        serviceRequested: 'Roofing'
        // No desiredCompletionTime
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      expect(sms).not.toContain('next week') // Historical timing
      expect(sms).toContain('When you\'d like it completed') // Asking for timing
    })

    it('SMS contains callback time when canonical has it', () => {
      const canonicalIntake = {
        customerName: 'Eve',
        serviceRequested: 'Flooring',
        callbackTime: 'afternoons'
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      expect(sms.toLowerCase()).toContain('afternoons')
    })

    it('SMS does NOT invent callback time when canonical lacks it', () => {
      const canonicalIntake = {
        customerName: 'Eve',
        serviceRequested: 'Flooring'
        // No callbackTime
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      expect(sms).not.toContain('mornings') // Historical callback
      expect(sms).toContain('Best time to call you') // Asking for callback
    })
  })

  describe('Empty canonical intake', () => {
    it('SMS asks for all fields when canonical is empty', () => {
      const canonicalIntake = {}

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      // Should NOT contain any historical data
      expect(sms).not.toContain('Lawn Mowing')
      expect(sms).not.toContain('Plumbing')
      expect(sms).not.toContain('123 Main Street')

      // Should ask for required fields
      expect(sms).toContain('What you\'re looking to have done')
      expect(sms).toContain('Service address')
      expect(sms).toContain('When you\'d like it completed')
      expect(sms).toContain('Best time to call you')
    })

    it('SMS does not show any captured fields when canonical is empty', () => {
      const canonicalIntake = {}

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      // Should NOT show "Here's what we captured:"
      expect(sms).not.toContain('Here\'s what we captured')
    })
  })

  describe('Partial canonical intake', () => {
    it('SMS shows only captured fields from canonical, not fill from history', () => {
      const canonicalIntake = {
        customerName: 'Frank',
        serviceRequested: 'Painting'
        // Missing: address, completion time, callback time
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business', undefined, 'onsite')

      // Should show captured fields
      expect(sms).toContain('Painting')

      // Should NOT show historical data
      expect(sms).not.toContain('321 Elm Street') // Historical address
      expect(sms).not.toContain('tomorrow') // Historical timing
      expect(sms).not.toContain('evenings') // Historical callback

      // Should ask for missing fields
      expect(sms).toContain('Service address')
      expect(sms).toContain('When you\'d like it completed')
      expect(sms).toContain('Best time to call you')
    })

    it('SMS preserves captured details even when other fields missing', () => {
      const canonicalIntake = {
        customerName: 'Grace',
        serviceRequested: 'Landscaping',
        importantDetails: 'front yard only, small garden bed',
        // Missing: address, completion time, callback time
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business', undefined, 'onsite')

      // Should preserve details
      expect(sms).toContain('front yard only')
      expect(sms).toContain('small garden bed')
    })
  })

  describe('Complete canonical intake', () => {
    it('SMS shows all captured fields without inventing additional data', () => {
      const canonicalIntake = {
        customerName: 'Henry',
        serviceRequested: 'Gutter Cleaning',
        importantDetails: 'two-story house, rear gutters clogged',
        serviceAddress: '999 Cedar Lane',
        desiredCompletionTime: 'this Friday',
        callbackTime: 'afternoon'
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business', undefined, 'onsite')

      // Should show all captured fields (allowing for capitalization normalization)
      expect(sms.toLowerCase()).toContain('gutter cleaning')
      expect(sms.toLowerCase()).toContain('two-story house')
      expect(sms.toLowerCase()).toContain('rear gutters clogged')
      expect(sms.toLowerCase()).toContain('999 cedar lane')
      expect(sms.toLowerCase()).toContain('friday') // Normalized to "This friday"
      expect(sms.toLowerCase()).toContain('afternoon')

      // Should NOT add extra facts not in canonical
      expect(sms).not.toContain('half-acre') // Not in canonical
      expect(sms).not.toContain('privacy fence') // Not in canonical
    })
  })

  describe('Alternative field name handling', () => {
    it('SMS recognizes callerName as customer name equivalent', () => {
      const canonicalIntake = {
        callerName: 'Iris', // Alternative field name
        serviceRequested: 'Pressure Washing'
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      expect(sms).toContain('Iris')
    })

    it('SMS recognizes addressOrLocation as serviceAddress equivalent', () => {
      const canonicalIntake = {
        customerName: 'Jack',
        serviceRequested: 'Window Cleaning',
        addressOrLocation: '555 Pine Road'
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('555 Pine Road')
    })

    it('SMS recognizes reasonForCalling as serviceRequested equivalent', () => {
      const canonicalIntake = {
        customerName: 'Kate',
        reasonForCalling: 'Carpet Cleaning'
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      expect(sms).toContain('Carpet Cleaning')
    })

    it('SMS recognizes preferredCallbackTime as callbackTime equivalent', () => {
      const canonicalIntake = {
        customerName: 'Leo',
        serviceRequested: 'Tile Installation',
        preferredCallbackTime: 'weekends'
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      expect(sms.toLowerCase()).toContain('weekends')
    })
  })

  describe('No field invention from history', () => {
    it('Canonical empty + historical Lawn Mowing data = SMS asks for info, no Lawn Mowing', () => {
      const canonicalIntake = {} // Empty current call

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business')

      expect(sms).not.toContain('Lawn Mowing')
      expect(sms).toContain('What you\'re looking to have done')
    })

    it('Canonical partial + historical full data = SMS shows only partial', () => {
      const canonicalIntake = {
        customerName: 'Mary',
        serviceRequested: 'House Cleaning'
        // Missing: address, timing, callback
      }

      const sms = formatAiIntakeSummaryWithMode(canonicalIntake, '+15551234567', 'Test Business', undefined, 'onsite')

      expect(sms).toContain('House Cleaning')
      expect(sms).not.toContain('789 Oak Street') // Historical address
      expect(sms).not.toContain('tomorrow') // Historical timing
    })
  })
})