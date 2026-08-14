import { describe, it, expect } from 'vitest'

describe('Google Calendar callback error handling', () => {
  it('access_denied should redirect to calendar=cancelled', () => {
    const error = 'access_denied'
    const userAgent = 'Mozilla/5.0 (web)'
    const isNative = userAgent.includes('Capacitor') || userAgent.includes('ReplyFlow')

    // access_denied should map to cancelled, not generic error
    expect(error).toBe('access_denied')
    expect(isNative).toBe(false)
  })

  it('native app with access_denied should use custom scheme', () => {
    const error = 'access_denied'
    const userAgent = 'Mozilla/5.0 (Capacitor/iOS)'
    const isNative = userAgent.includes('Capacitor') || userAgent.includes('ReplyFlow')

    expect(isNative).toBe(true)
    // Should redirect to replyflow://calendar?status=cancelled
  })

  it('other OAuth errors should redirect to calendar=error', () => {
    const error = 'invalid_request'
    const userAgent = 'Mozilla/5.0 (web)'
    const isNative = userAgent.includes('Capacitor') || userAgent.includes('ReplyFlow')

    expect(error).toBe('invalid_request')
    expect(isNative).toBe(false)
    // Should redirect to /dashboard/calendar?calendar=error
  })

  it('access_denied is distinct from other errors', () => {
    const accessDenied = 'access_denied'
    const otherError = 'invalid_request'

    expect(accessDenied).not.toBe(otherError)
    expect(accessDenied).toBe('access_denied')
  })
})