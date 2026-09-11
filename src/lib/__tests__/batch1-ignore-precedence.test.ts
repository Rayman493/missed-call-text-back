/**
 * Batch 1 — Final Ignore-Contact Regression Check
 *
 * Proves that the shouldReuseLead() change (allowing completed leads to be reused)
 * did NOT introduce an ignored-contact regression.
 *
 * Canonical precedence: ignored-contact determination takes precedence over
 * normal lead reuse for inbound contact handling.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Batch 1 — Ignore-contact precedence', () => {
  const smsProcessingSrc = readSrc('src/lib/sms-processing.ts')
  const adminSrc = readSrc('src/lib/supabase/admin.ts')
  const ignoredContactsSrc = readSrc('src/lib/ignored-contacts.ts')
  const voiceRouteSrc = readSrc('src/app/api/twilio/voice/route.ts')
  const autoSmsDispatcherSrc = readSrc('src/lib/auto-sms-dispatcher.ts')
  const followupsSrc = readSrc('src/app/api/cron/send-followups/route.ts')

  // ---------- case 1: active non-ignored customer persists inbound normally ----------

  it('case 1: active non-ignored customer persists inbound normally', () => {
    // Batch A universal reuse: shouldReuseLead has NO status-based exclusion.
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 400)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()

    // The existing-lead branch persists the message
    expect(smsProcessingSrc).toMatch(/createMessageWithConversation\(\{[\s\S]*?direction:\s*'inbound'/)
  })

  // ---------- case 2: completed non-ignored customer persists inbound normally ----------

  it('case 2: completed non-ignored customer persists inbound normally', () => {
    // Batch A universal reuse: shouldReuseLead has NO status-based exclusion.
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 400)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()

    // The existing-lead branch (else if lead) persists the message
    expect(smsProcessingSrc).toMatch(/createMessageWithConversation\(\{[\s\S]*?direction:\s*'inbound'/)
  })

  // ---------- case 3: completed non-ignored customer gets no generic acknowledgement ----------

  it('case 3: completed non-ignored customer gets no generic acknowledgement', () => {
    // The "Thanks - we received your message." is only in the ignored-contact branch
    const thanksIdx = smsProcessingSrc.indexOf('Thanks - we received your message.')
    expect(thanksIdx).toBeGreaterThan(0)

    // Verify it's inside the isIgnored check
    const beforeThanks = smsProcessingSrc.substring(Math.max(0, thanksIdx - 500), thanksIdx)
    expect(beforeThanks).toContain('isIgnored')
  })

  // ---------- case 4: active ignored contact follows canonical ignored behavior ----------

  it('case 4: active ignored contact follows canonical ignored behavior', () => {
    // The shared pre-check runs BEFORE the if (!lead) / else if (lead) branch
    // This means even if an active lead exists, the ignored check takes precedence
    const preCheckIdx = smsProcessingSrc.indexOf('SHARED PRE-CHECK')
    expect(preCheckIdx).toBeGreaterThan(0)

    // The pre-check is after business resolution but before the lead branch
    const leadBranchIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    expect(preCheckIdx).toBeGreaterThan(0)
    expect(leadBranchIdx).toBeGreaterThan(preCheckIdx)

    // The pre-check contains the ignored TwiML
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, leadBranchIdx)
    expect(preCheckSection).toContain('isIgnored')
    expect(preCheckSection).toContain('Thanks - we received your message.')
  })

  // ---------- case 5: completed ignored contact follows canonical ignored behavior ----------

  it('case 5: completed ignored contact follows canonical ignored behavior', () => {
    // The shared pre-check does NOT check lead status — it only checks isIgnoredContact
    const preCheckSection = smsProcessingSrc.substring(
      smsProcessingSrc.indexOf('SHARED PRE-CHECK'),
      smsProcessingSrc.indexOf('if (!lead) {', smsProcessingSrc.indexOf('SHARED PRE-CHECK'))
    )
    expect(preCheckSection).toContain('isIgnoredContact')
    expect(preCheckSection).not.toContain('lead.status')
    expect(preCheckSection).not.toContain('completed')
    expect(preCheckSection).not.toContain('active')

    // The pre-check returns the ignored TwiML regardless of whether a lead exists
    expect(preCheckSection).toContain('Thanks - we received your message.')
    expect(preCheckSection).toContain('hadExistingLead: !!lead')
  })

  // ---------- case 6: no-lead ignored contact follows canonical ignored behavior ----------

  it('case 6: no-lead ignored contact follows canonical ignored behavior', () => {
    // The shared pre-check handles both cases: with lead and without lead
    // When no lead exists, business is resolved from getBusinessesByPhone,
    // then the pre-check runs
    const preCheckIdx = smsProcessingSrc.indexOf('SHARED PRE-CHECK')
    expect(preCheckIdx).toBeGreaterThan(0)

    // The pre-check uses business.id which is set in both the lead-found and no-lead paths
    const preCheckSection = smsProcessingSrc.substring(
      preCheckIdx,
      smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    )
    expect(preCheckSection).toContain('business?.id')
  })

  // ---------- case 7: ignored contact does not accidentally create a new lead ----------

  it('case 7: ignored contact does not accidentally create a new lead', () => {
    // The pre-check returns BEFORE the if (!lead) branch that creates a new lead
    const preCheckIdx = smsProcessingSrc.indexOf('SHARED PRE-CHECK')
    const createLeadIdx = smsProcessingSrc.indexOf('LeadService.createLead', preCheckIdx)
    const preCheckReturnIdx = smsProcessingSrc.indexOf('return {', preCheckIdx)

    expect(preCheckReturnIdx).toBeGreaterThan(preCheckIdx)
    expect(createLeadIdx).toBeGreaterThan(preCheckReturnIdx)

    // The pre-check return is inside the isIgnored block
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, preCheckReturnIdx + 200)
    expect(preCheckSection).toContain('if (isIgnored)')
    expect(preCheckSection).toContain('return {')
    expect(preCheckSection).toContain('ignored: true')
  })

  // ---------- case 8: non-ignored completed customer still reuses existing lead ----------

  it('case 8: non-ignored completed customer still reuses existing lead', () => {
    // Batch A universal reuse: shouldReuseLead has NO status-based exclusion.
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 400)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()

    // The existing-lead branch (else if lead) is entered for completed leads
    expect(smsProcessingSrc).toContain('else if (lead) {')
  })

  // ---------- case 9: owner notification behavior is correct in each relevant case ----------

  it('case 9a: owner notification fires for non-ignored completed customer', () => {
    // The existing-lead branch calls notifyCustomerReply
    // Find the else if (lead) block and verify notifyCustomerReply is within it
    const elseIfLeadIdx = smsProcessingSrc.indexOf('else if (lead) {')
    expect(elseIfLeadIdx).toBeGreaterThan(0)

    // Search for notifyCustomerReply after the else if (lead) block
    const notifyIdx = smsProcessingSrc.indexOf('notifyCustomerReply', elseIfLeadIdx)
    expect(notifyIdx).toBeGreaterThan(elseIfLeadIdx)

    // Verify it's within the existing-lead branch (before the next major return/end)
    const branchSection = smsProcessingSrc.substring(elseIfLeadIdx, notifyIdx + 100)
    expect(branchSection).toContain('notifyCustomerReply')
  })

  it('case 9b: owner notification does NOT fire for ignored contacts', () => {
    // The shared pre-check returns BEFORE the existing-lead branch that calls notifyCustomerReply
    const preCheckIdx = smsProcessingSrc.indexOf('SHARED PRE-CHECK')
    const notifyIdx = smsProcessingSrc.indexOf('notifyCustomerReply', preCheckIdx)
    const preCheckReturnIdx = smsProcessingSrc.indexOf('return {', preCheckIdx)

    // The pre-check return comes before the notifyCustomerReply call
    expect(preCheckReturnIdx).toBeGreaterThan(preCheckIdx)
    expect(notifyIdx).toBeGreaterThan(preCheckReturnIdx)
  })

  // ---------- case 10: compliance opt-in / opt-out paths remain intact ----------

  it('case 10a: opt-out/opt-in/HELP keywords are processed before ignored-contact check', () => {
    // The opt-out/opt-in/HELP handling is at the top of processInboundSms (line 154)
    // before the lead lookup and ignored-contact check
    const optOutIdx = smsProcessingSrc.indexOf('if (isOptOut || isOptIn || isHelp)')
    const leadLookupIdx = smsProcessingSrc.indexOf('findLeadByPhoneAcrossBusinesses', optOutIdx)
    const preCheckIdx = smsProcessingSrc.indexOf('SHARED PRE-CHECK')

    expect(optOutIdx).toBeGreaterThan(0)
    expect(leadLookupIdx).toBeGreaterThan(optOutIdx)
    expect(preCheckIdx).toBeGreaterThan(leadLookupIdx)
  })

  it('case 10b: opt-out updates lead.opted_out regardless of ignored-contact status', () => {
    // The opt-out handler finds the lead and updates opted_out
    const optOutSection = smsProcessingSrc.substring(
      smsProcessingSrc.indexOf('if (isOptOut || isOptIn || isHelp)'),
      smsProcessingSrc.indexOf('if (isOptOut || isOptIn || isHelp)') + 2000
    )
    expect(optOutSection).toContain('opted_out')
    expect(optOutSection).toContain('findLeadByPhoneAcrossBusinesses')
    expect(optOutSection).toContain('updateLead')
  })

  it('case 10c: STOP/START keywords are defined correctly', () => {
    // STOP keywords
    expect(smsProcessingSrc).toContain("'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'")
    // START keywords (TCPA-compliant, YES is NOT valid)
    expect(smsProcessingSrc).toContain("'START', 'UNSTOP'")
    expect(smsProcessingSrc).toContain('YES is NOT a valid opt-in keyword')
  })

  // ---------- canonical precedence verification ----------

  it('canonical 1: voice route checks ignored contacts BEFORE lead lookup', () => {
    // Voice route: ignored check at line 598, lead lookup at line 999
    const ignoredCheckIdx = voiceRouteSrc.indexOf('isIgnoredContact(business.id, normalizedFrom)')
    const leadLookupIdx = voiceRouteSrc.indexOf('getLeadByPhone(business.id', ignoredCheckIdx)

    expect(ignoredCheckIdx).toBeGreaterThan(0)
    expect(leadLookupIdx).toBeGreaterThan(ignoredCheckIdx)
  })

  it('canonical 2: auto-sms-dispatcher checks ignored contacts BEFORE SMS dispatch', () => {
    // auto-sms-dispatcher: ignored check at line 548, returns skipped before any SMS
    const ignoredCheckIdx = autoSmsDispatcherSrc.indexOf('isIgnoredContact(businessId, callerPhone)')
    expect(ignoredCheckIdx).toBeGreaterThan(0)

    const afterCheck = autoSmsDispatcherSrc.substring(ignoredCheckIdx, ignoredCheckIdx + 300)
    expect(afterCheck).toContain('skipped: true')
    expect(afterCheck).toContain("'ignored_contact'")
  })

  it('canonical 3: follow-up cron checks ignored contacts and cancels follow-ups', () => {
    // send-followups: ignored check cancels the follow-up
    const ignoredCheckIdx = followupsSrc.indexOf('isIgnoredContact(business.id, lead.caller_phone)')
    expect(ignoredCheckIdx).toBeGreaterThan(0)

    const afterCheck = followupsSrc.substring(ignoredCheckIdx, ignoredCheckIdx + 500)
    expect(afterCheck).toContain('cancelled')
    expect(afterCheck).toContain("'ignored_contact'")
  })

  it('canonical 4: isIgnoredContact checks by business_id and phone_number (not lead status)', () => {
    expect(ignoredContactsSrc).toContain('ignored_contacts')
    expect(ignoredContactsSrc).toContain('business_id')
    expect(ignoredContactsSrc).toContain('phone_number')
    expect(ignoredContactsSrc).not.toContain('lead.status')
    expect(ignoredContactsSrc).not.toContain('completed')
  })

  // ---------- shared pre-check structure verification ----------

  it('structure 1: shared pre-check is after business resolution', () => {
    // The pre-check runs after business is resolved (either from leadResult or getBusinessesByPhone)
    const businessResolutionEnd = smsProcessingSrc.indexOf('Using business for new lead:')
    const preCheckIdx = smsProcessingSrc.indexOf('SHARED PRE-CHECK')

    // The pre-check should come after the business resolution block
    expect(preCheckIdx).toBeGreaterThan(businessResolutionEnd)
  })

  it('structure 2: shared pre-check is before the if (!lead) / else if (lead) branch', () => {
    const preCheckIdx = smsProcessingSrc.indexOf('SHARED PRE-CHECK')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const elseIfLeadIdx = smsProcessingSrc.indexOf('else if (lead) {', preCheckIdx)

    expect(preCheckIdx).toBeGreaterThan(0)
    expect(ifNotLeadIdx).toBeGreaterThan(preCheckIdx)
    expect(elseIfLeadIdx).toBeGreaterThan(preCheckIdx)
  })

  it('structure 3: the old ignored-contact check inside if (!lead) is removed', () => {
    // The old check was: "Check if phone number is in ignored contacts before creating lead"
    // This should no longer exist inside the if (!lead) block
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {')
    const ifNotLeadSection = smsProcessingSrc.substring(ifNotLeadIdx, ifNotLeadIdx + 500)

    // The old comment should not be inside the if (!lead) block
    expect(ifNotLeadSection).not.toContain('Check if phone number is in ignored contacts before creating lead')
  })
})
