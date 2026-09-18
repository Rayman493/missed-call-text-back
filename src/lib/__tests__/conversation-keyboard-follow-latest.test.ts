import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

describe('Conversation keyboard open preserves follow-latest intent', () => {
  it('uses a single canonical followLatestRef', () => {
    expect(pageClientContent).toMatch(/const followLatestRef = useRef\(true\)/)
    expect(pageClientContent).not.toMatch(/const \[followLatest/)
  })

  it('attributes scroll events to the user only via an armed gesture or bounded momentum', () => {
    // The composer is a SIBLING of the scroll container (verified in JSX), so
    // keyboard-open taps never arm the tracker. Scroll attribution requires an
    // active gesture or momentum continuing in the armed direction inside the
    // MOMENTUM_ATTRIBUTION_MS window — a plain scroll event can never clear
    // followLatestRef.
    expect(pageClientContent).toMatch(/MOMENTUM_ATTRIBUTION_MS/)
    expect(pageClientContent).toMatch(/userScrollGestureActiveRef/)
    expect(pageClientContent).toMatch(/Date\.now\(\) - lastUserGestureEndAtRef\.current <= MOMENTUM_ATTRIBUTION_MS/)
    expect(pageClientContent).toMatch(/isUserDriven/)
  })

  it('browser-generated scrolls cannot clear followLatestRef', () => {
    // followLatestRef may only be cleared inside the isUserDriven branch —
    // a non-user scroll event at most re-asserts follow mode near bottom.
    const scrollHandler = pageClientContent.match(/const handleScroll = \(\) => \{[\s\S]*?logConversationScroll\('scroll-event'/)
    expect(scrollHandler).toBeTruthy()
    const handler = scrollHandler![0]
    // The only write of followLatestRef.current = false comes from
    // `followLatestRef.current = isNearBottom` inside the user-driven branch.
    const falseWrites = handler.match(/followLatestRef\.current = false/g) || []
    expect(falseWrites.length).toBe(0)
    expect(handler).toMatch(/if \(isUserDriven\) \{\s*followLatestRef\.current = isNearBottom/)
    expect(handler).toMatch(/else if \(isNearBottom\) \{\s*followLatestRef\.current = true/)
  })

  it('re-anchors to true bottom via visualViewport/ResizeObserver when following latest', () => {
    expect(pageClientContent).toMatch(/window\.visualViewport\.addEventListener\('resize'/)
    expect(pageClientContent).toMatch(/new ResizeObserver/)
    expect(pageClientContent).toMatch(/scrollToTrueBottom\(container\)/)
    expect(pageClientContent).toMatch(/reconcileConversationBottom\('visual-viewport-resize'\)/)
  })

  it('does not use blind timeouts for keyboard re-anchor', () => {
    const keyboardBlock = pageClientContent.match(/Handle keyboard resize[\s\S]*?\}, \[getScrollContainer, scrollToTrueBottom, reconcileConversationBottom, logConversationScroll\]\)/)
    expect(keyboardBlock).toBeTruthy()
    expect(keyboardBlock![0]).not.toMatch(/setTimeout\(/)
  })
})
