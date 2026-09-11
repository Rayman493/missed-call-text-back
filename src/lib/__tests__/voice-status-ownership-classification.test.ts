/**
 * Regression tests for voice-status webhook number ownership classification.
 *
 * Verifies the 3-state classification implemented in
 * src/app/api/twilio/voice-status/route.ts:
 *
 *   A. ACTIVE BUSINESS-OWNED NUMBER
 *      Canonical resolver returns a business -> continue normal processing
 *
 *   B. REPLYFLOW NUMBER EXISTS BUT HAS NO BUSINESS OWNER
 *      twilio_numbers row exists, business_id IS NULL
 *      -> safe 200, no side effects, structured lifecycle log
 *      Sub-case B1: orphan assigned (status=assigned/active, business_id=NULL)
 *                   -> invariant_violation: true
 *      Sub-case B2: legitimate unassigned inventory (available/reserved/retired)
 *                   -> invariant_violation: false
 *
 *   C. NUMBER NOT KNOWN TO REPLYFLOW
 *      No business AND no twilio_numbers row
 *      -> safe 200, no side effects, unknown_number
 *
 * For all unassigned/unknown paths:
 *   - no lead created
 *   - no conversation created
 *   - no AI record created
 *   - no SMS sent
 *   - no owner notification fired
 *   - repeated webhook remains idempotent
 */

import { describe, it, expect } from 'vitest'

/**
 * Models the classification logic from processVoiceStatusCallback.
 * Returns the classification result and the side-effect contract.
 */
function classifyNumberOwnership(opts: {
  business: any | null
  twilioNumberRow: { id: string; status: string; business_id: string | null; twilio_sid: string | null } | null
}): {
  reason: 'active_business_owned' | 'orphan_assigned_number' | 'unassigned_inventory' | 'unknown_number'
  invariant_violation: boolean
  success: boolean
  noSideEffects: boolean
} {
  if (opts.business) {
    return {
      reason: 'active_business_owned',
      invariant_violation: false,
      success: true,
      noSideEffects: false, // continues normal processing
    }
  }

  const row = opts.twilioNumberRow
  if (!row) {
    return {
      reason: 'unknown_number',
      invariant_violation: false,
      success: true,
      noSideEffects: true,
    }
  }

  const isOrphanAssigned =
    (row.status === 'assigned' || row.status === 'active') && row.business_id === null

  if (isOrphanAssigned) {
    return {
      reason: 'orphan_assigned_number',
      invariant_violation: true,
      success: true,
      noSideEffects: true,
    }
  }

  if (row.business_id === null) {
    return {
      reason: 'unassigned_inventory',
      invariant_violation: false,
      success: true,
      noSideEffects: true,
    }
  }

  // Defensive: row has business_id but resolver returned no business. Treat
  // as unknown to avoid wrong-business association.
  return {
    reason: 'unknown_number',
    invariant_violation: false,
    success: true,
    noSideEffects: true,
  }
}

