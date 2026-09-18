import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const pageClientSrc = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8')

describe('Batch 7B — conversation keyboard/true-bottom diagnostic instrumentation', () => {
  it('keeps [RF_CONVERSATION_SCROLL] logging gated in production unless native debug is enabled', () => {
    const logger = pageClientSrc.match(/const logConversationScroll = useCallback\([\s\S]*?\}, \[getScrollContainer\]\)/)?.[0] || ''
    expect(logger).toContain("process.env.NODE_ENV === 'production'")
    expect(logger).toContain('Capacitor.isNativePlatform()')
    expect(logger).toContain('rf_scroll_debug')
  })

  it('logs all required geometry and state fields without message content', () => {
    const logger = pageClientSrc.match(/const logConversationScroll = useCallback\([\s\S]*?\}, \[getScrollContainer\]\)/)?.[0] || ''
    const fields = [
      'scrollTop',
      'scrollHeight',
      'clientHeight',
      'maxScrollTop',
      'distanceFromBottom',
      'containerRect',
      'windowInnerHeight',
      'visualViewportHeight',
      'visualViewportOffsetTop',
      'effectiveVisibleBottom',
      'composerHeight',
      'composerRect',
      'inputFocused',
      'followMode',
      'userGestureArmed',
      'userScrollDirection',
      'lastUserGestureEndAt',
      'lastObservedScrollTop',
      'reconcileScheduled',
      'keyboardOpen',
    ]
    for (const field of fields) {
      expect(logger).toContain(field)
    }
    // No sensitive message/customer data should be logged
    expect(logger).not.toContain('messagesArray')
    expect(logger).not.toContain('message')
    expect(logger).not.toContain('caller_phone')
  })

  it('logs composer focus/blur, visual viewport resize/scroll, container resize, scroll events, and reconcile lifecycle', () => {
    expect(pageClientSrc).toContain("logConversationScroll('composer-focus'")
    expect(pageClientSrc).toContain("logConversationScroll('composer-blur'")
    expect(pageClientSrc).toContain("logConversationScroll('visual-viewport-resize'")
    expect(pageClientSrc).toContain("logConversationScroll('visual-viewport-scroll'")
    expect(pageClientSrc).toContain("logConversationScroll('container-resize'")
    expect(pageClientSrc).toContain("logConversationScroll('scroll-event'")
    expect(pageClientSrc).toContain("logConversationScroll('reconcile-scheduled'")
    expect(pageClientSrc).toContain("logConversationScroll('reconcile-frame'")
    expect(pageClientSrc).toContain("logConversationScroll('reconcile-finished'")
  })
})
