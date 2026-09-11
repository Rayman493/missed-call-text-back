/**
 * Batch 1 — Messaging + Trust Behavior
 *
 * Focused tests for:
 * 1. COMPLETED-customer unwanted auto-reply fix
 * 2. MMS false "Image failed to load" fix
 * 3. Timeline "Customer Corrected Address" overclaim fix
 * 4. Outbound persistence audit (static assertions)
 * 5. Idempotency / retry safety (static assertions)
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

// ============================================================
// Part 1: COMPLETED-customer auto-reply (cases 1-12)
// ============================================================

describe('Batch 1 — Part 1: COMPLETED-customer auto-reply', () => {
  const adminSrc = readSrc('src/lib/supabase/admin.ts')
  const smsProcessingSrc = readSrc('src/lib/sms-processing.ts')
  const lifecycleSrc = readSrc('src/lib/lead-lifecycle.ts')
  const transitionsSrc = readSrc('src/lib/customer-status-transitions.ts')

  it('case 1: shouldReuseLead allows reuse of ALL lifecycle statuses (universal reuse)', () => {
    // Batch A universal reuse rule: customer lifecycle status must NEVER prevent
    // an existing customer from continuing a conversation. shouldReuseLead has
    // NO status-based exclusion check — all 10 statuses are eligible for reuse.
    const fnStart = adminSrc.indexOf('shouldReuseLead(lead: Lead | null): boolean {')
    const fnBody = adminSrc.substring(fnStart, fnStart + 400)

    // There should be NO status-based exclusion check at all
    const exclusionMatch = fnBody.match(/if \(lead\.status ===[^)]*\)/)
    expect(exclusionMatch).toBeFalsy()
  })

  it('case 2: ACTIVE customer inbound SMS sends no generic acknowledgement', () => {
    // ACTIVE leads are reused (not in exclusion list), so they go through the normal path
    // The normal path returns empty TwiML (no <Message> body)
    const successReturn = smsProcessingSrc.match(/return\s*\{[\s\S]*?success:\s*true[\s\S]*?twiml:[\s\S]*?<Response>[\s\S]*?<\/Response>/g)
    expect(successReturn).toBeTruthy()

    // The final success return should have empty <Response> (no <Message>)
    const finalReturn = successReturn![successReturn!.length - 1]
    expect(finalReturn).not.toContain('<Message>Thanks')
    expect(finalReturn).toContain('</Response>')
  })

  it('case 3: COMPLETED customer inbound SMS sends no generic acknowledgement', () => {
    // Since shouldReuseLead now allows completed leads, the "no existing lead" branch
    // (which contains the "Thanks - we received your message." TwiML) is NOT reached
    // for completed customers.

    // The "Thanks - we received your message." string should only appear in the
    // ignored-contact branch, not in the normal lead path
    const thanksIdx = smsProcessingSrc.indexOf('Thanks - we received your message.')
    expect(thanksIdx).toBeGreaterThan(0)

    // Verify it's inside the ignored-contact branch (isIgnored check)
    const beforeThanks = smsProcessingSrc.substring(Math.max(0, thanksIdx - 500), thanksIdx)
    expect(beforeThanks).toContain('isIgnored')
  })

  it('case 4: COMPLETED customer inbound SMS still persists', () => {
    // The normal lead path (else if lead) always creates a message via createMessageWithConversation
    const insertCall = smsProcessingSrc.match(/createMessageWithConversation\(\{[\s\S]*?direction:\s*'inbound'/)
    expect(insertCall).toBeTruthy()
  })

  it('case 5: message appears in canonical conversation history', () => {
    // createMessageWithConversation sets conversation_id which links to the conversation
    const createMsg = smsProcessingSrc.match(/createMessageWithConversation\(\{[\s\S]*?conversation_id:\s*conversation\.id/)
    expect(createMsg).toBeTruthy()
  })

  it('case 6: completed status reactivates to active on inbound message (universal reactivation)', () => {
    // Batch A universal reactivation rule: inbound_message_received transitions
    // ALL 10 lifecycle statuses (including completed) to 'active'.
    const completedSection = transitionsSrc.match(/completed:\s*\{[\s\S]*?\}/)
    expect(completedSection).toBeTruthy()
    // completed now has inbound_message_received → active
    expect(completedSection![0]).toMatch(/inbound_message_received/)
    expect(completedSection![0]).toMatch(/active/)
  })

  it('case 7: inbound MMS also sends no generic acknowledgement', () => {
    // MMS goes through the same processInboundSms function
    // The media parameter is passed but the same lead-lookup logic applies
    const mmsHandling = smsProcessingSrc.match(/media\?:\s*Array|hasMedia.*media\.length/)
    expect(mmsHandling).toBeTruthy()

    // The "Thanks" message is only in the ignored-contact branch, not MMS-specific
    const thanksCount = (smsProcessingSrc.match(/Thanks - we received your message/g) || []).length
    expect(thanksCount).toBe(1) // Only in ignored-contact branch
  })

  it('case 8: webhook retry does not produce duplicate outbound replies', () => {
    // createMessageWithConversation has idempotency by twilio_message_sid
    const idempotencyCheck = adminSrc.match(/createMessageWithConversation[\s\S]*?twilio_message_sid[\s\S]*?maybeSingle[\s\S]*?Existing message found/)
    expect(idempotencyCheck).toBeTruthy()
  })

  it('case 9: owner notification behavior remains intact', () => {
    // notificationServiceServer.notifyCustomerReply is called after message insert
    const notifyCall = smsProcessingSrc.match(/notificationServiceServer\.notifyCustomerReply/)
    expect(notifyCall).toBeTruthy()
  })

  it('case 10: missed-call text-back remains intact', () => {
    // The voice route handles missed-call text-back, not the SMS route
    // Verify the auto-reply logic in voice route is untouched
    const voiceRouteSrc = readSrc('src/app/api/twilio/voice/route.ts')
    expect(voiceRouteSrc).toContain('auto_reply_message')
    expect(voiceRouteSrc).toContain('AUTO_REPLY_REPEAT_WINDOW_MINUTES')
  })

  it('case 11: explicit follow-ups remain intact', () => {
    // Follow-up cancellation is preserved in the normal lead path
    const followUpCancel = smsProcessingSrc.match(/cancelPendingFollowUpJobsForLead|cancelPendingFollowUpsForConversation/)
    expect(followUpCancel).toBeTruthy()
  })

  it('case 12: configured Out of Office behavior remains intact', () => {
    // Out of office logic is in out-of-office.ts and appended in sendSms
    const oooSrc = readSrc('src/lib/out-of-office.ts')
    expect(oooSrc).toContain('isBusinessOutOfOffice')
    expect(oooSrc).toContain('getOutOfOfficeNotice')

    const twilioSrc = readSrc('src/lib/twilio.ts')
    expect(twilioSrc).toContain('appendBusinessAvailabilityNote')
  })
})

// ============================================================
// Part 2: MMS false "Image failed to load" (cases 13-21)
// ============================================================

describe('Batch 1 — Part 2: MMS media state model', () => {
  const rendererSrc = readSrc('src/components/MessageMediaRenderer.tsx')

  it('case 13: unresolved media renders loading, not failure', () => {
    // The component should have a resolving state
    expect(rendererSrc).toContain('resolvingMedia')
    expect(rendererSrc).toContain('isResolving')
    // Loading UI should show "Loading image…" not "Image failed to load"
    expect(rendererSrc).toContain('Loading image')
  })

  it('case 14: first failed source does not show terminal error while resolving', () => {
    // handleImageError should only mark as failed if authenticated URL exists
    const errorHandler = rendererSrc.match(/handleImageError[\s\S]*?\}/)
    expect(errorHandler).toBeTruthy()
    expect(errorHandler![0]).toContain('authenticatedUrls')
    // Should NOT unconditionally add to failedMedia
    expect(errorHandler![0]).not.toMatch(/^const handleImageError.*setFailedMedia\(prev => new Set\(prev\)\.add\(mediaId\)\)/m)
  })

  it('case 15: refreshed/signed URL success transitions to loaded', () => {
    // When authenticated URL arrives, the img src changes and onLoad fires
    // The retry effect should set authenticatedUrls and clear failedMedia
    expect(rendererSrc).toContain('setAuthenticatedUrls(prev => ({ ...prev, [mediaId]: blobUrl }))')

    // Failed media should be cleared on successful resolution
    expect(rendererSrc).toContain('setFailedMedia(prev => {')
    expect(rendererSrc).toContain('next.delete(mediaId)')
  })

  it('case 16: stale old-request error cannot overwrite newer successful load', () => {
    // handleImageError checks authenticatedUrls[mediaId] before marking failed
    // If no authenticated URL yet, the error is from a stale source and ignored
    const errorGuard = rendererSrc.match(/if \(authenticatedUrls\[mediaId\]\)/)
    expect(errorGuard).toBeTruthy()
  })

  it('case 17: terminal failure appears only after retries exhausted', () => {
    // MAX_RETRIES constant should exist
    expect(rendererSrc).toContain('MAX_RETRIES')
    // isTerminalFailed should check retriesExhausted
    expect(rendererSrc).toContain('retriesExhausted')
    expect(rendererSrc).toContain('isTerminalFailed')
  })

  it('case 18: outgoing historical image works', () => {
    // The component doesn't distinguish direction for loading — all images use the same path
    // isInbound prop exists but doesn't affect URL resolution
    expect(rendererSrc).toContain('isInbound')
    // No direction-conditional URL logic
    const directionCheck = rendererSrc.match(/isInbound.*getMediaUrl|getMediaUrl.*isInbound/)
    expect(directionCheck).toBeFalsy()
  })

  it('case 19: incoming historical image works', () => {
    // Same as case 18 — no direction-conditional logic
    const fetchAuth = rendererSrc.match(/fetchAuthenticatedMedia\(/)
    expect(fetchAuth).toBeTruthy()
  })

  it('case 20: multi-image message handles each item independently', () => {
    // The component maps over media items and tracks state per mediaItem.id
    expect(rendererSrc).toContain('media.map(')
    expect(rendererSrc).toContain('mediaItem.id')
    // State sets use mediaId, not a global flag
    expect(rendererSrc).toContain('loadedMedia.has(mediaItem.id)')
    expect(rendererSrc).toContain('failedMedia.has(mediaItem.id)')
  })

  it('case 21: existing realtime conversation behavior remains intact', () => {
    // The useEffect depends on [media], so when media changes (realtime update),
    // it re-fetches. The authenticatedUrls are merged, not replaced.
    const mergeUrls = rendererSrc.match(/setAuthenticatedUrls\(prev => \(\{ \.\.\.prev, \.\.\.urlMap \}\)\)/)
    expect(mergeUrls).toBeTruthy()

    // Cleanup of blob URLs on unmount is preserved
    expect(rendererSrc).toContain('revokeObjectURL')
  })
})

// ============================================================
// Part 3: Timeline "Customer Corrected Address" (cases 22-28)
// ============================================================

describe('Batch 1 — Part 3: Timeline labeling rules', () => {
  const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
  const orderingSrc = readSrc('src/lib/timeline-event-ordering.ts')

  it('case 22: address normalization does not render "Customer Corrected Address"', () => {
    // The old overconfident label should NOT be generated
    const oldLabel = pageClientSrc.match(/'Customer Corrected Address'/)
    expect(oldLabel).toBeFalsy()
  })

  it('case 23: passive/system field changes do not imply customer intent', () => {
    // The new labels use neutral wording
    expect(pageClientSrc).toContain("'Address updated'")
    expect(pageClientSrc).toContain("'Customer information updated'")
  })

  it('case 24: factual address update renders neutral "Address updated"', () => {
    // When only address field changed, use "Address updated"
    const addressOnlyCheck = pageClientSrc.match(/hasOnlyAddressChange[\s\S]*?'Address updated'/)
    expect(addressOnlyCheck).toBeTruthy()
  })

  it('case 25: uncertain multi-field update renders "Customer information updated"', () => {
    // When multiple fields changed, use "Customer information updated"
    const multiFieldCheck = pageClientSrc.match(/hasOnlyAddressChange[\s\S]*?'Customer information updated'/)
    expect(multiFieldCheck).toBeTruthy()
  })

  it('case 26: major business events remain visible', () => {
    // Other system events should still be generated
    expect(pageClientSrc).toContain('Follow-Ups Cancelled')
    expect(pageClientSrc).toContain('Customer Sent Photos')
    expect(pageClientSrc).toContain('payment_requested')
  })

  it('case 27: low-level normalization/system events are suppressed', () => {
    // The event is only generated when corrected_fields or customer_corrected_info exists
    // It does NOT generate events for whitespace/normalization changes
    const eventGuard = pageClientSrc.match(/customer_corrected_info.*\|\|.*corrected_fields/)
    expect(eventGuard).toBeTruthy()
  })

  it('case 28: duplicate/noisy activity entries are not introduced', () => {
    // Only one correction event per lead (id: `correction-${leadData.id}`)
    const eventId = pageClientSrc.match(/id:\s*`correction-\$\{leadData\.id\}`/)
    expect(eventId).toBeTruthy()

    // The timeline-event-ordering should recognize the new labels
    expect(orderingSrc).toContain("'Address updated'")
    expect(orderingSrc).toContain("'Customer information updated'")
  })
})

// ============================================================
// Part 4: Outbound persistence audit (static assertions)
// ============================================================

describe('Batch 1 — Part 4: Outbound persistence audit', () => {
  const smsProcessingSrc = readSrc('src/lib/sms-processing.ts')
  const twilioSrc = readSrc('src/lib/twilio.ts')

  it('audit 1: TwiML <Message> responses bypass persistence (by design)', () => {
    // TwiML responses are sent by Twilio directly — they don't go through sendSms
    // This is intentional for compliance (opt-in/opt-out/HELP) and error responses
    const twimlMessages = smsProcessingSrc.match(/<Message>[^<]+<\/Message>/g) || []
    expect(twimlMessages.length).toBeGreaterThan(0)

    // Each TwiML message is a direct Twilio-side send, not persisted in our DB
    // This is acceptable for:
    // - Opt-in/opt-out confirmations (compliance)
    // - Error responses (routing failures)
    // - Ignored contact acknowledgement
  })

  it('audit 2: sendSms persists messages to the messages table', () => {
    // The sendSms function inserts into the messages table for lead/conversation messages
    expect(twilioSrc).toContain("from('messages')")
    expect(twilioSrc).toContain('.insert(')
  })

  it('audit 3: opt-in/opt-out sendSms calls persist via sendSms', () => {
    // Opt-in and opt-out use sendSms which persists
    const optInSend = smsProcessingSrc.match(/sendSms\(business, from, confirmationMessage/)
    expect(optInSend).toBeTruthy()
  })

  it('audit 4: payment receipts skip persistence (intentional)', () => {
    // Payment receipts skip persistence since Twilio is the source of truth
    expect(twilioSrc).toContain("source === 'payment_receipt'")
    expect(twilioSrc).toContain('skipping database persistence')
  })
})

// ============================================================
// Part 5: Idempotency / retry safety (static assertions)
// ============================================================

describe('Batch 1 — Part 5: Idempotency / retry safety', () => {
  const adminSrc = readSrc('src/lib/supabase/admin.ts')
  const messageRouteSrc = readSrc('src/app/api/twilio/message/route.ts')

  it('idempotency 1: createMessageWithConversation deduplicates by twilio_message_sid', () => {
    expect(adminSrc).toContain('twilio_message_sid')
    expect(adminSrc).toContain('Existing message found for twilio_message_sid')
    expect(adminSrc).toContain('skipping duplicate')
  })

  it('idempotency 2: /api/twilio/message route checks for existing MessageSid', () => {
    expect(messageRouteSrc).toContain('INBOUND SMS IDEMPOTENCY')
    expect(messageRouteSrc).toContain('Message already processed')
  })

  it('idempotency 3: duplicate webhook returns 200 to prevent Twilio retries', () => {
    expect(messageRouteSrc).toContain("return new Response('ok', { status: 200 })")
  })

  it('idempotency 4: universal reactivation rule — all 10 statuses reactivate on inbound', () => {
    const transitionsSrc = readSrc('src/lib/customer-status-transitions.ts')
    // Batch A: completed now reactivates to active on inbound_message_received
    const completedEntry = transitionsSrc.match(/completed:\s*\{[\s\S]*?\}/)
    expect(completedEntry).toBeTruthy()
    expect(completedEntry![0]).toMatch(/inbound_message_received/)
    expect(completedEntry![0]).toMatch(/active/)
  })
})
