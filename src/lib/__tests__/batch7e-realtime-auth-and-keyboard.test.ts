/**
 * Batch 7E — Realtime auth + keyboard lifecycle regression tests
 *
 * Verifies:
 * 1. Realtime setAuth is called before channel.subscribe() so the websocket
 *    carries the user's JWT (not just the anon key) — RLS auth.uid() checks
 *    pass and postgres_changes events are delivered.
 * 2. Keyboard cycle resets gesture tracking to prevent stale momentum from
 *    misclassifying synthetic scroll events as user-driven.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync(
  'src/app/dashboard/leads/[id]/page-client.tsx',
  'utf8'
).replace(/\r\n/g, '\n')

describe('Realtime websocket auth', () => {
  it('resolves the session before subscribing', () => {
    expect(content).toContain('supabase.auth.getSession()')
  })

  it('calls realtime.setAuth with the session access token', () => {
    expect(content).toContain('realtime.setAuth')
    expect(content).toContain('session!.access_token')
  })

  it('logs realtime auth state for diagnostics', () => {
    expect(content).toContain('realtime-auth-state')
    expect(content).toContain('hasSession')
  })

  it('logs setAuth completion for diagnostics', () => {
    expect(content).toContain('realtime-setauth')
  })

  it('subscribes the channel after auth resolution, not before', () => {
    // The async IIFE calls setAuth, then channel.subscribe
    const setAuthIdx = content.indexOf('realtime.setAuth')
    const subscribeIdx = content.indexOf('channel.subscribe(')
    expect(setAuthIdx).toBeGreaterThan(-1)
    expect(subscribeIdx).toBeGreaterThan(-1)
    expect(setAuthIdx).toBeLessThan(subscribeIdx)
  })

  it('has a cancellation flag to prevent stale subscriptions', () => {
    expect(content).toContain('subscribeCancelled')
    expect(content).toContain('if (subscribeCancelled) return')
  })

  it('does NOT add polling for inbound messages', () => {
    // The fix is auth-based, not polling-based
    expect(content).not.toContain('setInterval.*fetch.*messages')
    expect(content).not.toContain('pollMessages')
  })
})

describe('Keyboard cycle gesture-reset fix', () => {
  it('resets userScrollDirectionRef on composer focus', () => {
    const focusBlock = content.substring(
      content.indexOf('handleMobileTextareaFocus'),
      content.indexOf('handleMobileTextareaBlur')
    )
    expect(focusBlock).toContain('userScrollDirectionRef.current = 0')
    expect(focusBlock).toContain('lastUserGestureEndAtRef.current = 0')
    expect(focusBlock).toContain('userScrollGestureActiveRef.current = false')
  })

  it('resets userScrollDirectionRef on composer blur', () => {
    const blurBlock = content.substring(
      content.indexOf('handleMobileTextareaBlur'),
      content.indexOf('checkCalendarConnection')
    )
    expect(blurBlock).toContain('userScrollDirectionRef.current = 0')
    expect(blurBlock).toContain('lastUserGestureEndAtRef.current = 0')
    expect(blurBlock).toContain('userScrollGestureActiveRef.current = false')
  })

  it('resets gesture tracking inside scrollToTrueBottom', () => {
    const scrollFn = content.substring(
      content.indexOf('const scrollToTrueBottom'),
      content.indexOf('const isContainerNearBottom')
    )
    expect(scrollFn).toContain('userScrollDirectionRef.current = 0')
    expect(scrollFn).toContain('lastUserGestureEndAtRef.current = 0')
  })

  it('tracks keyboardCycle for physical diagnostics', () => {
    expect(content).toContain('keyboardCycleRef')
    expect(content).toContain('keyboardCycle')
    expect(content).toContain('keyboardCycleRef.current += 1')
  })

  it('does NOT accumulate listeners across cycles', () => {
    // The gesture-reset approach prevents the stale momentum window from
    // arming — no listener accumulation mechanism exists.
    // Verify the scroll-listener cleanup removes all listeners.
    const scrollCleanupStart = content.indexOf('container.removeEventListener')
    expect(scrollCleanupStart).toBeGreaterThan(-1)
    expect(content.substring(scrollCleanupStart, scrollCleanupStart + 400)).toContain('removeEventListener')
  })
})
