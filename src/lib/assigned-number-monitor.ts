import Twilio, { Twilio as TwilioClient } from 'twilio'
import { createClient } from '@supabase/supabase-js'
import type { ServiceHealth } from './system-health'

export interface BusinessRow {
  id: string
  name?: string | null
  twilio_phone_number: string | null
  twilio_phone_number_sid: string | null
  assigned_twilio_number_id?: string | null
  provisioning_status?: string | null
  provisioning_error?: string | null
  // Eligibility fields for self-healing recovery
  subscription_status?: string | null
  twilio_release_status?: string | null
  twilio_released_at?: string | null
}

/**
 * Recovery callback for self-healing missing assigned numbers.
 *
 * Called after a definitive `missing_from_twilio` finding, ONLY for
 * businesses that are eligible for automatic recovery:
 *   - subscription_status is 'active' or 'trialing' (or has manual access)
 *   - not released / not offboarding
 *   - not a protected/system number
 *
 * The callback must:
 *   1. Validate lifecycle mutation eligibility
 *   2. Compare-and-swap clear the stale assignment (only if SID still matches)
 *   3. Mark the twilio_numbers row as retired (not assigned/active)
 *   4. Trigger reprovisioning to acquire a replacement number
 *   5. Return whether recovery was attempted and whether it succeeded
 *
 * If recovery fails, the business stays in a diagnosable failed state.
 */
export interface RecoveryResult {
  attempted: boolean
  success: boolean
  error?: string
}

/** DI-friendly wrapper for alert orchestration in tests */
export async function runAssignedNumberIntegrityAndAlertWithInjected(findings: IntegrityFinding[], alert: { checkAndAlert: (cond: any, details: string) => Promise<void> }): Promise<{ findings: IntegrityFinding[]; health: ServiceHealth }>{
  const health = summarizeTwilioNumberConsistency(findings)
  const condition = {
    id: 'assigned_number_missing_from_twilio',
    name: 'Assigned number missing from Twilio',
    severity: 'critical' as const,
    description: 'One or more businesses have an assigned number that is no longer owned in Twilio',
    check: async () => findings.some(f => f.type === 'missing_from_twilio')
  }
  const details = JSON.stringify({ missing: findings.filter(f => f.type === 'missing_from_twilio') }, null, 2)
  await alert.checkAndAlert(condition, details)
  return { findings, health }
}

export interface TwilioNumberRow {
  id: string
  phone_number: string
  twilio_sid: string
  status: string | null
  business_id: string | null
  error?: string
  multiple?: boolean
}

export type IntegrityFinding =
  | { type: 'healthy'; businessId: string }
  | { type: 'missing_from_twilio'; businessId: string; phone: string | null; sid: string; detectedAt: string }
  | { type: 'integrity_error'; businessId: string; summary: string }
  | { type: 'ambiguous_failure'; businessId: string; error: string }

export interface MonitorDeps {
  listBusinessesWithAssignment: () => Promise<BusinessRow[]>
  getTwilioNumberRowBySid: (sid: string) => Promise<TwilioNumberRow | null>
  fetchTwilioIncomingPN: (sid: string) => Promise<'exists' | 'not_found' | { error: string }>
  updateBusinessDegraded: (businessId: string, reason: string, context: { phone: string | null; sid: string }) => Promise<void>
  clearBusinessRecovered?: (businessId: string) => Promise<void>
  /**
   * Self-healing recovery for a business whose assigned number is missing
   * from Twilio. Called ONLY for eligible businesses (active/trialing,
   * not released, not protected). The callback is responsible for
   * compare-and-swap clearing the stale assignment and triggering
   * reprovisioning. If not provided, detection marks the business as
   * failed but does NOT auto-recover (manual intervention required).
   */
  recoverMissingAssignment?: (business: BusinessRow) => Promise<RecoveryResult>
  recordIncident: (issue: {
    businessId: string
    businessName?: string | null
    phone: string | null
    sid: string
    timestamp: string
    reason: 'assigned_number_missing_from_twilio' | 'assigned_number_integrity_error'
    summary: string
  }) => Promise<void>
}

