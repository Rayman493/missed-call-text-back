'use client'

/**
 * Google Ads conversion tracking for signup events.
 *
 * Loads the Google tag (gtag.js) site-wide so ad-click attribution
 * (gclid/wbraid) is captured on whatever page a visitor lands on, then fires
 * a single `conversion` event at the exact point a new account is created.
 *
 * Configuration (both required — component renders nothing without them):
 *   NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_ID   e.g. AW-123456789
 *   NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL    e.g. AbCdEfGhIjKlMnOp
 *
 * Safety properties:
 * - Fires only from the signup success path in /auth — never on login,
 *   /dashboard pageviews, refresh, or back navigation.
 * - Dedupe: sessionStorage flag per business + `transaction_id` (businessId)
 *   so Google Ads server-side dedupes even across sessions/browsers.
 * - Suppressed on native Capacitor shells and @replyflowhq.com test accounts.
 * - Never throws: a tracking failure cannot break registration.
 */

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { Capacitor } from '@capacitor/core'

export const GOOGLE_ADS_CONVERSION_ID = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_ID
export const GOOGLE_ADS_SIGNUP_LABEL = process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL

const SENT_FLAG_PREFIX = 'rf_ads_signup_conv:'

/**
 * Google tag init snippet. `allow_ad_personalization_signals: false` turns
 * off remarketing/audience data collection (which we don't use) while
 * keeping gclid attribution and conversion measurement fully functional.
 */
export function buildGoogleAdsInitSnippet(conversionId: string): string {
  return `
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${conversionId}', { allow_ad_personalization_signals: false });
        `
}

function globalPrivacyControlRequested(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as any).globalPrivacyControl === true
  )
}

/**
 * Google tag loader for the root layout. Renders nothing when the Ads
 * conversion ID is not configured, so the app ships inert until Google Ads
 * provides a real tag ID. Mount-gated and honors Global Privacy Control —
 * no ad-tech request is made for visitors who signal an opt-out.
 */
export function GoogleAdsTag() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!GOOGLE_ADS_CONVERSION_ID || !mounted || globalPrivacyControlRequested()) {
    return null
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_CONVERSION_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-gtag-init" strategy="afterInteractive">
        {buildGoogleAdsInitSnippet(GOOGLE_ADS_CONVERSION_ID)}
      </Script>
    </>
  )
}

export interface SignupConversionOptions {
  /** Stable per-account identifier — sent as transaction_id for dedupe. */
  businessId: string
  /** Used only to suppress internal/test accounts (@replyflowhq.com). Never sent. */
  email?: string
}

/**
 * Fire the Google Ads signup conversion exactly once per new account.
 * No-ops when unconfigured, off-browser, native, internal, already sent,
 * or when the Google tag failed to load (e.g. ad blockers).
 */
export function reportSignupConversion({ businessId, email }: SignupConversionOptions): void {
  try {
    if (!GOOGLE_ADS_CONVERSION_ID || !GOOGLE_ADS_SIGNUP_LABEL) return
    if (!businessId) return
    if (Capacitor.isNativePlatform()) return
    if (globalPrivacyControlRequested()) return
    if (email && email.toLowerCase().endsWith('@replyflowhq.com')) return
    if (typeof window === 'undefined') return

    const gtag = (window as any).gtag
    if (typeof gtag !== 'function') return

    const flagKey = `${SENT_FLAG_PREFIX}${businessId}`
    if (window.sessionStorage.getItem(flagKey)) return
    window.sessionStorage.setItem(flagKey, '1')

    gtag('event', 'conversion', {
      send_to: `${GOOGLE_ADS_CONVERSION_ID}/${GOOGLE_ADS_SIGNUP_LABEL}`,
      transaction_id: businessId,
    })
  } catch {
    // Tracking must never break registration.
  }
}
