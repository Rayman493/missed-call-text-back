/**
 * Inbound SMS realtime reliability — contract tests
 *
 * The customer conversation page relies on postgres_changes events for live
 * inbound SMS delivery. These tests pin the production contract that made
 * live delivery work:
 *
 *  - messages INSERT/UPDATE bindings carry NO server-side lead filter
 *    (a `lead_id=eq` filter was previously re-added and reproduced the
 *    "SUBSCRIBED but zero events" failure — client-side lead guard provides
 *    conversation isolation instead)
 *  - auth ordering: getSession → realtime.setAuth → channel.subscribe
 *  - unique channel names per subscription + cleanup removes old channels
 *  - ungated SUBSCRIBED confirmation log for live verification
 *  - focus/visibility self-heal performs a single deduped silent refresh
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'

const content = readFileSync(
  'src/app/dashboard/leads/[id]/page-client.tsx',
  'utf8'
).replace(/\r\n/g, '\n')

/** Extract a postgres_changes binding block starting at a marker. */
function bindingBlock(startMarker: string, fromIndex = 0): string {
  const start = content.indexOf(startMarker, fromIndex)
  expect(start).toBeGreaterThan(-1)
  const end = content.indexOf('(payload: any) =>', start)
  expect(end).toBeGreaterThan(start)
  return content.substring(start, end)
}

describe('messages postgres_changes bindings', () => {
  it('INSERT binding registers event=INSERT on public.messages', () => {
    const block = bindingBlock("event: 'INSERT'")
    expect(block).toContain("schema: 'public'")
    expect(block).toContain("table: 'messages'")
  })

  it('INSERT binding has NO server-side filter', () => {
    // Regression guard: the lead_id=eq filter previously re-broke delivery.
    const block = bindingBlock("event: 'INSERT'")
    expect(block).not.toContain('filter:')
  })

  it('UPDATE binding registers event=UPDATE on public.messages', () => {
    const block = bindingBlock("event: 'UPDATE'")
    expect(block).toContain("schema: 'public'")
    expect(block).toContain("table: 'messages'")
  })

  it('UPDATE binding has NO server-side filter', () => {
    const block = bindingBlock("event: 'UPDATE'")
    expect(block).not.toContain('filter:')
  })

  it('messages INSERT callback keeps the client-side lead guard', () => {
    const callback = content.substring(
      content.indexOf("event: 'INSERT'"),
      content.indexOf("event: 'UPDATE'")
    )
    expect(callback).toContain('newMessage.lead_id !== leadId')
    expect(callback).toContain('message-insert-rejected-lead')
    expect(callback).toContain('message-insert-accepted')
  })

  it('messages UPDATE callback keeps the client-side lead guard', () => {
    const callback = content.substring(
      content.indexOf("event: 'UPDATE'"),
      content.indexOf("event: '*'")
    )
    expect(callback).toContain('updatedMessage.lead_id !== leadId')
    expect(callback).toContain('message-update-rejected-lead')
  })

  it('INSERT callback merges through the canonical merge function', () => {
    const callback = content.substring(
      content.indexOf("event: 'INSERT'"),
      content.indexOf("event: 'UPDATE'")
    )
    expect(callback).toContain("mergeMessageWithMonotonicity(currentMessages, newMessage, 'realtime-insert')")
  })
})

describe('realtime auth ordering', () => {
  it('resolves the session before subscribing', () => {
    expect(content).toContain('supabase.auth.getSession()')
    expect(content.indexOf('supabase.auth.getSession()')).toBeLessThan(
      content.indexOf('channel.subscribe(')
    )
  })

  it('calls realtime.setAuth with the access token before channel.subscribe', () => {
    const setAuthIdx = content.indexOf('realtime.setAuth')
    const subscribeIdx = content.indexOf('channel.subscribe(')
    expect(setAuthIdx).toBeGreaterThan(-1)
    expect(subscribeIdx).toBeGreaterThan(-1)
    expect(setAuthIdx).toBeLessThan(subscribeIdx)
  })

  it('keeps the cancellation guard before channel.subscribe', () => {
    expect(content).toContain('if (subscribeCancelled) return')
    expect(content.indexOf('if (subscribeCancelled) return')).toBeLessThan(
      content.indexOf('channel.subscribe(')
    )
  })
})

