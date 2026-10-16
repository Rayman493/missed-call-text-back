/**
 * POST /api/apple/assn
 *
 * App Store Server Notifications V2 endpoint — configure in
 * App Store Connect → App → App Store Server Notifications → Production +
 * Sandbox server URLs as https://<host>/api/apple/assn.
 *
 * - Authenticated by Apple's JWS signature: the signedPayload's x5c chain
 *   must resolve to the pinned Apple Root CA - G3. No shared secret needed —
 *   a forged notification cannot produce a valid signature.
 * - Never trusts the notification payload: every subscription event
 *   re-fetches getAllSubscriptionStatuses before entitlements change.
 * - Idempotent via apple_assn_events.message_id (notificationUUID unique
 *   insert claim, same pattern as google_play_rtdn_events).
 * - Stripe/Google-Play entitlements are never clobbered by a dead Apple
 *   subscription (same stale-label logic as the RTDN route).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  decodeAndVerifyNotification,
  verifyAndApplyTransaction,
  fetchSubscriptionStatus,
  mapAppleEntitlement,
} from '@/lib/apple/billing-service'

const STALE_PROCESSING_MS = 10 * 60 * 1000

// Notification types that mean the Apple billing relationship ended or the
// user was refunded — entitlement loss is immediate, not at period end.
const REVOCATION_TYPES = new Set(['REVOKE', 'REFUND'])

// Notification types we intentionally never act on (handled elsewhere or
// no entitlement impact). Everything else re-fetches + reapplies state.
const IGNORED_TYPES = new Set(['TEST'])

async function claimEvent(
  messageId: string,
  notificationType: string | null,
  subtype: string | null,
  originalTransactionId: string | null
) {
  const { error } = await supabaseAdmin
    .from('apple_assn_events')
    .insert({
      message_id: messageId,
      notification_type: notificationType,
      subtype,
      original_transaction_id: originalTransactionId,
    })

  if (!error) return { claimed: true, alreadyProcessed: false }

  if (error.code === '23505') {
    const { data: existing } = await supabaseAdmin
      .from('apple_assn_events')
      .select('status, processing_started_at, attempt_count')
      .eq('message_id', messageId)
      .single()
    if (existing?.status === 'processed') return { claimed: false, alreadyProcessed: true }
    const staleProcessing = existing?.status === 'processing' &&
      Date.now() - new Date(existing.processing_started_at).getTime() > STALE_PROCESSING_MS
    if (existing?.status !== 'failed' && !staleProcessing) {
      return { claimed: false, alreadyProcessed: false }
    }
    const { data: reclaimed } = await supabaseAdmin
      .from('apple_assn_events')
      .update({
        status: 'processing',
        processing_started_at: new Date().toISOString(),
        error_message: null,
        attempt_count: (existing?.attempt_count ?? 1) + 1,
      })
      .eq('message_id', messageId)
      .neq('status', 'processed')
      .select('id')
    return { claimed: !!reclaimed?.length, alreadyProcessed: false }
  }
  return { claimed: false, alreadyProcessed: false }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const { signedPayload } = body as { signedPayload?: string }
  if (!signedPayload || typeof signedPayload !== 'string') {
    // Malformed push — 204 so App Store doesn't retry it forever.
    return new NextResponse(null, { status: 204 })
  }

  const decoded = decodeAndVerifyNotification(signedPayload)
  if ('error' in decoded) {
    // Signature or chain failure — never trust, never retry-loop. 400 tells
    // Apple to stop redelivering a permanently-invalid payload.
    console.warn('[APPLE ASSN] rejected:', decoded.error)
    return NextResponse.json({ ok: false, error: 'Invalid signature' }, { status: 400 })
  }

  const { notification, transactionInfo } = decoded
  const notificationType = notification.notificationType ?? null
  const messageId = notification.notificationUUID
  const originalTransactionId =
    transactionInfo?.originalTransactionId ?? null

  if (IGNORED_TYPES.has(notificationType ?? '') || !messageId) {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const claim = await claimEvent(messageId, notificationType, notification.subtype ?? null, originalTransactionId)
  if (claim.alreadyProcessed) {
    return NextResponse.json({ ok: true, alreadyProcessed: true })
  }
  if (!claim.claimed) {
    return NextResponse.json({ ok: false, error: 'Event already being processed' }, { status: 409 })
  }

  try {
    if (!originalTransactionId) {
      // Notification without transaction context (e.g. CONSUMPTION_REQUEST)
      // — nothing to entitle; record and ack.
      await supabaseAdmin
        .from('apple_assn_events')
        .update({ status: 'processed', processed_at: new Date().toISOString(), error_message: 'no transaction context' })
        .eq('message_id', messageId)
      return NextResponse.json({ ok: true, ignored: true })
    }

    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, user_id, subscription_provider, apple_revoked_at')
      .eq('apple_original_transaction_id', originalTransactionId)
      .maybeSingle()

    if (!business) {
      // Unknown transaction — likely a purchase not yet verified by the
      // client. Record and ack; client reconcile will bind it.
      await supabaseAdmin
        .from('apple_assn_events')
        .update({ status: 'processed', processed_at: new Date().toISOString(), error_message: 'no matching business' })
        .eq('message_id', messageId)
      return NextResponse.json({ ok: true, unmatched: true })
    }

    // Protect Stripe/Google-Play entitlements: a dead Apple subscription
    // must never overwrite a live entitlement under another provider. The
    // provider label can be stale (unprovidered webhook writes), so for
    // anything other than a definitively-revoked Apple record, ask Apple
    // and process only while the subscription is still live. A fetch
    // failure throws → 500 → Apple retries; never silently lost.
    if (business.subscription_provider === 'stripe' || business.subscription_provider === 'google_play') {
      let shouldProcess = false
      let skipReason = `${business.subscription_provider}_provider`
      if (business.apple_revoked_at) {
        skipReason = `${business.subscription_provider}_provider_apple_revoked`
      } else {
        const data = await fetchSubscriptionStatus(originalTransactionId, transactionInfo?.environment)
        const mapped = data && mapAppleEntitlement(data, { isTrial: false })
        shouldProcess = Boolean(mapped && mapped.status && mapped.status !== 'canceled')
        if (!shouldProcess) skipReason = `${business.subscription_provider}_provider_apple_dead`
      }
      if (!shouldProcess) {
        await supabaseAdmin
          .from('apple_assn_events')
          .update({ status: 'processed', processed_at: new Date().toISOString(), business_id: business.id, error_message: `${skipReason} - skipped` })
          .eq('message_id', messageId)
        return NextResponse.json({ ok: true, skipped: skipReason })
      }
      // Apple still reports live — the other-provider label was stale (or
      // genuine dual-billing). Fall through and apply; the write restores
      // subscription_provider='apple' to match Apple truth.
    }

    const result = await verifyAndApplyTransaction(supabaseAdmin, {
      originalTransactionId,
      businessId: business.id,
      userId: business.user_id,
      forceRevoked: REVOCATION_TYPES.has(notificationType ?? ''),
      transactionInfoHint: transactionInfo ?? undefined,
    })

    if (!result.ok) {
      throw new Error(result.error)
    }

    await supabaseAdmin
      .from('apple_assn_events')
      .update({ status: 'processed', processed_at: new Date().toISOString(), business_id: business.id })
      .eq('message_id', messageId)

    return NextResponse.json({ ok: true, status: result.status })
  } catch (error: any) {
    console.error('[APPLE ASSN] Processing failed:', error)
    await supabaseAdmin
      .from('apple_assn_events')
      .update({ status: 'failed', error_message: String(error?.message || error).slice(0, 500) })
      .eq('message_id', messageId)
    // 500 → Apple retries with backoff; event can be reclaimed.
    return NextResponse.json({ ok: false, error: 'Processing failed' }, { status: 500 })
  }
}
