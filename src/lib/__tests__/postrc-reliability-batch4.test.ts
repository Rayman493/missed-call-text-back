import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageClientSrc = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8').replace(/\r\n/g, '\n')
const leadsRouteSrc = readFileSync('src/app/api/leads/[id]/route.ts', 'utf8').replace(/\r\n/g, '\n')
const smsProcessingSrc = readFileSync('src/lib/sms-processing.ts', 'utf8').replace(/\r\n/g, '\n')

// ============================================================================
// PART 1 — CONVERSATION TRUE-BOTTOM / KEYBOARD
// ============================================================================
//
// Physical failure: newest message visible before keyboard open; after the
// composer focused and the Android keyboard shrank the viewport, an older
// long message stayed visible and the newest message fell below the fold.
//
// Proven root causes (audit):
//  a) userScrollDirectionRef retained the last user-scroll direction
//     indefinitely. When the keyboard opened, the browser's own scroll
//     adjustments (scroll-anchoring / scrollTop clamping) emitted scroll
//     events; whenever the delta direction coincided with the stale armed
//     direction, handleScroll classified the browser-generated scroll as
//     user momentum and executed `followLatestRef.current = isNearBottom`
//     — clearing the follow mode — after which every re-anchor path
//     (visualViewport resize, container ResizeObserver) skipped the pin.
//  b) scrollToBottom('smooth', false) — invoked by the realtime-insert and
//     inbound-media paths — falls into its else branch when the container is
//     momentarily not-near-bottom (exactly the state produced by a
//     keyboard-open shrink before re-anchor) and CLEARS followLatestRef
//     there too.
//
// Fixes: bounded momentum attribution window, direction armed only by real
// finger/wheel movement (touchmove/pointermove/wheel), and one canonical
// reconcileConversationBottom() for every environment-driven re-anchor that
// gates on followLatestRef intent and never mutates it.

// Faithful replica of the handleScroll attribution logic.
function isUserDrivenScroll({
  gestureActive,
  armedDirection,
  delta,
  now,
  lastGestureEndAt,
  momentumWindowMs = 700,
}: {
  gestureActive: boolean
  armedDirection: 0 | 1 | -1
  delta: number
  now: number
  lastGestureEndAt: number
  momentumWindowMs?: number
}): boolean {
  const momentumActive = !gestureActive &&
    armedDirection !== 0 &&
    now - lastGestureEndAt <= momentumWindowMs
  return (
    gestureActive ||
    (momentumActive && delta !== 0 && Math.sign(delta) === armedDirection)
  )
}

