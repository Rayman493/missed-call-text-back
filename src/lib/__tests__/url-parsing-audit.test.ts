/**
 * URL Parsing Audit for Stripe Billing Portal Return URLs
 *
 * This test audits how new URL() parses HTTPS Universal Link URLs
 * to verify the external return handler conditions are correct.
 */

import { describe, it, expect } from 'vitest'

describe('URL Parsing Audit', () => {
  describe('HTTPS Universal Link URL parsing', () => {
    it('should parse https://www.replyflowhq.com/dashboard/settings?billing=returned correctly', () => {
      const urlString = 'https://www.replyflowhq.com/dashboard/settings?billing=returned'
      const urlObj = new URL(urlString)

      console.log('[URL PARSING] Full URL:', urlString)
      console.log('[URL PARSING] protocol:', urlObj.protocol)
      console.log('[URL PARSING] hostname:', urlObj.hostname)
      console.log('[URL PARSING] host:', urlObj.host)
      console.log('[URL PARSING] pathname:', urlObj.pathname)
      console.log('[URL PARSING] search:', urlObj.search)
      console.log('[URL PARSING] searchParams:', urlObj.searchParams.toString())
      console.log('[URL PARSING] billing param:', urlObj.searchParams.get('billing'))

      // Report the actual parsing results
      expect(urlObj.protocol).toBe('https:')
      expect(urlObj.hostname).toBe('www.replyflowhq.com')
      expect(urlObj.pathname).toBe('/dashboard/settings')
      expect(urlObj.searchParams.get('billing')).toBe('returned')
    })
  })

  describe('External return handler matching', () => {
    it('should match billing=returned parameter for STRIPE_PORTAL flow', () => {
      const urlString = 'https://www.replyflowhq.com/dashboard/settings?billing=returned'
      const urlObj = new URL(urlString)

      // This matches the STRIPE_PORTAL flow in external-return-handler.ts
      const isStripePortalReturn = urlObj.searchParams.get('billing') === 'returned'

      expect(isStripePortalReturn).toBe(true)
    })

    it('should navigate to /dashboard/settings after reconciliation', () => {
      const urlString = 'https://www.replyflowhq.com/dashboard/settings?billing=returned'
      const urlObj = new URL(urlString)

      // This matches the internalDestination in external-return-handler.ts
      const internalDestination = '/dashboard/settings'

      expect(urlObj.pathname).toBe(internalDestination)
    })
  })

  describe('Custom scheme URL parsing (for comparison)', () => {
    it('should demonstrate why custom scheme parsing is different', () => {
      const urlString = 'replyflow://dashboard/settings?billing=returned'
      const urlObj = new URL(urlString)

      console.log('[CUSTOM SCHEME] Full URL:', urlString)
      console.log('[CUSTOM SCHEME] protocol:', urlObj.protocol)
      console.log('[CUSTOM SCHEME] hostname:', urlObj.hostname)
      console.log('[CUSTOM SCHEME] pathname:', urlObj.pathname)
      console.log('[CUSTOM SCHEME] billing param:', urlObj.searchParams.get('billing'))

      // Custom scheme parsing is different: hostname becomes the first path segment
      expect(urlObj.protocol).toBe('replyflow:')
      expect(urlObj.hostname).toBe('dashboard')
      expect(urlObj.pathname).toBe('/settings')
      expect(urlObj.searchParams.get('billing')).toBe('returned')

      // This is why custom scheme URLs are NOT used for Stripe return_url
      // Stripe requires HTTPS URLs and does not accept custom schemes
    })
  })
})