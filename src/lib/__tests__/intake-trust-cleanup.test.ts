/**
 * Final trust/correctness cleanup regressions.
 *
 * Issue 1 — customer-list card must resolve the same authoritative completed
 *   AI intake as Customer Context (requires `outcome` in the list's
 *   ai_call_records select so selectAuthoritativeAiCallRecord works).
 * Issue 2 — a per-call timeline event must not borrow the lead-level request
 *   title or raw_metadata when that call captured no service.
 * Issue 3 — Details must not lead with a verbatim echo of the Reason phrase;
 *   only a conservative phrase-level strip is allowed.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getLeadAIIntake, getLeadRequestTitle, getAIIntakeStatus } from '@/lib/ai-field-mapping'
import { getHistoricalJobRequestContext } from '@/lib/customer-context'
import { removeReasonEchoFromDetails, generateCanonicalRequestTitle, formatAiIntakeSummary } from '@/lib/ai-intake-formatter'

const readSrc = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n')

const rec = (id: string, outcome: string, created_at: string, extracted_info: any) => ({
  id, outcome, created_at, extracted_info,
})

// ---------------------------------------------------------------------------
// Issue 1 — customer list select + authoritative-completed semantics
// ---------------------------------------------------------------------------
describe('Issue 1: customer-list card uses authoritative completed intake', () => {
  const leadsPageSrc = readSrc('src/app/dashboard/leads/page.tsx')

  it('list selects include ai_call_records.outcome (main fetch + realtime single-lead select)', () => {
    const selects = leadsPageSrc.match(/ai_call_records \(([^)]*)\)/g) || []
    expect(selects.length).toBeGreaterThanOrEqual(2)
    for (const sel of selects) {
      expect(sel).toContain('outcome')
      expect(sel).toContain('extracted_info')
      expect(sel).toContain('created_at')
    }
  })

  const LANDSCAPE = { serviceRequested: 'looking for landscaping help with my backyard', callerName: 'Josh Allen' }
  const TREE = { serviceRequested: 'need a tree removal done this week', callerName: 'Josh Allen' }

  it('older completed + newer completed => newer completed shown', () => {
    const lead = {
      aiCallRecords: [
        rec('new', 'completed', '2026-10-01T10:00:00Z', LANDSCAPE),
        rec('old', 'completed', '2026-09-12T10:00:00Z', TREE),
      ],
      raw_metadata: {},
    }
    expect(getLeadRequestTitle(lead)).toBe('Landscaping Service')
  })

  it('older completed + newer ai_failed => older completed remains', () => {
    const lead = {
      aiCallRecords: [
        rec('failed', 'ai_failed', '2026-10-02T10:00:00Z', { callerName: 'Ghost' }),
        rec('old', 'completed', '2026-09-12T10:00:00Z', TREE),
      ],
      raw_metadata: {},
    }
    expect(getLeadRequestTitle(lead)).toBe('Tree Removal')
  })

  it('older completed + newer incomplete/partial => older completed remains', () => {
    for (const outcome of ['incomplete', 'partial_intake', 'voicemail_fallback', 'caller_hung_up']) {
      const lead = {
        aiCallRecords: [
          rec('noncomp', outcome, '2026-10-02T10:00:00Z', { serviceRequested: 'bogus newer request' }),
          rec('old', 'completed', '2026-09-12T10:00:00Z', TREE),
        ],
        raw_metadata: {},
      }
      expect(getLeadRequestTitle(lead)).toBe('Tree Removal')
    }
  })

  it('stale corrected_fields cannot win once the authoritative call is known', () => {
    const lead = {
      aiCallRecords: [rec('new', 'completed', '2026-10-01T10:00:00Z', LANDSCAPE)],
      raw_metadata: {
        corrected_fields: { serviceRequested: 'Tree Removal' },
        last_correction_at: '2026-09-12T10:00:00Z',
      },
    }
    expect(getLeadRequestTitle(lead)).toBe('Landscaping Service')
  })

  it('manual customer (no AI records) is unchanged', () => {
    const lead = {
      source: 'manual',
      aiCallRecords: [],
      raw_metadata: { extracted_info: { serviceRequested: 'annual gutter cleaning' } },
    }
    expect(getLeadAIIntake(lead).serviceRequested).toBe('Annual gutter cleaning')
  })
})

// ---------------------------------------------------------------------------
// Issue 2 — timeline request event must use the call's own captured service
// ---------------------------------------------------------------------------
describe('Issue 2: timeline event cannot borrow a previous request', () => {
  const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
  // Extract the per-record event builder block for structural assertions.
  const forEachBlock = pageClientSrc.slice(
    pageClientSrc.indexOf('leadData.aiCallRecords.forEach'),
    pageClientSrc.indexOf('systemEvents.push')
  )

  it('does not use the lead-level title or raw_metadata inside per-record events', () => {
    expect(forEachBlock).not.toContain('getLeadRequestTitle(leadData)')
    expect(forEachBlock).not.toContain('leadData?.raw_metadata')
    expect(forEachBlock).toContain('aiCall.extracted_info')
    expect(forEachBlock).toContain('generateCanonicalRequestTitle(serviceRaw)')
  })

  it('a record with no captured service emits NO event — no neutral stand-in label', () => {
    // The else branch must skip the record entirely when no service was
    // captured; it must not substitute 'No request captured', 'Unknown
    // request', or any other replacement Request/state label.
    expect(forEachBlock).toContain('if (!serviceRequested) return')
    expect(forEachBlock).not.toContain('No request captured')
    expect(forEachBlock).not.toContain('Unknown request')
    expect(forEachBlock).not.toContain('Incomplete request')
    // The request-event template appears exactly once and is reached only
    // when this record captured a service.
    expect(forEachBlock.match(/Request: \$\{/g)).toHaveLength(1)
    expect(forEachBlock).toContain('intakeMessage = `Request: ${serviceRequested}`')
  })

  // Mirror of the per-record event builder in page-client.tsx — kept in sync
  // by the source assertions above.
  const timelineMessageFor = (aiCall: any): string | null => {
    const outcome = aiCall.outcome
    const intakeStatus = getAIIntakeStatus({ aiCallRecords: [aiCall] })
    const info = aiCall.extracted_info || {}
    const serviceRaw = info.serviceRequested || info.reasonForCalling || info.request || ''
    const t = serviceRaw ? generateCanonicalRequestTitle(serviceRaw) : ''
    const serviceRequested = t && t !== 'Not collected' && t !== 'General Service' ? t : ''
    if (intakeStatus === 'complete') {
      return serviceRequested ? `Intake Complete: ${serviceRequested}` : 'Intake Complete'
    }
    if (intakeStatus === 'partial') {
      const captured: string[] = []
      if (info.customerName || info.callerName || info.name) captured.push('name')
      if (serviceRaw) captured.push('service')
      if (info.serviceAddress || info.addressOrLocation) captured.push('address')
      if (info.desiredCompletionTime || info.desiredCompletion) captured.push('timing')
      if (info.callbackTime || info.preferredCallbackTime) captured.push('callback')
      return `Partial Intake${serviceRequested ? `: ${serviceRequested}` : ''} (${captured.length ? captured.join(', ') : 'no fields captured'})`
    }
    if (outcome === 'early_hangup') return `Caller Hung Up${serviceRequested ? `: ${serviceRequested}` : ''}`
    if (outcome === 'no_speech') return 'No Speech Detected'
    if (outcome === 'ai_connection_failed') return 'AI Connection Failed'
    if (!serviceRequested) return null // no request event emitted
    return `Request: ${serviceRequested}`
  }

  const OLD = rec('old', 'completed', '2026-09-12T10:00:00Z', {
    serviceRequested: 'need a tree removal done this week',
    callerName: 'Josh Allen',
  })

  it('A: old completed request + current no-response call => ZERO fresh Request event', () => {
    const requestEvent = (m: string | null) =>
      m !== null && (m.startsWith('Request:') || m.startsWith('Intake Complete:'))
    // else-branch outcomes emit NOTHING when the record captured no service
    for (const outcome of ['ai_failed', 'voicemail_fallback', 'caller_hung_up', 'early_hangup']) {
      expect(requestEvent(timelineMessageFor(rec('cur', outcome, '2026-10-02T10:00:00Z', {}))))
        .toBe(false)
    }
    // incomplete records emit at most a Partial-Intake call-status line —
    // never a Request event naming a borrowed service
    const msg = timelineMessageFor(rec('cur', 'incomplete', '2026-10-02T10:00:00Z', {}))
    expect(requestEvent(msg)).toBe(false)
    expect(msg).not.toContain('Tree Removal')
    expect(msg).not.toContain('Landscaping')
    // extracted_info present but no service => still no Request event
    const noService = timelineMessageFor(
      rec('cur', 'voicemail_fallback', '2026-10-02T10:00:00Z', { callerName: 'Josh' })
    )
    expect(noService).toBeNull()
  })

  it('B: current call with its own serviceRequested emits CURRENT request only', () => {
    const current = rec('cur', 'completed', '2026-10-02T10:00:00Z', {
      serviceRequested: 'need a fence repair',
      callerName: 'Josh Allen',
    })
    const msg = timelineMessageFor(current)
    expect(msg).toBe('Intake Complete: Fence Repair')
    expect(msg).not.toContain('Tree Removal')
    expect(msg).not.toContain('Landscaping')
    // non-completed record that still captured a service gets its own Request event
    const partialSvc = rec('cur2', 'voicemail_fallback', '2026-10-03T10:00:00Z', {
      serviceRequested: 'need a fence repair',
    })
    expect(timelineMessageFor(partialSvc)).toBe('Request: Fence Repair')
  })

  it('C: the old completed record still emits its own historical event', () => {
    expect(timelineMessageFor(OLD)).toBe('Intake Complete: Tree Removal')
  })

  it('D: legitimate call-history events unchanged for no-service records', () => {
    expect(timelineMessageFor(rec('h', 'early_hangup', '2026-10-02T10:00:00Z', {})))
      .toBe('Caller Hung Up')
    expect(timelineMessageFor(rec('n', 'no_speech', '2026-10-02T10:00:00Z', {})))
      .toBe('No Speech Detected')
    expect(timelineMessageFor(rec('f', 'ai_connection_failed', '2026-10-02T10:00:00Z', {})))
      .toBe('AI Connection Failed')
    expect(timelineMessageFor(rec('p', 'incomplete', '2026-10-02T10:00:00Z', { callerName: 'Josh' })))
      .toBe('Partial Intake (name)')
    // none of these are Request events
    for (const o of ['early_hangup', 'no_speech', 'ai_connection_failed', 'incomplete']) {
      const m = timelineMessageFor(rec('x', o, '2026-10-02T10:00:00Z', {}))
      if (m) expect(m.startsWith('Request:')).toBe(false)
    }
  })
})

// ---------------------------------------------------------------------------
// Issue 3 — Details must not open with a verbatim Reason echo
// ---------------------------------------------------------------------------
describe('Issue 3: conservative reason-echo suppression in Details', () => {
  it('toilet example: echo prefix removed, incremental context kept', () => {
    expect(removeReasonEchoFromDetails(
      'installed in my bathroom because the old one broke',
      "I'm just looking to, um, get a new toilet installed in my bathroom"
    )).toBe('Because the old one broke')
  })

  it('sentence boundary after echo also strips cleanly', () => {
    expect(removeReasonEchoFromDetails(
      'installed in my bathroom. The old one broke',
      'get a new toilet installed in my bathroom'
    )).toBe('The old one broke')
  })

  it('fence example unchanged', () => {
    const d = "it's going to be about a quarter acre yard"
    expect(removeReasonEchoFromDetails(d, 'get a fence installed in my backyard')).toBe(d)
  })

  it('landscaping example unchanged', () => {
    const d = "you guys did my neighbor's yard and I liked how it looked"
    expect(removeReasonEchoFromDetails(d, 'landscaping help with my backyard')).toBe(d)
  })

  it('sink example unchanged — single shared word is not an echo phrase', () => {
    const d = 'it started leaking yesterday under the cabinet'
    expect(removeReasonEchoFromDetails(d, 'my sink is leaking')).toBe(d)
  })

  it('non-connector boundary preserves original (uncertain suffix)', () => {
    const d = 'installed in my bathroom sink needs reseating'
    expect(removeReasonEchoFromDetails(d, 'get a new toilet installed in my bathroom')).toBe(d)
  })

  it('pure echo with no remainder preserves original', () => {
    const d = 'installed in my bathroom'
    expect(removeReasonEchoFromDetails(d, 'get a new toilet installed in my bathroom')).toBe(d)
  })

  it('getLeadAIIntake dedups Details for the authoritative call only', () => {
    const lead = {
      aiCallRecords: [rec('r1', 'completed', '2026-10-01T10:00:00Z', {
        serviceRequested: "I'm just looking to, um, get a new toilet installed in my bathroom",
        issueDescription: 'installed in my bathroom because the old one broke',
      })],
      raw_metadata: {},
    }
    const intake = getLeadAIIntake(lead)
    expect(intake.serviceRequested).toBe("I'm just looking to, um, get a new toilet installed in my bathroom")
    expect(intake.additionalDetails).toBe('Because the old one broke')
  })

  it('Request History path (no records) keeps Details verbatim', () => {
    const intake = getLeadAIIntake({
      aiCallRecords: [],
      raw_metadata: { extracted_info: {
        serviceRequested: 'get a new toilet installed in my bathroom',
        issueDescription: 'installed in my bathroom because the old one broke',
      }},
    })
    expect(intake.additionalDetails).toBe('Installed in my bathroom because the old one broke')
  })

  it('Request History via getHistoricalJobRequestContext stays verbatim — explicit proof', () => {
    // The historical snapshot path (Previous Job Requests) must render the
    // record's captured details untouched, even when they echo the reason.
    const ctx = getHistoricalJobRequestContext(rec('old', 'completed', '2026-09-12T10:00:00Z', {
      serviceRequested: 'get a new toilet installed in my bathroom',
      issueDescription: 'installed in my bathroom because the old one broke',
    }))
    expect(ctx.details).toBe('Installed in my bathroom because the old one broke')
    expect(ctx.reasonForCalling).toBe('Get a new toilet installed in my bathroom')
  })

  it('dedup never mutates the stored ai_call_record fields', () => {
    const record = rec('r1', 'completed', '2026-10-01T10:00:00Z', {
      serviceRequested: "I'm just looking to, um, get a new toilet installed in my bathroom",
      issueDescription: 'installed in my bathroom because the old one broke',
    })
    getLeadAIIntake({ aiCallRecords: [record], raw_metadata: {} })
    expect(record.extracted_info.issueDescription)
      .toBe('installed in my bathroom because the old one broke')
    expect(record.extracted_info.serviceRequested)
      .toBe("I'm just looking to, um, get a new toilet installed in my bathroom")
  })

  it('manual/non-AI customer details stay verbatim even when they echo the reason', () => {
    const intake = getLeadAIIntake({
      aiCallRecords: [],
      raw_metadata: { extracted_info: {
        serviceRequested: 'get a new toilet installed in my bathroom',
        importantDetails: 'installed in my bathroom because the old one broke',
      }},
    })
    expect(intake.additionalDetails).toBe('Installed in my bathroom because the old one broke')
  })

  it('SMS Details line shows the deduped incremental context', () => {
    const sms = formatAiIntakeSummary({
      callerName: 'Ryan',
      serviceRequested: "I'm just looking to, um, get a new toilet installed in my bathroom",
      importantDetails: 'installed in my bathroom because the old one broke',
      serviceAddress: '127 Morphe Street',
      desiredCompletionTime: 'tomorrow',
      callbackTime: 'anytime after 2 pm',
    }, '+15551234567', 'Test Biz')
    expect(sms).toContain('• Details: Because the old one broke')
    expect(sms).not.toContain('installed in my bathroom because')
  })
})
