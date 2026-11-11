import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  IOS_APP_STORE_URL,
  GOOGLE_PLAY_STORE_URL,
  isValidAppStoreURL,
  isValidGooglePlayURL,
} from '@/lib/app-store-links'

/**
 * Store-link regressions — the shared config must default to the live
 * ReplyFlowHQ Google Play and iOS App Store listings, and the public
 * homepage must surface the live Google Play listing.
 */

const homepage = readFileSync('src/app/(public)/page.tsx', 'utf8')
const downloadPage = readFileSync('src/app/download/page.tsx', 'utf8')

describe('app-store-links shared config', () => {
  it('Google Play URL defaults to the live ReplyFlowHQ listing', () => {
    expect(GOOGLE_PLAY_STORE_URL).toContain('play.google.com/store/apps/details')
    expect(GOOGLE_PLAY_STORE_URL).toContain('id=com.replyflowhq.app')
    expect(isValidGooglePlayURL(GOOGLE_PLAY_STORE_URL)).toBe(true)
  })

  it('iOS App Store URL defaults to the live ReplyFlowHQ listing', () => {
    expect(IOS_APP_STORE_URL).toContain('apps.apple.com/us/app/replyflowhq/id6815518831')
    expect(isValidAppStoreURL(IOS_APP_STORE_URL)).toBe(true)
  })

  it('env override wins for the Google Play URL', async () => {
    process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=override.test'
    const mod = await import('@/lib/app-store-links?override=' + Date.now())
    expect(mod.GOOGLE_PLAY_STORE_URL).toContain('id=override.test')
    delete process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL
  })
})

describe('download page consumes the shared config', () => {
  it('no longer hardcodes a second copy of the Play listing URL', () => {
    expect(downloadPage).toContain("from '@/lib/app-store-links'")
    expect(downloadPage).not.toContain('process.env.NEXT_PUBLIC_ANDROID_PLAY_STORE_URL ||')
    expect(downloadPage).not.toContain("id=com.replyflowhq.app'")
  })
})

describe('homepage Google Play CTA', () => {
  it('links to the shared live listing, not a hardcoded duplicate', () => {
    expect(homepage).toContain("GOOGLE_PLAY_STORE_URL")
    expect(homepage).toContain('isValidGooglePlayURL(GOOGLE_PLAY_STORE_URL)')
    // The listing URL itself must not be pasted into the homepage
    expect(homepage).not.toContain('com.replyflowhq.app')
  })

  it('opens externally with safe link conventions and an accessible label', () => {
    const anchorIdx = homepage.indexOf('href={GOOGLE_PLAY_STORE_URL}')
    const region = homepage.slice(anchorIdx - 200, anchorIdx + 600)
    expect(region).toContain('target="_blank"')
    expect(region).toContain('rel="noopener noreferrer"')
    expect(region).toContain('aria-label="Download ReplyFlowHQ on Google Play"')
    // Visible text — not an icon-only CTA
    expect(region).toContain('Get it on Google Play')
  })

  it('falls back to Coming Soon if the Play URL is ever invalid', () => {
    const anchorIdx = homepage.indexOf('href={GOOGLE_PLAY_STORE_URL}')
    const region = homepage.slice(anchorIdx, anchorIdx + 1400)
    expect(region).toContain('Coming Soon')
  })

  it('iOS card links to the shared live listing with safe conventions', () => {
    const appleIdx = homepage.indexOf('{/* Apple App Store */}')
    const googleIdx = homepage.indexOf('{/* Google Play */}')
    const appleRegion = homepage.slice(appleIdx, googleIdx)
    expect(appleRegion).toContain('href={IOS_APP_STORE_URL}')
    expect(appleRegion).toContain('target="_blank"')
    expect(appleRegion).toContain('rel="noopener noreferrer"')
    expect(appleRegion).toContain('aria-label="Download ReplyFlowHQ on the App Store"')
    expect(appleRegion).toContain('Download on the App Store')
    // The listing URL itself must not be pasted into the homepage
    expect(appleRegion).not.toContain('id6815518831')
    // Coming Soon remains only as the invalid-URL fallback
    expect(appleRegion).toContain('Coming Soon')
  })
})
