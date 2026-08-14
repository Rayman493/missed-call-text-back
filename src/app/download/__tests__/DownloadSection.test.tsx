import { describe, it, expect } from 'vitest'
import { isValidAppStoreURL, isValidGooglePlayURL } from '../DownloadSection'

describe('DownloadSection URL Validation', () => {
  describe('isValidAppStoreURL', () => {
    it('should accept valid apps.apple.com URLs', () => {
      expect(isValidAppStoreURL('https://apps.apple.com/app/replyflow/id123456789')).toBe(true)
      expect(isValidAppStoreURL('https://apps.apple.com/us/app/replyflow/id123456789')).toBe(true)
    })

    it('should accept valid appstore.com URLs', () => {
      expect(isValidAppStoreURL('https://appstore.com/app/replyflow/id123456789')).toBe(true)
    })

    it('should reject invalid domains', () => {
      expect(isValidAppStoreURL('https://example.com/fake-store')).toBe(false)
      expect(isValidAppStoreURL('https://play.google.com/store/apps/details')).toBe(false)
      expect(isValidAppStoreURL('https://replyflow.com/download')).toBe(false)
    })

    it('should reject null or empty strings', () => {
      expect(isValidAppStoreURL(null)).toBe(false)
      expect(isValidAppStoreURL('')).toBe(false)
    })

    it('should reject malformed URLs', () => {
      expect(isValidAppStoreURL('not-a-url')).toBe(false)
      expect(isValidAppStoreURL('http://')).toBe(false)
      expect(isValidAppStoreURL('://invalid')).toBe(false)
    })
  })

  describe('isValidGooglePlayURL', () => {
    it('should accept valid play.google.com URLs', () => {
      expect(isValidGooglePlayURL('https://play.google.com/store/apps/details?id=com.replyflow.app')).toBe(true)
      expect(isValidGooglePlayURL('https://play.google.com/store/apps/details?id=com.replyflow.app&hl=en')).toBe(true)
    })

    it('should reject invalid domains', () => {
      expect(isValidGooglePlayURL('https://example.com/fake-play')).toBe(false)
      expect(isValidGooglePlayURL('https://apps.apple.com/app/replyflow')).toBe(false)
      expect(isValidGooglePlayURL('https://replyflow.com/download')).toBe(false)
    })

    it('should reject null or empty strings', () => {
      expect(isValidGooglePlayURL(null)).toBe(false)
      expect(isValidGooglePlayURL('')).toBe(false)
    })

    it('should reject malformed URLs', () => {
      expect(isValidGooglePlayURL('not-a-url')).toBe(false)
      expect(isValidGooglePlayURL('http://')).toBe(false)
      expect(isValidGooglePlayURL('://invalid')).toBe(false)
    })
  })

  describe('Cross-validation', () => {
    it('should not accept Google Play URLs as App Store URLs', () => {
      expect(isValidAppStoreURL('https://play.google.com/store/apps/details?id=com.replyflow.app')).toBe(false)
    })

    it('should not accept App Store URLs as Google Play URLs', () => {
      expect(isValidGooglePlayURL('https://apps.apple.com/app/replyflow/id123456789')).toBe(false)
    })

    it('should reject unrelated URLs for both', () => {
      const unrelatedUrl = 'https://example.com/fake'
      expect(isValidAppStoreURL(unrelatedUrl)).toBe(false)
      expect(isValidGooglePlayURL(unrelatedUrl)).toBe(false)
    })
  })
})