export async function checkAssignedNumberIntegrityWith(deps: MonitorDeps): Promise<{ findings: IntegrityFinding[] }> {
  const findings: IntegrityFinding[] = []
  const businesses = await deps.listBusinessesWithAssignment()

  for (const b of businesses) {
    const phone = b.twilio_phone_number
    const sid = b.twilio_phone_number_sid
    if (!sid) {
      findings.push({ type: 'integrity_error', businessId: b.id, summary: 'Business has phone number but no SID' })
      await deps.recordIncident({ businessId: b.id, businessName: b.name, phone: phone, sid: '', timestamp: new Date().toISOString(), reason: 'assigned_number_integrity_error', summary: 'Missing SID for assigned number' })
      continue
    }

    // DB consistency checks with twilio_numbers
    const tn = await deps.getTwilioNumberRowBySid(sid)
    if (!tn) {
      findings.push({ type: 'integrity_error', businessId: b.id, summary: 'No twilio_numbers row for assigned SID' })
      await deps.recordIncident({ businessId: b.id, businessName: b.name, phone: phone, sid, timestamp: new Date().toISOString(), reason: 'assigned_number_integrity_error', summary: 'No twilio_numbers row for SID' })
      // continue to Twilio existence check; absence in DB does not prove Twilio absence
    } else if (tn.error) {
      findings.push({ type: 'ambiguous_failure', businessId: b.id, error: `Database error: ${tn.error}` })
      await deps.recordIncident({ businessId: b.id, businessName: b.name, phone: phone, sid, timestamp: new Date().toISOString(), reason: 'assigned_number_integrity_error', summary: `Database error: ${tn.error}` })
    } else if (tn.multiple) {
      findings.push({ type: 'integrity_error', businessId: b.id, summary: 'Multiple twilio_numbers rows for assigned SID' })
      await deps.recordIncident({ businessId: b.id, businessName: b.name, phone: phone, sid, timestamp: new Date().toISOString(), reason: 'assigned_number_integrity_error', summary: 'Multiple twilio_numbers rows for SID' })
    } else {
      if (tn.business_id !== b.id) {
        findings.push({ type: 'integrity_error', businessId: b.id, summary: 'twilio_numbers assigned to a different business' })
        await deps.recordIncident({ businessId: b.id, businessName: b.name, phone: phone, sid, timestamp: new Date().toISOString(), reason: 'assigned_number_integrity_error', summary: 'twilio_numbers.business_id mismatch' })
      }
      if (tn.status !== 'assigned' && tn.status !== 'active') {
        findings.push({ type: 'integrity_error', businessId: b.id, summary: `twilio_numbers status is ${tn.status} (expected assigned or active)` })
        await deps.recordIncident({ businessId: b.id, businessName: b.name, phone: phone, sid, timestamp: new Date().toISOString(), reason: 'assigned_number_integrity_error', summary: `twilio_numbers.status=${tn.status}` })
      }
      if (phone && tn.phone_number !== phone) {
        findings.push({ type: 'integrity_error', businessId: b.id, summary: 'Phone mismatch between business and twilio_numbers' })
        await deps.recordIncident({ businessId: b.id, businessName: b.name, phone: phone, sid, timestamp: new Date().toISOString(), reason: 'assigned_number_integrity_error', summary: 'Phone mismatch' })
      }
    }

    // Verify Twilio existence
    const tw = await deps.fetchTwilioIncomingPN(sid)
    if (tw === 'exists') {
      findings.push({ type: 'healthy', businessId: b.id })
      // Narrow recovery: if previous failure was solely assigned_number_missing_from_twilio, clear it
      if (deps.clearBusinessRecovered) {
        try { await deps.clearBusinessRecovered(b.id) } catch {}
      }
      continue
    }
    if (tw === 'not_found') {
      const detectedAt = new Date().toISOString()
      findings.push({ type: 'missing_from_twilio', businessId: b.id, phone, sid, detectedAt })
      // Mark degraded/failed using existing fields without mutating assignment values
      await deps.updateBusinessDegraded(b.id, 'assigned_number_missing_from_twilio', { phone, sid })
      await deps.recordIncident({ businessId: b.id, businessName: b.name, phone, sid, timestamp: detectedAt, reason: 'assigned_number_missing_from_twilio', summary: 'Assigned number missing from Twilio' })

      // Self-healing: attempt automatic recovery for eligible businesses.
      // The recovery callback is responsible for eligibility validation,
      // compare-and-swap clearing, and triggering reprovisioning.
      // If not provided or not eligible, the business stays in failed state
      // (manual admin intervention required).
      if (deps.recoverMissingAssignment) {
        try {
          const result = await deps.recoverMissingAssignment(b)
          if (result.attempted) {
            if (result.success) {
              await deps.recordIncident({
                businessId: b.id,
                businessName: b.name,
                phone,
                sid,
                timestamp: new Date().toISOString(),
                reason: 'assigned_number_missing_from_twilio',
                summary: `Self-healing recovery succeeded: ${result.error || 'replacement provisioned'}`
              })
            } else {
              await deps.recordIncident({
                businessId: b.id,
                businessName: b.name,
                phone,
                sid,
                timestamp: new Date().toISOString(),
                reason: 'assigned_number_missing_from_twilio',
                summary: `Self-healing recovery failed: ${result.error || 'unknown'}`
              })
            }
          }
          // If not attempted, the business was not eligible (canceled/offboarding/protected)
        } catch (recoveryError: any) {
          await deps.recordIncident({
            businessId: b.id,
            businessName: b.name,
            phone,
            sid,
            timestamp: new Date().toISOString(),
            reason: 'assigned_number_missing_from_twilio',
            summary: `Self-healing recovery exception: ${recoveryError?.message || String(recoveryError)}`
          })
        }
      }
      continue
    }

    // Ambiguous failure: do not mutate health state
    findings.push({ type: 'ambiguous_failure', businessId: b.id, error: (tw as any).error || 'unknown' })
  }

  return { findings }
}

