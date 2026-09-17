/**
 * Conversation Initial Entry + Media Flash — Behavioral Tests
 *
 * PART B: Initial Entry True Bottom
 *   The initial scroll effect must settle at the true bottom after layout
 *   settles (images, voicemail cards, etc.). The fix changes the
 *   ResizeObserver to observe the inner content element (not the scroll
 *   container, which has a fixed height) and uses a settle counter to
 *   detect when the content has truly stopped changing.
 *
 * PART C: Sent Image Reload/Remount Flash
 *   The MessageMediaRenderer useEffect depended on `[media]` (the array
 *   reference). When a conversation refetch occurs, the API returns
 *   messages with new `media` array references, causing the effect to
 *   fire again, re-fetching blob URLs and changing the image `src`.
 *   The fix uses a stable string fingerprint (media IDs + URLs) as the
 *   useEffect dependency instead of the array reference.
 */

import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

// ============================================================================
// Helper: read source file
// ============================================================================
function readSrc(relativePath: string): string {
  const fullPath = path.join(process.cwd(), relativePath)
  return fs.readFileSync(fullPath, 'utf-8')
}

// ============================================================================
// PART B: INITIAL ENTRY TRUE BOTTOM
// ============================================================================

describe('B. Initial entry true bottom', () => {
  describe('B.1 ResizeObserver observes inner content (not container)', () => {
    it('initial scroll effect observes container.firstElementChild', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

      // The fix: observe the inner content element, not the scroll container.
      // The scroll container has a fixed height (flex-1 min-h-0); its dimensions
      // don't change when images load. The inner content's dimensions DO change.
      expect(source).toContain('container.firstElementChild')
      expect(source).toContain('resizeObserver.observe(innerContent')
    })

    it('falls back to observing container if no firstElementChild', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

      // Fallback: if no inner content, observe the container
      expect(source).toContain('resizeObserver.observe(container)')
    })
  })

  describe('B.2 Settle counter for layout stability', () => {
    it('uses a settle counter to detect when content has stopped changing', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

      // The fix: track lastScrollHeight and settleCount
      expect(source).toContain('lastScrollHeight')
      expect(source).toContain('settleCount')
      expect(source).toContain('settleCount >= 2')
    })

    it('does NOT mark initial scroll as done after a single RAF', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

      // The old code marked initial scroll as done in the RAF callback:
      //   isInitialAutoScrollingRef.current = false
      //   setHasScrolledToBottomOnLoad(true)
      // The new code does NOT do this in the first RAF — it only scrolls
      // to bottom and lets the ResizeObserver detect settle.
      //
      // Find the RAF callback that does NOT immediately mark as done
      const rafSection = source.substring(
        source.indexOf('Layout-aware reconciliation: RAF pass to scroll to bottom after initial layout'),
        source.indexOf('Fallback: if the ResizeObserver')
      )
      expect(rafSection).toContain('scrollToTrueBottom(container)')
      // The RAF should NOT set isInitialAutoScrollingRef.current = false
      // (that's now handled by the ResizeObserver settle detection)
      expect(rafSection).not.toContain('isInitialAutoScrollingRef.current = false')
    })
  })

  describe('B.3 Fallback for text-only messages', () => {
    it('has a double-RAF fallback for text-only messages', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

      // Fallback: if the ResizeObserver doesn't fire enough times (text-only
      // messages with no images), mark as done after a second RAF.
      expect(source).toContain('Fallback: if the ResizeObserver')
      expect(source).toContain('Content hasn\'t changed in 2 frames')
    })
  })

  describe('B.4 Follow-latest not broadened', () => {
    it('followLatestRef is still used for post-initial-scroll behavior', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

      // The follow-latest behavior is preserved — the ResizeObserver callback
      // gates on followLatestRef after initial scroll is done. It must NOT
      // re-check isContainerNearBottom post-resize: the RO fires BECAUSE the
      // content just grew, so measuring near-bottom then falsely reads false.
      expect(source).toMatch(/if \(followLatestRef\.current\) \{\s*scrollToTrueBottom\(container\)/)
      expect(source).not.toContain('followLatestRef.current && isContainerNearBottom(container)')
    })

    it('does NOT force scroll after user scrolls up', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')

      // The scroll handler updates followLatestRef based on user scroll position
      // This is the existing behavior — not broadened or changed.
      expect(source).toContain('followLatestRef.current = isNearBottom')
    })
  })
})

// ============================================================================
// PART C: SENT IMAGE RELOAD / REMOUNT FLASH
// ============================================================================