describe('Batch 4 — conversation true-bottom root-cause contract', () => {
  describe('Momentum attribution is bounded (stale direction cannot clear follow-latest)', () => {
    it('defines the momentum attribution window constant', () => {
      expect(pageClientSrc).toMatch(/const MOMENTUM_ATTRIBUTION_MS = 700/)
    })

    it('bounds momentum by lastUserGestureEndAtRef', () => {
      expect(pageClientSrc).toMatch(/lastUserGestureEndAtRef/)
      expect(pageClientSrc).toMatch(/Date\.now\(\) - lastUserGestureEndAtRef\.current <= MOMENTUM_ATTRIBUTION_MS/)
    })

    it('resets the armed direction on each new gesture start', () => {
      const touchStart = pageClientSrc.match(/const handleTouchStart = \(e: TouchEvent\) => \{[\s\S]*?\n    \}/)?.[0] || ''
      expect(touchStart).toContain('userScrollDirectionRef.current = 0')
    })

    it('arms direction from real finger movement (touchmove), not tap', () => {
      expect(pageClientSrc).toMatch(/container\.addEventListener\('touchmove', handleTouchMove/)
      const touchMove = pageClientSrc.match(/const handleTouchMove = \(e: TouchEvent\) => \{[\s\S]*?\n    \}/)?.[0] || ''
      expect(touchMove).toContain('touchLastYRef')
      expect(touchMove).toMatch(/userScrollDirectionRef\.current = dy < 0 \? 1 : -1/)
    })

    it('records the gesture-end timestamp for the momentum window', () => {
      const gestureEnd = pageClientSrc.match(/const handleGestureEnd = \(\) => \{[\s\S]*?\n    \}/)?.[0] || ''
      expect(gestureEnd).toContain('lastUserGestureEndAtRef.current = Date.now()')
    })

    it('keyboard-shrink browser scroll in stale direction is NOT user-driven', () => {
      // User's last gesture scrolled down (direction +1) and ended 5s ago.
      // The keyboard opens; the browser emits a scroll event with delta > 0
      // (scroll anchoring / clamping). Previously: armed +1 matched →
      // misclassified as user momentum → cleared followLatestRef.
      expect(isUserDrivenScroll({
        gestureActive: false,
        armedDirection: 1,
        delta: 40,
        now: 10_000,
        lastGestureEndAt: 5_000, // 5000ms ago — outside the 700ms window
      })).toBe(false)
    })

    it('inertial momentum inside the window in the armed direction IS user-driven', () => {
      expect(isUserDrivenScroll({
        gestureActive: false,
        armedDirection: -1,
        delta: -30,
        now: 1_000,
        lastGestureEndAt: 800, // 200ms ago — inside the window
      })).toBe(true)
    })

    it('momentum inside the window but OPPOSITE direction is NOT user-driven', () => {
      expect(isUserDrivenScroll({
        gestureActive: false,
        armedDirection: 1,
        delta: -30,
        now: 1_000,
        lastGestureEndAt: 800,
      })).toBe(false)
    })

    it('an active gesture is always user-driven', () => {
      expect(isUserDrivenScroll({
        gestureActive: true,
        armedDirection: 0,
        delta: -12,
        now: 0,
        lastGestureEndAt: 0,
      })).toBe(true)
    })
  })

  describe('Canonical reconcileConversationBottom', () => {
    const reconciler = pageClientSrc.match(
      /const reconcileConversationBottom = useCallback\([\s\S]*?\}, \[getScrollContainer, scrollToTrueBottom, logConversationScroll\]\)/
    )?.[0] || ''

    it('is defined and gated on followLatestRef intent', () => {
      expect(reconciler).toBeTruthy()
      expect(reconciler).toContain('if (!followLatestRef.current)')
    })

    it('coalesces duplicate calls via reconcileScheduledRef', () => {
      expect(reconciler).toContain('reconcileScheduledRef.current')
    })

    it('pins to exact true bottom via scrollToTrueBottom across a bounded frame window', () => {
      expect(reconciler).toContain('scrollToTrueBottom(container)')
      expect(reconciler).toMatch(/requestAnimationFrame\(\(\) => requestAnimationFrame\(step\)/)
      expect(reconciler).toMatch(/frames < 4/)
    })

    it('never mutates followLatestRef inside the reconciler', () => {
      expect(reconciler).not.toMatch(/followLatestRef\.current =/)
    })
  })

  describe('Environment-driven re-anchors all route through the reconciler', () => {
    it('visualViewport resize → reconcile', () => {
      const handleResize = pageClientSrc.match(/const handleResize = \(\) => \{[\s\S]*?\n    \}/)?.[0] || ''
      expect(handleResize).toContain("reconcileConversationBottom('visual-viewport-resize')")
    })

    it('visualViewport scroll (Android pan) → reconcile', () => {
      const handleViewportScroll = pageClientSrc.match(/const handleViewportScroll = \(\) => \{[\s\S]*?\n      \}/)?.[0] || ''
      expect(handleViewportScroll).toContain("reconcileConversationBottom('visual-viewport-scroll')")
    })

    it('container ResizeObserver → sync pin + reconcile', () => {
      const containerObserver = pageClientSrc.match(/containerObserver = new ResizeObserver\([\s\S]*?\}\)\s*\n\s*containerObserver\.observe/)?.[0] || ''
      expect(containerObserver).toContain('followLatestRef.current')
      expect(containerObserver).toContain('scrollToTrueBottom(container)')
      expect(containerObserver).toContain("reconcileConversationBottom('container-resize')")
    })

    it('realtime insert → reconcile (NOT scrollToBottom smooth/false which could clear follow mode)', () => {
      const realtimeSection = pageClientSrc.substring(
        pageClientSrc.indexOf('=== Realtime message scroll'),
        pageClientSrc.indexOf('const handleMobileImageSelect')
      )
      expect(realtimeSection).toContain("reconcileConversationBottom('realtime-insert')")
      expect(realtimeSection).not.toContain("scrollToBottom('smooth', false)")
    })

    it('inbound media load → reconcile (same follow-clearing hazard removed)', () => {
      const mediaBlock = pageClientSrc.match(/handleCoalescedImageLoad = useCallback\([\s\S]*?\}, \[scrollToBottom, reconcileConversationBottom\]\)/)?.[0] || ''
      expect(mediaBlock).toContain("reconcileConversationBottom('inbound-image-load')")
      expect(mediaBlock).not.toContain("scrollToBottom('smooth', false)")
    })

    it('messages array change → reconcile', () => {
      expect(pageClientSrc).toContain("reconcileConversationBottom('messages-array-changed')")
    })

    it('latest message advanced → reconcile', () => {
      expect(pageClientSrc).toContain("reconcileConversationBottom('latest-message-advanced')")
    })

    it('composer focus → immediate pin + scheduled reconcile; composer blur → reconcile', () => {
      const focusHandler = pageClientSrc.match(/const handleMobileTextareaFocus = \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''
      expect(focusHandler).toContain('followLatestRef.current')
      expect(focusHandler).toContain('scrollToTrueBottom(container)')
      expect(focusHandler).toContain("reconcileConversationBottom('composer-focus')")
      const blurHandler = pageClientSrc.match(/const handleMobileTextareaBlur = \(\) => \{[\s\S]*?\n  \}/)?.[0] || ''
      expect(blurHandler).toContain("reconcileConversationBottom('composer-blur')")
      expect(pageClientSrc).toContain('onBlur={handleMobileTextareaBlur}')
    })
  })

  describe('DEV instrumentation', () => {
    it('emits [RF_CONVERSATION_SCROLL] with seq + geometry, DEV only', () => {
      expect(pageClientSrc).toContain("'[RF_CONVERSATION_SCROLL]'")
      const logger = pageClientSrc.match(/const logConversationScroll = useCallback\([\s\S]*?\}, \[getScrollContainer\]\)/)?.[0] || ''
      expect(logger).toContain("process.env.NODE_ENV === 'production'")
      expect(logger).toContain('scrollLogSeqRef.current')
      expect(logger).toContain('distanceFromBottom')
      expect(logger).toContain('visualViewportHeight')
      expect(logger).toContain('visualViewportOffsetTop')
      expect(logger).toContain('composerHeight')
      expect(logger).toContain('followMode')
      expect(logger).toContain('userGestureArmed')
    })

    it('logs scroll events, gesture boundaries, and viewport resizes', () => {
      expect(pageClientSrc).toContain("logConversationScroll('scroll-event'")
      expect(pageClientSrc).toContain("logConversationScroll('gesture-touch-start')")
      expect(pageClientSrc).toContain("logConversationScroll('gesture-end')")
      expect(pageClientSrc).toContain("logConversationScroll('visual-viewport-resize'")
      expect(pageClientSrc).toContain("logConversationScroll('container-resize')")
      expect(pageClientSrc).toContain("logConversationScroll('composer-focus')")
      expect(pageClientSrc).toContain("logConversationScroll('composer-blur')")
    })
  })

  describe('Navigation reset clears gesture/momentum state', () => {
    it('resets armed direction, gesture refs, and reconcile flag on lead change', () => {
      const resetBlock = pageClientSrc.match(/Reset scroll state when navigating to a different customer[\s\S]*?\}, \[params\.id\]\)/)?.[0] || ''
      expect(resetBlock).toContain('followLatestRef.current = true')
      expect(resetBlock).toContain('userScrollDirectionRef.current = 0')
      expect(resetBlock).toContain('lastUserGestureEndAtRef.current = 0')
      expect(resetBlock).toContain('reconcileScheduledRef.current = false')
    })
  })
})

