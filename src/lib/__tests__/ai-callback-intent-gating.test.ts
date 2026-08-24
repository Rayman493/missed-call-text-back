/**
 * AI Callback Intent Gating Tests
 *
 * These tests verify that the AI semantic correction system
 * requires explicit callback intent before updating preferredCallbackTime,
 * not just time entity presence.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyzeSemanticCorrection } from '../ai-semantic-correction'

// Mock the OpenAI module at the module level
const mockCreate = vi.fn()
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate
      }
    }
  }))
}))

describe('AI Callback Intent Gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Set a fake API key to avoid the error
    process.env.OPENAI_API_KEY = 'fake-key-for-testing'
  })

  const mockExtractedInfo = {
    callerName: 'John Smith',
    reasonForCalling: 'Plumbing repair',
    importantDetails: 'Leaky faucet in kitchen',
    urgencyLevel: 'Not urgent',
    addressOrLocation: '123 Main St',
    preferredCallbackTime: null,
    callbackNumber: null
  }

  it('should update callback time for explicit callback intent', async () => {
    const mockCompletion = {
      choices: [{
        message: {
          content: JSON.stringify({
            shouldUpdate: true,
            updates: [{
              field: 'preferredCallbackTime',
              value: 'After 5 PM',
              action: 'correction'
            }],
            reason: 'Customer explicitly stated when to call back',
            confidence: 0.9
          })
        }
      }]
    }

    mockCreate.mockResolvedValue(mockCompletion)

    const result = await analyzeSemanticCorrection(
      'You can call me back after 5 PM.',
      mockExtractedInfo
    )

    expect(result.shouldUpdate).toBe(true)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].field).toBe('preferredCallbackTime')
    expect(result.updates[0].value).toBe('After 5 PM')
  })

  it('should NOT update callback time for incidental time mention', async () => {
    const mockCompletion = {
      choices: [{
        message: {
          content: JSON.stringify({
            shouldUpdate: false,
            updates: [],
            reason: 'Time mention is incidental, not explicit callback intent',
            confidence: 0.95
          })
        }
      }]
    }

    mockCreate.mockResolvedValue(mockCompletion)

    const result = await analyzeSemanticCorrection(
      '6:31 Test',
      mockExtractedInfo
    )

    expect(result.shouldUpdate).toBe(false)
    expect(result.updates).toHaveLength(0)
  })

  it('should NOT update callback time for past event time', async () => {
    const mockCompletion = {
      choices: [{
        message: {
          content: JSON.stringify({
            shouldUpdate: false,
            updates: [],
            reason: 'Past event time, not callback preference',
            confidence: 0.9
          })
        }
      }]
    }

    mockCreate.mockResolvedValue(mockCompletion)

    const result = await analyzeSemanticCorrection(
      'I got home around 6:31.',
      mockExtractedInfo
    )

    expect(result.shouldUpdate).toBe(false)
    expect(result.updates).toHaveLength(0)
  })

  it('should NOT update callback time for service arrival time', async () => {
    const mockCompletion = {
      choices: [{
        message: {
          content: JSON.stringify({
            shouldUpdate: false,
            updates: [],
            reason: 'Service arrival time, not callback preference',
            confidence: 0.9
          })
        }
      }]
    }

    mockCreate.mockResolvedValue(mockCompletion)

    const result = await analyzeSemanticCorrection(
      'The crew showed up at 6:31.',
      mockExtractedInfo
    )

    expect(result.shouldUpdate).toBe(false)
    expect(result.updates).toHaveLength(0)
  })

  it('should NOT update callback time for appointment scheduling without explicit callback intent', async () => {
    const mockCompletion = {
      choices: [{
        message: {
          content: JSON.stringify({
            shouldUpdate: false,
            updates: [],
            reason: 'Appointment time, not explicit callback preference',
            confidence: 0.85
          })
        }
      }]
    }

    mockCreate.mockResolvedValue(mockCompletion)

    const result = await analyzeSemanticCorrection(
      'Tomorrow at 6:31 works for the appointment.',
      mockExtractedInfo
    )

    expect(result.shouldUpdate).toBe(false)
    expect(result.updates).toHaveLength(0)
  })

  it('should update callback time for explicit callback preference with time', async () => {
    const mockCompletion = {
      choices: [{
        message: {
          content: JSON.stringify({
            shouldUpdate: true,
            updates: [{
              field: 'preferredCallbackTime',
              value: 'Morning',
              action: 'correction'
            }],
            reason: 'Explicit callback preference stated',
            confidence: 0.9
          })
        }
      }]
    }

    mockCreate.mockResolvedValue(mockCompletion)

    const result = await analyzeSemanticCorrection(
      'Mornings are usually best for a callback.',
      mockExtractedInfo
    )

    expect(result.shouldUpdate).toBe(true)
    expect(result.updates).toHaveLength(1)
    expect(result.updates[0].field).toBe('preferredCallbackTime')
    expect(result.updates[0].value).toBe('Morning')
  })

  it('should NOT update callback time for service availability mention', async () => {
    const mockCompletion = {
      choices: [{
        message: {
          content: JSON.stringify({
            shouldUpdate: false,
            updates: [],
            reason: 'Service availability, not callback preference',
            confidence: 0.9
          })
        }
      }]
    }

    mockCreate.mockResolvedValue(mockCompletion)

    const result = await analyzeSemanticCorrection(
      'We are usually open until 6.',
      mockExtractedInfo
    )

    expect(result.shouldUpdate).toBe(false)
    expect(result.updates).toHaveLength(0)
  })
})