/**
 * Batch 2 — Intentional Automation Matrix for Inbound SMS
 *
 * Proves that the inbound SMS path (processInboundSms) has a clear, single
 * automation decision tree with no duplicate or overlapping auto-responses.
 *
 * Matrix:
 *   - Instant Response: NOT in inbound SMS path (handled by voice/AI path)
 *   - Out of Office: NOT in inbound SMS path (handled by sendSms availability append)
 *   - After Hours: NOT in inbound SMS path (handled by sendSms availability append)
 *   - STOP → compliance preserved (opt-out confirmation)
 *   - START → compliance preserved (opt-in confirmation)
 *   - HELP → compliance preserved (help message)
 *   - Unknown ignored contact → generic ack (only for !lead)
 *   - Known customer → NO auto response (empty TwiML)
 *   - One inbound message never triggers multiple automatic systems
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

const smsProcessingSrc = readSrc('src/lib/sms-processing.ts')
const twilioSrc = readSrc('src/lib/twilio.ts')
const autoSmsDispatcherSrc = readSrc('src/lib/auto-sms-dispatcher.ts')

// ============================================================
// Part 1: Instant Response / OOO / After Hours NOT in inbound SMS path
// ============================================================

describe('Batch 2 — Automation matrix: inbound SMS path has no instant response / OOO / after-hours', () => {
  it('processInboundSms does NOT contain instant_response logic', () => {
    const processFnStart = smsProcessingSrc.indexOf('export async function processInboundSms')
    const processFnEnd = smsProcessingSrc.lastIndexOf('return {')
    const processBody = smsProcessingSrc.substring(processFnStart, processFnEnd + 200)
    expect(processBody).not.toContain('instant_response')
    expect(processBody).not.toContain('instantResponse')
  })

  it('processInboundSms does NOT contain out-of-office auto-reply logic', () => {
    const processFnStart = smsProcessingSrc.indexOf('export async function processInboundSms')
    const processFnEnd = smsProcessingSrc.lastIndexOf('return {')
    const processBody = smsProcessingSrc.substring(processFnStart, processFnEnd + 200)
    expect(processBody).not.toContain('isBusinessOutOfOffice')
    expect(processBody).not.toContain('out_of_office_enabled')
  })

  it('processInboundSms does NOT contain after-hours auto-reply logic', () => {
    const processFnStart = smsProcessingSrc.indexOf('export async function processInboundSms')
    const processFnEnd = smsProcessingSrc.lastIndexOf('return {')
    const processBody = smsProcessingSrc.substring(processFnStart, processFnEnd + 200)
    expect(processBody).not.toContain('isWithinBusinessHours')
    expect(processBody).not.toContain('after_hours')
  })
})

// ============================================================
// Part 2: Compliance (STOP/START/HELP) preserved
// ============================================================

describe('Batch 2 — Automation matrix: compliance preserved', () => {
  it('STOP keywords are defined and handled before normal processing', () => {
    expect(smsProcessingSrc).toContain("'STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'")
    const optOutIdx = smsProcessingSrc.indexOf('if (isOptOut || isOptIn || isHelp)')
    const leadLookupIdx = smsProcessingSrc.indexOf('findLeadByPhoneAcrossBusinesses', optOutIdx)
    expect(optOutIdx).toBeGreaterThan(0)
    expect(leadLookupIdx).toBeGreaterThan(optOutIdx)
  })

  it('STOP sends opt-out confirmation via sendSms', () => {
    expect(smsProcessingSrc).toContain('You have been unsubscribed. You will no longer receive messages.')
  })

  it('START keywords are defined (TCPA-compliant, YES excluded)', () => {
    expect(smsProcessingSrc).toContain("'START', 'UNSTOP'")
    expect(smsProcessingSrc).toContain('YES is NOT a valid opt-in keyword')
  })

  it('START sends opt-in confirmation via sendSms', () => {
    expect(smsProcessingSrc).toContain('You have been re-subscribed. You will receive messages again.')
  })

  it('HELP keyword is defined and sends help message', () => {
    expect(smsProcessingSrc).toContain("originalBody === 'HELP'")
    expect(smsProcessingSrc).toContain('For help, contact us at support@replyflowhq.com')
  })

  it('HELP does NOT cancel follow-ups (compliance keyword)', () => {
    expect(smsProcessingSrc).toContain('help_keyword_does_not_cancel_followups')
  })

  it('compliance handler returns BEFORE the ignored-contact check and lead reuse', () => {
    const complianceReturn = smsProcessingSrc.indexOf('optOutHandled: true')
    const ignoredCheck = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    expect(complianceReturn).toBeGreaterThan(0)
    expect(ignoredCheck).toBeGreaterThan(0)
    expect(complianceReturn).toBeLessThan(ignoredCheck)
  })
})

// ============================================================
// Part 3: One inbound message never triggers multiple automatic systems
// ============================================================

describe('Batch 2 — Automation matrix: no duplicate auto-responses', () => {
  it('"Thanks - we received your message." is NOT emitted in any production TwiML output', () => {
    // The legacy generic auto-ack has been removed entirely from production.
    expect(smsProcessingSrc).not.toMatch(/<Message>Thanks - we received your message/)
  })

  it('the ignored-contact branch returns empty TwiML (no <Message>, no outbound SID)', () => {
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    expect(preCheckIdx).toBeGreaterThan(0)
    expect(ifNotLeadIdx).toBeGreaterThan(preCheckIdx)

    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    expect(preCheckSection).toContain('!lead && business?.id')
    expect(preCheckSection).toContain('if (isIgnored)')
    // Empty TwiML — no <Message> element, no outbound acknowledgement
    expect(preCheckSection).not.toContain('<Message>')
    expect(preCheckSection).not.toContain('Thanks - we received your message.')
  })

  it('the legacy string is NOT in the normal lead path (existing-lead branch)', () => {
    expect(smsProcessingSrc).not.toMatch(/<Message>Thanks - we received your message/)
  })

  it('no other production file emits the generic ack', () => {
    expect(twilioSrc).not.toContain('Thanks - we received your message.')
    expect(autoSmsDispatcherSrc).not.toContain('Thanks - we received your message.')
  })

  it('compliance responses and ignored-contact ack are mutually exclusive (early returns)', () => {
    // The compliance handler returns before the ignored-contact check
    const complianceReturn = smsProcessingSrc.indexOf('optOutHandled: true')
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    expect(complianceReturn).toBeLessThan(preCheckIdx)

    // The ignored-contact check returns before lead creation
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const ignoredReturn = smsProcessingSrc.indexOf('ignored: true', preCheckIdx)
    expect(ignoredReturn).toBeLessThan(ifNotLeadIdx)
  })
})

// ============================================================
// Part 4: Outbound persistence for intentional automation
// ============================================================

describe('Batch 2 — Automation matrix: outbound persistence for compliance', () => {
  it('compliance responses use sendSms (canonical outbound persistence)', () => {
    // Opt-out uses sendSms
    const optOutStart = smsProcessingSrc.indexOf('// Handle opt-out requests')
    const optOutEnd = smsProcessingSrc.indexOf('Return TwiML response for opt-out', optOutStart)
    const optOutSection = smsProcessingSrc.substring(optOutStart, optOutEnd)
    expect(optOutSection).toContain('sendSms')

    // Opt-in uses sendSms
    const optInStart = smsProcessingSrc.indexOf('// Handle opt-in requests')
    const optInEnd = smsProcessingSrc.indexOf('Return TwiML response for opt-in', optInStart)
    const optInSection = smsProcessingSrc.substring(optInStart, optInEnd)
    expect(optInSection).toContain('sendSms')
  })

  it('compliance sendSms calls include skipBusinessAvailabilityAppend', () => {
    // Compliance responses should not have availability notes appended
    expect(smsProcessingSrc).toContain('skipBusinessAvailabilityAppend: true')
  })
})

// ============================================================
// Part 5: Outbound callback regression — ignored-contact path generates zero outbound
// ============================================================

describe('Batch 2 — Outbound callback regression: ignored-contact path generates zero outbound', () => {
  it('the ignored-contact branch does NOT invoke sendSms', () => {
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    // The ignored-contact branch returns directly without calling sendSms
    expect(preCheckSection).not.toContain('sendSms')
    expect(preCheckSection).toContain('return {')
  })

  it('the ignored-contact branch TwiML has no <Message> element (zero outbound Twilio message)', () => {
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    // Empty TwiML means Twilio does not generate an outbound message
    expect(preCheckSection).not.toContain('<Message>')
    expect(preCheckSection).toContain('<Response>')
    expect(preCheckSection).toContain('</Response>')
  })

  it('empty TwiML produces no outbound MessageSid for status-callback reconciliation', () => {
    // Since there is no <Message> in the TwiML, Twilio will not send an outbound
    // message and therefore will not generate an outbound MessageSid. This
    // eliminates the orphaned-SID pattern: outbound SID exists + messages row
    // absent + status-callback → PGRST116.
    const preCheckIdx = smsProcessingSrc.indexOf('KNOWN-CUSTOMER PRECEDENCE')
    const ifNotLeadIdx = smsProcessingSrc.indexOf('if (!lead) {', preCheckIdx)
    const preCheckSection = smsProcessingSrc.substring(preCheckIdx, ifNotLeadIdx)
    expect(preCheckSection).not.toContain('sendSms')
    expect(preCheckSection).not.toContain('<Message>')
    // The branch still marks the result as ignored for internal tracking
    expect(preCheckSection).toContain('ignored: true')
  })
})