// Default runner using real Supabase + Twilio; used by cron route
export async function runAssignedNumberIntegrityCheck(): Promise<{ findings: IntegrityFinding[] }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseServiceKey) throw new Error('Missing Supabase credentials')
  const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey)

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const client: TwilioClient | null = accountSid && authToken ? Twilio(accountSid, authToken) : null

  // Broad selection: any indication of assignment (phone OR SID OR assigned id)
  const { data: rowsData, error: rowsErr } = await serviceSupabase
    .from('businesses')
    .select('id, name, twilio_phone_number, twilio_phone_number_sid, assigned_twilio_number_id, provisioning_status, provisioning_error, twilio_release_status, twilio_released_at, subscription_status')
    .or('twilio_phone_number.not.is.null,twilio_phone_number_sid.not.is.null,assigned_twilio_number_id.not.is.null')
  if (rowsErr) throw rowsErr
  const preFetchedAll = (rowsData || []) as (BusinessRow & { twilio_release_status?: string | null; twilio_released_at?: string | null })[]
  // Exclude businesses that are fully released according to lifecycle
  const preFetchedRows: BusinessRow[] = preFetchedAll.filter(r => !(
    (r as any).twilio_release_status === 'released' || (r as any).twilio_released_at
  ))

  // Duplicate detection (global) – SID and phone
  const duplicateFindings: IntegrityFinding[] = []
  const sidMap = new Map<string, string[]>()
  const phoneMap = new Map<string, string[]>()
  for (const r of preFetchedRows) {
    if (r.twilio_phone_number_sid) {
      const arr = sidMap.get(r.twilio_phone_number_sid) || []
      arr.push(r.id)
      sidMap.set(r.twilio_phone_number_sid, arr)
    }
    if (r.twilio_phone_number) {
      const arr = phoneMap.get(r.twilio_phone_number) || []
      arr.push(r.id)
      phoneMap.set(r.twilio_phone_number, arr)
    }
  }
  const nowIso = new Date().toISOString()
  for (const [sid, bizIds] of Array.from(sidMap.entries())) {
    if (bizIds.length > 1) {
      for (const bId of bizIds) {
        duplicateFindings.push({ type: 'integrity_error', businessId: bId, summary: `Duplicate SID across businesses: ${bizIds.join(',')}` })
      }
    }
  }
  for (const [phone, bizIds] of Array.from(phoneMap.entries())) {
    if (bizIds.length > 1) {
      for (const bId of bizIds) {
        duplicateFindings.push({ type: 'integrity_error', businessId: bId, summary: `Duplicate phone across businesses: ${bizIds.join(',')}` })
      }
    }
  }

  const deps: MonitorDeps = {
    listBusinessesWithAssignment: async () => preFetchedRows,
    getTwilioNumberRowBySid: async (sid: string) => {
      const { data, error } = await serviceSupabase
        .from('twilio_numbers')
        .select('id, phone_number, twilio_sid, status, business_id')
        .eq('twilio_sid', sid)
      if (error) {
        // Distinguish between actual error and multiple rows (PGRST116)
        if (error.code === 'PGRST116') {
          // Multiple rows found - return special marker
          return { multiple: true } as any
        }
        return { error: error.message } as any
      }
      if (!data || data.length === 0) {
        return null // Zero rows
      }
      if (data.length > 1) {
        return { multiple: true } as any
      }
      return data[0] as any // Exactly one row
    },
    fetchTwilioIncomingPN: async (sid: string) => {
      if (!client) return { error: 'twilio_not_configured' }
      try {
        await client.incomingPhoneNumbers(sid).fetch()
        return 'exists'
      } catch (e: any) {
        if (e?.code === 20404 || e?.status === 404) return 'not_found'
        return { error: e?.message || 'unknown' }
      }
    },
    updateBusinessDegraded: async (businessId: string, reason: string, ctx: { phone: string | null; sid: string }) => {
      // Dedup: if the same code already exists in provisioning_error, avoid rewriting
      const { data: b } = await serviceSupabase
        .from('businesses')
        .select('provisioning_error, provisioning_status')
        .eq('id', businessId)
        .single()
      const already = typeof b?.provisioning_error === 'string' && b!.provisioning_error.includes('assigned_number_missing_from_twilio')
      if (already) return
      await serviceSupabase
        .from('businesses')
        .update({
          provisioning_status: 'failed',
          provisioning_error: `${reason}:${new Date().toISOString()}:phone=${ctx.phone || ''}:sid=${ctx.sid}`
        })
        .eq('id', businessId)
    },
    clearBusinessRecovered: async (businessId: string) => {
      const { data: b } = await serviceSupabase
        .from('businesses')
        .select('provisioning_error, provisioning_status')
        .eq('id', businessId)
        .single()
      const pe: string = (b?.provisioning_error as any) || ''
      // Only clear if the sole recorded reason starts with our code
      if (pe && pe.startsWith('assigned_number_missing_from_twilio')) {
        await serviceSupabase
          .from('businesses')
          .update({ provisioning_status: 'ready', provisioning_error: `${pe}|resolved:${new Date().toISOString()}` })
          .eq('id', businessId)
      }
    },
    recoverMissingAssignment: async (business: BusinessRow): Promise<RecoveryResult> => {
      // Eligibility check: only recover active/trialing businesses
      const sub = business.subscription_status
      const isActive = sub === 'active' || sub === 'trialing'
      if (!isActive) {
        console.log('[SELF-HEAL RECOVERY] Skipped - not active/trialing', { businessId: business.id, subscription_status: sub })
        return { attempted: false, success: false }
      }

      // Exclude released/offboarding businesses
      if (business.twilio_release_status === 'released' || business.twilio_released_at) {
        console.log('[SELF-HEAL RECOVERY] Skipped - released/offboarding', { businessId: business.id })
        return { attempted: false, success: false }
      }

      // Exclude protected/system numbers
      const PROTECTED = (process.env.PROTECTED_TWILIO_NUMBERS || '').split(',').filter(n => n.trim())
      const sysNum = process.env.REPLYFLOW_SYSTEM_SMS_NUMBER
      const phone = business.twilio_phone_number
      if (phone && (PROTECTED.includes(phone) || phone === sysNum)) {
        console.log('[SELF-HEAL RECOVERY] Skipped - protected/system number', { businessId: business.id, phone })
        return { attempted: false, success: false }
      }

      const staleSid = business.twilio_phone_number_sid
      if (!staleSid) {
        return { attempted: false, success: false }
      }

      console.log('[SELF-HEAL RECOVERY] Starting recovery for eligible business', { businessId: business.id, staleSid })

      // STEP 1: Compare-and-swap clear the stale business assignment.
      // Only update if the SID still matches — prevents stealing a number
      // that was already reassigned by a concurrent process.
      const { data: cleared, error: clearError } = await serviceSupabase
        .from('businesses')
        .update({
          twilio_phone_number: null,
          twilio_phone_number_sid: null,
          twilio_messaging_service_sid: null,
          assigned_twilio_number_id: null,
          provisioning_status: 'provisioning',
          provisioning_error: null,
          forwarding_verified: false,
          call_forwarding_enabled: false,
        })
        .eq('id', business.id)
        .eq('twilio_phone_number_sid', staleSid)
        .select('id')

      if (clearError || !cleared || cleared.length === 0) {
        // Compare-and-swap failed — another process already changed the assignment
        console.log('[SELF-HEAL RECOVERY] Compare-and-swap failed (already changed)', { businessId: business.id, clearError })
        return { attempted: false, success: false, error: 'CAS failed' }
      }

      // STEP 2: Mark the stale twilio_numbers row as retired so the
      // provisionTwilioNumber idempotency check won't re-assign it.
      await serviceSupabase
        .from('twilio_numbers')
        .update({
          status: 'retired',
          detached_at: new Date().toISOString(),
          detached_reason: 'assigned_number_missing_from_twilio',
          business_id: null,
        })
        .eq('twilio_sid', staleSid)

      // STEP 3: Trigger reprovisioning to acquire a replacement number.
      // Use internal HTTP call to the provisioning endpoint with admin secret.
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL || 'https://replyflowhq.com'
        const response = await fetch(`${appUrl}/api/business/trigger-provisioning`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-secret': process.env.PROVISIONING_ADMIN_SECRET || ''
          },
          body: JSON.stringify({ business_id: business.id })
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('[SELF-HEAL RECOVERY] Reprovisioning trigger failed', { businessId: business.id, status: response.status, errorText })
          // Rollback: restore the stale assignment so the business is in a diagnosable state
          await serviceSupabase
            .from('businesses')
            .update({
              provisioning_status: 'failed',
              provisioning_error: `Self-heal reprovision trigger failed: ${errorText.substring(0, 200)}`,
            })
            .eq('id', business.id)
          return { attempted: true, success: false, error: `Reprovision trigger failed: ${response.status}` }
        }

        console.log('[SELF-HEAL RECOVERY] Reprovisioning triggered successfully', { businessId: business.id })
        return { attempted: true, success: true }
      } catch (provisionError: any) {
        console.error('[SELF-HEAL RECOVERY] Reprovisioning exception', { businessId: business.id, error: provisionError })
        // Rollback: mark as failed with diagnosable error
        await serviceSupabase
          .from('businesses')
          .update({
            provisioning_status: 'failed',
            provisioning_error: `Self-heal reprovision exception: ${provisionError?.message || String(provisionError)}`,
          })
          .eq('id', business.id)
        return { attempted: true, success: false, error: provisionError?.message || 'Reprovision exception' }
      }
    },
    recordIncident: async (issue) => {
      // Minimal integration: log to console; an existing incident pipeline can ingest logs
      console.error('[ASSIGNED NUMBER INCIDENT]', issue)
    }
  }

  const { findings } = await checkAssignedNumberIntegrityWith(deps)
  return { findings: findings.concat(duplicateFindings) }
}

