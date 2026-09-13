/// <reference types="vitest" />
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = path.resolve(__dirname, '..', '..', '..')

function readSrc(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

// ============================================================================
// PART A — SELF-HEAL REPROVISION STATE RACE
// ============================================================================

describe('Part A: Self-Heal Reprovision State Race', () => {
  const monitor = readSrc('src/lib/assigned-number-monitor.ts')
  const trigger = readSrc('src/app/api/business/trigger-provisioning/route.ts')
  const migration = readSrc('supabase/migrations/20260722000007_prevent_duplicate_active_numbers.sql')

  // -------------------------------------------------------------------------
  // 1. Root cause: CAS clear must NOT set provisioning_status to 'provisioning'
  // -------------------------------------------------------------------------
  describe('1. CAS clear does not pre-set provisioning state', () => {
    it('CAS clear uses needs_provisioning (not provisioning)', () => {
      // The CAS clear should set 'needs_provisioning', not 'provisioning'
      const casIdx = monitor.indexOf('Compare-and-swap clear the stale business assignment')
      const block = monitor.substring(casIdx, casIdx + 2000)
      expect(block).toContain("provisioning_status: 'needs_provisioning'")
      expect(block).not.toContain("provisioning_status: 'provisioning'")
    })

    it('CAS clear comment explains why provisioning is not set', () => {
      const casIdx = monitor.indexOf('Compare-and-swap clear the stale business assignment')
      const block = monitor.substring(casIdx, casIdx + 2000)
      expect(block).toContain('Do NOT set provisioning_status')
      expect(block).toContain('acquire_provisioning_lock')
    })
  })

  // -------------------------------------------------------------------------
  // 2. acquire_provisioning_lock RPC rejects 'provisioning' status
  // -------------------------------------------------------------------------
  describe('2. Lock RPC rejects provisioning status', () => {
    it('RPC WHERE clause excludes provisioning_status = provisioning', () => {
      expect(migration).toContain("provisioning_status != 'provisioning'")
    })

    it('trigger route calls acquire_provisioning_lock RPC', () => {
      expect(trigger).toContain("rpc('acquire_provisioning_lock'")
    })

    it('trigger route returns 409 when lock fails', () => {
      const lockIdx = trigger.indexOf('Failed to acquire lock')
      const block = trigger.substring(lockIdx, lockIdx + 500)
      expect(block).toContain("'Provisioning already in progress'")
      expect(block).toContain('409')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Self-heal handles already-cleared failed rows (staleSid = NULL)
  // -------------------------------------------------------------------------
  describe('3. Already-cleared failed row recovery', () => {
    it('recoverMissingAssignment handles staleSid = NULL', () => {
      // The function should NOT early-return when staleSid is NULL
      // Instead, it should skip CAS clear and go directly to trigger-provisioning
      const idx = monitor.indexOf('skipCasAndRetire')
      expect(idx).toBeGreaterThan(-1)
    })

    it('skipCasAndRetire path skips CAS and retire, goes to trigger', () => {
      const idx = monitor.indexOf('skipCasAndRetire = true')
      const block = monitor.substring(idx - 500, idx + 300)
      expect(block).toContain('Already-cleared')
      expect(block).toContain('Skip CAS clear and retire')
    })

    it('trigger-provisioning call happens regardless of skipCasAndRetire', () => {
      // The trigger-provisioning fetch call should be after both paths
      const triggerIdx = monitor.indexOf('/api/business/trigger-provisioning')
      const skipIdx = monitor.indexOf('skipCasAndRetire = true')
      expect(triggerIdx).toBeGreaterThan(skipIdx)
    })
  })

  // -------------------------------------------------------------------------
  // 4. Recovery sweep for already-cleared failed rows
  // -------------------------------------------------------------------------
  describe('4. Recovery sweep for stuck businesses', () => {
    it('recovery sweep queries businesses with NULL number + failed status', () => {
      const sweepIdx = monitor.indexOf('RECOVERY SWEEP')
      const block = monitor.substring(sweepIdx, sweepIdx + 3000)
      expect(block).toContain("is('twilio_phone_number', null)")
      expect(block).toContain("is('twilio_phone_number_sid', null)")
      expect(block).toContain("is('assigned_twilio_number_id', null)")
      expect(block).toContain("eq('provisioning_status', 'failed')")
    })

    it('recovery sweep filters for self-heal error', () => {
      const sweepIdx = monitor.indexOf('RECOVERY SWEEP')
      const block = monitor.substring(sweepIdx, sweepIdx + 3000)
      expect(block).toContain("'Self-heal reprovision'")
      expect(block).toContain("'assigned_number_missing_from_twilio'")
    })

    it('recovery sweep filters for active/trialing subscription', () => {
      const sweepIdx = monitor.indexOf('RECOVERY SWEEP')
      const block = monitor.substring(sweepIdx, sweepIdx + 3000)
      expect(block).toContain("in('subscription_status', ['active', 'trialing'])")
    })

    it('recovery sweep excludes released/offboarding businesses', () => {
      const sweepIdx = monitor.indexOf('RECOVERY SWEEP')
      const block = monitor.substring(sweepIdx, sweepIdx + 3000)
      expect(block).toContain('twilio_release_status')
      expect(block).toContain("'released'")
    })

    it('recovery sweep calls recoverMissingAssignment for recoverable rows', () => {
      const sweepIdx = monitor.indexOf('RECOVERY SWEEP')
      const block = monitor.substring(sweepIdx, sweepIdx + 3000)
      expect(block).toContain('recoverMissingAssignment')
    })

    it('recovery sweep is non-blocking (wrapped in try/catch)', () => {
      const sweepIdx = monitor.indexOf('RECOVERY SWEEP')
      const block = monitor.substring(sweepIdx, sweepIdx + 5000)
      expect(block).toContain('try')
      expect(block).toContain('catch')
    })
  })

  // -------------------------------------------------------------------------
  // 5. Eligibility checks preserved
  // -------------------------------------------------------------------------
  describe('5. Eligibility checks', () => {
    it('checks subscription_status is active or trialing', () => {
      const idx = monitor.indexOf('Eligibility check: only recover active/trialing')
      const block = monitor.substring(idx, idx + 500)
      expect(block).toContain("'active'")
      expect(block).toContain("'trialing'")
    })

    it('excludes released/offboarding businesses', () => {
      const idx = monitor.indexOf('Exclude released/offboarding')
      const block = monitor.substring(idx, idx + 500)
      expect(block).toContain("'released'")
      expect(block).toContain('twilio_released_at')
    })

    it('excludes protected/system numbers', () => {
      const idx = monitor.indexOf('Exclude protected/system')
      const block = monitor.substring(idx, idx + 500)
      expect(block).toContain('PROTECTED_TWILIO_NUMBERS')
      expect(block).toContain('REPLYFLOW_SYSTEM_SMS_NUMBER')
    })
  })

  // -------------------------------------------------------------------------
  // 6. Trigger-provisioning accepts needs_provisioning status
  // -------------------------------------------------------------------------
  describe('6. Trigger accepts needs_provisioning', () => {
    it('trigger guard only rejects provisioning_status = provisioning', () => {
      const guardIdx = trigger.indexOf("provisioning_status === 'provisioning'")
      expect(guardIdx).toBeGreaterThan(-1)
      // The guard should NOT reject 'needs_provisioning'
      const block = trigger.substring(guardIdx - 200, guardIdx + 200)
      expect(block).not.toContain("needs_provisioning")
    })
  })
})

// ============================================================================
// PART B — READINESS UI TRUTH STATE
// ============================================================================

describe('Part B: Readiness UI Truth State', () => {
  const card = readSrc('src/components/SetupStatusCard.tsx')

  // -------------------------------------------------------------------------
  // 1. "ReplyFlow is ready" requires operational readiness
  // -------------------------------------------------------------------------
  describe('1. Ready banner requires number + forwarding + no error', () => {
    it('ready banner is gated on hasNumber', () => {
      // Find the JSX occurrence (second occurrence — first is in a comment)
      const firstIdx = card.indexOf('ReplyFlow is ready')
      const idx = card.indexOf('ReplyFlow is ready', firstIdx + 1)
      const block = card.substring(idx - 1200, idx + 200)
      expect(block).toContain('hasNumber')
    })

    it('ready banner is gated on forwardingStep2Complete', () => {
      const firstIdx = card.indexOf('ReplyFlow is ready')
      const idx = card.indexOf('ReplyFlow is ready', firstIdx + 1)
      const block = card.substring(idx - 1200, idx + 200)
      expect(block).toContain('forwardingStep2Complete')
    })

    it('ready banner is gated on !isRecoveringOrFailed', () => {
      const firstIdx = card.indexOf('ReplyFlow is ready')
      const idx = card.indexOf('ReplyFlow is ready', firstIdx + 1)
      const block = card.substring(idx - 1200, idx + 200)
      expect(block).toContain('!isRecoveringOrFailed')
    })

    it('ready banner comment explains canonical operational readiness', () => {
      // The comment is before the JSX — find the first occurrence (in comment)
      const idx = card.indexOf('CANONICAL OPERATIONAL READINESS')
      expect(idx).toBeGreaterThan(-1)
      const block = card.substring(idx, idx + 500)
      expect(block).toContain('CURRENTLY operational')
      expect(block).toContain('not historically onboarded')
    })
  })

  // -------------------------------------------------------------------------
  // 2. Recovery state UI shows when number is absent
  // -------------------------------------------------------------------------
  describe('2. Recovery state UI', () => {
    it('recovery banner shows when !hasNumber && isRecoveringOrFailed', () => {
      const idx = card.indexOf('Restoring your ReplyFlow number')
      expect(idx).toBeGreaterThan(-1)
      const block = card.substring(idx - 500, idx + 500)
      expect(block).toContain('!hasNumber')
      expect(block).toContain('isRecoveringOrFailed')
    })

    it('recovery banner has correct title copy', () => {
      expect(card).toContain('Restoring your ReplyFlow number')
    })

    it('recovery banner has correct body copy', () => {
      expect(card).toContain('We detected an issue with your assigned number and are automatically replacing it.')
      expect(card).toContain('Call handling will resume once the new number is ready.')
    })

    it('recovery banner uses amber color (not green)', () => {
      const idx = card.indexOf('Restoring your ReplyFlow number')
      const block = card.substring(idx - 500, idx + 500)
      expect(block).toContain('amber')
      expect(block).not.toContain('green-500/20')
    })

    it('recovery banner uses RotateCcw icon', () => {
      const idx = card.indexOf('Restoring your ReplyFlow number')
      const block = card.substring(idx - 500, idx + 500)
      expect(block).toContain('RotateCcw')
    })
  })

  // -------------------------------------------------------------------------
  // 3. isRecoveringOrFailed definition
  // -------------------------------------------------------------------------
  describe('3. isRecoveringOrFailed definition', () => {
    it('isRecoveringOrFailed includes failed status', () => {
      const idx = card.indexOf('isRecoveringOrFailed')
      const block = card.substring(idx, idx + 300)
      expect(block).toContain("'failed'")
    })

    it('isRecoveringOrFailed includes needs_provisioning status', () => {
      const idx = card.indexOf('isRecoveringOrFailed')
      const block = card.substring(idx, idx + 300)
      expect(block).toContain("'needs_provisioning'")
    })

    it('isRecoveringOrFailed includes provisioning status', () => {
      const idx = card.indexOf('isRecoveringOrFailed')
      const block = card.substring(idx, idx + 300)
      expect(block).toContain("'provisioning'")
    })
  })

  // -------------------------------------------------------------------------
  // 4. Historical forwarding does NOT imply ready without number
  // -------------------------------------------------------------------------
  describe('4. Historical forwarding does not imply ready', () => {
    it('hasConfirmedForwardingInstructions uses legacy fallback', () => {
      // This is the source of the bug — legacy fallback can be true without number
      const idx = card.indexOf('hasConfirmedForwardingInstructions')
      const block = card.substring(idx, idx + 300)
      expect(block).toContain('forwarding_verified')
      expect(block).toContain('forwarding_instructions_confirmed_at')
    })

    it('ready banner requires hasNumber (not just forwarding)', () => {
      // The fix: ready banner now requires hasNumber AND !isRecoveringOrFailed
      const firstIdx = card.indexOf('ReplyFlow is ready')
      const idx = card.indexOf('ReplyFlow is ready', firstIdx + 1)
      const block = card.substring(idx - 1200, idx)
      expect(block).toContain('hasNumber')
      expect(block).toContain('isRecoveringOrFailed')
    })
  })
})

// ============================================================================
// PART C — RECOVER-STUCK-PROVISIONING CRON TABLE ERROR
// ============================================================================

describe('Part C: Stuck-Provisioning Cron Table Error', () => {
  const service = readSrc('src/lib/twilio-provisioning-service.ts')
  const migrationPath = path.join(root, 'supabase/migrations/20260805000000_add_provisioning_recovery_fields.sql')

  // -------------------------------------------------------------------------
  // 1. provisioning_recovery_runs provenance
  // -------------------------------------------------------------------------
  describe('1. provisioning_recovery_runs provenance', () => {
    it('migration file exists', () => {
      expect(fs.existsSync(migrationPath)).toBe(true)
    })

    it('migration creates the table', () => {
      if (fs.existsSync(migrationPath)) {
        const migration = fs.readFileSync(migrationPath, 'utf8')
        expect(migration).toContain('CREATE TABLE IF NOT EXISTS provisioning_recovery_runs')
      }
    })

    it('service references provisioning_recovery_runs', () => {
      expect(service).toContain("from('provisioning_recovery_runs')")
    })
  })

  // -------------------------------------------------------------------------
  // 2. Audit record creation is non-critical
  // -------------------------------------------------------------------------
  describe('2. Audit record creation is non-critical', () => {
    it('audit insert failure does NOT abort recovery', () => {
      // The old code returned { success: false } on audit insert failure
      // The new code logs a warning and continues
      const idx = service.indexOf('Failed to create recovery run audit record')
      const block = service.substring(idx, idx + 500)
      expect(block).toContain('non-critical')
      expect(block).toContain('continuing')
      expect(block).not.toContain('return {')
    })

    it('audit insert failure logs warning (not error)', () => {
      const idx = service.indexOf('Failed to create recovery run audit record')
      const block = service.substring(idx - 200, idx + 300)
      expect(block).toContain('console.warn')
    })

    it('audit insert has NON-CRITICAL comment', () => {
      const idx = service.indexOf('NON-CRITICAL')
      const block = service.substring(idx, idx + 1000)
      expect(block).toContain('audit record')
      expect(block).toContain('PGRST205')
      expect(block).toContain('does not block functional recovery')
    })
  })

  // -------------------------------------------------------------------------
  // 3. Other audit updates are also non-critical
  // -------------------------------------------------------------------------
  describe('3. Other audit updates are non-critical', () => {
    it('no-eligible-numbers audit update is wrapped in try/catch', () => {
      const idx = service.indexOf('No eligible numbers found')
      const block = service.substring(idx, idx + 1000)
      expect(block).toContain('try')
      expect(block).toContain('catch')
      expect(block).toContain('non-critical')
    })

    it('final audit update is wrapped in try/catch', () => {
      const idx = service.indexOf('STEP 5: Update recovery run audit record')
      const block = service.substring(idx, idx + 1000)
      expect(block).toContain('try')
      expect(block).toContain('catch')
      expect(block).toContain('non-critical')
    })

    it('exception handler audit update is wrapped in try/catch', () => {
      const idx = service.indexOf('Mark recovery run as failed')
      const block = service.substring(idx, idx + 500)
      expect(block).toContain('try')
      expect(block).toContain('catch')
    })
  })

  // -------------------------------------------------------------------------
  // 4. Recovery continues after audit failure
  // -------------------------------------------------------------------------
  describe('4. Recovery continues after audit failure', () => {
    it('STEP 2 (reclaim stale claims) follows audit insert', () => {
      const auditIdx = service.indexOf('STEP 1: Create recovery run audit record')
      const step2Idx = service.indexOf('STEP 2: Reclaim stale claims')
      expect(step2Idx).toBeGreaterThan(auditIdx)
    })

    it('STEP 3 (find eligible numbers) follows audit insert', () => {
      const auditIdx = service.indexOf('STEP 1: Create recovery run audit record')
      const step3Idx = service.indexOf('STEP 3: Finding eligible numbers')
      expect(step3Idx).toBeGreaterThan(auditIdx)
    })

    it('business lock recovery (STEP 0) runs before audit insert', () => {
      const step0Idx = service.indexOf('STEP 0: Recovering stuck business-level locks')
      const auditIdx = service.indexOf('STEP 1: Create recovery run audit record')
      expect(step0Idx).toBeLessThan(auditIdx)
    })
  })

  // -------------------------------------------------------------------------
  // 5. twilio-health route handles missing table gracefully
  // -------------------------------------------------------------------------
  describe('5. twilio-health route handles missing table', () => {
    const healthRoute = readSrc('src/app/api/admin/support/twilio-health/route.ts')

    it('uses maybeSingle() for recovery run query', () => {
      expect(healthRoute).toContain('.maybeSingle()')
    })

    it('logs warning on recovery run query error', () => {
      expect(healthRoute).toContain('provisioning_recovery_runs query failed')
      expect(healthRoute).toContain('non-critical')
    })
  })
})
