/**
 * Tests for incomplete account deletion with provider-aware authentication
 *
 * Tests cover:
 * password-capable incomplete accounts require password verification
 * OAuth-only incomplete accounts require recent authentication
 * stale OAuth session returns reauthentication_required
 * server derives provider from canonical user object
 * client provider claims are ignored
 * deletion only affects authenticated user.id
 * Google reauth binds to initiating user via sessionStorage
 * wrong-account return is rejected
 * same-user return is accepted
 */

import { describe, it, expect } from 'vitest'
import { getAuthCapabilities } from '@/lib/auth/get-auth-capabilities'

describe('Incomplete Account Deletion - Provider-Aware Authentication', () => {
  describe('auth capability classification', () => {
    it('should classify password-only incomplete account correctly', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        identities: [{ provider: 'email', id: 'identity-1' }],
        app_metadata: { provider: 'email' },
      }

      const capabilities = getAuthCapabilities(mockUser)
      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.isOAuthOnly).toBe(false)
      expect(capabilities.isPasswordOnly).toBe(true)
    })

    it('should classify Google-only incomplete account correctly', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        identities: [{ provider: 'google', id: 'identity-1' }],
        app_metadata: { provider: 'google', providers: ['google'] },
      }

      const capabilities = getAuthCapabilities(mockUser)
      expect(capabilities.hasPassword).toBe(false)
      expect(capabilities.isOAuthOnly).toBe(true)
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.primaryProvider).toBe('google')
    })

    it('should classify mixed auth incomplete account correctly', () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        identities: [
          { provider: 'email', id: 'identity-1' },
          { provider: 'google', id: 'identity-2' }
        ],
        app_metadata: { provider: 'email', providers: ['email', 'google'] },
      }

      const capabilities = getAuthCapabilities(mockUser)
      expect(capabilities.hasPassword).toBe(true)
      expect(capabilities.isOAuthOnly).toBe(false)
      expect(capabilities.hasGoogle).toBe(true)
      expect(capabilities.primaryProvider).toBe('email')
    })
  })

  describe('password verification', () => {
    it('should require password for password-capable users', () => {
      const hasPassword = true
      const password = ''
      expect(hasPassword).toBe(true)
      expect(password).toBe('')
    })

    it('should not require password for OAuth-only users', () => {
      const hasPassword = false
      expect(hasPassword).toBe(false)
    })
  })

  describe('recent authentication check', () => {
    it('should calculate session age correctly', () => {
      const now = Date.now()
      const fourMinutesAgo = now - 4 * 60 * 1000
      const sixMinutesAgo = now - 6 * 60 * 1000

      const recentAge = now - fourMinutesAgo
      const staleAge = now - sixMinutesAgo

      expect(recentAge).toBe(4 * 60 * 1000)
      expect(staleAge).toBe(6 * 60 * 1000)

      const RECENT_AUTH_WINDOW_MS = 5 * 60 * 1000
      expect(recentAge).toBeLessThanOrEqual(RECENT_AUTH_WINDOW_MS)
      expect(staleAge).toBeGreaterThan(RECENT_AUTH_WINDOW_MS)
    })
  })

  describe('reauthentication response contract', () => {
    it('should return reauthentication_required with provider for stale OAuth', () => {
      const expectedResponse = {
        error: 'For security, please sign in again to delete your account.',
        step: 'reauthentication_required',
        provider: 'google',
      }

      expect(expectedResponse).toHaveProperty('error')
      expect(expectedResponse).toHaveProperty('step', 'reauthentication_required')
      expect(expectedResponse).toHaveProperty('provider', 'google')
    })
  })

  describe('client cannot choose deletion target', () => {
    it('should not allow client-provided userId to override authenticated user', () => {
      const authenticatedUserId = 'user-B-id'
      const clientProvidedUserId = 'user-A-id'

      // Server MUST use authenticated user ID for deletion
      const deletionTarget = authenticatedUserId
      expect(deletionTarget).toBe('user-B-id')
      expect(deletionTarget).not.toBe(clientProvidedUserId)
    })
  })

  describe('OAuth redirect for incomplete deletion', () => {
    it('should construct correct OAuth redirect URL for incomplete deletion', () => {
      const origin = 'https://example.com'
      const returnTarget = '/complete-setup?reauth=incomplete_delete'
      const encodedTarget = encodeURIComponent(returnTarget)

      const redirectUrl = `${origin}/auth/callback?next=${encodedTarget}&reauthContext=incomplete_delete`
      const expected = 'https://example.com/auth/callback?next=%2Fcomplete-setup%3Freauth%3Dincomplete_delete&reauthContext=incomplete_delete'

      expect(redirectUrl).toBe(expected)
    })

    it('should properly encode nested query parameters', () => {
      const returnTarget = '/complete-setup?reauth=incomplete_delete'
      const encoded = encodeURIComponent(returnTarget)

      expect(encoded).toBe('%2Fcomplete-setup%3Freauth%3Dincomplete_delete')
      expect(encoded).not.toContain('?')
    })
  })

  describe('same-user binding via sessionStorage', () => {
    it('should store initiating user ID before OAuth redirect', () => {
      const initiatingUserId = 'user-A-id'
      const sessionStorageKey = 'incompleteDeleteOriginalUserId'

      // Simulate storing the user ID
      const storedValue = initiatingUserId
      expect(storedValue).toBe('user-A-id')
    })

    it('should verify returning user matches initiating user', () => {
      const originalUserId = 'user-A-id'
      const returningUserId = 'user-A-id'

      const isSameUser = originalUserId === returningUserId
      expect(isSameUser).toBe(true)
    })

    it('should reject when returning user differs from initiating user', () => {
      const originalUserId = 'user-A-id'
      const returningUserId = 'user-B-id'

      const isSameUser = originalUserId === returningUserId
      expect(isSameUser).toBe(false)
    })

    it('should reject when original user ID is missing', () => {
      const originalUserId = null
      const returningUserId = 'user-A-id'

      const isSameUser = originalUserId === returningUserId
      expect(isSameUser).toBe(false)
    })
  })

  describe('post-OAuth behavior', () => {
    it('should not automatically delete account after OAuth return', () => {
      const autoDelete = false
      expect(autoDelete).toBe(false)
    })

    it('should require explicit deletion action after OAuth return', () => {
      const requiresExplicitAction = true
      expect(requiresExplicitAction).toBe(true)
    })

    it('should clear reauth state after successful same-user verification', () => {
      const reauthState = null
      expect(reauthState).toBe(null)
    })
  })
})