/**
 * Micro-hardening: Twilio error normalization.
 *
 * Production finding: warm-inventory replenishment hit Twilio's
 * "Phone Number or Short Code is already in the Messaging Service"
 * error (numeric `code`), and the classifier threw
 * `TypeError: code?.toLowerCase is not a function`, misclassifying the
 * condition as an unknown/definitive failure. These tests pin the safe
 * normalization contract.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { normalizeErrorField, isTransientError } from '../twilio-error-utils'

const repoRoot = path.resolve(__dirname, '../../..')
const WARM = readFileSync(path.join(repoRoot, 'src/lib/warm-number-manager.ts'), 'utf8')

describe('normalizeErrorField', () => {
  it('lowercases string values', () => {
    expect(normalizeErrorField('ECONNRESET')).toBe('econnreset')
  })

  it('stringifies numeric codes without throwing', () => {
    expect(() => normalizeErrorField(21705)).not.toThrow()
    expect(normalizeErrorField(21705)).toBe('21705')
    expect(normalizeErrorField(503)).toBe('503')
  })

  it('handles null / undefined', () => {
    expect(normalizeErrorField(null)).toBe('')
    expect(normalizeErrorField(undefined)).toBe('')
  })

  it('handles objects / unexpected shapes without throwing', () => {
    expect(() => normalizeErrorField({ code: 'x' })).not.toThrow()
    expect(normalizeErrorField({})).toBe('[object object]')
    expect(normalizeErrorField(true)).toBe('true')
  })
})

describe('isTransientError — never throws on non-string fields', () => {
  const cases: Array<[string, any]> = [
    ['string code', { code: 'ECONNRESET', message: 'socket error' }],
    ['numeric code', { code: 21705, message: 'Phone Number or Short Code is already in the Messaging Service.' }],
    ['null code', { code: null, message: 'boom' }],
    ['undefined code', { message: 'boom' }],
    ['object code', { code: { nested: 1 }, message: 'boom' }],
    ['numeric message', { code: 'x', message: 42 }],
    ['null message', { code: 'x', message: null }],
    ['non-Error value', 'plain string thrown'],
    ['null error', null],
    ['undefined error', undefined],
  ]
  for (const [label, err] of cases) {
    it(`does not throw for ${label}`, () => {
      expect(() => isTransientError(err)).not.toThrow()
    })
  }

  it('classifies the already-in-Messaging-Service condition as non-transient', () => {
    // Message-based; do not assume a specific numeric code.
    const err = { code: 21705, message: 'Phone Number or Short Code is already in the Messaging Service.' }
    expect(isTransientError(err)).toBe(false)
  })

  it('still classifies genuine transient failures', () => {
    expect(isTransientError({ message: 'fetch failed' })).toBe(true)
    expect(isTransientError({ message: 'Connection reset by peer' })).toBe(true)
    expect(isTransientError({ code: '503' })).toBe(true)
    expect(isTransientError({ code: 503 })).toBe(true)
  })

  it('unrelated Twilio errors remain non-transient', () => {
    expect(isTransientError({ code: 21211, message: 'Invalid phone number' })).toBe(false)
  })
})

describe('warm-number-manager uses the shared safe classifier', () => {
  it('imports from twilio-error-utils and has no unsafe code?.toLowerCase()', () => {
    expect(WARM).toContain("from './twilio-error-utils'")
    expect(WARM).not.toContain('error.code?.toLowerCase()')
    expect(WARM).not.toContain('error.message?.toLowerCase()')
  })

  it('retry logging includes the normalized code', () => {
    expect(WARM).toContain('normalizedCode')
    expect(WARM).toContain('normalizeErrorField(error?.code)')
  })

  it('sender-pool verification path (idempotent already-attached success) is preserved', () => {
    expect(WARM).toContain('alreadyAttached')
    expect(WARM).toContain('Number already in sender pool')
    expect(WARM).toContain('Sender pool membership verified')
  })
})