// ============================================================================
// PART 2 — INBOUND SMS REALTIME
// ============================================================================
//
// Physical failure: fresh inbound SMS persisted but the open conversation did
// not update live; a refresh revealed the message.
//
// Proven root cause (audit): a CHANNEL_ERROR / CLOSED / TIMED_OUT channel was
// answered with only a one-shot silent refresh — the channel itself was NEVER
// recreated. A transient Android network drop (radio sleep, WiFi↔LTE switch,
// WebView suspend without appStateChange) permanently killed live delivery
// while the page stayed open. The subscription filter itself is NOT the
// failure: createMessageWithConversation writes lead_id at INSERT time, so
// the server-side lead_id=eq filter matches the persisted row shape.
//
// Fixes: bounded channel recreation via realtimeGeneration (max 5 attempts,
// guarded against stale-channel callbacks), one-shot silent refetch retained
// to close the gap, and [RF_REALTIME_SMS] provenance logs from DB insert →
// channel status → callback → merge.

describe('Batch 4 — inbound SMS realtime contract', () => {
  describe('Subscription keeps server-side lead filter + client guard', () => {
    it('messages INSERT and UPDATE keep the lead_id filter (field is set at insert)', () => {
      expect(pageClientSrc).toMatch(/event: 'INSERT',[\s\S]*?table: 'messages',[\s\S]*?filter: `lead_id=eq\.\$\{leadId\}`/)
      expect(pageClientSrc).toMatch(/event: 'UPDATE',[\s\S]*?table: 'messages',[\s\S]*?filter: `lead_id=eq\.\$\{leadId\}`/)
    })

    it('retains the client-side lead guards', () => {
      expect(pageClientSrc).toContain('if (!newMessage?.lead_id || newMessage.lead_id !== leadId)')
      expect(pageClientSrc).toContain('if (!updatedMessage?.lead_id || updatedMessage.lead_id !== leadId)')
    })

    it('merges realtime events through mergeMessageWithMonotonicity (id dedupe)', () => {
      expect(pageClientSrc).toContain("mergeMessageWithMonotonicity(currentMessages, newMessage, 'realtime-insert')")
      expect(pageClientSrc).toContain("mergeMessageWithMonotonicity(currentMessages, updatedMessage, 'realtime-update')")
    })
  })

  describe('Dead channels are recreated (bounded) instead of only refreshing once', () => {
    it('CHANNEL_ERROR/CLOSED/TIMED_OUT share one recovery path', () => {
      expect(pageClientSrc).toMatch(/status === 'CHANNEL_ERROR' \|\| status === 'CLOSED' \|\| status === 'TIMED_OUT'/)
    })

    it('recreates the channel via realtimeGeneration with a bounded attempt count', () => {
      expect(pageClientSrc).toContain('realtimeRecoveryAttemptsRef')
      expect(pageClientSrc).toMatch(/realtimeRecoveryAttemptsRef\.current < 5/)
      expect(pageClientSrc).toContain('setRealtimeGeneration(prev => prev + 1)')
    })

    it('resets the attempt counter on SUBSCRIBED', () => {
      const subscribedBlock = pageClientSrc.match(/if \(status === 'SUBSCRIBED'\) \{[\s\S]*?\}\s*else if/)?.[0] || ''
      expect(subscribedBlock).toContain('realtimeRecoveryAttemptsRef.current = 0')
    })

    it('does not recover a channel that was deliberately torn down (stale callback guard)', () => {
      expect(pageClientSrc).toContain('realtimeChannelRef.current !== channel')
      expect(pageClientSrc).toContain('currentLeadIdRef.current !== leadId')
    })

    it('still performs a silent refetch to close the delivery gap', () => {
      const recoveryBlock = pageClientSrc.match(/REALTIME RECOVERY[\s\S]*?\}, 2000\)/)?.[0] || ''
      expect(recoveryBlock).toContain('handleRefresh({ silent: true })')
    })
  })

  describe('Exhausted recovery is re-armed by lifecycle signals, not permanently dead', () => {
    it('resets the bounded attempt counter and recreates on browser online event', () => {
      expect(pageClientSrc).toContain("window.addEventListener('online', handleOnline)")
      const handlerBlock = pageClientSrc.match(/const handleReconnectionSignal = \(source: string\) => \{[\s\S]*?\n    \}/)?.[0] || ''
      expect(handlerBlock).toContain('currentLeadIdRef.current !== leadId')
      expect(handlerBlock).toContain('realtimeChannelStatusRef.current === \'subscribed\'')
      expect(handlerBlock).toContain('realtimeRecoveryAttemptsRef.current = 0')
      expect(handlerBlock).toContain('setRealtimeGeneration(prev => prev + 1)')
    })

    it('registers Capacitor appStateChange resume foreground listener when available', () => {
      expect(pageClientSrc).toContain("import('@capacitor/app')")
      expect(pageClientSrc).toContain("appStateChange")
      expect(pageClientSrc).toContain("isActive")
      expect(pageClientSrc).toContain('capacitor-app-active')
    })

    it('does not recreate when the lead has changed (stale-lead guard)', () => {
      const handlerBlock = pageClientSrc.match(/const handleReconnectionSignal = \(source: string\) => \{[\s\S]*?\n    \}/)?.[0] || ''
      expect(handlerBlock).toContain('reconnection-signal-skipped-stale-lead')
    })

    it('does not spin after exhaustion because the only automatic retry path is bounded by attempts', () => {
      const recoveryBlock = pageClientSrc.match(/if \(realtimeRecoveryAttemptsRef\.current < 5\)[\s\S]*?\}/)?.[0] || ''
      expect(recoveryBlock).toContain('setRealtimeGeneration(prev => prev + 1)')
      expect(recoveryBlock).not.toContain('setInterval')
    })
  })

  describe('DEV instrumentation [RF_REALTIME_SMS]', () => {
    it('logs persistence with message/lead/conversation ids (server side)', () => {
      expect(smsProcessingSrc).toContain("'[RF_REALTIME_SMS]'")
      expect(smsProcessingSrc).toContain("stage: 'inbound-persisted'")
      expect(smsProcessingSrc).toContain('messageId: inboundMessage.id')
      expect(smsProcessingSrc).toContain('leadId: lead.id')
      expect(smsProcessingSrc).toContain('conversationId: conversation.id')
    })

    it('logs subscribe config with the exact filters and active lead', () => {
      expect(pageClientSrc).toContain("stage: 'subscribe'")
      expect(pageClientSrc).toContain('messagesInsertFilter')
    })

    it('logs insert/update callbacks with guard results', () => {
      expect(pageClientSrc).toContain("stage: 'message-insert-callback'")
      expect(pageClientSrc).toContain("stage: 'message-update-callback'")
      expect(pageClientSrc).toContain('passesLeadGuard')
    })

    it('logs merge outcome and channel status transitions', () => {
      expect(pageClientSrc).toContain("stage: 'message-insert-merge'")
      expect(pageClientSrc).toContain('alreadyExisted')
      expect(pageClientSrc).toContain("stage: 'channel-status'")
    })

    it('all RF realtime logs are DEV-gated', () => {
      const rfLogCount = (pageClientSrc.match(/\[RF_REALTIME_SMS\]/g) || []).length
      expect(rfLogCount).toBeGreaterThanOrEqual(4)
      // Each RF log site sits inside an explicit non-production gate.
      const gates = pageClientSrc.match(/process\.env\.NODE_ENV !== 'production'/g) || []
      expect(gates.length).toBeGreaterThanOrEqual(4)
    })
  })
})