describe('channel lifecycle', () => {
  it('uses unique channel names per lead + instance + sequence', () => {
    expect(content).toContain('`lead-detail:${leadId}:${realtimeInstanceIdRef.current}:${realtimeSubscriptionSequenceRef.current}`')
  })

  it('embeds the active lead id so navigation subscribes the new lead', () => {
    expect(content).toContain('lead-detail:${leadId}:')
    expect(content).toContain('currentLeadIdRef.current = leadId')
  })

  it('removes the previous channel before creating a new one', () => {
    expect(content).toContain('supabase.removeChannel(realtimeChannelRef.current)')
  })

  it('skips recreation only when the same lead is already subscribed', () => {
    expect(content).toContain("realtimeChannelStatusRef.current === 'subscribed'")
    expect(content).toContain('subscription-skip-healthy')
  })

  it('cleanup cancels pending subscribe and removes the channel', () => {
    expect(content).toContain('subscribeCancelled = true')
    const cleanupStart = content.indexOf('subscribeCancelled = true')
    const cleanupBlock = content.substring(cleanupStart, cleanupStart + 2000)
    expect(cleanupBlock).toContain('supabase.removeChannel')
  })

  it('logs an ungated SUBSCRIBED confirmation for live verification', () => {
    expect(content).toContain("status === 'SUBSCRIBED'")
    expect(content).toContain('[REALTIME] Successfully subscribed to lead')
  })

  it('keeps bounded recovery on channel error/closed/timed out', () => {
    expect(content).toContain('realtimeRecoveryAttemptsRef.current < 5')
    expect(content).toContain('setRealtimeGeneration')
  })
})

describe('foreground self-heal fallback', () => {
  it('listens for window focus and visibilitychange', () => {
    expect(content).toContain("window.addEventListener('focus', handleWindowFocus)")
    expect(content).toContain("document.addEventListener('visibilitychange', handleVisibilitySync)")
  })

  it('performs a silent refresh on foreground return (no loading flash)', () => {
    expect(content).toContain('handleRefresh({ silent: true })')
    const syncStart = content.indexOf('const handleForegroundSync')
    const syncBlock = content.substring(syncStart, syncStart + 1200)
    expect(syncBlock).toContain('handleRefresh({ silent: true })')
  })

  it('dedupes paired focus + visibility events', () => {
    expect(content).toContain('lastForegroundSyncAtRef')
    const syncStart = content.indexOf('const handleForegroundSync')
    const syncBlock = content.substring(syncStart, syncStart + 1200)
    expect(syncBlock).toContain('lastForegroundSyncAtRef.current')
  })

  it('re-arms channel recovery when the channel is not healthy', () => {
    const syncStart = content.indexOf('const handleForegroundSync')
    const syncBlock = content.substring(syncStart, syncStart + 1200)
    expect(syncBlock).toContain('handleReconnectionSignal')
  })

  it('removes focus and visibility listeners on cleanup', () => {
    expect(content).toContain("window.removeEventListener('focus', handleWindowFocus)")
    expect(content).toContain("document.removeEventListener('visibilitychange', handleVisibilitySync)")
  })

  it('does not add polling for inbound messages', () => {
    expect(content).not.toContain('pollMessages')
  })
})

describe('canonical merge import', () => {
  it('imports mergeMessageWithMonotonicity from the shared lib module', () => {
    expect(content).toContain("from '@/lib/message-merge'")
    expect(content).not.toContain('function mergeMessageWithMonotonicity')
  })
})
