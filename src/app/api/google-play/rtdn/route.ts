/**
 * POST /api/google-play/rtdn?key=<GOOGLE_PLAY_RTDN_SECRET>
 *
 * Google Play Real-time Developer Notifications (Pub/Sub push endpoint).
 *
 * - Authenticated by a shared secret in the push endpoint URL (configure the
 *   Pub/Sub subscription's push URL as this route + ?key=...).
 * - Never trusts the notification payload: every subscription notification
 *   triggers a fresh subscriptionsv2.get before entitlements change.
 * - Idempotent via google_play_rtdn_events.message_id (unique insert claim,
 *   same pattern as stripe_webhook_events).
 * - Stripe-provider businesses are never touched.
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAndApplyPurchase } from '@/lib/google-play/billing-service'

// developerNotification.subscriptionNotification.notificationType values.
// 1 RECOVERED, 2 RENEWED, 3 CANCELED, 4 PURCHASED, 5 ON_HOLD,
// 6 IN_GRACE_PERIOD, 7 RESTARTED, 8 PRICE_CHANGE_CONFIRMED, 9 DEFERRED,
// 10 PAUSED, 11 PAUSE_SCHEDULE_CHANGED, 12 REVOKED, 13 EXPIRED.
const REVOKED = 12 // SUBSCRIPTION_REVOKED — refund/revoke, immediate entitlement loss
const STALE_PROCESSING_MS = 10 * 60 * 1000

interface RtdnMessage {
  message?: { data?: string; messageId?: string }
  subscription?: string
}

interface DeveloperNotification {
  packageName?: string
  subscriptionNotification?: {
    notificationType?: number
    purchaseToken?: string
    subscriptionId?: string
  }
}

async function claimEvent(messageId: string, notificationType: number | null, purchaseToken: string | null) {
  const { error } = await supabaseAdmin
    .from('google_play_rtdn_events')
    .insert({ message_id: messageId, notification_type: notificationType, purchase_token: purchaseToken })

  if (!error) return { claimed: true, alreadyProcessed: false }

  if (error.code === '23505') {
    const { data: existing } = await supabaseAdmin
      .from('google_play_rtdn_events')
      .select('status, processing_started_at, attempt_count')
      .eq('message_id', messageId)
      .single()
    if (existing?.status === 'processed') return { claimed: false, alreadyProcessed: true }
    // Reclaim 'failed' events and 'processing' events that never finished
    // (e.g. the first attempt crashed before writing a terminal status).
    const staleProcessing = existing?.status === 'processing' &&
      Date.now() - new Date(existing.processing_started_at).getTime() > STALE_PROCESSING_MS
    if (existing?.status !== 'failed' && !staleProcessing) {
      return { claimed: false, alreadyProcessed: false }
    }
    const { data: reclaimed } = await supabaseAdmin
      .from('google_play_rtdn_events')
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
  const secret = request.nextUrl.searchParams.get('key')
  const expected = process.env.GOOGLE_PLAY_RTDN_SECRET
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const envelope = await request.json().catch(() => ({})) as RtdnMessage
  const messageId = envelope.message?.messageId
  const data = envelope.message?.data
  if (!messageId || !data) {
    // Return 204 so Pub/Sub doesn't retry malformed pushes forever.
    return new NextResponse(null, { status: 204 })
  }

  let notification: DeveloperNotification
  try {
    notification = JSON.parse(Buffer.from(data, 'base64').toString('utf8'))
  } catch {
    return new NextResponse(null, { status: 204 })
  }

  const subNotif = notification.subscriptionNotification
  if (!subNotif?.purchaseToken || subNotif.notificationType == null) {
    // Non-subscription notification (e.g. test notification) — ack and ignore.
    return NextResponse.json({ ok: true, ignored: true })
  }

  const claim = await claimEvent(messageId, subNotif.notificationType, subNotif.purchaseToken)
  if (claim.alreadyProcessed) {
    return NextResponse.json({ ok: true, alreadyProcessed: true })
  }
  if (!claim.claimed) {
    return NextResponse.json({ ok: false, error: 'Event already being processed' }, { status: 409 })
  }

  try {
    // Resolve which business this purchase token belongs to.
    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, user_id, subscription_provider')
      .eq('google_play_purchase_token', subNotif.purchaseToken)
      .maybeSingle()

    if (!business) {
      // Unknown token — could be a purchase not yet verified by the client.
      // Record and ack; the client's resume-reconciliation will bind it.
      await supabaseAdmin
        .from('google_play_rtdn_events')
        .update({ status: 'processed', processed_at: new Date().toISOString(), error_message: 'no matching business' })
        .eq('message_id', messageId)
      return NextResponse.json({ ok: true, unmatched: true })
    }

    // Protect Stripe entitlements: never apply Play events to Stripe subs.
    if (business.subscription_provider === 'stripe') {
      await supabaseAdmin
        .from('google_play_rtdn_events')
        .update({ status: 'processed', processed_at: new Date().toISOString(), business_id: business.id, error_message: 'stripe provider - skipped' })
        .eq('message_id', messageId)
      return NextResponse.json({ ok: true, skipped: 'stripe_provider' })
    }

    const result = await verifyAndApplyPurchase(supabaseAdmin, {
      purchaseToken: subNotif.purchaseToken,
      productId: subNotif.subscriptionId || process.env.NEXT_PUBLIC_GOOGLE_PLAY_PRODUCT_ID || 'replyflow_monthly',
      businessId: business.id,
      userId: business.user_id,
      forceRevoked: subNotif.notificationType === REVOKED,
    })

    if (!result.ok) {
      throw new Error(result.error)
    }

    await supabaseAdmin
      .from('google_play_rtdn_events')
      .update({ status: 'processed', processed_at: new Date().toISOString(), business_id: business.id })
      .eq('message_id', messageId)

    return NextResponse.json({ ok: true, status: result.status })
  } catch (error: any) {
    console.error('[GOOGLE PLAY RTDN] Processing failed:', error)
    await supabaseAdmin
      .from('google_play_rtdn_events')
      .update({ status: 'failed', error_message: String(error?.message || error).slice(0, 500) })
      .eq('message_id', messageId)
    // 500 → Pub/Sub retries with backoff; event can be reclaimed.
    return NextResponse.json({ ok: false, error: 'Processing failed' }, { status: 500 })
  }
}
