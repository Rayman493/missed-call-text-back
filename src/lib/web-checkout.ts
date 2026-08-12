/**
 * Replyflow Web Checkout Plugin
 *
 * Production Capacitor plugin for native iOS Stripe checkout using ASWebAuthenticationSession.
 *
 * This plugin provides automatic return-to-app behavior for native iOS Stripe checkout
 * by using ASWebAuthenticationSession with HTTPS callback matching.
 */

import { registerPlugin } from '@capacitor/core'

export interface WebCheckoutPlugin {
  openCheckoutSession(options: {
    url: string
    callbackHost?: string
    callbackPath?: string
  }): Promise<{
    completed: boolean
    iosVersion: string
    canceled?: boolean
    callbackMatched: boolean
    callbackUrl?: string
    errorCode?: string
    errorMessage?: string
  }>
}

const ReplyflowWebCheckoutPlugin = registerPlugin<WebCheckoutPlugin>('ReplyflowWebCheckoutPlugin')

export default ReplyflowWebCheckoutPlugin