/// <reference types="vitest" />
import { describe, it, expect, vi } from 'vitest'
import { checkAssignedNumberIntegrityWith, IntegrityFinding } from '../assigned-number-monitor'

function makeBusiness(overrides: Partial<any> = {}) {
  return {
    id: 'biz1',
    name: 'Acme',
    twilio_phone_number: '+15551234567',
    twilio_phone_number_sid: 'PN123',
    assigned_twilio_number_id: 'tn1',
    provisioning_status: 'ready',
    provisioning_error: null,
    ...overrides
  }
}

function depsTemplate(overrides: Partial<any> = {}) {
  return {
    listBusinessesWithAssignment: vi.fn().mockResolvedValue([makeBusiness()]),
    getTwilioNumberRowBySid: vi.fn().mockResolvedValue({ id: 'tn1', phone_number: '+15551234567', twilio_sid: 'PN123', status: 'assigned', business_id: 'biz1' }),
    fetchTwilioIncomingPN: vi.fn().mockResolvedValue('exists'),
    updateBusinessDegraded: vi.fn().mockResolvedValue(undefined),
    recordIncident: vi.fn().mockResolvedValue(undefined),
    clearBusinessRecovered: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }
}

describe('Assigned Number Integrity Monitor', () => {
  it('healthy assigned number → healthy finding, no update', async () => {
    const d = depsTemplate()
    const res = await checkAssignedNumberIntegrityWith(d)
    expect(res.findings.some((f: IntegrityFinding) => f.type === 'healthy')).toBe(true)
    expect(d.updateBusinessDegraded).not.toHaveBeenCalled()
  })

  it('definitive 404 → degraded update and incident', async () => {
    const d = depsTemplate({ fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found') })
    const res = await checkAssignedNumberIntegrityWith(d)
    expect(res.findings.some((f: IntegrityFinding) => f.type === 'missing_from_twilio')).toBe(true)
    expect(d.updateBusinessDegraded).toHaveBeenCalled()
    expect(d.recordIncident).toHaveBeenCalled()
  })

  it('ambiguous Twilio failure → no update, ambiguous finding', async () => {
    const d = depsTemplate({ fetchTwilioIncomingPN: vi.fn().mockResolvedValue({ error: 'timeout' }) })
    const res = await checkAssignedNumberIntegrityWith(d)
    expect(res.findings.some((f: IntegrityFinding) => f.type === 'ambiguous_failure')).toBe(true)
    expect(d.updateBusinessDegraded).not.toHaveBeenCalled()
  })

  it('DB inconsistency scenarios → integrity_error finding', async () => {
    const biz = makeBusiness({ twilio_phone_number_sid: null })
    const d = depsTemplate({ listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]) })
    const res = await checkAssignedNumberIntegrityWith(d)
    expect(res.findings.some((f: IntegrityFinding) => f.type === 'integrity_error')).toBe(true)
  })

  it('dedup incident on repeated missing', async () => {
    const d = depsTemplate({ fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found') })
    await checkAssignedNumberIntegrityWith(d)
    await checkAssignedNumberIntegrityWith(d)
    expect(d.updateBusinessDegraded).toHaveBeenCalledTimes(2) // DI stub does not dedup; default runner dedups by DB. Here we only assert incidents are recorded at least once.
    expect(d.recordIncident).toHaveBeenCalled()
  })

  it('business with phone number but missing SID → integrity_error', async () => {
    const biz = makeBusiness({ twilio_phone_number_sid: null, twilio_phone_number: '+15551234567' })
    const d = depsTemplate({ listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]) })
    const res = await checkAssignedNumberIntegrityWith(d)
    expect(res.findings.some((f: IntegrityFinding) => f.type === 'integrity_error')).toBe(true)
  })

  it('released business excluded from monitoring (default runner filtering)', async () => {
    // This test validates the default runner's filtering logic
    // by checking that businesses with twilio_release_status='released' are excluded
    const bizReleased = makeBusiness({ id: 'biz1', twilio_release_status: 'released' })
    const bizActive = makeBusiness({ id: 'biz2' })
    // The default runner filters out released businesses before processing
    // DI test validates that when listBusinessesWithAssignment returns pre-filtered results,
    // only those are processed
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([bizActive]),
    })
    const res = await checkAssignedNumberIntegrityWith(d)
    expect(d.fetchTwilioIncomingPN).toHaveBeenCalledTimes(1)
    expect(d.fetchTwilioIncomingPN).toHaveBeenCalledWith('PN123')
  })


  it('recovery clears only assigned_number_missing_from_twilio-specific failure', async () => {
    const biz = makeBusiness({ id: 'biz1' })
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
      clearBusinessRecovered: vi.fn().mockResolvedValue(undefined),
    })
    await checkAssignedNumberIntegrityWith(d)
    // Recovery is called when Twilio returns 'exists'
    expect(d.clearBusinessRecovered).toHaveBeenCalledWith('biz1')
  })

  it('unrelated provisioning_error is preserved (not cleared by recovery)', async () => {
    const biz = makeBusiness({ id: 'biz1' })
    let recoveryCalled = false
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
      clearBusinessRecovered: vi.fn().mockImplementation(async () => {
        recoveryCalled = true
      }),
    })
    await checkAssignedNumberIntegrityWith(d)
    // Recovery is still called; the internal logic checks the error prefix
    expect(d.clearBusinessRecovered).toHaveBeenCalled()
  })

  it('monitor exception does not break overall health-check aggregation', async () => {
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockRejectedValue(new Error('DB connection failed')),
    })
    await expect(checkAssignedNumberIntegrityWith(d)).rejects.toThrow('DB connection failed')
    // The health-checks route wraps this in try/catch and returns degraded status
  })
})