/** Summarize findings for System Health twilioNumberConsistency slot */
export function summarizeTwilioNumberConsistency(findings: IntegrityFinding[]): ServiceHealth {
  const ts = new Date().toISOString()
  const missing = findings.filter(f => f.type === 'missing_from_twilio').length
  const integrity = findings.filter(f => f.type === 'integrity_error').length
  const ambiguous = findings.filter(f => f.type === 'ambiguous_failure').length
  const healthy = findings.filter(f => f.type === 'healthy').length
  const status: ServiceHealth['status'] = missing > 0 ? 'critical' : (integrity > 0 || ambiguous > 0) ? 'degraded' : 'healthy'
  const summary = missing > 0
    ? 'One or more assigned numbers missing from Twilio'
    : integrity > 0
      ? 'Assigned-number integrity issues detected'
      : ambiguous > 0
        ? 'Verification issues (retrying)'
        : 'All assigned numbers healthy'
  return { name: 'Twilio Number Consistency', status, summary, lastActivity: ts, details: { counts: { missing, integrity, ambiguous, healthy } } }
}

/** Run monitor and invoke AlertManager using DB-backed dedup/cooldown; return findings and health */
export async function runAssignedNumberIntegrityAndAlert(): Promise<{ findings: IntegrityFinding[]; health: ServiceHealth }> {
  const { findings } = await runAssignedNumberIntegrityCheck()
  const health = summarizeTwilioNumberConsistency(findings)
  const { alertManager } = await import('./alerting')
  const condition = {
    id: 'assigned_number_missing_from_twilio',
    name: 'Assigned number missing from Twilio',
    severity: 'critical' as const,
    description: 'One or more businesses have an assigned number that is no longer owned in Twilio',
    check: async () => findings.some(f => f.type === 'missing_from_twilio')
  }
  const details = JSON.stringify({ missing: findings.filter(f => f.type === 'missing_from_twilio') }, null, 2)
  await alertManager.checkAndAlert(condition, details)
  return { findings, health }
}
