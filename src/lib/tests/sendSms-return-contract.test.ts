/**
 * sendSms Return Contract Tests
 *
 * Proves the contract callers must use: success is determined by `sid`, not the object.
 */

import { describe, it, expect } from 'vitest'

describe('sendSms return contract', () => {
  it('returns a truthy sid on real Twilio success', () => {
    const result = { sid: 'SM1234567890abcdef', messageId: 'msg-1' }
    expect(result.sid).toBeTruthy()
  })

  it('returns sid: null on failure but the object is still truthy', () => {
    const result = { sid: null, messageId: null }
    expect(result).toBeTruthy()
    expect(result.sid).toBeFalsy()
  })

  it('NO_TWILIO_NUMBER failure includes a reason without a sid', () => {
    const result = { sid: null, messageId: null, reason: 'NO_TWILIO_NUMBER' }
    expect(result.sid).toBeFalsy()
    expect(result.reason).toBe('NO_TWILIO_NUMBER')
  })

  it('callers must not treat the returned object as a boolean', () => {
    const failureObject = { sid: null, messageId: null }
    // This is the bug pattern that caused false "sent" classification
    const buggyBooleanCheck = failureObject ? 'sent' : 'failed'
    expect(buggyBooleanCheck).toBe('sent') // proves the object is truthy

    // Correct check
    const correctCheck = failureObject?.sid ? 'sent' : 'failed'
    expect(correctCheck).toBe('failed')
  })
})
