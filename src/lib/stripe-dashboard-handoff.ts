/**
 * Stripe Express Dashboard handoff.
 *
 * Fetches a fresh owner-scoped Express login link from the server
 * (business + account resolved server-side) and opens it in the platform-
 * appropriate surface:
 * - Native iOS/Android: Capacitor Browser (SFSafariViewController / Chrome
 *   Custom Tab) — closing it returns to ReplyFlow with the session intact.
 * - Web: external tab via openExternalLink.
 *
 * The login URL is single-use and is never persisted or logged.
 */

import { Capacitor } from '@capacitor/core'
import { Browser } from '@capacitor/browser'
import { openExternalLink } from '@/lib/external-link'

export async function openStripeDashboardHandoff(options: {
  businessId: string
  paymentRequestId?: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch('/api/stripe/connect/management-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        business_id: options.businessId,
        ...(options.paymentRequestId ? { payment_request_id: options.paymentRequestId } : {}),
      }),
    })

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      return { ok: false, error: data.error || 'Couldn\'t open Stripe right now. Please try again.' }
    }

    const data = await response.json()
    if (!data.url) {
      return { ok: false, error: 'Couldn\'t open Stripe right now. Please try again.' }
    }

    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url: data.url })
    } else {
      openExternalLink(data.url)
    }
    return { ok: true }
  } catch (error) {
    console.error('[Stripe Dashboard Handoff] Failed:', error)
    return { ok: false, error: 'Couldn\'t open Stripe right now. Please try again.' }
  }
}
