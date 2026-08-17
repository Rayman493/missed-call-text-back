/**
 * Replyflow Web Checkout Plugin
 *
 * Production Capacitor plugin for native Stripe checkout.
 *
 * iOS: Uses ASWebAuthenticationSession with HTTPS callback matching.
 * Android: Uses Chrome Custom Tabs with App Link callback interception.
 *
 * This plugin provides automatic return-to-app behavior for native Stripe checkout
 * while preserving Capacitor WebView Supabase/localStorage sessions.
 */

import { registerPlugin } from '@capacitor/core'

export interface WebCheckoutPlugin {
  openCheckoutSession(options: {
    url: string
    callbackHost?: string
    callbackPath?: string
  }): Promise<{
    completed: boolean
    iosVersion?: string
    androidVersion?: string
    canceled?: boolean
    callbackMatched: boolean
    callbackUrl?: string
    errorCode?: string
    errorMessage?: string
  }>
}

const ReplyflowWebCheckoutPlugin = registerPlugin<WebCheckoutPlugin>('ReplyflowWebCheckoutPlugin')

export default ReplyflowWebCheckoutPlugin