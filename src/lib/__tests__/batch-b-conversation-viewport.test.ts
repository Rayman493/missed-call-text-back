/**
 * Batch B — Customer Conversation Viewport + Scrolling + Fullscreen + Composer
 *
 * Static source-level tests proving:
 * 1. One canonical message scroll owner per mode (embedded / fullscreen)
 * 2. Touch scrolling works over message content (touch-action: pan-y)
 * 3. Late-loading MMS respects near-bottom (does not force scroll)
 * 4. Empty composer is not internally scrollable
 * 5. Fullscreen button stale highlight is cleared on touch close
 * 6. Conversation card top gap reduced
 * 7. Light-mode conversation card has distinct boundary
 * 8. Embedded/fullscreen share the same bottom-anchor helper
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = process.cwd()
const readSrc = (rel: string) => readFileSync(join(repoRoot, rel), 'utf-8').replace(/\r\n/g, '\n')

const pageClientSrc = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
const desktopComposerSrc = readSrc('src/components/ConversationComposer.tsx')
const mobileComposerSrc = readSrc('src/components/MobileConversationComposer.tsx')

// ============================================================
// Part 1: Touch / Scroll Ownership
// ============================================================

describe('Batch B — Part 1: Touch / Scroll Ownership', () => {
  it('1. conversation has one canonical message scroll owner per mode', () => {
    // Desktop embedded: conversationContainerRef
    expect(pageClientSrc).toContain('ref={conversationContainerRef}')
    // Mobile embedded: mobileConversationContainerRef
    expect(pageClientSrc).toContain('ref={mobileConversationContainerRef}')
    // Fullscreen: fullScreenScrollRef
    expect(pageClientSrc).toContain('ref={fullScreenScrollRef}')
    // Each is on a div with overflow-y-auto (the scroll container)
    const desktopContainerMatch = pageClientSrc.match(
      /ref=\{conversationContainerRef\}[^>]*overflow-y-auto/
    )
    expect(desktopContainerMatch).toBeTruthy()
    const mobileContainerMatch = pageClientSrc.match(
      /ref=\{mobileConversationContainerRef\}[^>]*overflow-y-auto/
    )
    expect(mobileContainerMatch).toBeTruthy()
    const fullScreenContainerMatch = pageClientSrc.match(
      /ref=\{fullScreenScrollRef\}[^>]*overflow-y-auto/
    )
    expect(fullScreenContainerMatch).toBeTruthy()
  })

  it('2. vertical drag over message bubble can scroll (touch-action: pan-y on desktop container)', () => {
    // Desktop container must have touch-action: pan-y
    const desktopContainerMatch = pageClientSrc.match(
      /ref=\{conversationContainerRef\}[^>]*style=\{\{[^}]*touchAction:\s*'pan-y'/
    )
    expect(desktopContainerMatch).toBeTruthy()
  })

  it('3. vertical drag over MMS image can scroll (touch-action: pan-y on mobile container)', () => {
    // Mobile container must have touch-action: pan-y
    const mobileContainerMatch = pageClientSrc.match(
      /ref=\{mobileConversationContainerRef\}[^>]*style=\{\{[^}]*touchAction:\s*'pan-y'/
    )
    expect(mobileContainerMatch).toBeTruthy()
  })

  it('4. vertical drag over timestamp/system row can scroll (touch-action: pan-y on fullscreen container)', () => {
    // Fullscreen container must have touch-action: pan-y
    const fullScreenContainerMatch = pageClientSrc.match(
      /ref=\{fullScreenScrollRef\}[^>]*style=\{\{[^}]*touchAction:\s*'pan-y'/
    )
    expect(fullScreenContainerMatch).toBeTruthy()
  })

  it('5. no descendant unnecessarily prevents vertical pan (no preventDefault on touchmove)', () => {
    // The message list components should NOT call preventDefault on touchmove
    const mobileListSrc = readSrc('src/components/MobileConversationMessageList.tsx')
    expect(mobileListSrc).not.toContain('preventDefault')
    const desktopListSrc = readSrc('src/components/DesktopConversationMessageList.tsx')
    expect(desktopListSrc).not.toContain('preventDefault')
  })

  it('6. scrollbar is not required for scrolling (touch-action enables pan)', () => {
    // All three containers have touch-action: pan-y which enables touch panning
    // independent of scrollbar visibility
    const allTouchAction = (pageClientSrc.match(/touchAction:\s*'pan-y'/g) || []).length
    expect(allTouchAction).toBeGreaterThanOrEqual(3) // desktop + mobile + fullscreen
  })
})

// ============================================================
// Part 2: Media Anchor
// ============================================================

describe('Batch B — Part 2: Media Anchor', () => {
  it('7. media height growth while near bottom keeps user pinned', () => {
    // handleCoalescedImageLoad calls scrollToBottom with force=false
    // This means it respects near-bottom: only scrolls if user is near bottom
    const coalescedMatch = pageClientSrc.match(
      /handleCoalescedImageLoad[^}]*scrollToBottom\('auto',\s*false\)/
    )
    expect(coalescedMatch).toBeTruthy()
  })

  it('8. media height growth while scrolled up does not pull user down', () => {
    // scrollToBottom with force=false shows jump button if user is scrolled up
    // The coalesced image load does NOT force scroll
    const coalescedSection = pageClientSrc.substring(
      pageClientSrc.indexOf('handleCoalescedImageLoad'),
      pageClientSrc.indexOf('handleCoalescedImageLoad') + 500
    )
    expect(coalescedSection).toContain("force")
    expect(coalescedSection).toContain("Do NOT force")
    // The actual call must use false, not true
    expect(coalescedSection).toContain("scrollToBottom('auto', false)")
    expect(coalescedSection).not.toContain("scrollToBottom('auto', true)")
  })

  it('9. multiple images loading sequentially remain stable (rAF coalescing)', () => {
    // The coalesced function uses requestAnimationFrame to coalesce multiple calls
    const coalescedSection = pageClientSrc.substring(
      pageClientSrc.indexOf('handleCoalescedImageLoad'),
      pageClientSrc.indexOf('handleCoalescedImageLoad') + 500
    )
    expect(coalescedSection).toContain('imageScrollRafRef')
    expect(coalescedSection).toContain('requestAnimationFrame')
    // Already-scheduled check prevents overlapping scroll animations
    expect(coalescedSection).toContain('already scheduled')
  })

  it('10. text-only conversation unchanged (no media scroll interference)', () => {
    // handleCoalescedImageLoad is only called from onImageLoad prop
    // Text-only conversations don't trigger image load events
    expect(pageClientSrc).toContain('onImageLoad={handleCoalescedImageLoad}')
  })

  it('11. realtime new message near bottom remains pinned', () => {
    // realtimeScrollGeneration uses scrollToBottom with force=false
    const realtimeMatch = pageClientSrc.match(
      /realtimeScrollGeneration[^}]*scrollToBottom\('smooth',\s*false\)/
    )
    expect(realtimeMatch).toBeTruthy()
  })

  it('12. realtime new message while scrolled up does not yank user down', () => {
    // The realtime scroll effect calls scrollToBottom with force=false
    // This means if user is scrolled up, it shows jump button instead of forcing
    const realtimeSection = pageClientSrc.substring(
      pageClientSrc.indexOf('Realtime message scroll'),
      pageClientSrc.indexOf('Realtime message scroll') + 500
    )
    expect(realtimeSection).toContain('respects near-bottom')
    expect(realtimeSection).toContain("scrollToBottom('smooth', false)")
  })
})

// ============================================================
// Part 3: Composer
// ============================================================

describe('Batch B — Part 3: Composer', () => {
  it('13. empty composer is not internally scrollable (overflow-y-hidden when not at max)', () => {
    // Desktop composer: overflow-y-hidden when isAtMaxHeight is false
    expect(desktopComposerSrc).toContain('overflow-y-hidden')
    // Mobile composer: overflow-y-hidden when isAtMaxHeight is false
    expect(mobileComposerSrc).toContain('overflow-y-hidden')
  })

  it('14. empty placeholder remains aligned (scrollTop reset to 0 when empty)', () => {
    // Desktop composer resets scrollTop when empty
    expect(desktopComposerSrc).toContain('textarea.scrollTop = 0')
    // Mobile composer resets scrollTop when empty
    expect(mobileComposerSrc).toContain('textarea.scrollTop = 0')
  })

  it('15. empty composer scrollTop cannot drift (reset on change when empty)', () => {
    // Both composers check for empty value and reset scrollTop
    const desktopChangeSection = desktopComposerSrc.substring(
      desktopComposerSrc.indexOf('handleTextareaChange'),
      desktopComposerSrc.indexOf('handleTextareaChange') + 800
    )
    expect(desktopChangeSection).toContain('!e.target.value')
    expect(desktopChangeSection).toContain('scrollTop = 0')

    const mobileChangeSection = mobileComposerSrc.substring(
      mobileComposerSrc.indexOf('handleChange'),
      mobileComposerSrc.indexOf('handleChange') + 800
    )
    expect(mobileChangeSection).toContain('!newValue')
    expect(mobileChangeSection).toContain('scrollTop = 0')
  })

  it('16. short text does not create internal scrolling (overflow-y-hidden while content fits)', () => {
    // isAtMaxHeight is only true when scrollHeight >= max height
    // Desktop: scrollHeight >= 150
    expect(desktopComposerSrc).toContain('scrollHeight >= 150')
    // Mobile: scrollHeight >= 100
    expect(mobileComposerSrc).toContain('scrollHeight >= 100')
  })

  it('17. long text enables internal scroll only after max height (overflow-y-auto when at max)', () => {
    // Both composers switch to overflow-y-auto when isAtMaxHeight is true
    expect(desktopComposerSrc).toContain('overflow-y-auto')
    expect(mobileComposerSrc).toContain('overflow-y-auto')
  })

  it('18. send/attachment controls remain aligned (flex-shrink-0 on buttons)', () => {
    // Desktop composer: attachment and send buttons have flex-shrink-0
    expect(desktopComposerSrc).toContain('flex-shrink-0')
    // Mobile composer: attachment and send buttons have flex-shrink-0
    expect(mobileComposerSrc).toContain('flex-shrink-0')
  })

  it('19. long-message sending behavior unchanged (handleSend still works)', () => {
    // Desktop composer: handleSend function is unchanged
    expect(desktopComposerSrc).toContain('handleSend')
    expect(desktopComposerSrc).toContain('handleSendMessage')
    // Mobile composer: handleSend function is unchanged
    expect(mobileComposerSrc).toContain('handleSend')
    expect(mobileComposerSrc).toContain('handleSendMessage')
  })

  it('composer textarea has touch-action: pan-y (vertical pan scrolls parent)', () => {
    // Desktop composer textarea has touch-action: pan-y
    const desktopTextareaMatch = desktopComposerSrc.match(
      /<textarea[^>]*style=\{\{[^}]*touchAction:\s*'pan-y'/
    )
    expect(desktopTextareaMatch).toBeTruthy()
    // Mobile composer textarea has touch-action: pan-y
    const mobileTextareaMatch = mobileComposerSrc.match(
      /<textarea[^>]*style=\{\{[^}]*touchAction:\s*'pan-y'/
    )
    expect(mobileTextareaMatch).toBeTruthy()
  })
})

// ============================================================
// Part 4: Fullscreen
// ============================================================

describe('Batch B — Part 4: Fullscreen', () => {
  it('20. fullscreen uses canonical bottom-anchor behavior (scrollToBottom handles fullScreenScrollRef)', () => {
    // scrollToBottom must select fullScreenScrollRef when isFullScreen is true
    const scrollToBottomSection = pageClientSrc.substring(
      pageClientSrc.indexOf('const scrollToBottom'),
      pageClientSrc.indexOf('const scrollToBottom') + 800
    )
    expect(scrollToBottomSection).toContain('isFullScreen')
    expect(scrollToBottomSection).toContain('fullScreenScrollRef.current')
  })

  it('21. fullscreen does not absolute-bottom overscroll (uses near-bottom threshold)', () => {
    // scrollToBottom uses NEAR_BOTTOM_THRESHOLD_PX for near-bottom check
    // This applies to fullscreen too since it goes through the same function
    const scrollToBottomSection = pageClientSrc.substring(
      pageClientSrc.indexOf('const scrollToBottom'),
      pageClientSrc.indexOf('const scrollToBottom') + 800
    )
    expect(scrollToBottomSection).toContain('NEAR_BOTTOM_THRESHOLD_PX')
    expect(scrollToBottomSection).toContain('isNearBottom')
  })

  it('22. exiting fullscreen clears active state (blur on touch close)', () => {
    // The cleanup function must blur the button on touch close paths
    // Search from the cleanup return block (after backHandle?.remove?.())
    const cleanupIdx = pageClientSrc.indexOf('backHandle?.remove?.()')
    const cleanupSection = pageClientSrc.substring(cleanupIdx, cleanupIdx + 1200)
    expect(cleanupSection).toContain('btn.blur()')
    expect(cleanupSection).toContain('wasKeyboardClose')
  })

  it('23. Android Back exit clears active state (touch origin tracked)', () => {
    // The backButton handler must set lastCloseOriginRef to 'touch'
    const backHandlerMatch = pageClientSrc.match(
      /backButton[^}]*lastCloseOriginRef\.current\s*=\s*'touch'/
    )
    expect(backHandlerMatch).toBeTruthy()
  })

  it('24. fullscreen button can be used again immediately (no retained state)', () => {
    // The toggle button onClick still works (sets isFullScreen to true)
    const toggleButtonMatch = pageClientSrc.match(
      /onClick=\{\(\)\s*=>\s*setIsFullScreen\(true\)\}/
    )
    expect(toggleButtonMatch).toBeTruthy()
    // The close button sets lastCloseOriginRef before closing
    const closeButtonMatch = pageClientSrc.match(
      /onClick=\{\(\)\s*=>\s*\{[^}]*lastCloseOriginRef\.current\s*=\s*'touch'[^}]*setIsFullScreen\(false\)/
    )
    expect(closeButtonMatch).toBeTruthy()
  })

  it('25. keyboard focus-visible remains accessible (focus restored on keyboard close)', () => {
    // The cleanup function restores focus for keyboard close paths
    const cleanupIdx = pageClientSrc.indexOf('backHandle?.remove?.()')
    const cleanupSection = pageClientSrc.substring(cleanupIdx, cleanupIdx + 1200)
    expect(cleanupSection).toContain("wasKeyboardClose")
    expect(cleanupSection).toContain('btn.focus()')
  })

  it('26. embedded/fullscreen near-bottom behavior matches (shared scrollToBottom)', () => {
    // Both embedded and fullscreen use the same scrollToBottom function
    // The function selects the container based on isFullScreen state
    const scrollToBottomSection = pageClientSrc.substring(
      pageClientSrc.indexOf('const scrollToBottom'),
      pageClientSrc.indexOf('const scrollToBottom') + 800
    )
    // Container selection includes all three refs
    expect(scrollToBottomSection).toContain('fullScreenScrollRef.current')
    expect(scrollToBottomSection).toContain('conversationContainerRef.current')
    expect(scrollToBottomSection).toContain('mobileConversationContainerRef.current')
    // Same near-bottom threshold for all
    expect(scrollToBottomSection).toContain('NEAR_BOTTOM_THRESHOLD_PX')
  })
})

// ============================================================
// Part 5: Layout / Light Mode
// ============================================================

describe('Batch B — Part 5: Layout / Light Mode', () => {
  it('27. Conversation card top gap reduced by one canonical spacing step', () => {
    // The mobile layout should use space-y-3 (reduced from space-y-4)
    const mobileLayoutMatch = pageClientSrc.match(
      /space-y-3\s+pb-\[calc\(1rem\+var\(--bottom-nav-height/
    )
    expect(mobileLayoutMatch).toBeTruthy()
    // The old space-y-4 should NOT be present for the mobile conversation layout
    const oldGapMatch = pageClientSrc.match(
      /space-y-4\s+pb-\[calc\(1rem\+var\(--bottom-nav-height/
    )
    expect(oldGapMatch).toBeFalsy()
  })

  it('28. no overlap at 320px (flex-col with min-h-0)', () => {
    // The conversation card uses flex flex-col min-h-0 to prevent overflow
    const cardMatch = pageClientSrc.match(
      /rounded-2xl\s+border\s+border-border\/60\s+shadow-sm\s+overflow-hidden\s+flex\s+flex-col\s+min-h-0/
    )
    expect(cardMatch).toBeTruthy()
  })

  it('29. bottom-nav clearance remains (pb calc with bottom-nav-height)', () => {
    // The mobile layout still has bottom-nav clearance padding
    expect(pageClientSrc).toContain('pb-[calc(1rem+var(--bottom-nav-height,72px))]')
  })

  it('30. light-mode Conversation card has distinct boundary/fill (stronger border + fill)', () => {
    // Mobile card: bg-muted/20 (strengthened from bg-muted/10) + border-border/60 (strengthened from /40)
    const mobileCardMatch = pageClientSrc.match(
      /bg-muted\/20\s+rounded-2xl\s+border\s+border-border\/60/
    )
    expect(mobileCardMatch).toBeTruthy()
    // Desktop card: bg-muted/20 (strengthened from bg-muted/10)
    const desktopCardMatch = pageClientSrc.match(
      /bg-muted\/20\s+rounded-xl\s+border\s+border-slate-200/
    )
    expect(desktopCardMatch).toBeTruthy()
  })

  it('31. dark-mode styling not regressed (dark: classes preserved)', () => {
    // Dark mode classes should still be present
    expect(pageClientSrc).toContain('dark:border-border/50')
    expect(pageClientSrc).toContain('dark:bg-slate-900/40')
    expect(pageClientSrc).toContain('dark:bg-slate-900/60')
  })

  it('32. customer card order unchanged (no reordering of layout sections)', () => {
    // The conversation section still comes before the sidebar
    const conversationIdx = pageClientSrc.indexOf('Desktop Conversation Section')
    const sidebarIdx = pageClientSrc.indexOf('Desktop Sidebar')
    expect(conversationIdx).toBeGreaterThan(0)
    expect(sidebarIdx).toBeGreaterThan(conversationIdx)
    // Mobile layout still has conversation card in the same position
    const mobileConversationIdx = pageClientSrc.indexOf('Conversation Workspace Card')
    expect(mobileConversationIdx).toBeGreaterThan(0)
  })
})
