/**
 * POST /api/apple/verify-transaction
 *
 * Called by the iOS app after a successful StoreKit 2 purchase, on
 * resume/cold-start reconciliation, and by Restore Purchases.
 *
 * Body:
 *   { signedTransactionInfo } — the transaction's JWS from StoreKit. The
 *     signature + x5c chain is verified before use; the transaction's
 *     originalTransactionId/productId/environment come from the verified
 *     payload, never the raw request fields.
 *   { reconcile: true } — resume/empty-entitlement reconcile. Uses the
 *     business's stored apple_original_transaction_id and re-queries Apple's
 *     authoritative status, so a device-side empty entitlement list can
 *     never strip a subscription Apple still reports live.
 *
 * Client-side purchase callbacks never grant access by themselves — every
 * call re-fetches getAllSubscriptionStatuses from the App Store Server API.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAppleJws } from '@/lib/apple/jws'
import { verifyAndApplyTransaction } from '@/lib/apple/billing-service'
import type { AppleTransactionInfo } from '@/lib/apple/billing-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { signedTransactionInfo, reconcile, productId } = body as {
      signedTransactionInfo?: string
      reconcile?: boolean
      productId?: string
    }

    // Authenticated user via cookie session (same pattern as /api/google-play/verify-purchase)
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 401 })
    }

    const { data: business } = await supabaseAdmin
      .from('businesses')
      .select('id, user_id, apple_original_transaction_id, apple_environment')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!business) {
      return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })
    }

    let verifiedTx: AppleTransactionInfo | null = null
    if (signedTransactionInfo) {
      const decoded = verifyAppleJws<AppleTransactionInfo>(signedTransactionInfo)
      if ('error' in decoded) {
        return NextResponse.json({ ok: false, error: `Invalid transaction signature: ${decoded.error}` }, { status: 400 })
      }
      verifiedTx = decoded.payload
      if (!verifiedTx.originalTransactionId) {
        return NextResponse.json({ ok: false, error: 'Transaction missing originalTransactionId' }, { status: 400 })
      }
    }

    const originalTransactionId = verifiedTx?.originalTransactionId ?? (
      reconcile ? business.apple_original_transaction_id : null
    )
    if (!originalTransactionId) {
      if (reconcile) {
        // Reconcile was requested but this business holds no stored Apple
        // subscription — a truthful no-entitlement no-op, not a malformed
        // request. Every non-Apple iOS account hits this on resume; a 400
        // there is noise that obscures real failures.
        return NextResponse.json({ ok: true, entitled: false, status: 'none' })
      }
      return NextResponse.json({ ok: false, error: 'signedTransactionInfo or reconcile:true is required' }, { status: 400 })
    }

    const result = await verifyAndApplyTransaction(supabaseAdmin, {
      originalTransactionId,
      businessId: business.id,
      userId: user.id,
      expectedProductId: productId ?? verifiedTx?.productId,
      // Signed JWS payloads carry their own environment. The reconcile path
      // has no JWS, so reuse the environment persisted at last verification —
      // a Sandbox subscription must reconcile against the sandbox App Store
      // Server API (the default fallback is production and 404s for it).
      transactionInfoHint: verifiedTx ?? (
        business.apple_environment ? { environment: business.apple_environment } : undefined
      ),
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status ?? 500 })
    }
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[APPLE IAP VERIFY] Unexpected error:', error)
    return NextResponse.json({ ok: false, error: 'Verification failed' }, { status: 500 })
  }
}