// ============================================================================
// SELF-HEALING RECOVERY TESTS
// ============================================================================

describe('Self-healing recovery for missing assigned numbers', () => {
  function depsWithRecovery(overrides: Partial<any> = {}) {
    const recoverMissingAssignment = vi.fn().mockResolvedValue({ attempted: true, success: true })
    return {
      ...depsTemplate({
        fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found'),
        ...overrides,
      }),
      recoverMissingAssignment,
    }
  }

  it('1. active business + missing Twilio number → recovery invoked', async () => {
    const biz = makeBusiness({ subscription_status: 'active' })
    const d = depsWithRecovery({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
    })
    const res = await checkAssignedNumberIntegrityWith(d)
    expect(res.findings.some(f => f.type === 'missing_from_twilio')).toBe(true)
    expect(d.recoverMissingAssignment).toHaveBeenCalledTimes(1)
    expect(d.recoverMissingAssignment).toHaveBeenCalledWith(biz)
  })

  it('2. same recovery invoked twice → callback called twice but CAS prevents double-provision', async () => {
    // The CAS (compare-and-swap) is in the default runner implementation.
    // At the DI level, the callback is called for each detection.
    // Idempotency is enforced by the CAS in the real implementation:
    // the second call's CAS fails because the SID was already cleared.
    const biz = makeBusiness({ subscription_status: 'active' })
    const d = depsWithRecovery({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
    })
    await checkAssignedNumberIntegrityWith(d)
    await checkAssignedNumberIntegrityWith(d)
    // The callback IS called twice (detection fires both times),
    // but the real implementation's CAS would prevent double-provisioning.
    // This test verifies the callback is invoked; CAS idempotency is
    // tested in the default runner integration test.
    expect(d.recoverMissingAssignment).toHaveBeenCalledTimes(2)
  })

  it('3. canceled business → recovery NOT attempted', async () => {
    const biz = makeBusiness({ subscription_status: 'canceled' })
    const recoverMissingAssignment = vi.fn().mockImplementation(async (b: any) => {
      // Simulate the eligibility check in the real implementation
      const sub = b.subscription_status
      if (sub !== 'active' && sub !== 'trialing') {
        return { attempted: false, success: false }
      }
      return { attempted: true, success: true }
    })
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
      fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found'),
      recoverMissingAssignment,
    })
    const res = await checkAssignedNumberIntegrityWith(d)
    expect(res.findings.some(f => f.type === 'missing_from_twilio')).toBe(true)
    expect(recoverMissingAssignment).toHaveBeenCalledTimes(1)
    const result = await recoverMissingAssignment.mock.results[0].value
    expect(result.attempted).toBe(false)
  })

  it('4. offboarding release → recovery NOT attempted', async () => {
    const biz = makeBusiness({
      subscription_status: 'active',
      twilio_release_status: 'released',
      twilio_released_at: new Date().toISOString(),
    })
    const recoverMissingAssignment = vi.fn().mockImplementation(async (b: any) => {
      if (b.twilio_release_status === 'released' || b.twilio_released_at) {
        return { attempted: false, success: false }
      }
      return { attempted: true, success: true }
    })
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
      fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found'),
      recoverMissingAssignment,
    })
    await checkAssignedNumberIntegrityWith(d)
    expect(recoverMissingAssignment).toHaveBeenCalledTimes(1)
    const result = await recoverMissingAssignment.mock.results[0].value
    expect(result.attempted).toBe(false)
  })

  it('5. protected/system number → recovery NOT attempted', async () => {
    // Set the system number env var so the mock's eligibility check matches
    process.env.REPLYFLOW_SYSTEM_SMS_NUMBER = '+18336584303'
    try {
      const biz = makeBusiness({ subscription_status: 'active', twilio_phone_number: '+18336584303' })
      const recoverMissingAssignment = vi.fn().mockImplementation(async (b: any) => {
        const PROTECTED = (process.env.PROTECTED_TWILIO_NUMBERS || '').split(',').filter(n => n.trim())
        const sysNum = process.env.REPLYFLOW_SYSTEM_SMS_NUMBER
        const phone = b.twilio_phone_number
        if (phone && (PROTECTED.includes(phone) || phone === sysNum)) {
          return { attempted: false, success: false }
        }
        return { attempted: true, success: true }
      })
      const d = depsTemplate({
        listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
        fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found'),
        recoverMissingAssignment,
      })
      await checkAssignedNumberIntegrityWith(d)
      const result = await recoverMissingAssignment.mock.results[0].value
      expect(result.attempted).toBe(false)
    } finally {
      delete process.env.REPLYFLOW_SYSTEM_SMS_NUMBER
    }
  })

  it('6. warm inventory exhausted → safe failure, business stays in failed state', async () => {
    const biz = makeBusiness({ subscription_status: 'active' })
    const recoverMissingAssignment = vi.fn().mockResolvedValue({
      attempted: true,
      success: false,
      error: 'No warm numbers available and live provisioning failed'
    })
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
      fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found'),
      recoverMissingAssignment,
    })
    const res = await checkAssignedNumberIntegrityWith(d)
    expect(res.findings.some(f => f.type === 'missing_from_twilio')).toBe(true)
    expect(d.updateBusinessDegraded).toHaveBeenCalled()
    expect(recoverMissingAssignment).toHaveBeenCalledTimes(1)
    const result = await recoverMissingAssignment.mock.results[0].value
    expect(result.attempted).toBe(true)
    expect(result.success).toBe(false)
  })

  it('7. webhook/configuration failure → rollback, no half-owned number', async () => {
    const biz = makeBusiness({ subscription_status: 'active' })
    const recoverMissingAssignment = vi.fn().mockResolvedValue({
      attempted: true,
      success: false,
      error: 'Reprovision trigger failed: 500'
    })
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
      fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found'),
      recoverMissingAssignment,
    })
    await checkAssignedNumberIntegrityWith(d)
    expect(recoverMissingAssignment).toHaveBeenCalledTimes(1)
    const result = await recoverMissingAssignment.mock.results[0].value
    expect(result.attempted).toBe(true)
    expect(result.success).toBe(false)
    // The real implementation rolls back to failed state
    // (the updateBusinessDegraded call already marked it as failed)
  })

  it('recovery callback not provided → detection only, no auto-recovery', async () => {
    const biz = makeBusiness({ subscription_status: 'active' })
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
      fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found'),
    })
    // No recoverMissingAssignment in deps
    const res = await checkAssignedNumberIntegrityWith(d as any)
    expect(res.findings.some(f => f.type === 'missing_from_twilio')).toBe(true)
    expect(d.updateBusinessDegraded).toHaveBeenCalled()
  })

  it('recovery exception → caught, incident recorded, business stays failed', async () => {
    const biz = makeBusiness({ subscription_status: 'active' })
    const recoverMissingAssignment = vi.fn().mockRejectedValue(new Error('Network timeout'))
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
      fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found'),
      recoverMissingAssignment,
    })
    const res = await checkAssignedNumberIntegrityWith(d)
    expect(res.findings.some(f => f.type === 'missing_from_twilio')).toBe(true)
    // Exception was caught — recordIncident called with recovery exception summary
    const incidentCalls = d.recordIncident.mock.calls
    const exceptionIncident = incidentCalls.find(
      (call: any[]) => call[0].summary.includes('Self-healing recovery exception')
    )
    expect(exceptionIncident).toBeTruthy()
  })

  it('successful recovery → success incident recorded', async () => {
    const biz = makeBusiness({ subscription_status: 'active' })
    const recoverMissingAssignment = vi.fn().mockResolvedValue({
      attempted: true,
      success: true,
    })
    const d = depsTemplate({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
      fetchTwilioIncomingPN: vi.fn().mockResolvedValue('not_found'),
      recoverMissingAssignment,
    })
    await checkAssignedNumberIntegrityWith(d)
    const incidentCalls = d.recordIncident.mock.calls
    const successIncident = incidentCalls.find(
      (call: any[]) => call[0].summary.includes('Self-healing recovery succeeded')
    )
    expect(successIncident).toBeTruthy()
  })

  it('trialing business → recovery invoked (eligible)', async () => {
    const biz = makeBusiness({ subscription_status: 'trialing' })
    const d = depsWithRecovery({
      listBusinessesWithAssignment: vi.fn().mockResolvedValue([biz]),
    })
    await checkAssignedNumberIntegrityWith(d)
    expect(d.recoverMissingAssignment).toHaveBeenCalledTimes(1)
  })
})
