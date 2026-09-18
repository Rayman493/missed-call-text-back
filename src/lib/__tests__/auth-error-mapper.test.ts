import { describe, it, expect } from 'vitest'
import { mapAuthError } from '@/lib/auth-error-mapper'

describe('mapAuthError invalid-credentials copy', () => {
  it('shows "Incorrect email or password" for confirmed invalid credentials', () => {
    const result = mapAuthError(new Error('Invalid login credentials'))
    expect(result.category).toBe('invalid_credentials')
    expect(result.body).toBe('Incorrect email or password. Please try again.')
  })

  it('maps common Supabase credential phrasings the same way', () => {
    for (const message of ['invalid credentials', 'invalid password', 'AuthApiError']) {
      expect(mapAuthError(new Error(message)).category).toBe('invalid_credentials')
    }
  })

  it('does not reveal whether a specific email exists', () => {
    const result = mapAuthError(new Error('Invalid login credentials'))
    expect(result.body).not.toMatch(/email (was )?not found|no account|does not exist/i)
  })

  it('preserves specific rate-limit and verification messages', () => {
    const rate = mapAuthError(new Error('Too many requests'))
    expect(rate.category).toBe('rate_limited')
    expect(rate.body).not.toContain('Incorrect email or password')

    const unconfirmed = mapAuthError(new Error('Email not confirmed'))
    expect(unconfirmed.category).toBe('email_not_confirmed')
    expect(unconfirmed.body).not.toContain('Incorrect email or password')
  })

  it('keeps the generic fallback for network/unknown failures', () => {
    const network = mapAuthError(new Error('network timeout'))
    expect(network.category).toBe('network_failure')
    expect(network.body).not.toContain('Incorrect email or password')

    const unknown = mapAuthError(new Error('unexpected failure'))
    expect(unknown.category).toBe('unknown')
    expect(unknown.body).toBe("We couldn't sign you in. Please try again.")
  })
})
