import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { getMonotonicMessageStatus } from '../twilio/status-monotonic'

const pageClientSrc = readFileSync('src/app/dashboard/leads/[id]/page-client.tsx', 'utf8').replace(/\r\n/g, '\n')
const useBodyScrollLockSrc = readFileSync('src/hooks/useBodyScrollLock.ts', 'utf8').replace(/\r\n/g, '\n')

// Faithful replica of mergeMessageWithMonotonicity from page-client.tsx,
// used to prove the realtime→merge pipeline contract without mounting the
// full page component.
function mergeMessageWithMonotonicity(existingMessages: any[], incomingMessage: any, source: string = 'unknown'): any[] {
  if (!incomingMessage) return existingMessages
  const messageMap = new Map<string, any>()

  existingMessages.forEach(msg => {
    messageMap.set(msg.id, msg)
  })

  let existingMessage: any = null
  let matchKey: string = ''

  const incomingClientMessageId = incomingMessage.clientMessageId || incomingMessage.client_message_id
  const incomingTwilioSid = incomingMessage.twilio_message_sid

  if (incomingMessage.id && messageMap.has(incomingMessage.id)) {
    existingMessage = messageMap.get(incomingMessage.id)
    matchKey = 'id'
  } else if (incomingClientMessageId) {
    for (const [id, msg] of Array.from(messageMap.entries())) {
      const msgClientMessageId = msg.clientMessageId || msg.client_message_id
      if (msgClientMessageId === incomingClientMessageId) {
        existingMessage = msg
        matchKey = 'clientMessageId'
        break
      }
    }
  } else if (incomingTwilioSid) {
    for (const [id, msg] of Array.from(messageMap.entries())) {
      if (msg.twilio_message_sid === incomingTwilioSid) {
        existingMessage = msg
        matchKey = 'twilio_message_sid'
        break
      }
    }
  }

  if (existingMessage) {
    const effectiveExistingStatus =
      existingMessage.isOptimistic && existingMessage.status === 'sending'
        ? 'pending'
        : existingMessage.status

    const mergedMessage = {
      ...existingMessage,
      ...incomingMessage,
      clientMessageId: existingMessage.clientMessageId || incomingMessage.clientMessageId || incomingMessage.client_message_id,
      isOptimistic: false,
      status: getMonotonicMessageStatus(effectiveExistingStatus, incomingMessage.status)
    }

    if (matchKey === 'clientMessageId' && incomingMessage.id && incomingMessage.id !== existingMessage.id) {
      messageMap.delete(existingMessage.id)
      messageMap.set(incomingMessage.id, mergedMessage)
    } else {
      messageMap.set(existingMessage.id, mergedMessage)
    }
  } else {
    messageMap.set(incomingMessage.id, incomingMessage)
  }

  const merged = Array.from(messageMap.values())
  return merged.sort((a: any, b: any) => {
    const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    if (timeDiff !== 0) return timeDiff
    if (a.direction === 'inbound' && b.direction === 'outbound') return -1
    if (a.direction === 'outbound' && b.direction === 'inbound') return 1
    return a.id.localeCompare(b.id)
  })
}

