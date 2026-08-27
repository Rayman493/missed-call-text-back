/**
 * Unit tests for getAuthCapabilities
 *
 * Tests cover:
 * - email/password-only users
 * - Google-only users
 * - Google + password users
 * - Apple-only users
 * - multiple OAuth providers
 * - missing identities with providers metadata fallback
 * - incomplete/malformed metadata
 * - unknown OAuth providers
 */

import { describe, it, expect } from 'vitest'
import { getAuthCapabilities, canUsePasswordVerification, requiresOAuthVerification } from '../get-auth-capabilities'

describe('getAuthCapabilities', () => {
  describe('email/password-only user', () => {
    it('should detect password-only user from identities', () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        identities: [
          { id: 'identity-1', provider: 'email', user_id: 'user-1' },
        ],
        app_metadata: {
          provider: 'email',
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.oauthProviders).toEqual([])
      expect(capabilities.hasGoogle).toBe(false)
      expect(capabilities.hasApple).toBe(false)
      expect(capabilities.hasMultipleMethods).toBe(false)
      expect(capabilities.isPasswordOnly).toBe(true)
      expect(capabilities.isOAuthOnly).toBe(false)
      expect(capabilities.primaryProvider).toBe('email')
    })

    it('should detect password-only user from app_metadata.providers fallback', () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        identities: [],
        app_metadata: {
          provider: 'email',
          providers: ['email'],
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.oauthProviders).toEqual([])
      expect(capabilities.isPasswordOnly).toBe(true)
      expect(capabilities.isOAuthOnly).toBe(false)
    })
  })

  describe('Google-only user', () => {
    it('should detect Google-only user from identities', () => {
      const user = {
        id: 'user-2',
        email: 'test@gmail.com',
        identities: [
          { id: 'identity-2', provider: 'google', user_id: 'user-2' },
        ],
        app_metadata: {
          provider: 'google',
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.oauthProviders).toEqual(['google'])
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.hasApple).toBe(false)
      expect(capabilities.hasMultipleMethods).toBe(false)
      expect(capabilities.isPasswordOnly).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(true)
      expect(capabilities.primaryProvider).toBe('google')
    })

    it('should detect Google-only user from app_metadata fallback', () => {
      const user = {
        id: 'user-2',
        email: 'test@gmail.com',
        identities: [],
        app_metadata: {
          provider: 'google',
          providers: ['google'],
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.isOAuthOnly).toBe(true)
      expect(capabilities.primaryProvider).toBe('google')
    })
  })

  describe('Google + password user', () => {
    it('should detect multi-method user with Google and password', () => {
      const user = {
        id: 'user-3',
        email: 'test@gmail.com',
        identities: [
          { id: 'identity-3a', provider: 'email', user_id: 'user-3' },
          { id: 'identity-3b', provider: 'google', user_id: 'user-3' },
        ],
        app_metadata: {
          provider: 'email', // May be email or google depending on last login
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.oauthProviders).toEqual(['google'])
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.hasApple).toBe(false)
      expect(capabilities.hasMultipleMethods).toBe(true)
      expect(capabilities.isPasswordOnly).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(false)
      expect(capabilities.primaryProvider).toBe('email') // First identity
    })
  })

  describe('Apple-only user', () => {
    it('should detect Apple-only user', () => {
      const user = {
        id: 'user-4',
        email: 'test@privaterelay.appleid.com',
        identities: [
          { id: 'identity-4', provider: 'apple', user_id: 'user-4' },
        ],
        app_metadata: {
          provider: 'apple',
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.oauthProviders).toEqual(['apple'])
      expect(capabilities.hasGoogle).toBe(false)
      expect(capabilities.hasApple).toBe(true)
      expect(capabilities.hasMultipleMethods).toBe(false)
      expect(capabilities.isPasswordOnly).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(true)
      expect(capabilities.primaryProvider).toBe('apple')
    })
  })

  describe('multiple OAuth providers', () => {
    it('should detect user with Google and Apple', () => {
      const user = {
        id: 'user-5',
        email: 'test@example.com',
        identities: [
          { id: 'identity-5a', provider: 'google', user_id: 'user-5' },
          { id: 'identity-5b', provider: 'apple', user_id: 'user-5' },
        ],
        app_metadata: {
          provider: 'google',
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.oauthProviders).toEqual(['google', 'apple'])
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.hasApple).toBe(true)
      expect(capabilities.hasMultipleMethods).toBe(true)
      expect(capabilities.isPasswordOnly).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(true)
      expect(capabilities.primaryProvider).toBe('google')
    })

    it('should detect user with password, Google, and Apple', () => {
      const user = {
        id: 'user-6',
        email: 'test@example.com',
        identities: [
          { id: 'identity-6a', provider: 'email', user_id: 'user-6' },
          { id: 'identity-6b', provider: 'google', user_id: 'user-6' },
          { id: 'identity-6c', provider: 'apple', user_id: 'user-6' },
        ],
        app_metadata: {
          provider: 'email',
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.oauthProviders).toEqual(['google', 'apple'])
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.hasApple).toBe(true)
      expect(capabilities.hasMultipleMethods).toBe(true)
      expect(capabilities.isPasswordOnly).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(false)
      expect(capabilities.primaryProvider).toBe('email')
    })
  })

  describe('missing identities with providers metadata fallback', () => {
    it('should use app_metadata.providers when identities is missing', () => {
      const user = {
        id: 'user-7',
        email: 'test@example.com',
        identities: [],
        app_metadata: {
          provider: 'google',
          providers: ['google', 'email'],
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.hasMultipleMethods).toBe(true)
      expect(capabilities.primaryProvider).toBe('google')
    })

    it('should use app_metadata.provider when both identities and providers are missing', () => {
      const user = {
        id: 'user-8',
        email: 'test@example.com',
        identities: [],
        app_metadata: {
          provider: 'google',
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.isOAuthOnly).toBe(true)
      expect(capabilities.primaryProvider).toBe('google')
    })
  })

  describe('incomplete/malformed metadata', () => {
    it('should handle null/undefined user', () => {
      const capabilities = getAuthCapabilities(null)
      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.oauthProviders).toEqual([])
      expect(capabilities.primaryProvider).toBe(null)
    })

    it('should handle user with no identities or metadata', () => {
      const user = {
        id: 'user-9',
        email: 'test@example.com',
        identities: [],
        app_metadata: {},
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.oauthProviders).toEqual([])
      expect(capabilities.primaryProvider).toBe(null)
    })

    it('should handle malformed identities (missing provider field)', () => {
      const user = {
        id: 'user-10',
        email: 'test@example.com',
        identities: [
          { id: 'identity-10', user_id: 'user-10' }, // Missing provider
        ],
        app_metadata: {},
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.oauthProviders).toEqual([])
      expect(capabilities.primaryProvider).toBe(null)
    })

    it('should handle null values in providers array', () => {
      const user = {
        id: 'user-11',
        email: 'test@example.com',
        identities: [],
        app_metadata: {
          providers: ['google', null, 'email', undefined] as any,
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.oauthProviders).toEqual(['google'])
    })
  })

  describe('unknown OAuth provider', () => {
    it('should handle unknown OAuth provider without breaking', () => {
      const user = {
        id: 'user-12',
        email: 'test@example.com',
        identities: [
          { id: 'identity-12', provider: 'github', user_id: 'user-12' },
        ],
        app_metadata: {
          provider: 'github',
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.oauthProviders).toEqual(['github'])
      expect(capabilities.hasGoogle).toBe(false)
      expect(capabilities.hasApple).toBe(false)
      expect(capabilities.hasMultipleMethods).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(true)
      expect(capabilities.primaryProvider).toBe('github')
    })

    it('should handle unknown provider with password', () => {
      const user = {
        id: 'user-13',
        email: 'test@example.com',
        identities: [
          { id: 'identity-13a', provider: 'email', user_id: 'user-13' },
          { id: 'identity-13b', provider: 'github', user_id: 'user-13' },
        ],
        app_metadata: {
          provider: 'email',
        },
      }

      const capabilities = getAuthCapabilities(user)

      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.oauthProviders).toEqual(['github'])
      expect(capabilities.hasMultipleMethods).toBe(true)
      expect(capabilities.isPasswordOnly).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(false)
    })
  })

  describe('helper functions', () => {
    it('canUsePasswordVerification should return true for password users', () => {
      const user = {
        id: 'user-14',
        identities: [{ provider: 'email' }],
        app_metadata: {},
      }
      expect(canUsePasswordVerification(user)).toBe(true)
    })

    it('canUsePasswordVerification should return false for OAuth-only users', () => {
      const user = {
        id: 'user-15',
        identities: [{ provider: 'google' }],
        app_metadata: {},
      }
      expect(canUsePasswordVerification(user)).toBe(false)
    })

    it('requiresOAuthVerification should return true for OAuth-only users', () => {
      const user = {
        id: 'user-16',
        identities: [{ provider: 'google' }],
        app_metadata: {},
      }
      expect(requiresOAuthVerification(user)).toBe(true)
    })

    it('requiresOAuthVerification should return false for password users', () => {
      const user = {
        id: 'user-17',
        identities: [{ provider: 'email' }],
        app_metadata: {},
      }
      expect(requiresOAuthVerification(user)).toBe(false)
    })
  })
})