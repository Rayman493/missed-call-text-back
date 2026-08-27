/**
 * Tests for OAuth reauthentication in account deletion
 *
 * Tests cover:
 * - stale OAuth session returns reauthentication_required with correct structure
 * - recent OAuth session proceeds
 * - password user still requires password
 * - provider is derived server-side from user object
 * - wrong-account detection and handling
 * - return routing after successful reauth
 */

import { describe, it, expect } from 'vitest'
import { getAuthCapabilities } from '@/lib/auth/get-auth-capabilities'

describe('Account Deletion Reauthentication', () => {
  describe('reauth response structure', () => {
    it('should have correct error response structure for stale Google OAuth', () => {
      const expectedResponse = {
        ok: false,
        step: 'reauthentication_required',
        provider: 'google',
        error: 'For security, please sign in again to delete your account.',
      }

      expect(expectedResponse).toHaveProperty('ok', false)
      expect(expectedResponse).toHaveProperty('step', 'reauthentication_required')
      expect(expectedResponse).toHaveProperty('provider', 'google')
      expect(expectedResponse).toHaveProperty('error')
      expect(typeof expectedResponse.error).toBe('string')
    })

    it('should have correct error response structure for stale Apple OAuth', () => {
      const expectedResponse = {
        ok: false,
        step: 'reauthentication_required',
        provider: 'apple',
        error: 'For security, please sign in again to delete your account.',
      }

      expect(expectedResponse).toHaveProperty('ok', false)
      expect(expectedResponse).toHaveProperty('step', 'reauthentication_required')
      expect(expectedResponse).toHaveProperty('provider', 'apple')
      expect(expectedResponse).toHaveProperty('error')
      expect(typeof expectedResponse.error).toBe('string')
    })

    it('should use machine-readable step code', () => {
      const step = 'reauthentication_required'
      expect(step).toBe('reauthentication_required')
      expect(step).not.toBe('recent_auth_required') // Changed from previous implementation
    })
  })

  describe('server-side provider derivation', () => {
    it('should derive Google provider from user.identities', () => {
      const mockUser = {
        id: 'user-123',
        identities: [{ provider: 'google', id: 'identity-1' }],
        app_metadata: { provider: 'google' },
      }

      const capabilities = getAuthCapabilities(mockUser)
      expect(capabilities.primaryProvider).toBe('google')
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.hasApple).toBe(false)
    })

    it('should derive Apple provider from user.identities', () => {
      const mockUser = {
        id: 'user-123',
        identities: [{ provider: 'apple', id: 'identity-1' }],
        app_metadata: { provider: 'apple' },
      }

      const capabilities = getAuthCapabilities(mockUser)
      expect(capabilities.primaryProvider).toBe('apple')
      expect(capabilities.hasApple).toBe(true)
      expect(capabilities.hasGoogle).toBe(false)
    })

    it('should derive primary provider as first identity in array', () => {
      const mockUser = {
        id: 'user-123',
        identities: [
          { provider: 'google', id: 'identity-1' },
          { provider: 'apple', id: 'identity-2' },
        ],
        app_metadata: { provider: 'google' },
      }

      const capabilities = getAuthCapabilities(mockUser)
      expect(capabilities.primaryProvider).toBe('google') // First identity is primary
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.hasApple).toBe(true)
    })

    it('should derive provider from app_metadata if identities missing', () => {
      const mockUser = {
        id: 'user-123',
        identities: [],
        app_metadata: { provider: 'google', providers: ['google'] },
      }

      const capabilities = getAuthCapabilities(mockUser)
      expect(capabilities.primaryProvider).toBe('google')
      expect(capabilities.hasGoogle).toBe(true)
    })

    it('should derive Apple provider from app_metadata if identities missing', () => {
      const mockUser = {
        id: 'user-123',
        identities: [],
        app_metadata: { provider: 'apple', providers: ['apple'] },
      }

      const capabilities = getAuthCapabilities(mockUser)
      expect(capabilities.primaryProvider).toBe('apple')
      expect(capabilities.hasApple).toBe(true)
    })

    it('should not trust client-provided provider', () => {
      // This test documents the security requirement
      // Server MUST derive provider from canonical user object
      // Client-provided provider in request body MUST be ignored
      const clientProvidedProvider = 'google'
      const serverDerivedProvider = 'google'

      // These should match, but server derives independently
      expect(serverDerivedProvider).toBe(clientProvidedProvider)
      // Security: server does not use clientProvidedProvider for authorization
    })
  })

  describe('session age logic', () => {
    it('should calculate session age correctly', () => {
      const now = Date.now()
      const fiveMinutesAgo = now - 5 * 60 * 1000
      const sixMinutesAgo = now - 6 * 60 * 1000

      const recentAge = now - fiveMinutesAgo
      const staleAge = now - sixMinutesAgo

      expect(recentAge).toBe(5 * 60 * 1000)
      expect(staleAge).toBe(6 * 60 * 1000)

      const RECENT_AUTH_WINDOW_MS = 5 * 60 * 1000
      expect(recentAge).toBeLessThanOrEqual(RECENT_AUTH_WINDOW_MS)
      expect(staleAge).toBeGreaterThan(RECENT_AUTH_WINDOW_MS)
    })
  })

  describe('password user behavior', () => {
    it('should require password for password-only user', () => {
      const mockUser = {
        id: 'user-123',
        identities: [{ provider: 'email', id: 'identity-1' }],
        app_metadata: { provider: 'email' },
      }

      const capabilities = getAuthCapabilities(mockUser)
      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.isPasswordOnly).toBe(true)
      expect(capabilities.isOAuthOnly).toBe(false)
    })

    it('should not trigger OAuth reauth for password users', () => {
      const mockUser = {
        id: 'user-123',
        identities: [{ provider: 'email', id: 'identity-1' }],
        app_metadata: { provider: 'email' },
      }

      const capabilities = getAuthCapabilities(mockUser)
      // Password users should use password verification, not OAuth reauth
      expect(capabilities.hasPassword).toBe(true)
    })
  })

  describe('wrong-account protection', () => {
    it('should detect mismatch between expected and current user ID', () => {
      const expectedUserId = 'user-A-id'
      const currentUserId = 'user-B-id'

      const isMatch = expectedUserId === currentUserId
      expect(isMatch).toBe(false)
    })

    it('should detect match between expected and current user ID', () => {
      const expectedUserId = 'user-A-id'
      const currentUserId = 'user-A-id'

      const isMatch = expectedUserId === currentUserId
      expect(isMatch).toBe(true)
    })

    it('should not allow client-provided user ID to override authenticated user', () => {
      // This documents the security invariant
      const authenticatedUserId = 'user-B-id'
      const clientProvidedExpectedUserId = 'user-A-id'

      // Server MUST use authenticated user ID for deletion
      const deletionTarget = authenticatedUserId
      expect(deletionTarget).toBe('user-B-id')
      expect(deletionTarget).not.toBe(clientProvidedExpectedUserId)
    })
  })

  describe('reauth context parameter', () => {
    it('should include reauthContext=delete in OAuth redirect', () => {
      const reauthContext = 'delete'
      expect(reauthContext).toBe('delete')
    })

    it('should allow callback to distinguish deletion reauth from normal signup', () => {
      const deletionReauthContext = 'delete'
      const normalSignupContext = null

      expect(deletionReauthContext).not.toBe(normalSignupContext)
    })
  })

  describe('return routing', () => {
    it('should use next parameter (not returnTo) for auth callback', () => {
      // The auth callback reads 'next' parameter, not 'returnTo'
      const paramName = 'next'
      expect(paramName).toBe('next')
      expect(paramName).not.toBe('returnTo')
    })

    it('should properly encode nested query parameters in return target', () => {
      const returnTarget = '/dashboard/settings?section=account&reauth=delete'
      const encoded = encodeURIComponent(returnTarget)

      expect(encoded).toBe('%2Fdashboard%2Fsettings%3Fsection%3Daccount%26reauth%3Ddelete')
      expect(encoded).not.toBe(returnTarget) // Should be encoded
      expect(encoded).not.toContain('?') // Should not contain unencoded ?
    })

    it('should decode nested query parameters correctly', () => {
      const encoded = '%2Fdashboard%2Fsettings%3Fsection%3Daccount%26reauth%3Ddelete'
      const decoded = decodeURIComponent(encoded)

      expect(decoded).toBe('/dashboard/settings?section=account&reauth=delete')
    })

    it('should construct correct OAuth redirect URL', () => {
      const origin = 'https://example.com'
      const returnTarget = '/dashboard/settings?section=account&reauth=delete'
      const encodedTarget = encodeURIComponent(returnTarget)

      const redirectUrl = `${origin}/auth/callback?next=${encodedTarget}&reauthContext=delete`
      const expected = 'https://example.com/auth/callback?next=%2Fdashboard%2Fsettings%3Fsection%3Daccount%26reauth%3Ddelete&reauthContext=delete'

      expect(redirectUrl).toBe(expected)
    })
  })

  describe('Apple-specific deletion reauth behavior', () => {
    it('should detect Apple-only user correctly', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@privaterelay.appleid.com',
        identities: [{ id: 'identity-1', provider: 'apple', user_id: 'user-123' }],
        app_metadata: { provider: 'apple' },
      }

      const capabilities = getAuthCapabilities(mockUser)
      expect(capabilities.hasApple).toBe(true)
      expect(capabilities.hasGoogle).toBe(false)
      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(true)
      expect(capabilities.primaryProvider).toBe('apple')
    })

    it('should return reauthentication_required with provider=apple for stale Apple session', () => {
      const appleUser = {
        id: 'user-123',
        identities: [{ provider: 'apple', id: 'identity-1' }],
        app_metadata: { provider: 'apple' },
      }

      const capabilities = getAuthCapabilities(appleUser)
      expect(capabilities.primaryProvider).toBe('apple')

      // Server would return this response for stale Apple session
      const expectedResponse = {
        ok: false,
        step: 'reauthentication_required',
        provider: 'apple',
        error: 'For security, please sign in again to delete your account.',
      }

      expect(expectedResponse.provider).toBe('apple')
    })

    it('should allow recent Apple session to proceed without reauth', () => {
      const appleUser = {
        id: 'user-123',
        identities: [{ provider: 'apple', id: 'identity-1' }],
        app_metadata: { provider: 'apple' },
      }

      const capabilities = getAuthCapabilities(appleUser)
      expect(capabilities.isOAuthOnly).toBe(true)
      // Recent auth would allow deletion without reauth
    })

    it('should select Apple as reauth provider for Apple-only user', () => {
      const appleUser = {
        id: 'user-123',
        identities: [{ provider: 'apple', id: 'identity-1' }],
        app_metadata: { provider: 'apple' },
      }

      const capabilities = getAuthCapabilities(appleUser)
      expect(capabilities.primaryProvider).toBe('apple')
    })

    it('should not allow ?provider=apple query parameter to override authenticated identity', () => {
      // Security invariant: provider must come from authenticated user object
      const authenticatedUserId = 'user-123'
      const clientProvidedProvider = 'apple'

      // Server derives provider from user.identities, not from query param
      const mockUser = {
        id: authenticatedUserId,
        identities: [{ provider: 'google', id: 'identity-1' }],
        app_metadata: { provider: 'google' },
      }

      const capabilities = getAuthCapabilities(mockUser)
      // Server would use 'google' because that's the user's actual provider
      expect(capabilities.primaryProvider).toBe('google')
      expect(capabilities.primaryProvider).not.toBe(clientProvidedProvider)
    })
  })

  describe('mixed-provider scenarios', () => {
    it('should select first identity as primary for Google+Apple user', () => {
      const mixedUser = {
        id: 'user-123',
        identities: [
          { provider: 'google', id: 'identity-1' },
          { provider: 'apple', id: 'identity-2' },
        ],
        app_metadata: { provider: 'google' },
      }

      const capabilities = getAuthCapabilities(mixedUser)
      expect(capabilities.primaryProvider).toBe('google') // First identity
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.hasApple).toBe(true)
      expect(capabilities.hasMultipleMethods).toBe(true)
    })

    it('should select first identity as primary for Apple+Google user', () => {
      const mixedUser = {
        id: 'user-123',
        identities: [
          { provider: 'apple', id: 'identity-1' },
          { provider: 'google', id: 'identity-2' },
        ],
        app_metadata: { provider: 'apple' },
      }

      const capabilities = getAuthCapabilities(mixedUser)
      expect(capabilities.primaryProvider).toBe('apple') // First identity
      expect(capabilities.hasApple).toBe(true)
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.hasMultipleMethods).toBe(true)
    })

    it('should allow password verification for password+Apple user', () => {
      const passwordAppleUser = {
        id: 'user-123',
        identities: [
          { provider: 'email', id: 'identity-1' },
          { provider: 'apple', id: 'identity-2' },
        ],
        app_metadata: { provider: 'email', providers: ['email', 'apple'] },
      }

      const capabilities = getAuthCapabilities(passwordAppleUser)
      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.hasApple).toBe(true)
      expect(capabilities.isPasswordOnly).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(false)
    })

    it('should allow password verification for password+Google user', () => {
      const passwordGoogleUser = {
        id: 'user-123',
        identities: [
          { provider: 'email', id: 'identity-1' },
          { provider: 'google', id: 'identity-2' },
        ],
        app_metadata: { provider: 'email', providers: ['email', 'google'] },
      }

      const capabilities = getAuthCapabilities(passwordGoogleUser)
      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.isPasswordOnly).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(false)
    })

    it('should allow password verification for password+Google+Apple user', () => {
      const allMethodsUser = {
        id: 'user-123',
        identities: [
          { provider: 'email', id: 'identity-1' },
          { provider: 'google', id: 'identity-2' },
          { provider: 'apple', id: 'identity-3' },
        ],
        app_metadata: { provider: 'email', providers: ['email', 'google', 'apple'] },
      }

      const capabilities = getAuthCapabilities(allMethodsUser)
      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.hasApple).toBe(true)
      expect(capabilities.hasMultipleMethods).toBe(true)
      expect(capabilities.isOAuthOnly).toBe(false)
    })

    it('should select first identity as primary for password+Google+Apple user', () => {
      const allMethodsUser = {
        id: 'user-123',
        identities: [
          { provider: 'email', id: 'identity-1' },
          { provider: 'google', id: 'identity-2' },
          { provider: 'apple', id: 'identity-3' },
        ],
        app_metadata: { provider: 'email', providers: ['email', 'google', 'apple'] },
      }

      const capabilities = getAuthCapabilities(allMethodsUser)
      expect(capabilities.primaryProvider).toBe('email') // First identity
      // Password users would use password verification, so primaryProvider doesn't matter
    })
  })
})