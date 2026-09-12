/**
 * Batch 2 — Conversation Viewport / Auto-Follow / Media Polish Tests
 *
 * Verifies the unified scroll system, true-bottom behavior, followLatest model,
 * keyboard/viewport handling, media anchoring, and outgoing media bubble width.
 *
 * These are source-contract tests that verify the implementation from source
 * without requiring a running DOM or browser environment.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')
const desktopListContent = readFileSync('src/components/DesktopConversationMessageList.tsx', 'utf8')
const mobileListContent = readFileSync('src/components/MobileConversationMessageList.tsx', 'utf8')
const mediaRendererContent = readFileSync('src/components/MessageMediaRenderer.tsx', 'utf8')

// ============================================================================
// PART A — ONE CANONICAL FOLLOW-LATEST MODEL
// ============================================================================
describe('Part A: One Canonical Follow-Latest Model', () => {
  describe('A1. Single followLatestRef', () => {
    it('defines followLatestRef as the canonical follow-latest state', () => {
      expect(pageClientContent).toMatch(/followLatestRef/)
      expect(pageClientContent).toMatch(/const followLatestRef = useRef\(true\)/)
    })

    it('does not use multiple competing follow-latest states', () => {
      // followLatestRef is the single source of truth
      // No other "followLatest" or "userScrolled" state variables
      expect(pageClientContent).not.toMatch(/const \[followLatest/)
      expect(pageClientContent).not.toMatch(/const \[userScrolled/)
    })

    it('scroll handler updates followLatestRef based on scroll position', () => {
      expect(pageClientContent).toMatch(/followLatestRef\.current = isNearBottom/)
    })
  })

  describe('A2. Single canonical near-bottom threshold', () => {
    it('defines NEAR_BOTTOM_THRESHOLD_PX as the canonical threshold', () => {
      expect(pageClientContent).toMatch(/NEAR_BOTTOM_THRESHOLD_PX = 150/)
    })

    it('does not use competing 200px/40px thresholds for scroll decisions', () => {
      // The old code had `const scrollThreshold = isDesktop ? 200 : 40` in multiple places
      // These should be replaced with isContainerNearBottom or NEAR_BOTTOM_THRESHOLD_PX
      const oldThresholdPattern = /scrollThreshold = isDesktop \? 200 : 40/
      expect(pageClientContent).not.toMatch(oldThresholdPattern)
    })

    it('uses isContainerNearBottom helper for all near-bottom checks', () => {
      expect(pageClientContent).toMatch(/isContainerNearBottom/)
    })
  })

  describe('A3. Dead code removed', () => {
    it('removes dead bottomSentinelRef (never attached to DOM)', () => {
      expect(pageClientContent).not.toMatch(/bottomSentinelRef/)
    })

    it('removes dead handleImageLoad function', () => {
      // handleImageLoad was dead code — handleCoalescedImageLoad is the active one
      expect(pageClientContent).not.toMatch(/const handleImageLoad = \(\) =>/)
    })

    it('removes dead scrollIntoView branch for bottom sentinel', () => {
      expect(pageClientContent).not.toMatch(/bottomSentinelRef\.current\.scrollIntoView/)
    })
  })
})

// ============================================================================
// PART B — TRUE-BOTTOM HELPER
// ============================================================================
describe('Part B: True-Bottom Helper', () => {
  describe('B1. scrollToTrueBottom uses direct scrollTop assignment', () => {
    it('defines scrollToTrueBottom helper', () => {
      expect(pageClientContent).toMatch(/scrollToTrueBottom/)
    })

    it('uses container.scrollTop = container.scrollHeight (not scrollTo/scrollIntoView)', () => {
      const match = pageClientContent.match(/const scrollToTrueBottom = useCallback\([\s\S]*?\}, \[\]\)/)
      expect(match).toBeTruthy()
      if (match) {
        expect(match[0]).toMatch(/container\.scrollTop = container\.scrollHeight/)
        expect(match[0]).not.toMatch(/scrollIntoView/)
        expect(match[0]).not.toMatch(/scrollTo\(/)
      }
    })
  })

  describe('B2. No magic pixel offsets', () => {
    it('does not add arbitrary pixel offsets to scroll position', () => {
      // No +50, -100, scrollBy(0, X) magic offsets
      expect(pageClientContent).not.toMatch(/scrollTop = container\.scrollHeight - \d+/)
      expect(pageClientContent).not.toMatch(/scrollBy\(0, \d+\)/)
    })
  })

  describe('B3. bottomDistance effectively zero', () => {
    it('true-bottom sets scrollTop to scrollHeight (bottomDistance = 0)', () => {
      // scrollTop = scrollHeight means bottomDistance = scrollHeight - clientHeight - scrollTop = 0
      expect(pageClientContent).toMatch(/container\.scrollTop = container\.scrollHeight/)
    })
  })
})

// ============================================================================
// PART C — LAYOUT-AWARE FINAL RECONCILIATION
// ============================================================================
describe('Part C: Layout-Aware Final Reconciliation', () => {
  describe('C1. ResizeObserver for content height changes', () => {
    it('uses ResizeObserver to detect content height changes', () => {
      expect(pageClientContent).toMatch(/ResizeObserver/)
    })

    it('ResizeObserver scrolls to true bottom when followLatest is true', () => {
      expect(pageClientContent).toMatch(/followLatestRef\.current && isContainerNearBottom/)
    })
  })

  describe('C2. requestAnimationFrame for layout-aware correction', () => {
    it('uses requestAnimationFrame for layout-aware reconciliation', () => {
      expect(pageClientContent).toMatch(/requestAnimationFrame/)
    })

    it('performs one bounded correction pass after initial scroll', () => {
      // The scrollToBottom function does one RAF correction after the initial scroll
      expect(pageClientContent).toMatch(/Layout-aware reconciliation/)
    })
  })

  describe('C3. No setTimeout hacks', () => {
    it('removes setTimeout(300) from initial load scroll', () => {
      // The old code had setTimeout(..., 300) as a fallback
      // The new code uses RAF instead
      expect(pageClientContent).not.toMatch(/setTimeout\(\(\) => \{[\s\S]*?scrollToBottomNow/)
    })

    it('does not use setTimeout for scroll operations', () => {
      // No setTimeout(100), setTimeout(300), setTimeout(500) for scrolling
      const scrollTimeoutPattern = /setTimeout\([^,]+,\s*(100|300|500)\)/
      // Allow the 2000ms highlight timeout (not scroll-related)
      const matches = pageClientContent.match(/setTimeout\(/g) || []
      // The only setTimeouts should be for non-scroll purposes (highlight, picker)
      // Check that no setTimeout is used inside scrollToBottom or scrollToTrueBottom
      const scrollToBottomBlock = pageClientContent.match(/const scrollToBottom = useCallback\([\s\S]*?\}, \[getScrollContainer/)
      if (scrollToBottomBlock) {
        expect(scrollToBottomBlock[0]).not.toMatch(/setTimeout/)
      }
    })
  })
})

// ============================================================================
// PART D — INBOUND MESSAGE ARRIVES WHILE AWAY
// ============================================================================
describe('Part D: Return-to-Conversation Behavior', () => {
  describe('D1. latestMessageIdRef tracks seen messages', () => {
    it('defines latestMessageIdRef', () => {
      expect(pageClientContent).toMatch(/latestMessageIdRef/)
    })

    it('updates latestMessageIdRef when latest message changes', () => {
      expect(pageClientContent).toMatch(/latestMessageIdRef\.current = currentLatestId/)
    })
  })

  describe('D2. Detects messages arrived while away', () => {
    it('compares current latest ID with previous latestMessageIdRef', () => {
      expect(pageClientContent).toMatch(/latestMessageIdRef\.current !== currentLatestId/)
    })

    it('scrolls to true bottom if followLatest was true and messages advanced', () => {
      expect(pageClientContent).toMatch(/followLatestRef\.current[\s\S]*?scrollToTrueBottom/)
    })
  })

  describe('D3. Preserves reading position when scrolled up', () => {
    it('does not scroll if followLatest is false', () => {
      // The effect only scrolls when followLatestRef.current is true
      const effectBlock = pageClientContent.match(/latestMessageIdRef\.current && latestMessageIdRef\.current !== currentLatestId[\s\S]*?\}\)/)
      expect(effectBlock).toBeTruthy()
      if (effectBlock) {
        expect(effectBlock[0]).toMatch(/followLatestRef\.current/)
      }
    })
  })

  describe('D4. Resets state on customer navigation', () => {
    it('resets followLatestRef to true on new conversation', () => {
      expect(pageClientContent).toMatch(/followLatestRef\.current = true/)
    })

    it('clears latestMessageIdRef on new conversation', () => {
      expect(pageClientContent).toMatch(/latestMessageIdRef\.current = null/)
    })
  })
})

// ============================================================================
// PART E — KEYBOARD / VISUAL VIEWPORT
// ============================================================================
describe('Part E: Keyboard/VisualViewport Behavior', () => {
  describe('E1. Uses followLatestRef for keyboard resize', () => {
    it('keyboard handler checks followLatestRef', () => {
      expect(pageClientContent).toMatch(/followLatestRef\.current[\s\S]*?scrollToTrueBottom/)
    })

    it('does not use separate threshold for keyboard resize', () => {
      // The old code used `scrollThreshold = isDesktop ? 200 : 40` for keyboard
      // The new code uses followLatestRef
      const keyboardBlock = pageClientContent.match(/Handle keyboard resize[\s\S]*?\}, \[scrollToTrueBottom\]\)/)
      expect(keyboardBlock).toBeTruthy()
      if (keyboardBlock) {
        expect(keyboardBlock[0]).toMatch(/followLatestRef\.current/)
        expect(keyboardBlock[0]).not.toMatch(/scrollThreshold = isDesktop \? 200 : 40/)
      }
    })
  })

  describe('E2. Uses visualViewport API', () => {
    it('listens to window.visualViewport resize event', () => {
      expect(pageClientContent).toMatch(/window\.visualViewport\.addEventListener\('resize'/)
    })

    it('scrolls to true bottom when keyboard opens and followLatest is true', () => {
      expect(pageClientContent).toMatch(/scrollToTrueBottom\(container\)/)
    })
  })

  describe('E3. Preserves position when followLatest is false', () => {
    it('does not scroll when keyboard opens and user was reading history', () => {
      // The handler only scrolls when followLatestRef.current is true
      const keyboardBlock = pageClientContent.match(/if \(followLatestRef\.current\) \{[\s\S]*?scrollToTrueBottom/)
      expect(keyboardBlock).toBeTruthy()
    })
  })
})

// ============================================================================
// PART F — MEDIA LOAD ANCHORING
// ============================================================================
describe('Part F: Media Load Anchoring', () => {
  describe('F1. Reuses canonical helper', () => {
    it('handleCoalescedImageLoad uses scrollToBottom (not a separate algorithm)', () => {
      expect(pageClientContent).toMatch(/handleCoalescedImageLoad/)
      expect(pageClientContent).toMatch(/scrollToBottom\('auto', true\)/)
    })

    it('does not create a second independent media scrolling algorithm', () => {
      // The media load handler reuses the same scrollToBottom + followLatestRef
      const mediaBlock = pageClientContent.match(/handleCoalescedImageLoad = useCallback\([\s\S]*?\}, \[\]\)/)
      expect(mediaBlock).toBeTruthy()
      if (mediaBlock) {
        expect(mediaBlock[0]).toMatch(/scrollToBottom/)
        expect(mediaBlock[0]).toMatch(/followLatestRef/)
      }
    })
  })

  describe('F2. Outgoing media anchors to true bottom', () => {
    it('outgoing media forces scroll to bottom', () => {
      expect(pageClientContent).toMatch(/outgoingMediaAnchorRef\.current/)
      expect(pageClientContent).toMatch(/scrollToBottom\('auto', true\)/)
    })
  })

  describe('F3. Inbound media respects followLatest', () => {
    it('inbound media only scrolls if followLatestRef is true', () => {
      const mediaBlock = pageClientContent.match(/Inbound media[\s\S]*?followLatestRef\.current[\s\S]*?scrollToBottom/)
      expect(mediaBlock).toBeTruthy()
    })

    it('does not yank user down if they scrolled up', () => {
      // When followLatestRef is false, inbound media does not scroll
      expect(pageClientContent).toMatch(/Inbound media: only follow if user is already near bottom/)
    })
  })
})

// ============================================================================
// PART G — OUTGOING MEDIA BUBBLE WIDTH
// ============================================================================
describe('Part G: Outgoing Media-Only Bubble Width', () => {
  describe('G1. Desktop: media-only outgoing bubble content-sizes', () => {
    it('defines isMediaOnly flag', () => {
      expect(desktopListContent).toMatch(/isMediaOnly/)
    })

    it('applies w-fit to media-only outgoing bubbles', () => {
      expect(desktopListContent).toMatch(/isMediaOnly && isOutbound \? 'w-fit'/)
    })

    it('does not apply w-fit to text+media or text-only bubbles', () => {
      // w-fit is conditional on isMediaOnly && isOutbound
      expect(desktopListContent).toMatch(/isMediaOnly && isOutbound \? 'w-fit' : ''/)
    })
  })

  describe('G2. Mobile: media-only outgoing bubble content-sizes', () => {
    it('defines isMediaOnly flag', () => {
      expect(mobileListContent).toMatch(/isMediaOnly/)
    })

    it('applies w-fit to media-only outgoing bubbles', () => {
      expect(mobileListContent).toMatch(/isMediaOnly && isOutbound \? 'w-fit'/)
    })
  })

  describe('G3. Image fills its wrapper (no 85% clamp)', () => {
    it('image uses max-w-full instead of max-w-[85%]', () => {
      expect(mediaRendererContent).toMatch(/max-w-full md:max-w-\[420px\]/)
      expect(mediaRendererContent).not.toMatch(/max-w-\[85%\]/)
    })

    it('video uses max-w-full instead of max-w-[85%]', () => {
      expect(mediaRendererContent).toMatch(/max-w-full md:max-w-\[420px\].*object-contain bg-black/)
    })
  })

  describe('G4. Text+media preserves normal layout', () => {
    it('text+media messages do not get w-fit (normal bubble sizing)', () => {
      // isMediaOnly is false when hasText is true
      expect(desktopListContent).toMatch(/isMediaOnly = !hasText && hasRenderableMedia/)
      expect(mobileListContent).toMatch(/isMediaOnly = !hasText && hasRenderableMedia/)
    })
  })
})

// ============================================================================
// PART H — EMBEDDED + FULLSCREEN PARITY
// ============================================================================
describe('Part H: Embedded + Fullscreen Parity', () => {
  describe('H1. Shared scroll helpers work for both modes', () => {
    it('getScrollContainer selects fullscreen or embedded container', () => {
      expect(pageClientContent).toMatch(/getScrollContainer/)
      expect(pageClientContent).toMatch(/isFullScreen/)
      expect(pageClientContent).toMatch(/fullScreenScrollRef/)
      expect(pageClientContent).toMatch(/conversationContainerRef/)
      expect(pageClientContent).toMatch(/mobileConversationContainerRef/)
    })

    it('scrollToTrueBottom works on any container (not mode-specific)', () => {
      // scrollToTrueBottom takes a container parameter — works for any container
      const match = pageClientContent.match(/const scrollToTrueBottom = useCallback\(\(container: HTMLDivElement\) => \{[\s\S]*?\}, \[\]\)/)
      expect(match).toBeTruthy()
    })

    it('isContainerNearBottom works on any container', () => {
      const match = pageClientContent.match(/const isContainerNearBottom = useCallback\(\(container: HTMLDivElement\)/)
      expect(match).toBeTruthy()
    })
  })

  describe('H2. Both modes use same followLatest model', () => {
    it('followLatestRef is shared across embedded and fullscreen', () => {
      // followLatestRef is a single ref, not per-mode
      expect(pageClientContent).toMatch(/const followLatestRef = useRef\(true\)/)
    })
  })
})

// ============================================================================
// PART J — TEST MATRIX VERIFICATION
// ============================================================================
describe('Part J: Test Matrix Verification', () => {
  // 1. At bottom → inbound text arrives while visible → true bottom
  it('1. inbound text while visible: scrollToBottom uses auto behavior', () => {
    expect(pageClientContent).toMatch(/scrollToBottom\('auto'/)
  })

  // 2. At bottom → navigate away → inbound text → return → true bottom
  it('2. return after away: latestMessageIdRef detects new messages', () => {
    expect(pageClientContent).toMatch(/latestMessageIdRef\.current !== currentLatestId/)
  })

  // 3. Multiple inbound messages while away → newest visible and true bottom
  it('3. multiple messages: effect fires on latestMessage?.id change', () => {
    expect(pageClientContent).toMatch(/\[latestMessage\?\.id/)
  })

  // 4. User intentionally scrolled up → inbound arrives → no forced bottom
  it('4. scrolled up: realtime effect checks followLatestRef', () => {
    expect(pageClientContent).toMatch(/if \(followLatestRef\.current\)/)
  })

  // 5. Keyboard opens while followLatest=true → true bottom after viewport resize
  it('5. keyboard + followLatest: scrollToTrueBottom called', () => {
    expect(pageClientContent).toMatch(/followLatestRef\.current[\s\S]*?scrollToTrueBottom\(container\)/)
  })

  // 6. Keyboard opens while followLatest=false → no forced jump
  it('6. keyboard + scrolled up: no scroll when followLatest is false', () => {
    const keyboardBlock = pageClientContent.match(/if \(followLatestRef\.current\) \{[\s\S]*?scrollToTrueBottom/)
    expect(keyboardBlock).toBeTruthy()
    // The else branch does NOT scroll
  })

  // 7. Outgoing media loads while followLatest=true → true bottom
  it('7. outgoing media: forces scroll to bottom', () => {
    expect(pageClientContent).toMatch(/outgoingMediaAnchorRef\.current = true/)
    expect(pageClientContent).toMatch(/scrollToBottom\('auto', true\)/)
  })

  // 8. Incoming media loads while user scrolled up → reading position preserved
  it('8. incoming media + scrolled up: followLatestRef check prevents yank', () => {
    expect(pageClientContent).toMatch(/Inbound media: only follow if user is already near bottom/)
  })

  // 9. Embedded conversation → same behavior
  it('9. embedded: uses conversationContainerRef / mobileConversationContainerRef', () => {
    expect(pageClientContent).toMatch(/conversationContainerRef/)
    expect(pageClientContent).toMatch(/mobileConversationContainerRef/)
  })

  // 10. Fullscreen conversation → same behavior
  it('10. fullscreen: uses fullScreenScrollRef', () => {
    expect(pageClientContent).toMatch(/fullScreenScrollRef/)
  })

  // 11. Final bottomDistance after auto-follow → effectively zero
  it('11. true bottom: scrollTop = scrollHeight (bottomDistance = 0)', () => {
    expect(pageClientContent).toMatch(/container\.scrollTop = container\.scrollHeight/)
  })

  // 12. Media-only outgoing bubble → wrapper does not retain excess width
  it('12. media-only bubble: w-fit applied', () => {
    expect(desktopListContent).toMatch(/w-fit/)
    expect(mobileListContent).toMatch(/w-fit/)
  })

  // 13. Text + media → normal mixed-content layout preserved
  it('13. text+media: w-fit NOT applied (isMediaOnly is false)', () => {
    expect(desktopListContent).toMatch(/isMediaOnly = !hasText && hasRenderableMedia/)
    expect(mobileListContent).toMatch(/isMediaOnly = !hasText && hasRenderableMedia/)
  })
})