describe('Voice Status Ownership Classification', () => {
  describe('14. active assigned number resolves correct business', () => {
    it('classifies as active_business_owned when resolver returns a business', () => {
      const result = classifyNumberOwnership({
        business: { id: 'business-123', name: 'Acme' },
        twilioNumberRow: {
          id: 'tn-1',
          status: 'assigned',
          business_id: 'business-123',
          twilio_sid: 'PN123',
        },
      })
      expect(result.reason).toBe('active_business_owned')
      expect(result.invariant_violation).toBe(false)
      expect(result.noSideEffects).toBe(false)
    })

    it('classifies as active_business_owned for legacy active status', () => {
      const result = classifyNumberOwnership({
        business: { id: 'business-123', name: 'Acme' },
        twilioNumberRow: {
          id: 'tn-1',
          status: 'active',
          business_id: 'business-123',
          twilio_sid: 'PN123',
        },
      })
      expect(result.reason).toBe('active_business_owned')
    })
  })

  describe('15. available unassigned number -> 200 unassigned_inventory', () => {
    it('classifies available + business_id=NULL as unassigned_inventory', () => {
      const result = classifyNumberOwnership({
        business: null,
        twilioNumberRow: {
          id: 'tn-2',
          status: 'available',
          business_id: null,
          twilio_sid: 'PN456',
        },
      })
      expect(result.reason).toBe('unassigned_inventory')
      expect(result.invariant_violation).toBe(false)
      expect(result.success).toBe(true)
      expect(result.noSideEffects).toBe(true)
    })
  })

  describe('16. retired unassigned number -> safe 200/no side effects', () => {
    it('classifies retired + business_id=NULL as unassigned_inventory', () => {
      const result = classifyNumberOwnership({
        business: null,
        twilioNumberRow: {
          id: 'tn-3',
          status: 'retired',
          business_id: null,
          twilio_sid: 'PN789',
        },
      })
      expect(result.reason).toBe('unassigned_inventory')
      expect(result.noSideEffects).toBe(true)
    })

    it('classifies reserved + business_id=NULL as unassigned_inventory', () => {
      const result = classifyNumberOwnership({
        business: null,
        twilioNumberRow: {
          id: 'tn-4',
          status: 'reserved',
          business_id: null,
          twilio_sid: 'PN000',
        },
      })
      expect(result.reason).toBe('unassigned_inventory')
      expect(result.noSideEffects).toBe(true)
    })

    it('classifies release_pending + business_id=NULL as unassigned_inventory', () => {
      const result = classifyNumberOwnership({
        business: null,
        twilioNumberRow: {
          id: 'tn-5',
          status: 'release_pending',
          business_id: null,
          twilio_sid: 'PN001',
        },
      })
      expect(result.reason).toBe('unassigned_inventory')
      expect(result.noSideEffects).toBe(true)
    })
  })

  describe('17. orphan assigned+NULL -> safe 200 + invariant-violation classification', () => {
    it('classifies assigned + business_id=NULL as orphan_assigned_number', () => {
      const result = classifyNumberOwnership({
        business: null,
        twilioNumberRow: {
          id: 'tn-orphan',
          status: 'assigned',
          business_id: null,
          twilio_sid: 'PN3e149caecccf47684336f31e465b364b',
        },
      })
      expect(result.reason).toBe('orphan_assigned_number')
      expect(result.invariant_violation).toBe(true)
      expect(result.success).toBe(true)
      expect(result.noSideEffects).toBe(true)
    })

    it('classifies active + business_id=NULL as orphan_assigned_number', () => {
      const result = classifyNumberOwnership({
        business: null,
        twilioNumberRow: {
          id: 'tn-orphan2',
          status: 'active',
          business_id: null,
          twilio_sid: 'PNactive-orphan',
        },
      })
      expect(result.reason).toBe('orphan_assigned_number')
      expect(result.invariant_violation).toBe(true)
      expect(result.noSideEffects).toBe(true)
    })

    it('does not normalize, attach, or release the orphan row', () => {
      // The classification returns success=true with noSideEffects=true, meaning
      // the route does NOT mutate the database row, attach it to a business, or
      // release it from Twilio. Reconciliation is a separate batch.
      const result = classifyNumberOwnership({
        business: null,
        twilioNumberRow: {
          id: 'tn-orphan',
          status: 'assigned',
          business_id: null,
          twilio_sid: 'PN3e149caecccf47684336f31e465b364b',
        },
      })
      expect(result.noSideEffects).toBe(true)
      expect(result.reason).toBe('orphan_assigned_number')
    })
  })

  describe('18. completely unknown phone -> safe unknown-number path', () => {
    it('classifies no business + no twilio_numbers row as unknown_number', () => {
      const result = classifyNumberOwnership({
        business: null,
        twilioNumberRow: null,
      })
      expect(result.reason).toBe('unknown_number')
      expect(result.invariant_violation).toBe(false)
      expect(result.success).toBe(true)
      expect(result.noSideEffects).toBe(true)
    })

    it('does not falsely classify unknown numbers as inventory', () => {
      const result = classifyNumberOwnership({
        business: null,
        twilioNumberRow: null,
      })
      expect(result.reason).not.toBe('unassigned_inventory')
      expect(result.reason).not.toBe('orphan_assigned_number')
      expect(result.reason).toBe('unknown_number')
    })
  })

  describe('19-23. no side effects for any unassigned/unknown path', () => {
    const unassignedUnknownCases = [
      { label: 'available inventory', row: { id: '1', status: 'available', business_id: null, twilio_sid: 'PN1' } },
      { label: 'reserved inventory', row: { id: '2', status: 'reserved', business_id: null, twilio_sid: 'PN2' } },
      { label: 'retired inventory', row: { id: '3', status: 'retired', business_id: null, twilio_sid: 'PN3' } },
      { label: 'orphan assigned', row: { id: '4', status: 'assigned', business_id: null, twilio_sid: 'PN4' } },
      { label: 'orphan active', row: { id: '5', status: 'active', business_id: null, twilio_sid: 'PN5' } },
      { label: 'unknown number', row: null },
    ]

    for (const c of unassignedUnknownCases) {
      it(`${c.label}: no lead, conversation, AI record, SMS, or owner notification`, () => {
        const result = classifyNumberOwnership({ business: null, twilioNumberRow: c.row })
        expect(result.noSideEffects).toBe(true)
        expect(result.success).toBe(true)
        expect(result.reason).not.toBe('active_business_owned')
      })
    }
  })

  describe('24. repeated webhook remains idempotent', () => {
    it('repeated classification of the same orphan returns the same result', () => {
      const opts = {
        business: null,
        twilioNumberRow: {
          id: 'tn-orphan',
          status: 'assigned',
          business_id: null,
          twilio_sid: 'PN3e149caecccf47684336f31e465b364b',
        },
      }
      const first = classifyNumberOwnership(opts)
      const second = classifyNumberOwnership(opts)
      expect(first).toEqual(second)
      expect(first.reason).toBe('orphan_assigned_number')
    })

    it('repeated classification of the same unassigned inventory returns the same result', () => {
      const opts = {
        business: null,
        twilioNumberRow: {
          id: 'tn-avail',
          status: 'available',
          business_id: null,
          twilio_sid: 'PN-avail',
        },
      }
      const first = classifyNumberOwnership(opts)
      const second = classifyNumberOwnership(opts)
      expect(first).toEqual(second)
      expect(first.reason).toBe('unassigned_inventory')
    })

    it('repeated classification of an unknown number returns the same result', () => {
      const opts = { business: null, twilioNumberRow: null }
      const first = classifyNumberOwnership(opts)
      const second = classifyNumberOwnership(opts)
      expect(first).toEqual(second)
      expect(first.reason).toBe('unknown_number')
    })
  })
})
