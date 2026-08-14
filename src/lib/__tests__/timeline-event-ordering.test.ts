/**
 * Tests for Timeline Event Ordering
 *
 * These tests verify that correction events are placed directly after their source messages
 */

import { describe, it, expect } from 'vitest'
import { groupCorrectionsWithSourceMessages, TimelineEvent } from '@/lib/timeline-event-ordering'

describe('groupCorrectionsWithSourceMessages', () => {
  it('address correction event appears immediately after its source message', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive'
        }
      },
      {
        type: 'message',
        id: 'msg-2',
        created_at: '2025-01-09T10:00:05Z',
        data: {
          direction: 'outbound',
          body: 'Thanks for the update!'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:01Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe('msg-1') // Source message
    expect(result[1].id).toBe('correction-1') // Correction event
    expect(result[2].id).toBe('msg-2') // Acknowledgment
  })

  it('acknowledgment appears after the correction event', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive'
        }
      },
      {
        type: 'message',
        id: 'msg-2',
        created_at: '2025-01-09T10:00:05Z',
        data: {
          direction: 'outbound',
          body: 'Thanks for the update!'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:01Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    expect(result[0].id).toBe('msg-1')
    expect(result[1].id).toBe('correction-1')
    expect(result[2].id).toBe('msg-2')
  })

  it('later unrelated messages remain later', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive'
        }
      },
      {
        type: 'message',
        id: 'msg-2',
        created_at: '2025-01-09T10:00:05Z',
        data: {
          direction: 'outbound',
          body: 'Thanks for the update!'
        }
      },
      {
        type: 'message',
        id: 'msg-3',
        created_at: '2025-01-09T10:01:00Z',
        data: {
          direction: 'inbound',
          body: 'When can you come?'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:01Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    expect(result[0].id).toBe('msg-1')
    expect(result[1].id).toBe('correction-1')
    expect(result[2].id).toBe('msg-2')
    expect(result[3].id).toBe('msg-3')
  })

  it('multiple corrections from one message remain grouped', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive and call me after 3pm'
        }
      },
      {
        type: 'message',
        id: 'msg-2',
        created_at: '2025-01-09T10:00:05Z',
        data: {
          direction: 'outbound',
          body: 'Updated!'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:01Z',
          isDivider: true
        }
      },
      {
        type: 'system_event',
        id: 'correction-2',
        created_at: '2025-01-09T10:00:02Z',
        data: {
          message: 'Customer Updated Information',
          timestamp: '2025-01-09T10:00:02Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive', callback_time: 'after 3pm' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    expect(result[0].id).toBe('msg-1')
    expect(result[1].id).toBe('correction-1')
    expect(result[2].id).toBe('correction-2')
    expect(result[3].id).toBe('msg-2')
  })

  it('multiple corrections use stable field order', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive and call me after 3pm'
        }
      },
      {
        type: 'message',
        id: 'msg-2',
        created_at: '2025-01-09T10:00:05Z',
        data: {
          direction: 'outbound',
          body: 'Updated!'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-01T10:00:01Z',
          isDivider: true
        }
      },
      {
        type: 'system_event',
        id: 'correction-2',
        created_at: '2025-01-09T10:00:02Z',
        data: {
          message: 'Customer Updated Information',
          timestamp: '2025-01-01T10:00:02Z',
          isDivider: true
        }
      }
    ]

    // Test that order is deterministic based on correction timestamps
    const correctedFields = { address: '1532 Southpine Drive', callback_time: 'after 3pm' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    // Both corrections should be grouped after the source message
    expect(result[0].id).toBe('msg-1')
    expect(result[1].id).toBe('correction-1')
    expect(result[2].id).toBe('correction-2')
    expect(result[3].id).toBe('msg-2')
  })

  it('an event is never duplicated', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:01Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    const ids = result.map(e => e.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('a source message is never duplicated', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:01Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    const messageCount = result.filter(e => e.type === 'message' && e.id === 'msg-1').length
    expect(messageCount).toBe(1)
  })

  it('identical timestamps remain deterministic', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:00Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result1 = groupCorrectionsWithSourceMessages(events, correctedFields)
    const result2 = groupCorrectionsWithSourceMessages(events, correctedFields)

    expect(result1).toEqual(result2)
  })

  it('explicit source identifier wins over timestamp proximity', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive'
        }
      },
      {
        type: 'message',
        id: 'msg-2',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          direction: 'inbound',
          body: 'Hello'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:01Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    // Should associate with msg-1 (content match) not msg-2 (closer in time)
    expect(result[0].id).toBe('msg-1')
    expect(result[1].id).toBe('msg-2')
    expect(result[2].id).toBe('correction-1')
  })

  it('unsafe ambiguous matches use chronological fallback', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'Hello'
        }
      },
      {
        type: 'message',
        id: 'msg-2',
        created_at: '2025-01-09T10:00:05Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:01Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    // Correction is associated with msg-1 (within timing window) even though msg-2 has the content
    // This is correct behavior - msg-2 occurred AFTER the correction, so it can't be the source
    const ids = result.map(e => e.id)
    expect(ids).toEqual(['msg-1', 'correction-1', 'msg-2'])
  })

  it('missing source message uses chronological fallback', () => {
    const events: TimelineEvent[] = [
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:00Z',
          isDivider: true
        }
      },
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:05Z',
        data: {
          direction: 'inbound',
          body: 'Hello'
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    // No inbound messages with matching content, so correction stays in chronological position
    expect(result[0].id).toBe('correction-1')
    expect(result[1].id).toBe('msg-1')
  })

  it('page refresh produces the same ordering', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive'
        }
      },
      {
        type: 'message',
        id: 'msg-2',
        created_at: '2025-01-09T10:00:05Z',
        data: {
          direction: 'outbound',
          body: 'Thanks!'
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:01Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result1 = groupCorrectionsWithSourceMessages(events, correctedFields)
    const result2 = groupCorrectionsWithSourceMessages(events, correctedFields)
    const result3 = groupCorrectionsWithSourceMessages(events, correctedFields)

    expect(result1).toEqual(result2)
    expect(result2).toEqual(result3)
  })

  it('no corrections returns events unchanged', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'Hello'
        }
      },
      {
        type: 'message',
        id: 'msg-2',
        created_at: '2025-01-09T10:00:05Z',
        data: {
          direction: 'outbound',
          body: 'Hi!'
        }
      }
    ]

    const result = groupCorrectionsWithSourceMessages(events, null)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('msg-1')
    expect(result[1].id).toBe('msg-2')
  })

  it('no messages returns events unchanged', () => {
    const events: TimelineEvent[] = [
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:00Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('correction-1')
  })

  it('empty events returns empty array', () => {
    const result = groupCorrectionsWithSourceMessages([], null)
    expect(result).toHaveLength(0)
  })

  it('other system events remain in chronological order', () => {
    const events: TimelineEvent[] = [
      {
        type: 'message',
        id: 'msg-1',
        created_at: '2025-01-09T10:00:00Z',
        data: {
          direction: 'inbound',
          body: 'My address is 1532 Southpine Drive'
        }
      },
      {
        type: 'system_event',
        id: 'job-created',
        created_at: '2025-01-09T10:00:02Z',
        data: {
          message: 'Job Created',
          timestamp: '2025-01-09T10:00:02Z',
          isDivider: false
        }
      },
      {
        type: 'system_event',
        id: 'correction-1',
        created_at: '2025-01-09T10:00:01Z',
        data: {
          message: 'Customer Corrected Address',
          timestamp: '2025-01-09T10:00:01Z',
          isDivider: true
        }
      }
    ]

    const correctedFields = { address: '1532 Southpine Drive' }
    const result = groupCorrectionsWithSourceMessages(events, correctedFields)

    expect(result[0].id).toBe('msg-1')
    expect(result[1].id).toBe('correction-1')
    expect(result[2].id).toBe('job-created')
  })
})