import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getMonotonicMessageStatus } from '@/lib/twilio/status-monotonic'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

// ---------- Part 1: Follow-up SMS lifecycle + status truth (cases 1-12) ----------

describe('Batch 1 — Part 1: SMS status classifier truth', () => {
  const pageClient = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

  it('case 1: accepted is NOT classified as failure UI', () => {
    // getStatusText must have an explicit 'accepted' case that is NOT 'Failed'
    const acceptedMatch = pageClient.match(/function getStatusText[\s\S]*?case 'accepted':\s*\n\s*return '([^']+)'/)
    expect(acceptedMatch).toBeTruthy()
    expect(acceptedMatch![1]).not.toBe('Failed')
    expect(acceptedMatch![1]).not.toBe('Undelivered')
  })

  it('case 2: queued is NOT classified as failure UI', () => {
    const queuedMatch = pageClient.match(/function getStatusText[\s\S]*?case 'queued':\s*\n\s*return '([^']+)'/)
    expect(queuedMatch).toBeTruthy()
    expect(queuedMatch![1]).not.toBe('Failed')
    expect(queuedMatch![1]).not.toBe('Undelivered')
  })

  it('case 3: sending is NOT classified as failure UI', () => {
    const sendingMatch = pageClient.match(/function getStatusText[\s\S]*?case 'sending':\s*\n\s*return '([^']+)'/)
    expect(sendingMatch).toBeTruthy()
    expect(sendingMatch![1]).not.toBe('Failed')
  })

  it('case 4: sent is NOT classified as failure UI', () => {
    const sentMatch = pageClient.match(/function getStatusText[\s\S]*?case 'sent':\s*\n\s*return '([^']+)'/)
    expect(sentMatch).toBeTruthy()
    expect(sentMatch![1]).not.toBe('Failed')
    expect(sentMatch![1]).not.toBe('Undelivered')
  })

  it('case 5: delivered is success', () => {
    const deliveredMatch = pageClient.match(/function getStatusText[\s\S]*?case 'delivered':\s*\n\s*return '([^']+)'/)
    expect(deliveredMatch).toBeTruthy()
    expect(deliveredMatch![1]).toBe('Delivered')
  })

  it('case 6: undelivered is failure', () => {
    const undeliveredMatch = pageClient.match(/function getStatusText[\s\S]*?case 'undelivered':\s*\n\s*return '([^']+)'/)
    expect(undeliveredMatch).toBeTruthy()
    expect(undeliveredMatch![1]).toBe('Undelivered')
  })

  it('case 7: failed is failure', () => {
    const failedMatch = pageClient.match(/function getStatusText[\s\S]*?case 'failed':\s*\n\s*return '([^']+)'/)
    expect(failedMatch).toBeTruthy()
    expect(failedMatch![1]).toBe('Failed')
  })

  it('accepted/queued/sending share the same non-failure color (blue)', () => {
    // All three should use the blue color scheme, not red/amber
    const acceptedColorMatch = pageClient.match(/function getStatusColor[\s\S]*?case 'accepted':\s*\n\s*return 'bg-blue-100/)
    const queuedColorMatch = pageClient.match(/function getStatusColor[\s\S]*?case 'queued':\s*\n\s*return 'bg-blue-100/)
    const sendingColorMatch = pageClient.match(/function getStatusColor[\s\S]*?case 'sending':\s*\n\s*return 'bg-blue-100/)
    expect(acceptedColorMatch).toBeTruthy()
    expect(queuedColorMatch).toBeTruthy()
    expect(sendingColorMatch).toBeTruthy()
  })
})

describe('Batch 1 — Part 1: Monotonic status reconciliation', () => {
  it('case 9: stale accepted callback cannot regress delivered', () => {
    expect(getMonotonicMessageStatus('delivered', 'accepted')).toBe('delivered')
  })

  it('case 9b: stale queued callback cannot regress sent', () => {
    expect(getMonotonicMessageStatus('sent', 'queued')).toBe('sent')
  })

  it('case 9c: stale accepted callback cannot regress sent', () => {
    // accepted → sent is allowed (forward), but sent → accepted is rejected
    expect(getMonotonicMessageStatus('sent', 'accepted')).toBe('sent')
  })

  it('case 9d: delivered cannot regress to any progress state', () => {
    expect(getMonotonicMessageStatus('delivered', 'accepted')).toBe('delivered')
    expect(getMonotonicMessageStatus('delivered', 'queued')).toBe('delivered')
    expect(getMonotonicMessageStatus('delivered', 'sending')).toBe('delivered')
    expect(getMonotonicMessageStatus('delivered', 'sent')).toBe('delivered')
  })

  it('case 9e: failure terminals cannot regress to progress states', () => {
    expect(getMonotonicMessageStatus('failed', 'accepted')).toBe('failed')
    expect(getMonotonicMessageStatus('failed', 'queued')).toBe('failed')
    expect(getMonotonicMessageStatus('undelivered', 'sent')).toBe('undelivered')
    expect(getMonotonicMessageStatus('undelivered', 'queued')).toBe('undelivered')
  })

  it('case 10: NULL conversation_id does not affect callback lookup (lookup is by SID)', () => {
    const callbackSrc = readSrc('src/app/api/twilio/message-status/route.ts')
    // The callback must look up by twilio_message_sid, not conversation_id
    expect(callbackSrc).toContain(".eq('twilio_message_sid', MessageSid)")
    expect(callbackSrc).not.toMatch(/\.eq\('conversation_id'/)
  })

  it('case 11: realtime/fetch merge preserves newest authoritative status', () => {
    // Forward transitions must be accepted
    expect(getMonotonicMessageStatus('accepted', 'sent')).toBe('sent')
    expect(getMonotonicMessageStatus('queued', 'delivered')).toBe('delivered')
    expect(getMonotonicMessageStatus('accepted', 'failed')).toBe('failed')
    expect(getMonotonicMessageStatus('accepted', 'undelivered')).toBe('undelivered')
  })

  it('SMS transition model: accepted → queued allowed', () => {
    expect(getMonotonicMessageStatus('accepted', 'queued')).toBe('queued')
  })

  it('SMS transition model: queued → sending allowed', () => {
    expect(getMonotonicMessageStatus('queued', 'sending')).toBe('sending')
  })

  it('SMS transition model: sending → sent allowed', () => {
    expect(getMonotonicMessageStatus('sending', 'sent')).toBe('sent')
  })

  it('SMS transition model: queued → sent allowed (missing intermediate)', () => {
    expect(getMonotonicMessageStatus('queued', 'sent')).toBe('sent')
  })

  it('SMS transition model: accepted → sent allowed (missing intermediate)', () => {
    expect(getMonotonicMessageStatus('accepted', 'sent')).toBe('sent')
  })

  it('SMS transition model: sent → delivered allowed', () => {
    expect(getMonotonicMessageStatus('sent', 'delivered')).toBe('delivered')
  })

  it('SMS transition model: sent → undelivered allowed', () => {
    expect(getMonotonicMessageStatus('sent', 'undelivered')).toBe('undelivered')
  })

  it('SMS transition model: valid progress → failed allowed', () => {
    expect(getMonotonicMessageStatus('accepted', 'failed')).toBe('failed')
    expect(getMonotonicMessageStatus('queued', 'failed')).toBe('failed')
    expect(getMonotonicMessageStatus('sending', 'failed')).toBe('failed')
    expect(getMonotonicMessageStatus('sent', 'failed')).toBe('failed')
  })

  it('SMS transition model: delivered → late failed ignored', () => {
    expect(getMonotonicMessageStatus('delivered', 'failed')).toBe('delivered')
  })

  it('SMS transition model: delivered → late undelivered ignored', () => {
    expect(getMonotonicMessageStatus('delivered', 'undelivered')).toBe('delivered')
  })

  it('SMS transition model: failed → late sent ignored', () => {
    expect(getMonotonicMessageStatus('failed', 'sent')).toBe('failed')
  })

  it('SMS transition model: undelivered → late delivered ignored', () => {
    expect(getMonotonicMessageStatus('undelivered', 'delivered')).toBe('undelivered')
  })

  it('SMS transition model: duplicate terminal callback idempotent', () => {
    expect(getMonotonicMessageStatus('failed', 'failed')).toBe('failed')
    expect(getMonotonicMessageStatus('undelivered', 'undelivered')).toBe('undelivered')
    expect(getMonotonicMessageStatus('delivered', 'delivered')).toBe('delivered')
  })

  it('SMS transition model: not_sent cannot overwrite Twilio terminal result', () => {
    expect(getMonotonicMessageStatus('delivered', 'not_sent')).toBe('delivered')
    expect(getMonotonicMessageStatus('failed', 'not_sent')).toBe('failed')
    expect(getMonotonicMessageStatus('undelivered', 'not_sent')).toBe('undelivered')
  })

  it('SMS transition model: not_sent → real Twilio status allowed', () => {
    expect(getMonotonicMessageStatus('not_sent', 'delivered')).toBe('delivered')
    expect(getMonotonicMessageStatus('not_sent', 'failed')).toBe('failed')
    expect(getMonotonicMessageStatus('not_sent', 'sent')).toBe('sent')
  })

  it('case 12: retry link appears only for true failure (failed/undelivered)', () => {
    const desktopList = readSrc('src/components/DesktopConversationMessageList.tsx')
    // hasError must be gated on failed/undelivered only
    expect(desktopList).toContain("msg.status === 'undelivered' || msg.status === 'failed'")
    // accepted/queued/sending/sent must NOT appear in hasError
    const hasErrorMatch = desktopList.match(/const hasError = ([^\n]+)/)
    expect(hasErrorMatch).toBeTruthy()
    expect(hasErrorMatch![1]).not.toContain('accepted')
    expect(hasErrorMatch![1]).not.toContain('queued')
    expect(hasErrorMatch![1]).not.toContain('sending')
    expect(hasErrorMatch![1]).not.toContain("'sent'")
  })

  it('case 12b: mobile retry link also gated on true failure only', () => {
    const mobileList = readSrc('src/components/MobileConversationMessageList.tsx')
    expect(mobileList).toContain("msg.status === 'undelivered' || msg.status === 'failed'")
  })
})

describe('Batch 1 — Part 1: Failure notification idempotency', () => {
  it('case 8: duplicate failure callback creates one notification (idempotency by messageSid)', () => {
    const notifSrc = readSrc('src/lib/notifications-server.ts')
    // sms_failed must use messageSid for idempotency key
    expect(notifSrc).toContain("data.messageSid && type === 'sms_failed'")
    expect(notifSrc).toContain("idempotencyKey = `sms_${data.messageSid}`")
    // Atomic idempotency must be enabled for sms_failed
    expect(notifSrc).toContain('useAtomicIdempotency = true')
  })

  it('case 8b: callback creates notification only for failed/undelivered', () => {
    const callbackSrc = readSrc('src/app/api/twilio/message-status/route.ts')
    // Notification creation must be gated on failed/undelivered
    expect(callbackSrc).toContain("MessageStatus === 'failed' || MessageStatus === 'undelivered'")
    expect(callbackSrc).toContain('notifySmsFailed')
  })

  it('case 8c: callback rejects stale/backwards status before mutating', () => {
    const callbackSrc = readSrc('src/app/api/twilio/message-status/route.ts')
    // Must use getMonotonicMessageStatus and reject if it differs from incoming
    expect(callbackSrc).toContain('getMonotonicMessageStatus')
    expect(callbackSrc).toContain('monotonicStatus !== incomingStatusRaw')
  })
})

describe('Batch 1 — Part 1: send-followups truthiness check', () => {
  it('cron checks messageSid.sid, not the object truthiness', () => {
    const cronSrc = readSrc('src/app/api/cron/send-followups/route.ts')
    // The fix: check messageSid.sid, not just messageSid
    expect(cronSrc).toContain('!messageSid || !messageSid.sid')
    // The old buggy check must be gone
    expect(cronSrc).not.toMatch(/if \(!messageSid\) \{[\s\S]*?AUTO RESPONSE MESSAGE INSERT ERROR/)
  })
})

// ---------- Part 2: No-phone send validation (cases 13-16) ----------

describe('Batch 1 — Part 2: No-phone send validation', () => {
  const pageClient = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

  it('case 13: no phone + text send — no API call, draft preserved, error shown', () => {
    // handleSendMessage must gate on hasPhoneNumber before any API call
    expect(pageClient).toContain("if (!hasPhoneNumber(leadData?.caller_phone))")
    // Must set composerError (visible at composer level) not just infoMessage
    expect(pageClient).toContain('setComposerError')
    // Must return before setMessage('') so draft is preserved
    const gateMatch = pageClient.match(/const handleSendMessage = async[\s\S]*?if \(!hasPhoneNumber\(leadData\?\.caller_phone\)\) \{[\s\S]*?return[\s\S]*?\}/)
    expect(gateMatch).toBeTruthy()
    expect(gateMatch![0]).toContain('setComposerError')
    expect(gateMatch![0]).toContain('return')
    // setMessage('') must NOT be in the gate block
    expect(gateMatch![0]).not.toContain("setMessage('')")
  })

  it('case 13b: no-phone send uses exactly ONE error presentation (composerError only)', () => {
    // The no-phone gate must NOT set infoMessage (which would render a second
    // InfoBanner at the top level). Only composerError (inline near composer).
    const gateMatch = pageClient.match(/const handleSendMessage = async[\s\S]*?if \(!hasPhoneNumber\(leadData\?\.caller_phone\)\) \{[\s\S]*?return[\s\S]*?\}/)
    expect(gateMatch).toBeTruthy()
    expect(gateMatch![0]).not.toContain('setInfoMessage')
    expect(gateMatch![0]).toContain('setComposerError')
  })

  it('case 14: no phone + attachment send — no API call, state preserved, error shown', () => {
    // The gate is before mediaFiles/isMMS check, so attachments are also blocked
    const gateMatch = pageClient.match(/const handleSendMessage = async[\s\S]*?if \(!hasPhoneNumber\(leadData\?\.caller_phone\)\) \{[\s\S]*?return[\s\S]*?\}/)
    expect(gateMatch).toBeTruthy()
    // The gate must be before the mediaFiles line
    const handleSendIndex = pageClient.indexOf('const handleSendMessage = async')
    const gateIndex = pageClient.indexOf("if (!hasPhoneNumber(leadData?.caller_phone))", handleSendIndex)
    const mediaFilesIndex = pageClient.indexOf('const mediaFiles = Array.isArray(e)')
    expect(gateIndex).toBeLessThan(mediaFilesIndex)
  })

  it('case 15: valid phone — existing send path unchanged', () => {
    // The send path (optimistic message, API call) must still exist after the gate
    const gateEnd = pageClient.indexOf("if (!hasPhoneNumber(leadData?.caller_phone))")
    const afterGate = pageClient.slice(gateEnd)
    expect(afterGate).toContain('optimisticMsg')
    expect(afterGate).toContain('clientMessageId')
    expect(afterGate).toContain('setLeadData')
  })

  it('case 16: rapid taps — no duplicate/spam API calls', () => {
    // handleSendMessage must check `sending` early to prevent rapid taps
    const handleSendMatch = pageClient.match(/const handleSendMessage = async[\s\S]*?if \(sending\) return/)
    expect(handleSendMatch).toBeTruthy()
    // The sending check must be before any API call or optimistic creation
    const sendingCheckIndex = pageClient.indexOf('if (sending) return')
    const optimisticIndex = pageClient.indexOf('optimisticMsg')
    expect(sendingCheckIndex).toBeLessThan(optimisticIndex)
  })

  it('composerError is rendered inline near the composer (desktop)', () => {
    // The composer error banner must be rendered near ConversationComposer
    expect(pageClient).toContain('composerError')
    expect(pageClient).toMatch(/composerError && \([\s\S]*?ConversationComposer|composerError[\s\S]*?ConversationComposer/)
  })

  it('composerError is rendered inline near the composer (mobile inline)', () => {
    const pageClient2 = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    // Mobile inline composer must also show composerError
    const composerErrorCount = (pageClient2.match(/composerError && \(/g) || []).length
    expect(composerErrorCount).toBeGreaterThanOrEqual(2) // desktop + mobile
  })
})

// ---------- Part 3: Customer name reconciliation (cases 17-22) ----------

describe('Batch 1 — Part 3: Customer name reconciliation', () => {
  const leadsPage = readSrc('src/app/dashboard/leads/page.tsx')

  it('case 17/18: list query selects contact_name so preview updates', () => {
    // The query must include contact_name
    expect(leadsPage).toContain('contact_name')
  })

  it('case 19: rename twice — latest wins (normalization prefers contact_name)', () => {
    // name normalization must prefer contact_name over extracted_info
    expect(leadsPage).toMatch(/name: lead\.contact_name \?\?/)
  })

  it('case 20/21: realtime merge preserves contact_name updates', () => {
    // Realtime callback must merge updatedLead fields (including contact_name)
    expect(leadsPage).toContain('{ ...lead, ...updatedLead }')
  })

  it('case 20b: realtime UPDATE recomputes derived name via normalizeLead', () => {
    // The realtime UPDATE handler must call normalizeLead on the merged row
    // so the client-computed `name` field is recomputed from contact_name.
    expect(leadsPage).toMatch(/normalizeLead\(\{ \.\.\.lead, \.\.\.updatedLead \}\)/)
  })

  it('case 20c: normalizeLead is the single source of truth for derived fields', () => {
    // normalizeLead must recompute name from contact_name
    expect(leadsPage).toMatch(/function normalizeLead\(lead: any\): any/)
    expect(leadsPage).toMatch(/name: lead\.contact_name \?\? lead\.raw_metadata\?\.extracted_info\?\.callerName \?\? null/)
  })

  it('case 20d: stale in-flight fetch cannot overwrite newer realtime edit', () => {
    // fetchLeads must capture a generation and check it before applying results
    expect(leadsPage).toContain('fetchGenerationRef')
    expect(leadsPage).toContain('const myGeneration = ++fetchGenerationRef.current')
    expect(leadsPage).toContain('myGeneration !== fetchGenerationRef.current')
    // Realtime UPDATE must bump the generation so stale fetch discards results
    expect(leadsPage).toMatch(/fetchGenerationRef\.current\+\+[\s\S]*?normalizeLead\(\{ \.\.\.lead, \.\.\.updatedLead \}\)/)
  })

  it('case 22: no duplicate card — mergeDuplicateLeads is called', () => {
    // Realtime callback must deduplicate
    expect(leadsPage).toContain('mergeDuplicateLeads')
  })

  it('detail page edit-customer callback triggers refresh', () => {
    const pageClient = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    // EditCustomerModal onCustomerUpdated must call handleRefresh
    expect(pageClient).toMatch(/onCustomerUpdated=\{async \(\) => \{[\s\S]*?handleRefresh/)
  })
})

// ---------- Part 4: Silent background refresh (cases 23-28) ----------

describe('Batch 1 — Part 4: Silent background refresh', () => {
  const pageClient = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

  it('case 23/24: background refresh leaves manual label "Refresh" (manualRefreshing state exists)', () => {
    expect(pageClient).toContain('manualRefreshing')
    expect(pageClient).toContain('setManualRefreshing')
  })

  it('case 23: realtime lead update refresh is silent', () => {
    expect(pageClient).toContain("handleRefresh({ silent: true })")
    // The realtime lead update caller must use silent
    const realtimeUpdate = pageClient.match(/REALTIME LEAD UPDATE[\s\S]*?handleRefresh\(\{ silent: true \}\)/)
    expect(realtimeUpdate).toBeTruthy()
  })

  it('case 24: channel error/closed/timedout recovery is silent', () => {
    const channelErrorBlock = pageClient.match(/CHANNEL_ERROR[\s\S]*?handleRefresh\(\{ silent: true \}\)/)
    const closedBlock = pageClient.match(/CLOSED[\s\S]*?handleRefresh\(\{ silent: true \}\)/)
    const timedOutBlock = pageClient.match(/TIMED_OUT[\s\S]*?handleRefresh\(\{ silent: true \}\)/)
    expect(channelErrorBlock).toBeTruthy()
    expect(closedBlock).toBeTruthy()
    expect(timedOutBlock).toBeTruthy()
  })

  it('case 24b: stuck message polling is silent', () => {
    const stuckBlock = pageClient.match(/STUCK MESSAGE CHECK[\s\S]*?handleRefresh\(\{ silent: true \}\)/)
    expect(stuckBlock).toBeTruthy()
  })

  it('case 25: explicit tap shows "Refreshing…" (manualRefreshing drives label)', () => {
    // The label must use manualRefreshing, not refreshing
    expect(pageClient).toContain("manualRefreshing ? 'Refreshing…'")
    expect(pageClient).toContain("manualRefreshing ? 'Refreshing'")
  })

  it('case 25b: spinner uses manualRefreshing', () => {
    expect(pageClient).toContain("manualRefreshing ? 'animate-spin'")
  })

  it('case 26: manual success returns to "Refresh" (refreshMessage cleared)', () => {
    // handleRefresh without silent must set refreshMessage to 'Refreshed' then clear
    expect(pageClient).toContain("setRefreshMessage('Refreshed')")
    expect(pageClient).toContain("setRefreshMessage('')")
  })

  it('case 27: manual failure presents "Refresh failed"', () => {
    expect(pageClient).toContain("setRefreshMessage('Refresh failed')")
  })

  it('case 28: silent refresh does NOT set manualRefreshing or refreshMessage', () => {
    // handleRefresh must accept { silent } option
    expect(pageClient).toContain('options?: { silent?: boolean }')
    expect(pageClient).toContain("const silent = options?.silent ?? false")
    // silent path must NOT set manualRefreshing
    const silentGuardMatch = pageClient.match(/if \(!silent\) \{[\s\S]*?setManualRefreshing\(true\)/)
    expect(silentGuardMatch).toBeTruthy()
    // silent path must NOT set refreshMessage
    const silentRefreshMsgMatch = pageClient.match(/if \(!silent\) \{[\s\S]*?setRefreshMessage\('Refreshed'\)/)
    expect(silentRefreshMsgMatch).toBeTruthy()
  })

  it('case 28b: manual control disabled only during MANUAL refresh (not background)', () => {
    // disabled={manualRefreshing} — background refresh must NOT disable the
    // manual control. Only a manual refresh in progress disables the button.
    expect(pageClient).toContain('disabled={manualRefreshing}')
    // The old disabled={refreshing} must be gone from refresh controls
    expect(pageClient).not.toContain('disabled={refreshing}')
  })

  it('case 28c: manual tap during background refresh is allowed (not silently ignored)', () => {
    // handleRefresh dedup: manual refresh blocked only by manualRefreshing,
    // not by refreshing (which tracks background too).
    expect(pageClient).toContain('!silent && manualRefreshing')
    expect(pageClient).toContain('silent && refreshing')
  })
})

describe('Batch 1 — Part 4: Customers list silent initial load', () => {
  const leadsPage = readSrc('src/app/dashboard/leads/page.tsx')

  it('list page has manualRefreshing state', () => {
    expect(leadsPage).toContain('manualRefreshing')
    expect(leadsPage).toContain('setManualRefreshing')
  })

  it('list page fetchLeads accepts silent option', () => {
    expect(leadsPage).toContain('options?: { silent?: boolean }')
    expect(leadsPage).toContain("const silent = options?.silent ?? false")
  })

  it('initial mount useEffect calls fetchLeads with silent: true', () => {
    expect(leadsPage).toContain('fetchLeads({ silent: true })')
  })

  it('refresh button spinner uses manualRefreshing', () => {
    expect(leadsPage).toContain('{manualRefreshing ? (')
  })

  it('list page refresh button disabled only during MANUAL refresh', () => {
    // disabled={loading || manualRefreshing} — background refresh must NOT
    // disable the manual control.
    expect(leadsPage).toContain('disabled={loading || manualRefreshing}')
    expect(leadsPage).not.toContain('disabled={loading || refreshing}')
  })
})
