/**
 * POST /api/google-play/verify-purchase
 *
 * Called by the Android app after a successful BillingClient purchase and on
 * resume/cold-start reconciliation. The client sends only a purchase token;
 * the authoritative entitlement is always re-fetched from Google's API.
 * Client-side purchase callbacks never grant access by themselves.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { verifyAndApplyPurchase } from '@/lib/google-play/billing-service'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { purchaseToken, productId, usedTrialOffer, obfuscatedExternalAccountId } = body as {
      purchaseToken?: string
      productId?: string
      usedTrialOffer?: boolean
      obfuscatedExternalAccountId?: string
    }

    if (!purchaseToken || !productId) {
      return NextResponse.json({ ok: false, error: 'purchaseToken and productId are required' }, { status: 400 })
    }

    // Authenticated user via cookie session (same pattern as /api/account/delete)
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
      .select('id, user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!business) {
      return NextResponse.json({ ok: false, error: 'Business not found' }, { status: 404 })
    }

    const result = await verifyAndApplyPurchase(supabaseAdmin, {
      purchaseToken,
      productId,
      businessId: business.id,
      userId: user.id,
      usedTrialOffer: usedTrialOffer === true,
      obfuscatedExternalAccountId,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: result.status ?? 500 })
    }
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[GOOGLE PLAY VERIFY] Unexpected error:', error)
    return NextResponse.json({ ok: false, error: 'Verification failed' }, { status: 500 })
  }
}