describe('C. Media flash — stable fingerprint prevents unnecessary re-fetch', () => {
  describe('C.1 Media fingerprint is used as useEffect dependency', () => {
    it('MessageMediaRenderer uses mediaFingerprint', () => {
      const source = readSrc('src/components/MessageMediaRenderer.tsx')

      expect(source).toContain('mediaFingerprint')
      expect(source).toContain('useMemo')
    })

    it('fingerprint is based on media IDs + URLs + local-preview flags', () => {
      const source = readSrc('src/components/MessageMediaRenderer.tsx')

      // The fingerprint includes media ID, URL, and isLocalPreview flag
      expect(source).toContain('m.id')
      expect(source).toContain('m.media_url')
      expect(source).toContain('m.isLocalPreview')
    })

    it('fetch useEffect depends on mediaFingerprint (not media array)', () => {
      const source = readSrc('src/components/MessageMediaRenderer.tsx')

      // The fetch useEffect should depend on mediaFingerprint, not media
      // Find the fetch effect and verify its dependency
      const fetchEffectMatch = source.match(
        /fetchUrls\(\)\s*\n\s*\},\s*\[([^\]]+)\]/
      )
      expect(fetchEffectMatch).toBeTruthy()
      expect(fetchEffectMatch![1]).toContain('mediaFingerprint')
      expect(fetchEffectMatch![1]).not.toBe('media')
    })
  })

  describe('C.2 Fingerprint stability', () => {
    it('same media content produces same fingerprint', () => {
      // Simulate the fingerprint computation
      function computeFingerprint(media: any[]): string {
        return (media || [])
          .map(m => `${m.id}:${m.media_url}:${m.isLocalPreview ? '1' : '0'}`)
          .join('|')
      }

      const media1 = [
        { id: 'media-1', media_url: 'https://example.com/img.jpg', isLocalPreview: false },
        { id: 'media-2', media_url: 'https://example.com/img2.jpg', isLocalPreview: false },
      ]
      const media2 = [
        { id: 'media-1', media_url: 'https://example.com/img.jpg', isLocalPreview: false },
        { id: 'media-2', media_url: 'https://example.com/img2.jpg', isLocalPreview: false },
      ]

      // Different array references, same content
      expect(media1).not.toBe(media2) // different references
      expect(computeFingerprint(media1)).toBe(computeFingerprint(media2)) // same fingerprint
    })

    it('different media content produces different fingerprint', () => {
      function computeFingerprint(media: any[]): string {
        return (media || [])
          .map(m => `${m.id}:${m.media_url}:${m.isLocalPreview ? '1' : '0'}`)
          .join('|')
      }

      const media1 = [
        { id: 'media-1', media_url: 'https://example.com/img.jpg', isLocalPreview: false },
      ]
      const media2 = [
        { id: 'media-1', media_url: 'https://example.com/different.jpg', isLocalPreview: false },
      ]

      expect(computeFingerprint(media1)).not.toBe(computeFingerprint(media2))
    })

    it('optimistic to server transition changes fingerprint (URL changes)', () => {
      function computeFingerprint(media: any[]): string {
        return (media || [])
          .map(m => `${m.id}:${m.media_url}:${m.isLocalPreview ? '1' : '0'}`)
          .join('|')
      }

      // Optimistic message with local preview
      const optimisticMedia = [
        { id: 'media-1', media_url: 'blob:abc123', isLocalPreview: true },
      ]
      // Server message with real URL
      const serverMedia = [
        { id: 'media-1', media_url: 'https://supabase.co/storage/v1/...', isLocalPreview: false },
      ]

      // The fingerprint changes — this is correct, the image SHOULD update
      expect(computeFingerprint(optimisticMedia)).not.toBe(computeFingerprint(serverMedia))
    })

    it('unrelated conversation update does NOT change fingerprint', () => {
      function computeFingerprint(media: any[]): string {
        return (media || [])
          .map(m => `${m.id}:${m.media_url}:${m.isLocalPreview ? '1' : '0'}`)
          .join('|')
      }

      // Original media from initial fetch
      const originalMedia = [
        { id: 'media-1', media_url: 'https://supabase.co/storage/v1/photo.jpg', isLocalPreview: false },
      ]
      // Same media from refetch (new array reference, same content)
      const refetchedMedia = [
        { id: 'media-1', media_url: 'https://supabase.co/storage/v1/photo.jpg', isLocalPreview: false },
      ]

      // Different references
      expect(originalMedia).not.toBe(refetchedMedia)
      // Same fingerprint — no re-fetch, no flash
      expect(computeFingerprint(originalMedia)).toBe(computeFingerprint(refetchedMedia))
    })
  })

  describe('C.3 Message key stability', () => {
    it('getMessageKey uses clientMessageId for optimistic messages', () => {
      const source = readSrc('src/components/MobileConversationMessageList.tsx')

      expect(source).toContain('function getMessageKey')
      expect(source).toContain('clientMessageId')
    })

    it('getMessageKey uses database ID for persisted messages', () => {
      const source = readSrc('src/components/MobileConversationMessageList.tsx')

      expect(source).toContain('msg.id')
      expect(source).toContain("msg.id.includes('-')")
    })
  })
})

// ============================================================================
// VOICEMAIL SEEK — VoicemailMessage.seekTo canonical duration
// ============================================================================

