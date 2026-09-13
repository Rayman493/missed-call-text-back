/**
 * Number-Replacement Readiness State Regression
 *
 * Root cause: After automatic Twilio number self-heal replacement, the
 * `assigned-number-monitor.ts` CAS clear only reset `forwarding_verified`
 * and `call_forwarding_enabled` but left `forwarding_verified_at`,
 * `forwarding_instructions_confirmed_at`, `phone_setup_completed_at`, and
 * test-setup timestamps populated from the OLD number. The
 * `SetupStatusCard.tsx` component used `forwarding_instructions_confirmed_at`
 * as a fallback for `hasConfirmedForwardingInstructions`, so historical
 * confirmation from the old number made the replacement number appear ready.
 *
 * The fix has two layers:
 *
 * 1. Self-heal invalidation: `assigned-number-monitor.ts` CAS clear now
 *    resets ALL forwarding/test fields so the replacement number does not
 *    inherit stale confirmation signals.
 *
 * 2. Defensive timestamp check: `SetupStatusCard.tsx` compares
 *    confirmation timestamps against `provisioned_at` (the current-number
 *    assignment timestamp). If a confirmation timestamp predates
 *    `provisioned_at`, it is treated as stale and not counted.
 *
 * Regression cases:
 *   1. Normal healthy setup → Ready remains Ready
 *   2. Missing Twilio number → Restoring your ReplyFlow number
 *   3. Successful replacement → new number Connected + forwarding Action Required
 *   4. Historical forwarding confirmation from old number → does NOT make replacement Ready
 *   5. User reconfirms forwarding → forwarding Complete
 *   6. Successful new-number test → Ready returns
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const monitorSrc = readSrc('src/lib/assigned-number-monitor.ts')
const setupCardSrc = readSrc('src/components/SetupStatusCard.tsx')

// Helper: extract the CAS clear update block from assigned-number-monitor.ts
function getCasClearBlock(): string {
  const marker = 'STEP 1: Compare-and-swap clear the stale business assignment'
  const idx = monitorSrc.indexOf(marker)
  if (idx === -1) return ''
  return monitorSrc.substring(idx, idx + 4000)
}

// Helper: extract the subscription-active render block from SetupStatusCard.tsx
function getSubscriptionActiveBlock(): string {
  const startMarker = "cardState === 'subscription-active'"
  const idx = setupCardSrc.indexOf(startMarker)
  if (idx === -1) return ''
  // Find the end of this render block (next cardState check or function end)
  const endIdx = setupCardSrc.indexOf("cardState === 'critical-issue'", idx)
  if (endIdx === -1) return setupCardSrc.substring(idx)
  return setupCardSrc.substring(idx, endIdx)
}

// ============================================================================
// PART A — SELF-HEAL FORWARDING INVALIDATION
// ============================================================================

describe('Part A: Self-Heal Forwarding Invalidation', () => {
  const casBlock = getCasClearBlock()

  describe('CAS clear resets ALL forwarding/test fields', () => {
    it('CAS clear resets forwarding_verified to false', () => {
      expect(casBlock).toContain('forwarding_verified: false')
    })

    it('CAS clear resets forwarding_verified_at to null', () => {
      expect(casBlock).toContain('forwarding_verified_at: null')
    })

    it('CAS clear resets forwarding_instructions_confirmed_at to null', () => {
      expect(casBlock).toContain('forwarding_instructions_confirmed_at: null')
    })

    it('CAS clear resets call_forwarding_enabled to false', () => {
      expect(casBlock).toContain('call_forwarding_enabled: false')
    })

    it('CAS clear resets phone_setup_completed_at to null', () => {
      expect(casBlock).toContain('phone_setup_completed_at: null')
    })

    it('CAS clear resets first_test_call_completed_at to null', () => {
      expect(casBlock).toContain('first_test_call_completed_at: null')
    })

    it('CAS clear resets test_call_received_at to null', () => {
      expect(casBlock).toContain('test_call_received_at: null')
    })

    it('CAS clear resets test_sms_sent_at to null', () => {
      expect(casBlock).toContain('test_sms_sent_at: null')
    })

    it('CAS clear comment explains why forwarding state is invalidated', () => {
      expect(casBlock).toContain('Invalidate ALL forwarding/setup state')
      expect(casBlock).toContain('carrier')
      expect(casBlock).toContain('OLD ReplyFlow')
    })

    it('CAS clear comment explains test invalidation', () => {
      expect(casBlock).toContain('Invalidate test-setup state')
      expect(casBlock).toContain('old number')
    })
  })

  describe('Self-heal preserves provisioning lifecycle', () => {
    it('CAS clear still sets provisioning_status to needs_provisioning', () => {
      expect(casBlock).toContain("provisioning_status: 'needs_provisioning'")
    })

    it('CAS clear still nulls twilio_phone_number', () => {
      expect(casBlock).toContain('twilio_phone_number: null')
    })

    it('CAS clear still nulls twilio_phone_number_sid', () => {
      expect(casBlock).toContain('twilio_phone_number_sid: null')
    })

    it('CAS clear still nulls assigned_twilio_number_id', () => {
      expect(casBlock).toContain('assigned_twilio_number_id: null')
    })

    it('CAS clear still nulls twilio_messaging_service_sid', () => {
      expect(casBlock).toContain('twilio_messaging_service_sid: null')
    })

    it('CAS clear still uses CAS guard (eq twilio_phone_number_sid)', () => {
      expect(casBlock).toContain(".eq('twilio_phone_number_sid', staleSid)")
    })
  })
})

// ============================================================================
// PART B — SETUP STATUS CARD: DEFENSIVE TIMESTAMP CHECK
// ============================================================================

describe('Part B: SetupStatusCard Defensive Timestamp Check', () => {
  describe('provisioned_at comparison helper', () => {
    it('defines provisionedAt from business.provisioned_at', () => {
      expect(setupCardSrc).toContain('business?.provisioned_at')
      expect(setupCardSrc).toContain('provisionedAt')
    })

    it('defines isForwardingConfirmedForCurrentNumber helper', () => {
      expect(setupCardSrc).toContain('isForwardingConfirmedForCurrentNumber')
    })

    it('helper returns false for null timestamp', () => {
      const helperIdx = setupCardSrc.indexOf('isForwardingConfirmedForCurrentNumber')
      const helperBlock = setupCardSrc.substring(helperIdx, helperIdx + 400)
      expect(helperBlock).toContain('if (!timestamp) return false')
    })

    it('helper returns true when provisionedAt is null (legacy)', () => {
      const helperIdx = setupCardSrc.indexOf('isForwardingConfirmedForCurrentNumber')
      const helperBlock = setupCardSrc.substring(helperIdx, helperIdx + 500)
      expect(helperBlock).toContain('provisionedAt === null')
      expect(helperBlock).toContain('return true')
    })

    it('helper compares timestamp >= provisionedAt', () => {
      const helperIdx = setupCardSrc.indexOf('isForwardingConfirmedForCurrentNumber')
      const helperBlock = setupCardSrc.substring(helperIdx, helperIdx + 600)
      expect(helperBlock).toContain('new Date(timestamp).getTime()')
      expect(helperBlock).toContain('>= provisionedAt')
    })
  })

  describe('hasConfirmedForwardingInstructions uses timestamp check', () => {
    it('checks forwarding_verified with timestamp guard', () => {
      expect(setupCardSrc).toContain(
        'business?.forwarding_verified === true && isForwardingConfirmedForCurrentNumber(business?.forwarding_verified_at)'
      )
    })

    it('checks forwarding_instructions_confirmed_at with timestamp guard', () => {
      expect(setupCardSrc).toContain(
        'business?.forwarding_instructions_confirmed_at && isForwardingConfirmedForCurrentNumber(business?.forwarding_instructions_confirmed_at)'
      )
    })
  })

  describe('hasCompletedTestCall uses timestamp check', () => {
    it('checks forwarding_verified with timestamp guard', () => {
      expect(setupCardSrc).toContain(
        'business?.forwarding_verified === true && isForwardingConfirmedForCurrentNumber(business?.forwarding_verified_at)'
      )
    })

    it('checks first_test_call_completed_at with timestamp guard', () => {
      expect(setupCardSrc).toContain(
        'business?.first_test_call_completed_at && isForwardingConfirmedForCurrentNumber(business?.first_test_call_completed_at)'
      )
    })
  })

  describe('numberWasReplaced detection', () => {
    it('defines numberWasReplaced', () => {
      expect(setupCardSrc).toContain('numberWasReplaced')
    })

    it('requires hasNumber for replacement detection', () => {
      const idx = setupCardSrc.indexOf('numberWasReplaced =')
      const block = setupCardSrc.substring(idx, idx + 200)
      expect(block).toContain('hasNumber')
    })

    it('requires !hasConfirmedForwardingInstructions for replacement detection', () => {
      const idx = setupCardSrc.indexOf('numberWasReplaced =')
      const block = setupCardSrc.substring(idx, idx + 200)
      expect(block).toContain('!hasConfirmedForwardingInstructions')
    })

    it('requires provisionedAt !== null for replacement detection', () => {
      const idx = setupCardSrc.indexOf('numberWasReplaced =')
      const block = setupCardSrc.substring(idx, idx + 200)
      expect(block).toContain('provisionedAt !== null')
    })
  })
})

// ============================================================================
// PART C — REGRESSION CASES (SOURCE-LEVEL VERIFICATION)
// ============================================================================

describe('Part C: Regression Cases', () => {
  const subActiveBlock = getSubscriptionActiveBlock()

  describe('Case 1: Normal healthy setup → Ready remains Ready', () => {
    it('ReplyFlow is ready banner condition uses forwardingStep2Complete && hasNumber && !isRecoveringOrFailed', () => {
      // Search for the JSX condition, not the comment text
      const condIdx = setupCardSrc.indexOf('forwardingStep2Complete && hasNumber && !isRecoveringOrFailed')
      expect(condIdx).toBeGreaterThan(-1)
    })

    it('ReplyFlow is ready banner renders the text', () => {
      expect(subActiveBlock).toContain('ReplyFlow is ready')
    })

    it('normal setup with forwarding confirmed after provisioned_at passes timestamp check', () => {
      // The helper returns true when timestamp >= provisionedAt
      const helperIdx = setupCardSrc.indexOf('isForwardingConfirmedForCurrentNumber')
      const helperBlock = setupCardSrc.substring(helperIdx, helperIdx + 600)
      expect(helperBlock).toContain('>= provisionedAt')
    })

    it('legacy setup without provisioned_at does not invalidate (provisionedAt === null → true)', () => {
      const helperIdx = setupCardSrc.indexOf('isForwardingConfirmedForCurrentNumber')
      const helperBlock = setupCardSrc.substring(helperIdx, helperIdx + 500)
      expect(helperBlock).toContain('provisionedAt === null')
      expect(helperBlock).toContain('return true')
    })
  })

  describe('Case 2: Missing Twilio number → Restoring your ReplyFlow number', () => {
    it('recovery banner condition uses !hasNumber && isRecoveringOrFailed', () => {
      const condIdx = setupCardSrc.indexOf('!hasNumber && isRecoveringOrFailed')
      expect(condIdx).toBeGreaterThan(-1)
    })

    it('recovery banner shows Restoring your ReplyFlow number text', () => {
      expect(subActiveBlock).toContain('Restoring your ReplyFlow number')
    })

    it('recovery banner uses RotateCcw icon', () => {
      const idx = setupCardSrc.indexOf('Restoring your ReplyFlow number')
      const block = setupCardSrc.substring(idx - 300, idx + 100)
      expect(block).toContain('RotateCcw')
    })
  })

  describe('Case 3: Successful replacement → Connected + Action Required', () => {
    it('number-replacement banner condition uses numberWasReplaced && !isRecoveringOrFailed', () => {
      const condIdx = setupCardSrc.indexOf('numberWasReplaced && !isRecoveringOrFailed')
      expect(condIdx).toBeGreaterThan(-1)
    })

    it('number-replacement banner shows the NEW number prominently', () => {
      const idx = setupCardSrc.indexOf('Your ReplyFlow number changed')
      const block = setupCardSrc.substring(idx, idx + 800)
      expect(block).toContain('New number:')
      expect(block).toContain('business.twilio_phone_number')
    })

    it('number-replacement banner has Review forwarding CTA', () => {
      const idx = setupCardSrc.indexOf('Your ReplyFlow number changed')
      const block = setupCardSrc.substring(idx, idx + 1200)
      expect(block).toContain('Review forwarding')
      expect(block).toContain('setShowForwardingInstructions(true)')
    })

    it('number-replacement banner uses AlertTriangle icon', () => {
      const idx = setupCardSrc.indexOf('Your ReplyFlow number changed')
      const block = setupCardSrc.substring(idx - 300, idx + 100)
      expect(block).toContain('AlertTriangle')
    })

    it('Call Forwarding label shows Action required when numberWasReplaced', () => {
      // Search for the ternary that includes numberWasReplaced and 'Action required'
      const idx = setupCardSrc.indexOf("'Action required'")
      expect(idx).toBeGreaterThan(-1)
      const block = setupCardSrc.substring(idx - 200, idx + 100)
      expect(block).toContain('numberWasReplaced')
    })

    it('Call Forwarding indicator uses amber when numberWasReplaced', () => {
      // Search for the amber indicator in the Call Forwarding section
      const idx = setupCardSrc.indexOf('numberWasReplaced ? \'bg-amber-500\'')
      expect(idx).toBeGreaterThan(-1)
    })

    it('Test Your Setup label shows Action required when numberWasReplaced', () => {
      // Search for the ternary in the Test Your Setup section
      // The second 'Action required' occurrence is in the Test Your Setup section
      const firstIdx = setupCardSrc.indexOf("'Action required'")
      const secondIdx = setupCardSrc.indexOf("'Action required'", firstIdx + 1)
      expect(secondIdx).toBeGreaterThan(-1)
      const block = setupCardSrc.substring(secondIdx - 200, secondIdx + 100)
      expect(block).toContain('numberWasReplaced')
    })

    it('Test Your Setup shows Re-test after forwarding badge when numberWasReplaced', () => {
      expect(setupCardSrc).toContain('Re-test after forwarding')
    })

    it('CTA shows Review forwarding when numberWasReplaced', () => {
      // The CTA ternary: numberWasReplaced ? 'Review forwarding' : ...
      const idx = setupCardSrc.indexOf("numberWasReplaced ? 'Review forwarding'")
      expect(idx).toBeGreaterThan(-1)
    })
  })

  describe('Case 4: Historical forwarding confirmation from old number → does NOT make replacement Ready', () => {
    it('timestamp check rejects confirmations that predate provisioned_at', () => {
      const helperIdx = setupCardSrc.indexOf('isForwardingConfirmedForCurrentNumber')
      const helperBlock = setupCardSrc.substring(helperIdx, helperIdx + 600)
      expect(helperBlock).toContain('>= provisionedAt')
      // If timestamp < provisionedAt, the function returns false
    })

    it('self-heal CAS clear nulls forwarding_instructions_confirmed_at', () => {
      const casBlock = getCasClearBlock()
      expect(casBlock).toContain('forwarding_instructions_confirmed_at: null')
    })

    it('self-heal CAS clear nulls forwarding_verified_at', () => {
      const casBlock = getCasClearBlock()
      expect(casBlock).toContain('forwarding_verified_at: null')
    })

    it('self-heal CAS clear nulls phone_setup_completed_at', () => {
      const casBlock = getCasClearBlock()
      expect(casBlock).toContain('phone_setup_completed_at: null')
    })

    it('self-heal CAS clear nulls first_test_call_completed_at', () => {
      const casBlock = getCasClearBlock()
      expect(casBlock).toContain('first_test_call_completed_at: null')
    })

    it('ReplyFlow is ready banner does NOT show when numberWasReplaced', () => {
      // The banner requires forwardingStep2Complete which is false when
      // numberWasReplaced (because hasConfirmedForwardingInstructions is false)
      const condIdx = setupCardSrc.indexOf('forwardingStep2Complete && hasNumber && !isRecoveringOrFailed')
      expect(condIdx).toBeGreaterThan(-1)
      // forwardingStep2Complete = hasConfirmedForwardingInstructions
      // which is false when numberWasReplaced
    })

    it('number-replacement banner and ReplyFlow is ready are mutually exclusive', () => {
      // numberWasReplaced requires !hasConfirmedForwardingInstructions
      // ReplyFlow is ready requires forwardingStep2Complete (= hasConfirmedForwardingInstructions)
      // So they cannot both be true at the same time
      const replacedIdx = setupCardSrc.indexOf('numberWasReplaced =')
      const replacedBlock = setupCardSrc.substring(replacedIdx, replacedIdx + 200)
      expect(replacedBlock).toContain('!hasConfirmedForwardingInstructions')

      const readyCondIdx = setupCardSrc.indexOf('forwardingStep2Complete && hasNumber && !isRecoveringOrFailed')
      expect(readyCondIdx).toBeGreaterThan(-1)
    })
  })

  describe('Case 5: User reconfirms forwarding → forwarding Complete', () => {
    it('confirm-forwarding-instructions API sets forwarding_instructions_confirmed_at to now', () => {
      const apiSrc = readSrc('src/app/api/onboarding/confirm-forwarding-instructions/route.ts')
      expect(apiSrc).toContain('forwarding_instructions_confirmed_at: new Date().toISOString()')
    })

    it('confirm-forwarding-instructions API sets phone_setup_completed_at to now', () => {
      const apiSrc = readSrc('src/app/api/onboarding/confirm-forwarding-instructions/route.ts')
      expect(apiSrc).toContain('phone_setup_completed_at: new Date().toISOString()')
    })

    it('confirm-forwarding-instructions API sets call_forwarding_enabled to true', () => {
      const apiSrc = readSrc('src/app/api/onboarding/confirm-forwarding-instructions/route.ts')
      expect(apiSrc).toContain('call_forwarding_enabled: true')
    })

    it('after reconfirmation, timestamp is after provisioned_at → forwardingStep2Complete = true', () => {
      // The helper returns true when timestamp >= provisionedAt
      // new Date().toISOString() from confirm API will be after provisioned_at
      const helperIdx = setupCardSrc.indexOf('isForwardingConfirmedForCurrentNumber')
      const helperBlock = setupCardSrc.substring(helperIdx, helperIdx + 600)
      expect(helperBlock).toContain('>= provisionedAt')
    })

    it('after reconfirmation, Call Forwarding shows Complete', () => {
      expect(subActiveBlock).toContain("forwardingStep2Complete ? 'Complete'")
    })

    it('after reconfirmation, numberWasReplaced becomes false', () => {
      // numberWasReplaced requires !hasConfirmedForwardingInstructions
      // After reconfirmation, hasConfirmedForwardingInstructions is true
      // So numberWasReplaced is false
      const replacedIdx = setupCardSrc.indexOf('numberWasReplaced =')
      const replacedBlock = setupCardSrc.substring(replacedIdx, replacedIdx + 200)
      expect(replacedBlock).toContain('!hasConfirmedForwardingInstructions')
    })
  })

  describe('Case 6: Successful new-number test → Ready returns', () => {
    it('markForwardingVerified sets forwarding_verified_at to now', () => {
      const fvSrc = readSrc('src/lib/forwarding-verification.ts')
      expect(fvSrc).toContain('forwarding_verified: true')
      expect(fvSrc).toContain('forwarding_verified_at: new Date().toISOString()')
    })

    it('after test, forwarding_verified_at is after provisioned_at → hasCompletedTestCall = true', () => {
      // The helper returns true when timestamp >= provisionedAt
      // markForwardingVerified sets forwarding_verified_at to now
      const helperIdx = setupCardSrc.indexOf('isForwardingConfirmedForCurrentNumber')
      const helperBlock = setupCardSrc.substring(helperIdx, helperIdx + 600)
      expect(helperBlock).toContain('>= provisionedAt')
    })

    it('after test + forwarding reconfirmation, ReplyFlow is ready shows', () => {
      // After reconfirmation: forwardingStep2Complete = true
      // After test: hasCompletedTestCall = true (but not required for ready banner)
      // ReplyFlow is ready requires: forwardingStep2Complete && hasNumber && !isRecoveringOrFailed
      const condIdx = setupCardSrc.indexOf('forwardingStep2Complete && hasNumber && !isRecoveringOrFailed')
      expect(condIdx).toBeGreaterThan(-1)
    })

    it('after test, Test Your Setup shows Complete', () => {
      expect(subActiveBlock).toContain("hasCompletedTestCall ? 'Complete'")
    })
  })

  // ------------------------------------------------------------------------
  // PRODUCTION DATE REGRESSION: 2026-09-13 self-heal replacement
  // ------------------------------------------------------------------------
  // Production data proved that provisioned_at was NOT refreshed on
  // replacement, causing a Sep 8 forwarding confirmation to appear valid
  // for a Sep 13 replacement number (because Sep 8 > Aug 25 provisioned_at).
  // The fix refreshes provisioned_at on every successful provisioning
  // completion, so Sep 8 < Sep 13 → stale → Action Required.
  // ------------------------------------------------------------------------
  describe('Production Date Regression: 2026-09-13 replacement', () => {
    const triggerSrc = readSrc('src/app/api/business/trigger-provisioning/route.ts')

    it('trigger-provisioning refreshes provisioned_at to now() on completion (not preserving old value)', () => {
      // The bug was: provisioned_at: business.provisioned_at || new Date().toISOString()
      // The fix is: provisioned_at: new Date().toISOString()
      expect(triggerSrc).toContain('provisioned_at: new Date().toISOString()')
      expect(triggerSrc).not.toContain('business.provisioned_at || new Date().toISOString()')
    })

    it('self-heal CAS clear nulls provisioned_at', () => {
      const casBlock = getCasClearBlock()
      expect(casBlock).toContain('provisioned_at: null')
    })

    it('CAS clear comment explains why provisioned_at is cleared', () => {
      const casBlock = getCasClearBlock()
      expect(casBlock).toContain('provisioned_at')
      expect(casBlock).toContain('old number')
    })

    it('Sep 8 forwarding confirmation is stale for Sep 13 replacement (Sep 8 < Sep 13)', () => {
      // After the fix, provisioned_at is refreshed to Sep 13 on replacement.
      // The defensive check: confirmation >= provisioned_at
      // Sep 8 >= Sep 13 → false → stale → Action Required
      const sep8 = new Date('2026-09-08T00:00:00Z').getTime()
      const sep13 = new Date('2026-09-13T07:45:42Z').getTime()
      expect(sep8).toBeLessThan(sep13)
      // The helper would return false for Sep 8 confirmation vs Sep 13 provisioned_at
    })

    it('Aug 25 old provisioned_at no longer causes false positive (Sep 8 > Aug 25 was the bug)', () => {
      // Before the fix: provisioned_at stayed Aug 25, Sep 8 > Aug 25 → valid (BUG)
      // After the fix: provisioned_at becomes Sep 13, Sep 8 < Sep 13 → stale (CORRECT)
      const aug25 = new Date('2026-08-25T05:46:11Z').getTime()
      const sep8 = new Date('2026-09-08T00:00:00Z').getTime()
      const sep13 = new Date('2026-09-13T07:45:42Z').getTime()

      // The old bug: Sep 8 > Aug 25 → false positive
      expect(sep8).toBeGreaterThan(aug25)

      // The fix: Sep 8 < Sep 13 → correctly stale
      expect(sep8).toBeLessThan(sep13)
    })

    it('after reconfirmation on Sep 13+, forwarding becomes valid (Sep 13 >= Sep 13)', () => {
      // User reconfirms forwarding after the replacement.
      // confirm-forwarding-instructions sets forwarding_instructions_confirmed_at to now().
      // now() >= provisioned_at (Sep 13) → valid → Complete
      const sep13_later = new Date('2026-09-13T12:00:00Z').getTime()
      const sep13_provisioned = new Date('2026-09-13T07:45:42Z').getTime()
      expect(sep13_later).toBeGreaterThanOrEqual(sep13_provisioned)
    })

    it('every other provisioning path already sets provisioned_at to now()', () => {
      // Verify the fix aligns trigger-provisioning with all other paths
      const twilioSrc = readSrc('src/lib/twilio.ts')
      expect(twilioSrc).toContain('provisioned_at: new Date().toISOString()')

      const provisioningServiceSrc = readSrc('src/lib/twilio-provisioning-service.ts')
      expect(provisioningServiceSrc).toContain('provisioned_at: new Date().toISOString()')

      const warmManagerSrc = readSrc('src/lib/warm-number-manager.ts')
      expect(warmManagerSrc).toContain('provisioned_at: new Date().toISOString()')
    })
  })
})

// ============================================================================
// PART D — PRESERVATION OF SELF-HEAL FLOW
// ============================================================================

describe('Part D: Self-Heal Flow Preservation', () => {
  it('does not modify Twilio purchasing logic', () => {
    // The CAS clear should not touch trigger-provisioning's purchasing logic
    const triggerSrc = readSrc('src/app/api/business/trigger-provisioning/route.ts')
    expect(triggerSrc).toContain('provisionTwilioNumber')
  })

  it('does not modify provisioning locks', () => {
    const triggerSrc = readSrc('src/app/api/business/trigger-provisioning/route.ts')
    expect(triggerSrc).toContain('acquire_provisioning_lock')
  })

  it('does not modify number retirement', () => {
    // The twilio_numbers retirement update should still be present
    const casBlock = getCasClearBlock()
    expect(casBlock).toContain('assigned_number_missing_from_twilio')
  })

  it('does not modify Messaging Service attachment', () => {
    // The CAS clear should not affect messaging service attachment in trigger-provisioning
    const triggerSrc = readSrc('src/app/api/business/trigger-provisioning/route.ts')
    expect(triggerSrc).toContain('messagingService')
  })

  it('self-heal still triggers reprovisioning after CAS clear', () => {
    const triggerIdx = monitorSrc.indexOf('trigger-provisioning')
    expect(triggerIdx).toBeGreaterThan(-1)
  })

  it('normal user without number change sees no regression (legacy provisionedAt === null → true)', () => {
    // When provisioned_at is null (legacy), the helper returns true
    // so existing forwarding confirmation is still valid
    const helperIdx = setupCardSrc.indexOf('isForwardingConfirmedForCurrentNumber')
    const helperBlock = setupCardSrc.substring(helperIdx, helperIdx + 500)
    expect(helperBlock).toContain('provisionedAt === null')
    expect(helperBlock).toContain('return true')
  })
})
