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
    } else {
      if (tn.business_id !== b.id) {
        findings.push({ type: 'integrity_error', businessId: b.id, summary: 'twilio_numbers assigned to a different business' })
        await deps.recordIncident({ businessId: b.id, businessName: b.name, phone: phone, sid, timestamp: new Date().toISOString(), reason: 'assigned_number_integrity_error', summary: 'twilio_numbers.business_id mismatch' })
      }
      if (tn.status !== 'assigned') {
        findings.push({ type: 'integrity_error', businessId: b.id, summary: `twilio_numbers status is ${tn.status} (expected assigned)` })
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
    .select('id, name, twilio_phone_number, twilio_phone_number_sid, assigned_twilio_number_id, provisioning_status, provisioning_error, twilio_release_status, twilio_released_at')
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
        .maybeSingle()
      if (error) return null
      return (data || null) as any
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
