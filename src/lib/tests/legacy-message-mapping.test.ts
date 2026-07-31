import { describe, it, expect } from 'vitest'
import { normalizeMessagesForDisplay } from '../legacy-message-mapper'

describe('normalizeMessagesForDisplay', () => {
  it('maps legacy AI rows with content only to body and direction', () => {
    const input = [
      { id: '1', content: 'AI call summary', message_type: 'summary', direction: null },
      { id: '2', content: 'Caller: hi\nAssistant: hello', message_type: 'transcript' },
      { id: '3', content: 'AI system failed.', message_type: 'system' },
    ]

    const result = normalizeMessagesForDisplay(input)

    expect(result[0].body).toBe('AI call summary')
    expect(result[0].direction).toBe('outbound')
    expect(result[1].body).toBe('Caller: hi\nAssistant: hello')
    expect(result[1].direction).toBe('inbound')
    expect(result[2].body).toBe('AI system failed.')
    expect(result[2].direction).toBe('outbound')
  })

  it('leaves normal SMS rows unchanged', () => {
    const input = [
      { id: '1', body: 'SMS text', direction: 'inbound', message_type: 'text' },
      { id: '2', body: 'Reply', direction: 'outbound', message_type: 'text' },
    ]

    const result = normalizeMessagesForDisplay(input)

    expect(result[0].body).toBe('SMS text')
    expect(result[0].direction).toBe('inbound')
    expect(result[1].body).toBe('Reply')
    expect(result[1].direction).toBe('outbound')
  })

  it('keeps existing body and direction when already set', () => {
    const input = [
      { id: '1', body: 'New summary', content: 'Old summary', direction: 'outbound', message_type: 'summary' },
    ]

    const result = normalizeMessagesForDisplay(input)

    expect(result[0].body).toBe('New summary')
    expect(result[0].direction).toBe('outbound')
  })

  it('returns an empty array for null/undefined input', () => {
    expect(normalizeMessagesForDisplay(null)).toEqual([])
    expect(normalizeMessagesForDisplay(undefined)).toEqual([])
  })
})
