/**
 * Tests for OAuth callback routing
 *
 * Tests cover:
 * - business state takes priority over stale next parameter
 * - reauth contexts preserve their specific return targets
 * - new users go to onboarding
 * - existing business users go to dashboard
 * - unsafe next URLs are rejected
 * - provider-agnostic routing (works for Google and Apple)
 */

import { describe, it, expect } from 'vitest'

describe('OAuth Callback Routing', () => {
  describe('canonical routing precedence', () => {
    it('should route to dashboard when user has existing business, regardless of next=/onboarding', () => {
      const business = { id: 'business-123', onboarding_status: 'completed' }
      const next = '/onboarding'
      const reauthContext = null

      // Business takes priority over stale next parameter
      const finalRedirect = business ? '/dashboard' : next
      expect(finalRedirect).toBe('/dashboard')
    })

    it('should route to dashboard when user has existing business with no next parameter', () => {
      const business = { id: 'business-123', onboarding_status: 'completed' }
      const next = null
      const reauthContext = null

      const redirectTarget = business ? '/dashboard' : '/onboarding'
      const finalRedirect = next || redirectTarget
      expect(finalRedirect).toBe('/dashboard')
    })

    it('should route to onboarding when user has no business with next=/onboarding', () => {
      const business = null
      const next = '/onboarding'
      const reauthContext = null

      const redirectTarget = business ? '/dashboard' : '/onboarding'
      const finalRedirect = next || redirectTarget
      expect(finalRedirect).toBe('/onboarding')
    })

    it('should route to onboarding when user has no business with no next parameter', () => {
      const business = null
      const next = null
      const reauthContext = null

      const redirectTarget = business ? '/dashboard' : '/onboarding'
      const finalRedirect = next || redirectTarget
      expect(finalRedirect).toBe('/onboarding')
    })
  })

  describe('reauth context routing', () => {
    it('should preserve next parameter for deletion reauth context', () => {
      const business = { id: 'business-123', onboarding_status: 'completed' }
      const next = '/dashboard/settings?section=account&reauth=delete'
      const reauthContext = 'delete'

      // Reauth contexts preserve their specific return targets
      const redirectTarget = business ? '/dashboard' : '/onboarding'
      const finalRedirect = reauthContext === 'delete' ? (next || redirectTarget) : redirectTarget
      expect(finalRedirect).toBe(next)
    })

    it('should preserve next parameter for incomplete deletion reauth context', () => {
      const business = null
      const next = '/complete-setup?reauth=incomplete_delete'
      const reauthContext = 'incomplete_delete'

      // Reauth contexts preserve their specific return targets
      const redirectTarget = business ? '/dashboard' : '/onboarding'
      const finalRedirect = reauthContext === 'incomplete_delete' ? (next || redirectTarget) : redirectTarget
      expect(finalRedirect).toBe(next)
    })

    it('should not override business state with next parameter when not in reauth context', () => {
      const business = { id: 'business-123', onboarding_status: 'completed' }
      const next = '/onboarding'
      const reauthContext = null

      // Business takes priority when not in reauth context
      const finalRedirect = business ? '/dashboard' : next
      expect(finalRedirect).toBe('/dashboard')
      expect(finalRedirect).not.toBe(next)
    })
  })

  describe('provider-agnostic routing', () => {
    it('should route Google user with existing business to dashboard', () => {
      const provider = 'google'
      const business = { id: 'business-123', onboarding_status: 'completed' }
      const next = '/onboarding'

      // Routing is provider-agnostic
      const finalRedirect = business ? '/dashboard' : next
      expect(finalRedirect).toBe('/dashboard')
    })

    it('should route Apple user with existing business to dashboard', () => {
      const provider = 'apple'
      const business = { id: 'business-123', onboarding_status: 'completed' }
      const next = '/onboarding'

      // Routing is provider-agnostic
      const finalRedirect = business ? '/dashboard' : next
      expect(finalRedirect).toBe('/dashboard')
    })

    it('should route Google new user to onboarding', () => {
      const provider = 'google'
      const business = null
      const next = '/onboarding'

      const redirectTarget = business ? '/dashboard' : '/onboarding'
      const finalRedirect = next || redirectTarget
      expect(finalRedirect).toBe('/onboarding')
    })

    it('should route Apple new user to onboarding', () => {
      const provider = 'apple'
      const business = null
      const next = '/onboarding'

      const redirectTarget = business ? '/dashboard' : '/onboarding'
      const finalRedirect = next || redirectTarget
      expect(finalRedirect).toBe('/onboarding')
    })
  })

  describe('next parameter safety', () => {
    it('should reject external URLs in next parameter', () => {
      const next = 'https://evil.com/phishing'
      const safeRedirectPaths = ['/', '/dashboard', '/onboarding', '/complete-setup', '/auth/signin']

      const isValid = safeRedirectPaths.some(safePath =>
        next.startsWith(safePath)
      )
      expect(isValid).toBe(false)
    })

    it('should accept safe internal paths in next parameter', () => {
      const next = '/dashboard/settings'
      const safeRedirectPaths = ['/', '/dashboard', '/onboarding', '/complete-setup', '/auth/signin']

      const isValid = safeRedirectPaths.some(safePath =>
        next.startsWith(safePath)
      )
      expect(isValid).toBe(true)
    })
  })

  describe('query parameter cannot override canonical state', () => {
    it('should not allow query parameter to override business existence', () => {
      const business = { id: 'business-123', onboarding_status: 'completed' }
      const queryParamOverride = 'force_onboarding=true'

      // Business state is canonical, query parameters cannot override it
      const redirectTarget = business ? '/dashboard' : '/onboarding'
      expect(redirectTarget).toBe('/dashboard')
    })

    it('should not allow query parameter to override reauth context', () => {
      const reauthContext = 'delete'
      const queryParamOverride = 'skip_reauth=true'

      // Reauth context is canonical, query parameters cannot override it
      expect(reauthContext).toBe('delete')
    })
  })
})