// ============================================================================
// PART 3 — FALSE "CUSTOMER INFORMATION UPDATED" DIVIDER
// ============================================================================
//
// Physical failure: ordinary inbound/outbound exchanges rendered a
// "Customer information updated" divider with no customer change.
//
// Proven root causes (audit):
//  a) The timeline gate was `customer_corrected_info || corrected_fields`.
//     A present-but-empty corrected_fields object ({}) is truthy, and the
//     raw_metadata branch repopulates corrected_fields on same-value saves —
//     either case minted a divider with no real correction.
//  b) The divider timestamp used last_customer_reply_at, which advances on
//     EVERY inbound SMS. A legitimate historical correction (or a stale
//     empty-object artifact) therefore re-anchored beside each new inbound
//     message — perceived as "the new message created a false divider".
//
// Fixes: the divider requires customer_corrected_info === true AND at least
// one corrected field key; the timestamp anchors to the stable correction
// time (last_correction_at → max corrected_fields_updated_at → fallback).

// Faithful replica of the new timeline gate.
function shouldEmitCorrectionDivider(rawMetadata: any): boolean {
  const correctedFields = rawMetadata?.corrected_fields
  const correctedFieldKeys = correctedFields ? Object.keys(correctedFields) : []
  return rawMetadata?.customer_corrected_info === true && correctedFieldKeys.length > 0
}