describe('A. Voicemail seek — VoicemailMessage.seekTo uses canonical duration', () => {
  it('seekTo uses audio.duration as canonical (not shared context duration)', () => {
    const source = readSrc('src/components/VoicemailMessage.tsx')

    // The fix: use audio.duration as the canonical duration
    expect(source).toContain('audioDuration')
    expect(source).toContain('canonicalDuration')
    expect(source).toContain('Number.isFinite(audioDuration)')
  })

  it('seekTo falls back to shared context duration if audio.duration is invalid', () => {
    const source = readSrc('src/components/VoicemailMessage.tsx')

    // Fall back to `duration` from shared context
    expect(source).toContain(': duration')
  })

  it('seekTo clamps to canonical duration (not shared context duration)', () => {
    const source = readSrc('src/components/VoicemailMessage.tsx')

    // The clamp should use canonicalDuration, not duration
    expect(source).toContain('Math.min(time, canonicalDuration)')
  })
})

// ============================================================================
// PART D: SCROLL OWNERSHIP — TOP-JUMP REGRESSION
// ============================================================================
// Physical bug: the conversation could land near the bottom and then jump
// toward the TOP/oldest messages during layout/media settling.
// Root causes fixed in page-client.tsx:
//   1. scrollToTrueBottom measured the sentinel in viewport space but never
//      added container.scrollTop back — a repeat call computed
//      target = correct - currentScrollTop, i.e. scrollTop = 0 when already
//      at the bottom.
//   2. The initial-scroll effect's cleanup marked the scroll as "settled" on
//      teardown, so an effect re-run mid-settle (messagesArray.length change
//      while media hydrated) permanently abandoned the bottom anchor.
//   3. The customer-switch reset ran as a passive effect AFTER the
//      initial-scroll effect on the same commit, so a same-count new thread
//      could inherit the previous conversation's settled flag.
//   4. The post-settle ResizeObserver branch re-measured isContainerNearBottom
//      AFTER the growth that triggered it — falsely reading "not near bottom"
//      for a bottom-pinned user.

describe('D. Scroll ownership — no jump toward oldest/top', () => {
  describe('D.1 scrollToTrueBottom is idempotent (repeat calls stay at bottom)', () => {
    it('pins the exact scrollable maximum, not sentinel geometry', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
      const match = source.match(/const scrollToTrueBottom = useCallback\([\s\S]*?\}, \[\]\)/)
      expect(match).toBeTruthy()
      // scrollHeight - clientHeight is inherently idempotent: repeat calls land
      // on the same maximum regardless of the current scrollTop. The old
      // sentinel-position path depended on wrapper padding and landed short.
      expect(match![0]).toContain('container.scrollTop = Math.max(0, container.scrollHeight - container.clientHeight)')
      expect(match![0]).not.toContain('sentinelTop')
      expect(match![0]).not.toContain('data-bottom-sentinel')
    })
  })

  describe('D.2 Effect teardown must not fake a completed settle', () => {
    it('cleanup only disconnects/cancels — never marks initialScrollSettledRef', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
      const cleanup = source.match(/const cleanup = \(\) => \{[\s\S]*?\n      \}/)
      expect(cleanup).toBeTruthy()
      expect(cleanup![0]).not.toContain('initialScrollSettledRef.current = true')
      expect(cleanup![0]).not.toContain('setHasScrolledToBottomOnLoad(true)')
      expect(cleanup![0]).not.toContain('setInitialScrollReady(true)')
    })
  })

  describe('D.3 Customer switch re-anchors the new conversation', () => {
    it('initial-scroll effect re-runs on params.id change', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
      expect(source).toContain('}, [loading, messagesArray.length, params.id, scrollToTrueBottom, isContainerNearBottom])')
    })

    it('scroll-state reset uses useLayoutEffect so it runs before the initial-scroll effect', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
      const reset = source.match(/Reset scroll state when navigating to a different customer[\s\S]*?\}, \[params\.id\]\)/)
      expect(reset).toBeTruthy()
      expect(reset![0]).toContain('useLayoutEffect(() => {')
      expect(reset![0]).toContain('initialScrollSettledRef.current = false')
      expect(reset![0]).toContain('followLatestRef.current = true')
    })
  })

  describe('D.4 No scroll writer targets the top/oldest message', () => {
    it('no conversation-container path writes scrollTop = 0', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
      // scrollTop = 0 on the scroll container would jump to oldest messages.
      // (Composer textarea scrollTop resets are unrelated and not matched.)
      expect(source).not.toMatch(/container\.scrollTop = 0/)
      expect(source).not.toMatch(/conversationContainerRef\.current\.scrollTop = 0/)
      expect(source).not.toMatch(/mobileConversationContainerRef\.current\.scrollTop = 0/)
    })

    it('no scrollIntoView call is used to position the conversation container', () => {
      const source = readSrc('src/app/dashboard/leads/[id]/page-client.tsx')
      const scrollSection = source.substring(
        source.indexOf('=== CANONICAL SCROLL SYSTEM ==='),
        source.indexOf('const handleSaveNotes')
      )
      // Match actual calls, not the word appearing in explanatory comments.
      expect(scrollSection).not.toMatch(/\.scrollIntoView\(/)
    })
  })
})
