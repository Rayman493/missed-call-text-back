'use client'

/**
 * Microsoft Advertising UET tracking for signup conversion events.
 *
 * Mirrors src/lib/google-ads.tsx: the UET base tag loads site-wide so
 * msclkid ad-click attribution is captured on any landing page, then a
 * single custom `signup` event fires at the exact point a new account is
 * created (same call site as reportSignupConversion in /auth).
 *
 * Configuration:
 *   Goal: "ReplyFlowHQ - Completed Signup" (category: Sign-up, manual
 *   custom event, action "signup", unique conversion count, enhanced
 *   conversions DISABLED).
 *
 * Safety properties:
 * - Fires only from the signup success path in /auth — never on login,
 *   pageviews, refresh, or back navigation.
 * - Dedupe: sessionStorage flag per business + Microsoft-side "unique"
 *   goal counting for the account.
 * - Suppressed on native Capacitor shells and @replyflowhq.com test accounts.
 * - No PII: the event payload is exactly `{}` — no email, phone, name,
 *   business details, or payment data. Enhanced conversions stay off.
 * - GPC fail-closed: the script is not loaded and the event not queued
 *   when navigator.globalPrivacyControl is set.
 * - Never throws: a tracking failure cannot break registration.
 */

import { useEffect, useState } from 'react'
import Script from 'next/script'
import { Capacitor } from '@capacitor/core'

export const UET_TAG_ID = '343279768'

const SENT_FLAG_PREFIX = 'rf_uet_signup_conv:'

/**
 * UET base tag init snippet. `enableAutoSpaTracking: true` lets bat.js
 * report SPA route-change pageviews itself — we deliberately do NOT wire
 * up router events or extra manual pageLoad pushes, which would double
 * report navigation.
 */
export function buildUetInitSnippet(tagId: string): string {
  return `
          (function(w,d,t,r,u){var f,n,i;w[u]=w[u]||[],f=function(){var o={ti:"${tagId}",enableAutoSpaTracking:true};o.q=w[u],w[u]=new UET(o),w[u].push("pageLoad")},n=d.createElement(t),n.src=r,n.async=1,n.onload=n.onreadystatechange=function(){var s=this.readyState;s&&s!=="loaded"&&s!=="complete"||(f(),n.onload=n.onreadystatechange=null)},i=d.getElementsByTagName(t)[0],i.parentNode.insertBefore(n,i)})(window,document,"script","https://bat.bing.net/bat.js","uetq");
        `
}

function globalPrivacyControlRequested(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    (navigator as any).globalPrivacyControl === true
  )
}

/**
 * UET tag loader for the root layout. Mount-gated and honors Global
 * Privacy Control — no ad-tech request is made for visitors who signal
 * an opt-out. Also suppressed on native shells where web-ad attribution
 * is meaningless.
 */
export function MicrosoftUetTag() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!UET_TAG_ID || !mounted || globalPrivacyControlRequested() || Capacitor.isNativePlatform()) {
    return null
  }

  return (
    <Script id="microsoft-uet-init" strategy="afterInteractive">
      {buildUetInitSnippet(UET_TAG_ID)}
    </Script>
  )
}

export interface UetSignupConversionOptions {
  /** Stable per-account identifier — used for client-side dedupe only. Never sent. */
  businessId: string
  /** Used only to suppress internal/test accounts (@replyflowhq.com). Never sent. */
  email?: string
}

/**
 * Fire the Microsoft Ads `signup` custom event exactly once per new
 * account. The event carries no parameters — the goal is defined
 * server-side in Microsoft Advertising and enhanced conversions are off.
 * No-ops off-browser, on native, for internal accounts, when already
 * sent, or when GPC is set.
 */
export function reportUetSignupConversion({ businessId, email }: UetSignupConversionOptions): void {
  try {
    if (!businessId) return
    if (Capacitor.isNativePlatform()) return
    if (globalPrivacyControlRequested()) return
    if (email && email.toLowerCase().endsWith('@replyflowhq.com')) return
    if (typeof window === 'undefined') return

    const flagKey = `${SENT_FLAG_PREFIX}${businessId}`
    if (window.sessionStorage.getItem(flagKey)) return
    window.sessionStorage.setItem(flagKey, '1')

    ;(window as any).uetq = (window as any).uetq || []
    ;(window as any).uetq.push('event', 'signup', {})
  } catch {
    // Tracking must never break registration.
  }
}