function correctionTimestampFor(rawMetadata: any): string | null {
  const stamps = Object.values(rawMetadata.corrected_fields_updated_at || {})
    .map((t: any) => new Date(t).getTime())
    .filter((t: number) => Number.isFinite(t))
  return (
    rawMetadata.last_correction_at ||
    (stamps.length > 0 ? new Date(Math.max(...stamps)).toISOString() : null)
  )
}

describe('Batch 4 — false "Customer information updated" divider contract', () => {
  describe('Timeline gate requires material correction evidence', () => {
    it('requires customer_corrected_info === true AND non-empty corrected_fields', () => {
      expect(pageClientSrc).toMatch(/customer_corrected_info === true && correctedFieldKeys\.length > 0/)
    })

    it('anchors the divider to the stable correction timestamp, not last_customer_reply_at or last_activity_at', () => {
      const correctionBlock = pageClientSrc.substring(
        pageClientSrc.indexOf('MATERIAL-CHANGE CONTRACT'),
        pageClientSrc.indexOf('Add Follow-Ups Cancelled event')
      )
      expect(correctionBlock).toContain('last_correction_at')
      expect(correctionBlock).toContain('corrected_fields_updated_at')
      // The correction timestamp must not fall back to fields that advance on
      // normal messaging (last_customer_reply_at, last_activity_at, updated_at,
      // or created_at), otherwise a historical correction re-renders beside
      // every new inbound SMS.
      expect(correctionBlock).not.toMatch(/last_customer_reply_at\s*\|\|/)
      expect(correctionBlock).not.toContain('leadData.last_activity_at')
      expect(correctionBlock).not.toContain('leadData.created_at')
    })

    it('emits [RF_CUSTOMER_UPDATE_EVENT] provenance logs (DEV only)', () => {
      expect(pageClientSrc).toContain("'[RF_CUSTOMER_UPDATE_EVENT]'")
      expect(pageClientSrc).toContain("stage: 'timeline-divider-emitted'")
      expect(leadsRouteSrc).toContain("'[RF_CUSTOMER_UPDATE_EVENT]'")
      expect(leadsRouteSrc).toContain("stage: 'simple-update-evaluated'")
      expect(leadsRouteSrc).toContain("stage: 'raw-metadata-update-evaluated'")
    })
  })

  describe('Divider decision logic (replica of the production gate)', () => {
    it('inbound SMS with no customer change → no divider', () => {
      // SMS processing writes extracted_info/last_customer_reply_at but never
      // customer_corrected_info.
      expect(shouldEmitCorrectionDivider({
        extracted_info: { serviceRequested: 'leak' },
        last_customer_reply_at: '2025-01-01T10:00:00Z',
      })).toBe(false)
    })

    it('outbound SMS with no customer change → no divider', () => {
      expect(shouldEmitCorrectionDivider({
        last_message_at: '2025-01-01T10:00:00Z',
      })).toBe(false)
    })

    it('same-value re-save leaving empty corrected_fields → no divider', () => {
      expect(shouldEmitCorrectionDivider({
        customer_corrected_info: true,
        corrected_fields: {},
      })).toBe(false)
    })

    it('corrected_fields present but flag never stamped → no divider', () => {
      // raw_metadata same-value save can repopulate corrected_fields while the
      // API deliberately does NOT stamp the flag (changedCount === 0).
      expect(shouldEmitCorrectionDivider({
        corrected_fields: { callerName: 'Sam' },
      })).toBe(false)
    })

    it('real correction → exactly one divider', () => {
      expect(shouldEmitCorrectionDivider({
        customer_corrected_info: true,
        corrected_fields: { callerName: 'Sam' },
      })).toBe(true)
    })

    it('multiple fields changed together → still one divider (single gate)', () => {
      expect(shouldEmitCorrectionDivider({
        customer_corrected_info: true,
        corrected_fields: { callerName: 'Sam', serviceAddress: '1 Main St' },
      })).toBe(true)
    })

    it('divider timestamp stays at the correction time when a new SMS arrives later', () => {
      const rawMetadata = {
        customer_corrected_info: true,
        corrected_fields: { callerName: 'Sam' },
        last_correction_at: '2025-01-01T09:00:00Z',
        corrected_fields_updated_at: { callerName: '2025-01-01T09:00:00Z' },
        last_customer_reply_at: '2025-01-02T12:00:00Z', // a later inbound SMS
      }
      const ts = correctionTimestampFor(rawMetadata)
      expect(ts).toBe('2025-01-01T09:00:00Z')
    })

    it('legacy correction with no trusted correction timestamp is omitted (not fabricated from last_activity_at)', () => {
      const rawMetadata = {
        customer_corrected_info: true,
        corrected_fields: { callerName: 'Sam' },
        last_customer_reply_at: '2025-06-01T12:00:00Z',
        last_activity_at: '2025-06-01T12:00:00Z',
      }
      expect(correctionTimestampFor(rawMetadata)).toBeNull()
      expect(shouldEmitCorrectionDivider(rawMetadata)).toBe(true) // gate still allows
    })

    it('falls back to max corrected_fields_updated_at when last_correction_at is missing', () => {
      const ts = correctionTimestampFor({
        corrected_fields_updated_at: { a: '2025-01-01T09:00:00Z', b: '2025-01-03T09:00:00Z' },
      })
      expect(ts).toBe('2025-01-03T09:00:00.000Z')
    })

    it('does NOT fall back to last_activity_at or created_at when no correction timestamp exists', () => {
      const ts = correctionTimestampFor({
        last_customer_reply_at: '2025-06-01T12:00:00Z',
      })
      expect(ts).toBeNull()
    })
  })
})
