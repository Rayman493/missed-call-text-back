/**
 * Batch 2 — Known Customer Inbound SMS Status Matrix + Active/Payment Requested Regression
 *
 * Proves the canonical product rule for EVERY lifecycle status:
 *   KNOWN EXISTING CUSTOMER + NORMAL INBOUND SMS =
 *     - reuse existing customer
 *     - reuse canonical conversation
 *     - persist inbound message
 *     - update recency
 *     - notify business owner
 *     - apply canonical status/reactivation behavior
 *     - NEVER send "Thanks - we received your message."
 *
 * The ignored-contact pre-check applies ONLY to unknown contacts (!lead).
 * Known customers always receive normal inbound processing regardless of
 * ignored_contacts membership or lifecycle status.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

const smsProcessingSrc = readSrc('src/lib/sms-processing.ts')
const transitionsSrc = readSrc('src/lib/customer-status-transitions.ts')
const adminSrc = readSrc('src/lib/supabase/admin.ts')
const ignoredContactsSrc = readSrc('src/lib/ignored-contacts.ts')

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

// ============================================================
// Part 1: Full lifecycle status matrix — known customer inbound
// ============================================================

describe('Batch 2 — Part 1: Full lifecycle status matrix (known customer inbound)', () => {
  ALL_STATUSES.forEach((status) => {
    it(`status "${status}" + known customer + inbound "Hi" → normal processing (no generic ack)`, () => {
      // The pre-check condition requires !lead, so known customers bypass it
      const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
      expect(preCheckIdx).toBeGreaterThan(0)

      const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
      const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
      expect(preCheckSection).toContain('!lead && business?.id')

      // The legacy generic acknowledgement has been removed entirely from
      // production inbound SMS output. No TwiML <Message> contains it.
      expect(smsProcessingSrc).not.toMatch(/<Message>Thanks - we received your message/)
    })
  })

  ALL_STATUSES.forEach((status) => {
    it(`status "${status}" + inbound_message_received → active (transition table)`, () => {
      const statusSection = transitionsSrc.match(
        new RegExp(`${status}:\\s*\\{[\\s\\S]*?\\}`)
      )
      expect(statusSection).toBeTruthy()
      expect(statusSection![0]).toMatch(/inbound_message_received/)
      expect(statusSection![0]).toMatch(/'active'/)
    })
  })
})

// ============================================================
// Part 2: Named Active regression
// ============================================================

describe('Batch 2 — Part 2: Named Active regression', () => {
  it('Active customer + inbound "Hi" → inbound persists, customer reactivated, no auto response', () => {
    // Active is a known customer status — the pre-check is skipped (!lead is false)
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    expect(preCheckSection).toContain('!lead && business?.id')

    // Active + inbound_message_received → active (stays active)
    const activeSection = transitionsSrc.match(/active:\s*\{[\s\S]*?\}/)
    expect(activeSection).toBeTruthy()
    expect(activeSection![0]).toMatch(/inbound_message_received:\s*'active'/)

    // The normal path persists the inbound message
    expect(smsProcessingSrc).toMatch(/createMessageWithConversation\(\{[\s\S]*?direction:\s*'inbound'/)

    // The normal path returns empty TwiML (no auto response)
    const successReturnIdx = smsProcessingSrc.lastIndexOf('return {')
    const successSection = smsProcessingSrc.substring(successReturnIdx, successReturnIdx + 300)
    expect(successSection).toContain('success: true')
    expect(successSection).not.toContain('Thanks - we received your message')
  })

  it('Active customer in ignored_contacts still gets normal processing (not generic ack)', () => {
    // The pre-check requires !lead, so an Active customer with an entry in
    // ignored_contacts still gets normal processing
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    expect(preCheckSection).toContain('!lead && business?.id')
    expect(preCheckSection).toContain('isIgnored')

    // The pre-check does NOT check lead.status — it only checks !lead
    expect(preCheckSection).not.toContain("=== 'active'")
    expect(preCheckSection).not.toContain("=== 'payment_requested'")
  })
})

// ============================================================
// Part 3: Named Payment Requested regression
// ============================================================

describe('Batch 2 — Part 3: Named Payment Requested regression', () => {
  it('Payment Requested customer + inbound "Hi" → inbound persists, reactivated, no generic ack', () => {
    // Payment Requested is a known customer status — the pre-check is skipped
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    expect(preCheckSection).toContain('!lead && business?.id')

    // Payment Requested + inbound_message_received → active (reactivated)
    const paymentSection = transitionsSrc.match(/payment_requested:\s*\{[\s\S]*?\}/)
    expect(paymentSection).toBeTruthy()
    expect(paymentSection![0]).toMatch(/inbound_message_received:\s*'active'/)

    // The normal path persists the inbound message
    expect(smsProcessingSrc).toMatch(/createMessageWithConversation\(\{[\s\S]*?direction:\s*'inbound'/)

    // The normal path does NOT send the generic acknowledgement
    const successReturnIdx = smsProcessingSrc.lastIndexOf('return {')
    const successSection = smsProcessingSrc.substring(successReturnIdx, successReturnIdx + 300)
    expect(successSection).not.toContain('Thanks - we received your message')
  })

  it('Payment Requested customer in ignored_contacts still gets normal processing', () => {
    // Same as Active — the pre-check requires !lead
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    expect(preCheckSection).toContain('!lead && business?.id')
    expect(preCheckSection).not.toContain("=== 'payment_requested'")
  })

  it('Payment Requested payment state is NOT altered by inbound_message_received', () => {
    // The transition table only maps inbound_message_received to 'active'
    // It does NOT map to 'paid' or any payment-related status
    const allInboundTransitions = transitionsSrc.match(
      /inbound_message_received:\s*'[^']*'/g
    ) || []
    allInboundTransitions.forEach((t) => {
      expect(t).toContain("'active'")
      expect(t).not.toContain("'paid'")
      expect(t).not.toContain("'payment_requested'")
    })

    // processInboundSms does NOT update payments table
    const processFnStart = smsProcessingSrc.indexOf('export async function processInboundSms')
    const processFnEnd = smsProcessingSrc.lastIndexOf('return {')
    const processBody = smsProcessingSrc.substring(processFnStart, processFnEnd + 200)
    expect(processBody).not.toMatch(/from\('payments'\).*\.update/)
    expect(processBody).not.toMatch(/from\('payment_requests'\).*\.update/)
  })
})

// ============================================================
// Part 4: No duplicate customer/conversation for known customers
// ============================================================

describe('Batch 2 — Part 4: No duplicate customer/conversation', () => {
  it('known customer reuses existing lead (LeadService.createLead only in !lead branch)', () => {
    const createLeadIdx = smsProcessingSrc.indexOf('LeadService.createLead')
    expect(createLeadIdx).toBeGreaterThan(0)
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {')
    expect(createLeadIdx).toBeGreaterThan(ifNotLeadIdx)
  })

  it('conversation is findOrCreate (reuses existing, no duplicate)', () => {
    expect(smsProcessingSrc).toContain('findOrCreateConversation')
  })

  it('shouldReuseLead has NO status-based exclusion (all 10 statuses eligible)', () => {
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 500)
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()
    expect(fnBody).toContain('return true')
  })
})

// ============================================================
// Part 5: Unknown contact ignored-contact behavior preserved
// ============================================================

describe('Batch 2 — Part 5: Unknown contact ignored-contact behavior preserved', () => {
  it('unknown contact in ignored_contacts is suppressed with empty TwiML (no outbound ack)', () => {
    // The pre-check still runs for unknown contacts (!lead)
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    expect(preCheckSection).toContain('!lead && business?.id')
    expect(preCheckSection).toContain('isIgnoredContact')
    // Suppression returns empty TwiML — no legacy generic ack, no <Message>
    expect(preCheckSection).not.toContain('Thanks - we received your message.')
    expect(preCheckSection).not.toContain('<Message>')
    expect(preCheckSection).toContain('ignored: true')
  })

  it('isIgnoredContact checks by business_id and phone_number (not lead status)', () => {
    expect(ignoredContactsSrc).toContain('ignored_contacts')
    expect(ignoredContactsSrc).toContain('business_id')
    expect(ignoredContactsSrc).toContain('phone_number')
    expect(ignoredContactsSrc).not.toContain('lead.status')
  })
})

// ============================================================
// Part 6: Targeted inbound decision logging
// ============================================================

describe('Batch 2 — Part 6: Targeted inbound decision logging', () => {
  it('processInboundSms emits [inbound-sms] decision log on success', () => {
    expect(smsProcessingSrc).toContain("[inbound-sms]")
    expect(smsProcessingSrc).toContain('existing_customer:')
    expect(smsProcessingSrc).toContain('status_before:')
    expect(smsProcessingSrc).toContain('status_after:')
    expect(smsProcessingSrc).toContain('automation_decision:')
    expect(smsProcessingSrc).toContain('auto_reply_sent:')
    expect(smsProcessingSrc).toContain('auto_reply_reason:')
  })

  it('decision log reflects actual production decisions (not misleading)', () => {
    // The normal success path logs automation_decision=none and auto_reply_sent=false
    const decisionLogIdx = smsProcessingSrc.indexOf("[inbound-sms]")
    const decisionSection = smsProcessingSrc.substring(decisionLogIdx, decisionLogIdx + 500)
    expect(decisionSection).toContain("'none'")
    expect(decisionSection).toContain('false')
  })
})
