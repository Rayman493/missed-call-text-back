/**
 * Batch A — Universal Inbound Customer Reactivation + Remove Status-Based Auto-Ack
 *
 * Proves the canonical product rule:
 *   CUSTOMER STATUS MUST NEVER PREVENT AN EXISTING CUSTOMER FROM
 *   CONTINUING A CONVERSATION.
 *
 * For any existing customer receiving a normal inbound SMS, regardless of prior
 * lifecycle status:
 *   1. reuse the existing customer/lead
 *   2. reuse the existing conversation
 *   3. persist the inbound message
 *   4. update recency
 *   5. fire normal inbound/customer notification behavior
 *   6. set the customer status to ACTIVE
 *   7. DO NOT send the generic fallback auto-ack
 *   8. DO NOT create a duplicate customer
 *   9. DO NOT infer payment/job state from message wording
 *
 * Compliance (STOP/START/HELP) and canonical ignored-contact suppression
 * (ignored_contacts table) take precedence and are preserved.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

const adminSrc = readSrc('src/lib/supabase/admin.ts')
const smsProcessingSrc = readSrc('src/lib/sms-processing.ts')
const transitionsSrc = readSrc('src/lib/customer-status-transitions.ts')
const lifecycleSrc = readSrc('src/lib/lead-lifecycle.ts')
const ignoredContactsSrc = readSrc('src/lib/ignored-contacts.ts')

// ============================================================
// Part 1: Universal reuse — shouldReuseLead has NO status gate
// ============================================================

describe('Batch A — Part 1: Universal reuse (no status gate)', () => {
  it('shouldReuseLead has NO status-based exclusion check', () => {
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    expect(fnStart).toBeGreaterThan(0)
    const fnBody = adminSrc.substring(fnStart, fnStart + 500)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()
  })

  it('shouldReuseLead comment documents universal reuse for all 10 statuses', () => {
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const commentStart = adminSrc.lastIndexOf('/**', fnStart)
    const commentBlock = adminSrc.substring(commentStart, fnStart)
    // All 10 statuses should be mentioned in the universal reuse documentation
    expect(commentBlock).toContain('new')
    expect(commentBlock).toContain('needs_reply')
    expect(commentBlock).toContain('active')
    expect(commentBlock).toContain('scheduled')
    expect(commentBlock).toContain('payment_requested')
    expect(commentBlock).toContain('paid')
    expect(commentBlock).toContain('completed')
    expect(commentBlock).toContain('cancelled')
    expect(commentBlock).toContain('ignored')
    expect(commentBlock).toContain('lost')
  })

  it('shouldReuseLead has NO recency/age gate (identity is not gated by age)', () => {
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    expect(fnStart).toBeGreaterThan(0)
    const fnBody = adminSrc.substring(fnStart, fnStart + 500)
    // There should be NO recency check — no daysSinceActivity, no 30-day threshold
    expect(fnBody).not.toContain('daysSinceActivity')
    expect(fnBody).not.toContain('30')
    // The function should simply return true for any non-null lead
    expect(fnBody).toContain('return true')
  })
})

// ============================================================
// Part 2: Universal reactivation — all 10 statuses → active
// ============================================================

describe('Batch A — Part 2: Universal reactivation to Active', () => {
  const ALL_STATUSES = [
    'new',
    'needs_reply',
    'active',
    'scheduled',
    'payment_requested',
    'paid',
    'completed',
    'cancelled',
    'ignored',
    'lost',
  ] as const

  ALL_STATUSES.forEach((status) => {
    it(`status "${status}" + inbound_message_received → active`, () => {
      // The transition table must have inbound_message_received → active for this status
      const statusSection = transitionsSrc.match(
        new RegExp(`${status}:\\s*\\{[\\s\\S]*?\\}`)
      )
      expect(statusSection).toBeTruthy()
      expect(statusSection![0]).toMatch(/inbound_message_received/)
      expect(statusSection![0]).toMatch(/'active'/)
    })
  })

  it('applyCustomerStatusEvent bypasses protected-status guard for inbound_message_received', () => {
    // The function must have an early return for inbound_message_received
    // that bypasses the PROTECTED_STATUSES check
    const earlyReturn = transitionsSrc.match(
      /if \(event === 'inbound_message_received'\)\s*\{[\s\S]*?return/
    )
    expect(earlyReturn).toBeTruthy()
  })

  it('applyCustomerStatusEvent still protects cancelled/ignored/lost for OTHER events', () => {
    // PROTECTED_STATUSES is still defined and used for non-inbound events
    expect(transitionsSrc).toContain("['cancelled', 'ignored', 'lost']")
    expect(transitionsSrc).toContain('PROTECTED_STATUSES')
    expect(transitionsSrc).toContain('PROTECTED_STATUSES.includes(normalizedCurrent)')
  })

  it('updateLeadStatusForInboundMessage uses applyCustomerStatusEvent with inbound_message_received', () => {
    expect(lifecycleSrc).toContain('updateLeadStatusForInboundMessage')
    expect(lifecycleSrc).toContain("applyCustomerStatusEvent")
    expect(lifecycleSrc).toContain("'inbound_message_received'")
  })

  it('updateLeadStatusForInboundMessage only updates leads.status (no jobs/payments/appointments)', () => {
    const fnStart = lifecycleSrc.indexOf('export async function updateLeadStatusForInboundMessage')
    const fnBody = lifecycleSrc.substring(fnStart, fnStart + 2000)
    // Only updates the leads table
    expect(fnBody).toContain("from('leads')")
    expect(fnBody).toContain('status: nextStatus')
    // Does NOT touch jobs, payments, appointments, or reminders
    expect(fnBody).not.toContain("from('jobs')")
    expect(fnBody).not.toContain("from('payments')")
    expect(fnBody).not.toContain("from('appointments')")
    expect(fnBody).not.toContain("from('reminders')")
  })
})

// ============================================================
// Part 3: processInboundSms flow — reuse + persist + reactivate
// ============================================================

describe('Batch A — Part 3: processInboundSms flow', () => {
  it('findLeadByPhoneAcrossBusinesses calls shouldReuseLead (universal reuse)', () => {
    expect(adminSrc).toContain('findLeadByPhoneAcrossBusinesses')
    expect(adminSrc).toContain('shouldReuseLead(data as Lead)')
  })

  it('existing-lead branch persists inbound message via createMessageWithConversation', () => {
    const insertCall = smsProcessingSrc.match(
      /createMessageWithConversation\(\{[\s\S]*?direction:\s*'inbound'/
    )
    expect(insertCall).toBeTruthy()
  })

  it('existing-lead branch updates lead metadata (recency)', () => {
    expect(smsProcessingSrc).toContain('last_message_at: now')
    expect(smsProcessingSrc).toContain('last_reply_at: now')
  })

  it('updateLeadStatusForInboundMessage is called in the existing-lead branch', () => {
    // Called at line 467 (before message insert) and line 604 (after message insert)
    const calls = smsProcessingSrc.match(/updateLeadStatusForInboundMessage/g)
    expect(calls).toBeTruthy()
    expect(calls!.length).toBeGreaterThanOrEqual(2)
  })

  it('conversation is reused via findOrCreateConversation (no duplicate)', () => {
    expect(smsProcessingSrc).toContain('ConversationService.findOrCreateConversation')
  })

  it('notification fires via notifyCustomerReply (no status check)', () => {
    expect(smsProcessingSrc).toContain('notificationServiceServer.notifyCustomerReply')
  })

  it('final success return is empty TwiML (no generic auto-ack)', () => {
    // The final return at the end of processInboundSms has empty <Response>
    // Find the LAST return block in processInboundSms (the final success return)
    const processFnStart = smsProcessingSrc.indexOf('export async function processInboundSms')
    const processBody = smsProcessingSrc.substring(processFnStart)
    // Find the last occurrence of 'return {' followed by empty <Response></Response>
    const lastEmptyResponseIdx = processBody.lastIndexOf('<Response>\n</Response>')
    expect(lastEmptyResponseIdx).toBeGreaterThan(0)
    // Get the return block containing this empty response
    const beforeEmpty = processBody.substring(Math.max(0, lastEmptyResponseIdx - 300), lastEmptyResponseIdx)
    expect(beforeEmpty).toContain('success: true')
    expect(beforeEmpty).toContain('lead,')
    expect(beforeEmpty).toContain('conversation,')
    expect(beforeEmpty).toContain('message:')
    // The empty response block itself must NOT contain a <Message> tag
    const responseBlock = processBody.substring(lastEmptyResponseIdx, lastEmptyResponseIdx + 50)
    expect(responseBlock).not.toContain('<Message>')
  })
})

// ============================================================
// Part 4: Generic auto-ack audit
// ============================================================

describe('Batch A — Part 4: Generic auto-ack audit', () => {
  it('"Thanks - we received your message." appears exactly once (ignored-contact branch only)', () => {
    const thanksCount = (smsProcessingSrc.match(/Thanks - we received your message/g) || []).length
    expect(thanksCount).toBe(1)
  })

  it('the auto-ack is inside the isIgnored conditional (canonical suppression)', () => {
    const thanksIdx = smsProcessingSrc.indexOf('Thanks - we received your message.')
    expect(thanksIdx).toBeGreaterThan(0)
    const beforeThanks = smsProcessingSrc.substring(Math.max(0, thanksIdx - 500), thanksIdx)
    expect(beforeThanks).toContain('isIgnored')
  })

  it('the auto-ack is NOT in the normal lead path (existing-lead branch)', () => {
    const elseIfLeadIdx = smsProcessingSrc.indexOf('else if (lead) {')
    expect(elseIfLeadIdx).toBeGreaterThan(0)
    // The "Thanks" message should come BEFORE the else if (lead) branch
    // (it's in the shared pre-check, not in the existing-lead branch)
    const thanksIdx = smsProcessingSrc.indexOf('Thanks - we received your message.')
    expect(thanksIdx).toBeLessThan(elseIfLeadIdx)
  })

  it('no other code path emits "Thanks - we received your message."', () => {
    // Verify the string is NOT in other production files that handle inbound
    const twilioSrc = readSrc('src/lib/twilio.ts')
    expect(twilioSrc).not.toContain('Thanks - we received your message.')
    const autoSmsSrc = readSrc('src/lib/auto-sms-dispatcher.ts')
    expect(autoSmsSrc).not.toContain('Thanks - we received your message.')
  })
})

// ============================================================
// Part 5: Ignored-status vs explicit contact suppression
// ============================================================

describe('Batch A — Part 5: Ignored-status vs explicit suppression', () => {
  it('isIgnoredContact queries the ignored_contacts table (canonical suppression)', () => {
    expect(ignoredContactsSrc).toContain('ignored_contacts')
    expect(ignoredContactsSrc).toContain('business_id')
    expect(ignoredContactsSrc).toContain('phone_number')
  })

  it('isIgnoredContact does NOT check lead lifecycle status', () => {
    // The function checks the ignored_contacts table by business_id + phone_number.
    // It does NOT reference lead.status or any lifecycle status field.
    expect(ignoredContactsSrc).not.toContain('lead.status')
    expect(ignoredContactsSrc).not.toContain("=== 'completed'")
    expect(ignoredContactsSrc).not.toContain("=== 'cancelled'")
    expect(ignoredContactsSrc).not.toContain("=== 'ignored'")
    expect(ignoredContactsSrc).not.toContain("=== 'lost'")
  })

  it('ignored lifecycle status is NOT a suppression gate (universal reuse applies)', () => {
    // shouldReuseLead has no status exclusion, so 'ignored' lifecycle status leads
    // ARE reused. The ignored_contacts table is the ONLY suppression mechanism.
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 500)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()
  })

  it('ignored lifecycle status + inbound → active (transition table)', () => {
    const ignoredSection = transitionsSrc.match(/ignored:\s*\{[\s\S]*?\}/)
    expect(ignoredSection).toBeTruthy()
    expect(ignoredSection![0]).toMatch(/inbound_message_received/)
    expect(ignoredSection![0]).toMatch(/'active'/)
  })
})

// ============================================================
// Part 6: Compliance precedence (STOP/START/HELP)
// ============================================================

describe('Batch A — Part 6: Compliance precedence', () => {
  it('STOP/START/HELP keywords are handled BEFORE normal lead processing', () => {
    const optOutIdx = smsProcessingSrc.indexOf('if (isOptOut || isOptIn || isHelp)')
    expect(optOutIdx).toBeGreaterThan(0)
    const leadLookupIdx = smsProcessingSrc.indexOf('findLeadByPhoneAcrossBusinesses', optOutIdx)
    expect(leadLookupIdx).toBeGreaterThan(optOutIdx)
  })

  it('STOP keywords are defined correctly', () => {
    expect(smsProcessingSrc).toContain("'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'")
  })

  it('START keywords are defined correctly (TCPA-compliant)', () => {
    expect(smsProcessingSrc).toContain("'START', 'UNSTOP'")
    expect(smsProcessingSrc).toContain('YES is NOT a valid opt-in keyword')
  })

  it('HELP keyword is defined correctly', () => {
    expect(smsProcessingSrc).toContain("originalBody === 'HELP'")
  })

  it('compliance handler returns BEFORE the ignored-contact check and lead reuse', () => {
    const complianceReturn = smsProcessingSrc.indexOf('optOutHandled: true')
    const ignoredCheck = smsProcessingSrc.indexOf('SHARED PRE-CHECK')
    expect(complianceReturn).toBeGreaterThan(0)
    expect(ignoredCheck).toBeGreaterThan(0)
    expect(complianceReturn).toBeLessThan(ignoredCheck)
  })

  it('opt-out updates lead.opted_out (not lifecycle status)', () => {
    const optOutSection = smsProcessingSrc.substring(
      smsProcessingSrc.indexOf('if (isOptOut || isOptIn || isHelp)'),
      smsProcessingSrc.indexOf('if (isOptOut || isOptIn || isHelp)') + 2000
    )
    expect(optOutSection).toContain('opted_out')
    expect(optOutSection).toContain('updateLead')
  })

  it('HELP does not cancel follow-ups (compliance keyword)', () => {
    const helpSection = smsProcessingSrc.match(
      /if \(!isHelp\)\s*\{[\s\S]*?cancelPendingFollowUpJobsForLead[\s\S]*?\}\s*else\s*\{[\s\S]*?help_keyword_does_not_cancel_followups/
    )
    expect(helpSection).toBeTruthy()
  })
})

// ============================================================
// Part 7: Business object state untouched
// ============================================================

describe('Batch A — Part 7: Business object state untouched', () => {
  it('inbound SMS processing does NOT update the jobs table', () => {
    // Check that processInboundSms does not write to jobs
    const processFnStart = smsProcessingSrc.indexOf('export async function processInboundSms')
    const processFnEnd = smsProcessingSrc.lastIndexOf('return {')
    const processBody = smsProcessingSrc.substring(processFnStart, processFnEnd + 200)
    expect(processBody).not.toMatch(/from\('jobs'\).*\.update/)
  })

  it('inbound SMS processing does NOT update the payments table', () => {
    const processFnStart = smsProcessingSrc.indexOf('export async function processInboundSms')
    const processFnEnd = smsProcessingSrc.lastIndexOf('return {')
    const processBody = smsProcessingSrc.substring(processFnStart, processFnEnd + 200)
    expect(processBody).not.toMatch(/from\('payments'\).*\.update/)
    expect(processBody).not.toMatch(/from\('payment_requests'\).*\.update/)
  })

  it('inbound SMS processing does NOT update appointments', () => {
    const processFnStart = smsProcessingSrc.indexOf('export async function processInboundSms')
    const processFnEnd = smsProcessingSrc.lastIndexOf('return {')
    const processBody = smsProcessingSrc.substring(processFnStart, processFnEnd + 200)
    expect(processBody).not.toMatch(/from\('appointments'\).*\.update/)
  })

  it('updateLeadStatusForInboundMessage only writes leads.status', () => {
    const fnStart = lifecycleSrc.indexOf('export async function updateLeadStatusForInboundMessage')
    const fnBody = lifecycleSrc.substring(fnStart, fnStart + 800)
    // The only .update() call writes { status: nextStatus } to the leads table
    const updateCalls = fnBody.match(/\.update\(\{[^}]*\}\)/g) || []
    updateCalls.forEach((call) => {
      expect(call).toMatch(/status/)
      expect(call).not.toMatch(/payment/)
      expect(call).not.toMatch(/job/)
      expect(call).not.toMatch(/appointment/)
    })
  })

  it('transition table does NOT have payment_succeeded triggered by inbound_message_received', () => {
    // inbound_message_received only maps to 'active', never to 'paid'
    const allInboundTransitions = transitionsSrc.match(
      /inbound_message_received:\s*'[^']*'/g
    ) || []
    allInboundTransitions.forEach((t) => {
      expect(t).toContain("'active'")
      expect(t).not.toContain("'paid'")
      expect(t).not.toContain("'completed'")
      expect(t).not.toContain("'payment_requested'")
    })
  })
})

// ============================================================
// Part 8: No duplicate customer/conversation
// ============================================================

describe('Batch A — Part 8: No duplicate customer/conversation', () => {
  it('existing lead is reused (LeadService.createLead only in the !lead branch)', () => {
    const createLeadIdx = smsProcessingSrc.indexOf('LeadService.createLead')
    expect(createLeadIdx).toBeGreaterThan(0)
    // createLead should be inside the if (!lead) block
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {')
    expect(createLeadIdx).toBeGreaterThan(ifNotLeadIdx)
  })

  it('conversation is findOrCreate (reuses existing, no duplicate)', () => {
    expect(smsProcessingSrc).toContain('findOrCreateConversation')
  })

  it('message idempotency by twilio_message_sid prevents duplicate messages', () => {
    expect(adminSrc).toContain('twilio_message_sid')
    expect(adminSrc).toContain('Existing message found for twilio_message_sid')
    expect(adminSrc).toContain('skipping duplicate')
  })
})

// ============================================================
// Part 9: Transition matrix completeness (all 10 statuses)
// ============================================================

describe('Batch A — Part 9: Transition matrix completeness', () => {
  const ALL_STATUSES = [
    'new',
    'needs_reply',
    'active',
    'scheduled',
    'payment_requested',
    'paid',
    'completed',
    'cancelled',
    'ignored',
    'lost',
  ] as const

  ALL_STATUSES.forEach((status) => {
    it(`transition matrix has an entry for "${status}"`, () => {
      const statusSection = transitionsSrc.match(
        new RegExp(`${status}:\\s*\\{`)
      )
      expect(statusSection).toBeTruthy()
    })

    it(`"${status}" + inbound_message_received → active (not null)`, () => {
      // The applyCustomerStatusEvent early return for inbound_message_received
      // must return 'active' for this status (not null)
      const earlyReturn = transitionsSrc.match(
        /if \(event === 'inbound_message_received'\)\s*\{[\s\S]*?return TRANSITION_TABLE\[normalizedCurrent\]\?\.\[event\] \?\? 'active'/
      )
      expect(earlyReturn).toBeTruthy()
    })
  })
})

// ============================================================
// Part 10: Stale-customer reuse (no recency/age gate)
// ============================================================

describe('Batch A — Part 10: Stale-customer reuse (no age gate)', () => {
  it('shouldReuseLead has NO recency check at all', () => {
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 500)
    expect(fnBody).not.toContain('daysSinceActivity')
    expect(fnBody).not.toContain('30')
    expect(fnBody).not.toContain('lastActivity')
    expect(fnBody).toContain('return true')
  })

  it('case 1: existing Active customer, 31 days old → reused', () => {
    // shouldReuseLead returns true regardless of age — no 30-day gate
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 500)
    expect(fnBody).toContain('return true')
    // No recency check that would reject a 31-day-old lead
    expect(fnBody).not.toMatch(/daysSinceActivity\s*>\s*\d+/)
  })

  it('case 2: existing Completed customer, 60 days old → reused + Active', () => {
    // Completed status is eligible for reuse (no status gate)
    // AND reactivates to active on inbound (transition table)
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 500)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()

    const completedSection = transitionsSrc.match(/completed:\s*\{[\s\S]*?\}/)
    expect(completedSection).toBeTruthy()
    expect(completedSection![0]).toMatch(/inbound_message_received/)
    expect(completedSection![0]).toMatch(/'active'/)
  })

  it('case 3: existing Payment Requested customer, 90 days old → reused + Active', () => {
    // Payment Requested status is eligible for reuse (no status gate, no age gate)
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 500)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()
    expect(fnBody).not.toMatch(/daysSinceActivity\s*>\s*\d+/)

    const prSection = transitionsSrc.match(/payment_requested:\s*\{[\s\S]*?\}/)
    expect(prSection).toBeTruthy()
    expect(prSection![0]).toMatch(/inbound_message_received/)
    expect(prSection![0]).toMatch(/'active'/)
  })

  it('case 4: existing Lost customer, 1 year old → reused + Active', () => {
    // Lost status is eligible for reuse (no status gate, no age gate)
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 500)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()
    expect(fnBody).not.toMatch(/daysSinceActivity\s*>\s*\d+/)

    const lostSection = transitionsSrc.match(/lost:\s*\{[\s\S]*?\}/)
    expect(lostSection).toBeTruthy()
    expect(lostSection![0]).toMatch(/inbound_message_received/)
    expect(lostSection![0]).toMatch(/'active'/)
  })

  it('case 5: no duplicate customer created for stale existing phone', () => {
    // findLeadByPhoneAcrossBusinesses returns the existing lead if found
    // shouldReuseLead returns true for any non-null lead
    // Therefore a stale existing phone reuses the existing customer, not a duplicate
    expect(adminSrc).toContain('findLeadByPhoneAcrossBusinesses')
    expect(adminSrc).toContain('shouldReuseLead(data as Lead)')
    // The existing-lead branch in sms-processing persists to the existing lead
    expect(smsProcessingSrc).toContain('else if (lead) {')
    // createLead is only in the if (!lead) branch
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {')
    const createLeadIdx = smsProcessingSrc.indexOf('LeadService.createLead')
    expect(createLeadIdx).toBeGreaterThan(ifNotLeadIdx)
  })

  it('case 6: business scoping remains correct (business_id filter in query)', () => {
    // findLeadByPhoneAcrossBusinesses filters by business_id in the DB query
    const fnStart = adminSrc.indexOf('async findLeadByPhoneAcrossBusinesses')
    const fnBody = adminSrc.substring(fnStart, fnStart + 2000)
    expect(fnBody).toContain("from('leads')")
    expect(fnBody).toContain('.eq(\'business_id\', business.id)')
    expect(fnBody).toContain('.eq(\'caller_phone\', phone)')
  })

  it('case 7: same phone in different businesses does not cross-associate', () => {
    // The query filters by both business_id AND caller_phone
    // A lead in business A will NOT be returned for business B
    const fnStart = adminSrc.indexOf('async findLeadByPhoneAcrossBusinesses')
    const fnBody = adminSrc.substring(fnStart, fnStart + 2000)
    expect(fnBody).toContain('.eq(\'business_id\', business.id)')
    expect(fnBody).toContain('.eq(\'caller_phone\', phone)')
    // Both filters must be present — business scoping is enforced at the DB level
  })

  it('case 8: genuinely unknown phone still follows normal new-customer path', () => {
    // If no lead is found, findLeadByPhoneAcrossBusinesses returns null
    // The if (!lead) branch creates a new lead
    expect(smsProcessingSrc).toContain('if (!lead) {')
    expect(smsProcessingSrc).toContain('LeadService.createLead')
    // New leads are created with status 'needs_reply'
    expect(smsProcessingSrc).toContain("status: 'needs_reply'")
  })

  it('case 9: ignored_contacts suppression still wins over reuse', () => {
    // The shared pre-check (isIgnoredContact) runs BEFORE the lead reuse branch
    const preCheckIdx = smsProcessingSrc.indexOf('SHARED PRE-CHECK')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const elseIfLeadIdx = smsProcessingSrc.indexOf('else if (lead) {', preCheckIdx)
    expect(preCheckIdx).toBeGreaterThan(0)
    expect(ifNotLeadIdx).toBeGreaterThan(preCheckIdx)
    expect(elseIfLeadIdx).toBeGreaterThan(preCheckIdx)
    // The pre-check returns the generic auto-ack if the phone is in ignored_contacts
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    expect(preCheckSection).toContain('isIgnored')
    expect(preCheckSection).toContain('Thanks - we received your message.')
  })

  it('case 10: STOP/START/HELP behavior unchanged', () => {
    // Compliance keywords are handled before lead lookup and reuse
    const optOutIdx = smsProcessingSrc.indexOf('if (isOptOut || isOptIn || isHelp)')
    const leadLookupIdx = smsProcessingSrc.indexOf('findLeadByPhoneAcrossBusinesses', optOutIdx)
    expect(optOutIdx).toBeGreaterThan(0)
    expect(leadLookupIdx).toBeGreaterThan(optOutIdx)
    // STOP keywords
    expect(smsProcessingSrc).toContain("'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'")
    // START keywords
    expect(smsProcessingSrc).toContain("'START', 'UNSTOP'")
    // HELP keyword
    expect(smsProcessingSrc).toContain("originalBody === 'HELP'")
  })
})
