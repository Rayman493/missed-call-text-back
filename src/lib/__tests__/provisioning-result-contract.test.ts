/**
 * Twilio Provisioning Result Contract — Regression Tests
 *
 * Verifies the canonical provisioning success result contract:
 *   { phoneNumber, phoneNumberSid, messagingServiceAttached, ... }
 *
 * And the structured failure result contract:
 *   { failureType, reason }
 *
 * The root cause of the production failure was that provisionTwilioNumber
 * returned bare `null` for ALL failure paths, and the trigger-provisioning
 * route's validator conflated null with "missing fields", producing the
 * misleading error: "Invalid provisioning result returned - missing
 * phoneNumber or phoneNumberSid".
 *
 * The fix normalizes all null returns into structured failure results
 * with a human-readable reason and machine-readable failureType, and
 * updates the trigger route to surface the real root cause.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf8').replace(/\r\n/g, '\n')

const twilioSrc = readSrc('src/lib/twilio.ts')
const triggerRouteSrc = readSrc('src/app/api/business/trigger-provisioning/route.ts')
const stripeWebhookSrc = readSrc('src/app/api/stripe/webhook/route.ts')
const adminRetrySrc = readSrc('src/app/api/admin/retry-twilio-provisioning/route.ts')

// ============================================================================
// 1. Canonical success result contract
// ============================================================================
describe('1. Canonical success result contract', () => {
  it('provisionTwilioNumber declares ProvisioningSuccessResult type', () => {
    expect(twilioSrc).toContain('export interface ProvisioningSuccessResult')
    expect(twilioSrc).toContain('phoneNumber: string')
    expect(twilioSrc).toContain('phoneNumberSid: string')
    expect(twilioSrc).toContain('messagingServiceAttached: boolean')
  })

  it('all success returns include phoneNumber and phoneNumberSid', () => {
    // Idempotency success
    expect(twilioSrc).toContain('phoneNumber: existingTwilioNumber.phone_number')
    expect(twilioSrc).toContain('phoneNumberSid: existingTwilioNumber.twilio_sid')

    // Warm inventory success
    expect(twilioSrc).toContain('phoneNumber: warmNumberResult.phoneNumber')
    expect(twilioSrc).toContain('phoneNumberSid: warmNumberResult.phoneNumberSid')

    // Pre-purchase check success
    expect(twilioSrc).toContain('phoneNumber: prePurchaseCheck.phone_number')
    expect(twilioSrc).toContain('phoneNumberSid: prePurchaseCheck.twilio_sid')

    // Live purchase success
    expect(twilioSrc).toContain('phoneNumber: purchasedPhoneNumber')
    expect(twilioSrc).toContain('phoneNumberSid: purchasedPhoneNumberSid')
  })
})

// ============================================================================
// 2. Structured failure result contract (replaces bare null)
// ============================================================================
describe('2. Structured failure result contract', () => {
  it('provisionTwilioNumber no longer returns bare null', () => {
    // All return null statements should be replaced with structured failures
    // Find the function body and verify no bare `return null` remains
    const fnStart = twilioSrc.indexOf('export async function provisionTwilioNumber')
    const fnEnd = twilioSrc.indexOf('\nexport async function saveProvisionedNumberToBusiness')
    const fnBody = twilioSrc.substring(fnStart, fnEnd)
    expect(fnBody).not.toContain('return null')
    expect(fnBody).not.toContain('return null;')
  })

  it('CREDENTIALS_MISSING failure type exists', () => {
    expect(twilioSrc).toContain("failureType: 'CREDENTIALS_MISSING'")
  })

  it('LOCK_BLOCKED_BY_OTHER_REQUEST failure type exists', () => {
    expect(twilioSrc).toContain("failureType: 'LOCK_BLOCKED_BY_OTHER_REQUEST'")
  })

  it('EXISTING_NUMBER_FOUND failure type exists', () => {
    expect(twilioSrc).toContain("failureType: 'EXISTING_NUMBER_FOUND'")
  })

  it('WARM_INVENTORY_BUSINESS_UPDATE_FAILED failure type exists', () => {
    expect(twilioSrc).toContain("failureType: 'WARM_INVENTORY_BUSINESS_UPDATE_FAILED'")
  })

  it('WARM_INVENTORY_BLOCKED_LIVE_PURCHASE failure type exists', () => {
    expect(twilioSrc).toContain("failureType: 'WARM_INVENTORY_BLOCKED_LIVE_PURCHASE'")
  })

  it('NO_AVAILABLE_LOCAL_NUMBERS failure type exists', () => {
    expect(twilioSrc).toContain("failureType: 'NO_AVAILABLE_LOCAL_NUMBERS'")
  })

  it('MESSAGING_SERVICE_NOT_ATTACHED failure type exists', () => {
    expect(twilioSrc).toContain("failureType: 'MESSAGING_SERVICE_NOT_ATTACHED'")
  })

  it('PROVISIONING_EXCEPTION failure type exists', () => {
    expect(twilioSrc).toContain("failureType: 'PROVISIONING_EXCEPTION'")
  })

  it('each failure result includes a human-readable reason', () => {
    // Every failure return should include a `reason:` field
    const fnStart = twilioSrc.indexOf('export async function provisionTwilioNumber')
    const fnEnd = twilioSrc.indexOf('\nexport async function saveProvisionedNumberToBusiness')
    const fnBody = twilioSrc.substring(fnStart, fnEnd)
    const failureReturns = fnBody.match(/failureType:/g) || []
    const reasonReturns = fnBody.match(/reason:/g) || []
    // reason count may exceed failureType count due to comments/strings,
    // but every failure must have at least as many reasons
    expect(reasonReturns.length).toBeGreaterThanOrEqual(failureReturns.length)
  })
})

// ============================================================================
// 3. Type guard and failure reason helper
// ============================================================================
describe('3. Type guard and failure reason helper', () => {
  it('isProvisioningSuccess type guard is exported', () => {
    expect(twilioSrc).toContain('export function isProvisioningSuccess')
  })

  it('isProvisioningSuccess checks phoneNumber and phoneNumberSid presence', () => {
    const guardIdx = twilioSrc.indexOf('export function isProvisioningSuccess')
    const guardBody = twilioSrc.substring(guardIdx, guardIdx + 300)
    expect(guardBody).toContain("'phoneNumber' in result")
    expect(guardBody).toContain("'phoneNumberSid' in result")
  })

  it('getProvisioningFailureReason helper is exported', () => {
    expect(twilioSrc).toContain('export function getProvisioningFailureReason')
  })

  it('getProvisioningFailureReason returns null for success results', () => {
    const helperIdx = twilioSrc.indexOf('export function getProvisioningFailureReason')
    const helperBody = twilioSrc.substring(helperIdx, helperIdx + 400)
    expect(helperBody).toContain('return null')
  })

  it('getProvisioningFailureReason surfaces failureType and reason', () => {
    const helperIdx = twilioSrc.indexOf('export function getProvisioningFailureReason')
    const helperBody = twilioSrc.substring(helperIdx, helperIdx + 400)
    expect(helperBody).toContain('failureType')
    expect(helperBody).toContain('reason')
  })
})

// ============================================================================
// 4. Trigger-provisioning route uses type guard and surfaces real reason
// ============================================================================
describe('4. Trigger-provisioning route validator', () => {
  it('imports isProvisioningSuccess and getProvisioningFailureReason', () => {
    expect(triggerRouteSrc).toContain('isProvisioningSuccess')
    expect(triggerRouteSrc).toContain('getProvisioningFailureReason')
  })

  it('uses isProvisioningSuccess instead of bare truthiness check', () => {
    expect(triggerRouteSrc).toContain('isProvisioningSuccess(provisioningResult)')
  })

  it('does NOT use the old misleading error message as the only message', () => {
    // The old message "Invalid provisioning result returned - missing phoneNumber or phoneNumberSid"
    // should only appear as a fallback, not the primary message
    const validatorIdx = triggerRouteSrc.indexOf('isProvisioningSuccess(provisioningResult)')
    const block = triggerRouteSrc.substring(validatorIdx, validatorIdx + 3500)
    // The new code should use failureReason as the primary message
    expect(block).toContain('failureReason')
    expect(block).toContain('Provisioning failed -')
  })

  it('logs diagnostic snapshot before rejecting', () => {
    const validatorIdx = triggerRouteSrc.indexOf('isProvisioningSuccess(provisioningResult)')
    const block = triggerRouteSrc.substring(validatorIdx, validatorIdx + 2000)
    expect(block).toContain('DIAGNOSTIC SNAPSHOT')
    expect(block).toContain('business_id')
    expect(block).toContain('provisioning_path_used')
    expect(block).toContain('result_keys')
    expect(block).toContain('failure_reason')
    expect(block).toContain('db_assignment_exists')
  })

  it('checks DB assignment state before rejecting (split-brain detection)', () => {
    const validatorIdx = triggerRouteSrc.indexOf('isProvisioningSuccess(provisioningResult)')
    const block = triggerRouteSrc.substring(validatorIdx, validatorIdx + 2500)
    expect(block).toContain('twilio_phone_number')
    expect(block).toContain('assigned_twilio_number_id')
    expect(block).toContain('provisioning_status')
  })
})

// ============================================================================
// 5. Stripe webhook uses type guard
// ============================================================================
describe('5. Stripe webhook caller', () => {
  it('imports isProvisioningSuccess and getProvisioningFailureReason', () => {
    expect(stripeWebhookSrc).toContain('isProvisioningSuccess')
    expect(stripeWebhookSrc).toContain('getProvisioningFailureReason')
  })

  it('uses isProvisioningSuccess instead of bare truthiness check', () => {
    expect(stripeWebhookSrc).toContain('isProvisioningSuccess(provisioningResult)')
  })

  it('surfaces failure reason in error message', () => {
    expect(stripeWebhookSrc).toContain('failureReason')
    expect(stripeWebhookSrc).toContain('Provisioning failed -')
  })
})

// ============================================================================
// 6. Admin retry route uses type guard
// ============================================================================
describe('6. Admin retry route caller', () => {
  it('imports isProvisioningSuccess and getProvisioningFailureReason', () => {
    expect(adminRetrySrc).toContain('isProvisioningSuccess')
    expect(adminRetrySrc).toContain('getProvisioningFailureReason')
  })

  it('uses isProvisioningSuccess instead of bare truthiness check', () => {
    expect(adminRetrySrc).toContain('isProvisioningSuccess(provisioned)')
  })

  it('surfaces failure reason in error message', () => {
    expect(adminRetrySrc).toContain('failureReason')
    expect(adminRetrySrc).toContain('Admin retry failed -')
  })
})

// ============================================================================
// 7. Lifecycle safety preserved
// ============================================================================
describe('7. Lifecycle safety preserved', () => {
  it('CAS ownership check still uses provisioning_lock_id in WHERE', () => {
    expect(triggerRouteSrc).toContain('.eq(\'provisioning_lock_id\', correlationId)')
  })

  it('lock release on failure still uses ownership check', () => {
    const failIdx = triggerRouteSrc.indexOf('provisioning_status: \'failed\'')
    const block = triggerRouteSrc.substring(failIdx, failIdx + 500)
    expect(block).toContain('provisioning_lock_id: null')
    expect(block).toContain('.eq(\'provisioning_lock_id\', correlationId)')
  })

  it('acquire_provisioning_lock RPC still called', () => {
    expect(triggerRouteSrc).toContain("rpc('acquire_provisioning_lock'")
  })

  it('active subscription check preserved', () => {
    // The route should still check subscription status before provisioning
    expect(triggerRouteSrc).toContain('subscription_status')
  })

  it('idempotency check preserved in provisionTwilioNumber', () => {
    expect(twilioSrc).toContain('PROVISION_IDEMPOTENCY')
    expect(twilioSrc).toContain('existingTwilioNumber')
  })

  it('pre-purchase duplicate prevention check preserved', () => {
    expect(twilioSrc).toContain('PROVISION_PRE_PURCHASE_CHECK')
    expect(twilioSrc).toContain('PROVISION_DUPLICATE_PURCHASE_PREVENTED')
  })

  it('warm inventory rollback on business update failure preserved', () => {
    expect(twilioSrc).toContain('business_update_failure_rollback')
  })

  it('compensation (release Twilio number) on DB save failure preserved', () => {
    expect(triggerRouteSrc).toContain('COMPENSATION')
    expect(triggerRouteSrc).toContain('incomingPhoneNumbers')
    expect(triggerRouteSrc).toContain('.remove()')
  })
})

// ============================================================================
// 8. Final successful recovery sets all required fields
// ============================================================================
describe('8. Final successful recovery sets all required fields', () => {
  it('trigger route sets twilio_phone_number on success', () => {
    expect(triggerRouteSrc).toContain('twilio_phone_number: provisioningResult.phoneNumber')
  })

  it('trigger route sets twilio_phone_number_sid on success', () => {
    expect(triggerRouteSrc).toContain('twilio_phone_number_sid: provisioningResult.phoneNumberSid')
  })

  it('trigger route sets assigned_twilio_number_id on success', () => {
    expect(triggerRouteSrc).toContain('assigned_twilio_number_id: twilioNumber?.id')
  })

  it('trigger route sets provisioning_status to completed on success', () => {
    expect(triggerRouteSrc).toContain("provisioning_status: 'completed'")
  })

  it('trigger route clears provisioning_error on success', () => {
    expect(triggerRouteSrc).toContain('provisioning_error: null')
  })

  it('trigger route clears provisioning_lock_id on success', () => {
    expect(triggerRouteSrc).toContain('provisioning_lock_id: null')
  })
})