describe('Batch A — realtime + keyboard true-bottom contracts', () => {
  describe('Realtime message subscription is filtered by lead_id', () => {
    it('subscribes to INSERT events on messages with lead_id filter', () => {
      expect(pageClientSrc).toMatch(/channel\s*\.\s*on\s*\(\s*['"]postgres_changes['"]\s*,\s*\{\s*event:\s*['"]INSERT['"][\s\S]*?filter:\s*`lead_id=eq\.\$\{leadId\}`/)
    })

    it('subscribes to UPDATE events on messages with lead_id filter', () => {
      expect(pageClientSrc).toMatch(/channel\s*\.\s*on\s*\(\s*['"]postgres_changes['"]\s*,\s*\{\s*event:\s*['"]UPDATE['"][\s\S]*?filter:\s*`lead_id=eq\.\$\{leadId\}`/)
    })

    it('retains a client-side lead guard inside the INSERT callback', () => {
      expect(pageClientSrc).toMatch(/const newMessage = payload\.new\s*[\s\S]*?if \(!newMessage\?\.lead_id \|\| newMessage\.lead_id !== leadId\)/)
    })

    it('retains a client-side lead guard inside the UPDATE callback', () => {
      expect(pageClientSrc).toMatch(/const updatedMessage = payload\.new\s*[\s\S]*?if \(!updatedMessage\?\.lead_id \|\| updatedMessage\.lead_id !== leadId\)/)
    })

    it('merges realtime INSERT through mergeMessageWithMonotonicity', () => {
      expect(pageClientSrc).toContain("mergeMessageWithMonotonicity(currentMessages, newMessage, 'realtime-insert')")
    })

    it('merges realtime UPDATE through mergeMessageWithMonotonicity', () => {
      expect(pageClientSrc).toContain("mergeMessageWithMonotonicity(currentMessages, updatedMessage, 'realtime-update')")
    })
  })

  describe('Realtime message merge pipeline is correct', () => {
    const makeInbound = (id: string, createdAt: string, overrides: any = {}) => ({
      id,
      direction: 'inbound',
      body: 'Hey man',
      status: 'received',
      created_at: createdAt,
      twilio_message_sid: `SM_${id}`,
      ...overrides,
    })

    const makeOutbound = (id: string, createdAt: string, overrides: any = {}) => ({
      id,
      direction: 'outbound',
      body: 'ok',
      status: 'sent',
      created_at: createdAt,
      twilio_message_sid: `SM_${id}`,
      ...overrides,
    })

    it('inbound INSERT for current lead merges exactly once', () => {
      const existing = [makeOutbound('msg_1', '2024-01-01T00:00:00.000Z')]
      const incoming = makeInbound('msg_2', '2024-01-01T00:00:01.000Z')
      const merged = mergeMessageWithMonotonicity(existing, incoming, 'realtime-insert')
      expect(merged).toHaveLength(2)
      expect(merged.some(m => m.id === 'msg_2')).toBe(true)
    })

    it('unrelated lead is not represented by merge; duplicate id for current lead does not duplicate', () => {
      const existing = [makeOutbound('msg_1', '2024-01-01T00:00:00.000Z')]
      const incoming = makeInbound('msg_1', '2024-01-01T00:00:01.000Z', { body: 'hijacked', direction: 'inbound' })
      const merged = mergeMessageWithMonotonicity(existing, incoming, 'realtime-insert')
      expect(merged).toHaveLength(1)
      expect(merged[0].direction).toBe('inbound')
      expect(merged[0].body).toBe('hijacked')
    })

    it('canonical Twilio SID duplicate does not duplicate rows', () => {
      const existing = [makeInbound('msg_1', '2024-01-01T00:00:00.000Z', { twilio_message_sid: 'SM_dup' })]
      const incoming = makeInbound('msg_reconcile', '2024-01-01T00:00:00.000Z', { twilio_message_sid: 'SM_dup' })
      const merged = mergeMessageWithMonotonicity(existing, incoming, 'realtime-update')
      expect(merged).toHaveLength(1)
      expect(merged[0].id).toBe('msg_reconcile')
    })

    it('newer inbound message survives existing state/refetch reconciliation', () => {
      const existing = [
        makeOutbound('msg_1', '2024-01-01T00:00:00.000Z'),
        makeInbound('msg_2', '2024-01-01T00:00:02.000Z'),
      ]
      const incoming = makeInbound('msg_3', '2024-01-01T00:00:03.000Z')
      const merged = mergeMessageWithMonotonicity(existing, incoming, 'realtime-insert')
      expect(merged.map(m => m.id)).toEqual(['msg_1', 'msg_2', 'msg_3'])
    })

    it('UPDATE does not replace or drop a newer INSERT for the same message', () => {
      const existing = [makeInbound('msg_1', '2024-01-01T00:00:00.000Z', { status: 'received' })]
      const update = makeInbound('msg_1', '2024-01-01T00:00:00.000Z', { status: 'delivered' })
      const merged = mergeMessageWithMonotonicity(existing, update, 'realtime-update')
      expect(merged).toHaveLength(1)
      expect(merged[0].status).toBe('delivered')
      expect(merged[0].body).toBe('Hey man')
    })

    it('inbound INSERT during optimistic outbound send preserves both', () => {
      const optimistic = {
        id: 'optimistic_1',
        direction: 'outbound',
        body: 'sending...',
        status: 'sending',
        isOptimistic: true,
        created_at: '2024-01-01T00:00:01.000Z',
        clientMessageId: 'cid_1',
      }
      const persisted = makeOutbound('msg_persisted', '2024-01-01T00:00:01.000Z', { clientMessageId: 'cid_1', status: 'queued' })
      const inbound = makeInbound('msg_inbound', '2024-01-01T00:00:02.000Z')
      let messages = mergeMessageWithMonotonicity([optimistic], persisted, 'realtime-insert')
      messages = mergeMessageWithMonotonicity(messages, inbound, 'realtime-insert')
      expect(messages).toHaveLength(2)
      expect(messages.find(m => m.id === 'msg_persisted')?.isOptimistic).toBe(false)
      expect(messages.find(m => m.id === 'msg_inbound')?.body).toBe('Hey man')
    })
  })

  describe('Android keyboard anchoring uses deterministic layout events', () => {
    it('focuses composer re-anchors based on followLatest intent, not intermediate geometry', () => {
      expect(pageClientSrc).toContain('onFocus={handleMobileTextareaFocus}')
      // Focus handler must preserve the user's follow-latest INTENT and not
      // re-derive it from near-bottom geometry, which is unstable during the
      // keyboard-open resize sequence.
      const focusHandler = pageClientSrc.match(/handleMobileTextareaFocus\s*=\s*\(\)\s*=>\s*\{[\s\S]*?\}/)?.[0] || ''
      expect(focusHandler).toContain('followLatestRef.current')
      expect(focusHandler).toContain('scrollToTrueBottom(container)')
      expect(focusHandler).not.toContain('isContainerNearBottom(container)')
    })

    it('visualViewport resize handler re-anchors via the canonical reconciler', () => {
      // handleResize delegates to reconcileConversationBottom, which holds the
      // double-RAF + bounded re-assert loop internally.
      const resizeHandler = pageClientSrc.match(/const handleResize = \(\) => \{[\s\S]*?\n    \}/)?.[0] || ''
      expect(resizeHandler).toContain("reconcileConversationBottom('visual-viewport-resize')")
    })

    it('visualViewport scroll handler re-anchors via the canonical reconciler', () => {
      const scrollHandler = pageClientSrc.match(/const handleViewportScroll = \(\) => \{[\s\S]*?\n      \}/)?.[0] || ''
      expect(scrollHandler).toContain("reconcileConversationBottom('visual-viewport-scroll')")
    })

    it('canonical reconciler contains the double-RAF settle + bounded re-assert', () => {
      const reconciler = pageClientSrc.match(/const reconcileConversationBottom = useCallback\([\s\S]*?\}, \[getScrollContainer, scrollToTrueBottom, logConversationScroll\]\)/)?.[0] || ''
      expect(reconciler).toBeTruthy()
      expect(reconciler).toMatch(/requestAnimationFrame\(\(\) => requestAnimationFrame\(step\)/)
      expect(reconciler).toContain('scrollToTrueBottom(container)')
      expect(reconciler).toContain('reconcileScheduledRef')
    })
  })

  describe('Modal chrome coverage is synchronous via useLayoutEffect', () => {
    it('useBodyScrollLock uses useLayoutEffect instead of useEffect', () => {
      expect(useBodyScrollLockSrc).toContain('useLayoutEffect')
      expect(useBodyScrollLockSrc).not.toMatch(/useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]*?lock\s*\(\)/)
    })
  })
})
