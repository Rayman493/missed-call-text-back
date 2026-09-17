import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageClientContent = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

describe('Conversation keyboard open preserves follow-latest intent', () => {
  it('uses a single canonical followLatestRef', () => {
    expect(pageClientContent).toMatch(/const followLatestRef = useRef\(true\)/)
    expect(pageClientContent).not.toMatch(/const \[followLatest/)
  })

  it('scroll handler ignores pointerdown/touchstart that originate from composer inputs/buttons', () => {
    // The fix guards gesture attribution so tapping the composer textarea does not
    // arm the user-scroll tracker, which would cause keyboard resize events to be
    // misclassified as user-driven and clear followLatestRef.
    expect(pageClientContent).toMatch(/isInteractiveScrollTarget/)
    expect(pageClientContent).toMatch(/target\.closest\('textarea, input, button, a, \[role="button"\], \[role="textbox"\]'\)/)
  })

  it('re-anchors to true bottom via visualViewport/ResizeObserver when following latest', () => {
    expect(pageClientContent).toMatch(/window\.visualViewport\.addEventListener\('resize'/)
    expect(pageClientContent).toMatch(/new ResizeObserver/)
    expect(pageClientContent).toMatch(/scrollToTrueBottom\(container\)/)
  })

  it('does not use blind timeouts for keyboard re-anchor', () => {
    const keyboardBlock = pageClientContent.match(/Handle keyboard resize[\s\S]*?\}, \[getScrollContainer, scrollToTrueBottom\]\)/)
    expect(keyboardBlock).toBeTruthy()
    expect(keyboardBlock![0]).not.toMatch(/setTimeout\(/)
  })
})
