import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { getMonotonicMessageStatus } from '@/lib/twilio/status-monotonic'

function readSrc(relativePath: string): string {
  const fullPath = path.join(process.cwd(), relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

// ============================================================================
// A. TRUE-BOTTOM CONVERSATION ANCHOR
// ============================================================================

describe('A. True-bottom conversation anchor', () => {
  it('A.1 message lists render an explicit bottom sentinel', () => {
    const desktop = readSrc('src/components/DesktopConversationMessageList.tsx')
    const mobile = readSrc('src/components/MobileConversationMessageList.tsx')
    expect(desktop).toContain('data-bottom-sentinel')
    expect(mobile).toContain('data-bottom-sentinel')
  })

  it('A.2 scrollToTrueBottom pins the exact scrollable maximum', () => {
    const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    // True bottom is scrollHeight - clientHeight — the maximum scrollTop.
    // Sentinel-position math was removed: wrapper padding below the sentinel
    // (e.g. the mobile thread's py-2) made it land short of the real bottom.
    const functionBody = source.substring(
      source.indexOf('const scrollToTrueBottom = useCallback'),
      source.indexOf('const isContainerNearBottom')
    )
    expect(functionBody).toContain('container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight)')
    expect(functionBody).not.toContain('data-bottom-sentinel')
    expect(functionBody).not.toContain('scrollIntoView')
  })

  it('A.3 ResizeObserver observes the actual message-list content for late growth', () => {
    const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(source).toContain('resizeObserver.observe(innerContent')
    expect(source).toContain('lastScrollHeight')
    expect(source).toContain('settleCount >= 2')
    // Gate on followLatestRef (recorded user intent) only — do NOT re-check
    // isContainerNearBottom inside the RO callback: it fires BECAUSE content
    // just grew, so a post-growth measurement falsely reads "not near bottom".
    expect(source).toMatch(/if \(followLatestRef\.current\) \{\s*scrollToTrueBottom\(container\)/)
    expect(source).not.toContain('followLatestRef.current && isContainerNearBottom(container)')
  })

  it('A.4 user scroll intent updates followLatestRef via near-bottom threshold', () => {
    const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    expect(source).toContain('followLatestRef.current = isNearBottom')
    expect(source).toContain('NEAR_BOTTOM_THRESHOLD_PX')
    expect(source).toContain('setShowJumpButton(!isNearBottom')
  })

  it('A.5 visual viewport resize re-anchors when followLatest is true', () => {
    const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    const section = source.substring(
      source.indexOf('Re-anchor to the true bottom on any viewport/keyboard/window resize'),
      source.indexOf('Use visualViewport API for keyboard resize detection')
    )
    expect(section).toContain('followLatestRef.current')
    expect(section).toContain('scrollToTrueBottom(container)')
    expect(section).not.toContain('heightDiff > 100')
  })

  it('A.6 initial scroll reaches true bottom via scrollToTrueBottom', () => {
    const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    const startIdx = source.indexOf('Scroll to bottom after messages load with ResizeObserver')
    expect(startIdx).toBeGreaterThan(-1)
    const initialWindow = source.substring(startIdx, startIdx + 3500)
    expect(initialWindow).toContain('ResizeObserver')
    expect(initialWindow).toContain('scrollToTrueBottom(container)')
    expect(initialWindow).toContain('settleCount >= 2')
  })

  it('A.7 realtime INSERT respects followLatest and uses smooth scroll', () => {
    const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    const realtimeSection = source.substring(
      source.indexOf('=== Realtime message scroll'),
      source.indexOf('const latestMessage = messagesArray')
    )
    expect(realtimeSection).toContain("scrollToBottom('smooth', false)")
    expect(realtimeSection).toContain('followLatestRef.current')
    expect(realtimeSection).toContain('setShowJumpButton(true)')
  })

  it('A.8 realtime UPDATE does not change scroll generation', () => {
    const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    const mergeIdx = source.indexOf("mergeMessageWithMonotonicity(currentMessages, updatedMessage, 'realtime-update')")
    expect(mergeIdx).toBeGreaterThan(-1)
    const updateWindow = source.substring(mergeIdx, mergeIdx + 1200)
    expect(updateWindow).toContain('mergeMessageWithMonotonicity')
    expect(updateWindow).not.toContain('setRealtimeScrollGeneration')
  })
})

// ============================================================================
// G. SENTINEL DOM GEOMETRY
// ============================================================================

describe('G. Sentinel DOM geometry and composer clearance', () => {
  it('G.1 desktop message list no longer carries 96px bottom padding after the sentinel', () => {
    const source = readSrc('src/components/DesktopConversationMessageList.tsx')
    const listMatch = source.match(/<div className="([^"]+)" data-desktop-layout data-active-conversation-list>/)
    expect(listMatch).toBeTruthy()
    const classes = listMatch![1]
    expect(classes).not.toContain('pb-24')
    expect(classes).not.toContain('pb-')
  })

  it('G.2 mobile message list has no bottom padding either', () => {
    const source = readSrc('src/components/MobileConversationMessageList.tsx')
    const listMatch = source.match(/<div className="([^"]+)" data-mobile-layout data-active-conversation-list>/)
    expect(listMatch).toBeTruthy()
    const classes = listMatch![1]
    expect(classes).not.toContain('pb-')
  })

  it('G.3 sentinel is the last child of the message list with zero top margin', () => {
    const desktop = readSrc('src/components/DesktopConversationMessageList.tsx')
    const mobile = readSrc('src/components/MobileConversationMessageList.tsx')
    expect(desktop).toMatch(/<div data-bottom-sentinel[^>]*className="[^"]*!mt-0[^"]*"[^>]*\s*\/>/)
    expect(mobile).toMatch(/<div data-bottom-sentinel[^>]*className="[^"]*!mt-0[^"]*"[^>]*\s*\/>/)
    // The sentinel is the last child before the outer relative wrapper closes.
    expect(desktop).toMatch(/<div data-bottom-sentinel[^>]*\/>\s*<\/div>\s*<\/div>/)
    expect(mobile).toMatch(/<div data-bottom-sentinel[^>]*\/>\s*<\/div>\s*<\/div>/)
  })

  it('G.4 scrollToTrueBottom does not add arbitrary padding/spacer to the anchor', () => {
    const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    const body = source.substring(
      source.indexOf('const scrollToTrueBottom = useCallback'),
      source.indexOf('const isContainerNearBottom')
    )
    // The pin targets the exact scrollable maximum — no spacer, no padding
    // offset, no scrollIntoView approximation.
    expect(body).toContain('container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight)')
    expect(body).not.toContain('+ 96')
    expect(body).not.toContain('parseFloat')
  })

  it('G.5 desktop and mobile use the same data-bottom-sentinel anchor contract', () => {
    const desktop = readSrc('src/components/DesktopConversationMessageList.tsx')
    const mobile = readSrc('src/components/MobileConversationMessageList.tsx')
    expect(desktop).toContain('data-bottom-sentinel')
    expect(mobile).toContain('data-bottom-sentinel')
    expect(desktop).toContain('!mt-0')
    expect(mobile).toContain('!mt-0')
    expect(desktop).not.toContain('pb-')
    expect(mobile).not.toContain('pb-')
  })
})

// ============================================================================
// B. OUTBOUND SMS STATUS RECONCILIATION
// ============================================================================

describe('B. Outbound SMS status reconciliation', () => {
  it('B.1 message merge matches by id, clientMessageId, and twilio_message_sid', () => {
    const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    const mergeSection = source.substring(
      source.indexOf('Canonical message merge function'),
      source.indexOf('Convert back to array and sort chronologically')
    )
    expect(mergeSection).toContain('messageMap.has(incomingMessage.id)')
    expect(mergeSection).toContain('clientMessageId')
    expect(mergeSection).toContain('twilio_message_sid')
  })

  it('B.2 status monotonicity only allows forward/terminal transitions', () => {
    // Twilio-driven status updates are truthfully represented; nothing fakes 'delivered'.
    expect(getMonotonicMessageStatus('sent', 'delivered')).toBe('delivered')
    expect(getMonotonicMessageStatus('sending', 'sent')).toBe('sent')
    expect(getMonotonicMessageStatus('delivered', 'sent')).toBe('delivered')
    expect(getMonotonicMessageStatus('sent', 'queued')).toBe('sent')
  })

  it('B.3 optimistic flag is cleared on server reconciliation without duplicating', () => {
    const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
    const mergeSection = source.substring(
      source.indexOf('Canonical message merge function'),
      source.indexOf('Convert back to array and sort chronologically')
    )
    expect(mergeSection).toContain('isOptimistic: false')
    expect(mergeSection).toContain('messageMap.set(incomingMessage.id, incomingMessage)')
  })
})

// ============================================================================
// C. ATTACHMENT VIEWER
// ============================================================================

describe('C. Attachment viewer reliability', () => {
  it('C.1 MessageMediaRenderer integrates with modal back stack', () => {
    const source = readSrc('src/components/MessageMediaRenderer.tsx')
    expect(source).toContain("import { useModalBackButton } from '@/hooks/useModalBackButton'")
    expect(source).toContain('useModalBackButton({ isOpen: Boolean(expandedMedia), onClose: handleCloseExpanded })')
  })

  it('C.2 MessageMediaRenderer locks body scroll while open', () => {
    const source = readSrc('src/components/MessageMediaRenderer.tsx')
    expect(source).toContain("import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'")
    expect(source).toContain('useBodyScrollLock(Boolean(expandedMedia)')
  })

  it('C.3 viewer overlay is fixed, full viewport, and above app chrome', () => {
    const source = readSrc('src/components/MessageMediaRenderer.tsx')
    // Portal to document.body is required: transformed/animated ancestors make
    // `fixed` positioning element-relative, which left an uncovered top strip.
    expect(source).toContain('createPortal(')
    const modalMatch = source.match(/createPortal\(\s*<div[\s\S]*?<\/div>\s*,\s*document\.body\s*\)/)
    expect(modalMatch).toBeTruthy()
    const modal = modalMatch![0]
    expect(modal).toContain('fixed inset-0')
    expect(modal).toContain('z-[60]')
    expect(modal).toContain('bg-black/95')
    expect(modal).not.toContain('p-4')
    expect(modal).not.toContain('max-h-[90vh]')
  })

  it('C.4 X and Back use the same handleCloseExpanded path', () => {
    const source = readSrc('src/components/MessageMediaRenderer.tsx')
    expect(source).toContain('onClick={handleCloseExpanded}')
    expect(source).toContain('aria-label="Close"')
    // The dark overlay background and the X button both invoke handleCloseExpanded.
    expect((source.match(/onClick=\{handleCloseExpanded\}/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(source).toContain('useModalBackButton({ isOpen: Boolean(expandedMedia), onClose: handleCloseExpanded })')
  })

  it('C.5 image is constrained to full viewport, not 90vh', () => {
    const source = readSrc('src/components/MessageMediaRenderer.tsx')
    const imgMatch = source.match(/<img\s+src=\{expandedMedia\}[\s\S]*?\/>/)
    expect(imgMatch).toBeTruthy()
    expect(imgMatch![0]).toContain('max-h-full')
    expect(imgMatch![0]).toContain('max-w-full')
    expect(imgMatch![0]).not.toContain('max-h-[90vh]')
  })

  it('C.6 Escape key still closes the viewer', () => {
    const source = readSrc('src/components/MessageMediaRenderer.tsx')
    expect(source).toContain("if (e.key === 'Escape')")
    expect(source).toContain('handleCloseExpanded')
  })
})
